# Face Authentication System — Agent Context

> **Purpose of this file**: Project context for Cursor (or any dev) before touching SDK state-machine code, registration flows, admin routes, or Admin Portal. Read this together with `PROJECT_CONTEXT.md` and `docs/architecture/registration-flow.md`.

Last updated: 2026-08-31

---

## 1. What Stays Fixed (Do Not Redesign)

- Mendix Web only ever shows: **Employee ID + Authenticate**. This never changes.
- SDK owns camera, liveness, capture, Register overlay, session handling.
- Backend (FastAPI + PostgreSQL/pgvector) owns matching, enrollment state, duplicate blocking, plant-scoped access, audit logging.
- Free stack unchanged: MediaPipe, OpenCV SFace, ONNX Runtime, pgvector.
- Plant workspace boundary: **`plant_id`** on all relevant rows; admin queues filtered by plant.

Full architecture: `docs/architecture/system-architecture.md`.

---

## 2. One Person, Three Tables (Admin Is an Employee Too)

Every person — worker or admin — uses **one business `employee_id`**. Capabilities are layered; do not merge into one table.

| Table | Purpose | Used for |
|-------|---------|----------|
| `employees` | Identity: who, which plant, ACTIVE/INACTIVE | All flows |
| `enrollments` | Face embedding (ACTIVE) | **`POST /authenticate`** (kiosk face login) |
| `admin_roles` | Password + `PLANT_ADMIN` / `SUPER_ADMIN` | **Admin Portal** + kiosk admin login (Path B) |

**Rules:**

- `POST /authenticate` reads **`employees` + `enrollments` only** — never `admin_roles`.
- Admin login reads **`admin_roles` only** — password, not face.
- Same person can have both `enrollments` and `admin_roles` on the same `employee_id`.
- `admin_roles.employee_id` FK → `employees` — admin must exist as employee first (recommended: enrolled worker first).

### Admin who also face-logs in (daily work)

```text
Morning — Admin Portal
  ADMIN001 + password → approve/reject queue → log out

Later — Kiosk / Mendix
  ADMIN001 + Authenticate (face) → employee daily work
```

Both use the **same Employee ID**; different credentials (password vs face).

### Recommended admin provisioning (worker first)

```text
Step 1 — Enroll as worker
  Path A (register → approve) OR Path B batch enroll OR dev enroll script
  → employees + enrollments (face login works)

Step 2 — Grant plant admin (desk)
  SUPER_ADMIN: search employee_id → assign PLANT_ADMIN (plant) → set password
  → admin_roles row (portal login for that plant)

Step 3 — Complete person
  employees + enrollments + admin_roles (same employee_id)
```

**v1 roles:** `SUPER_ADMIN` + `PLANT_ADMIN` only. **SUB_ADMIN deferred.**

**Not built yet:** Admin Portal UI for Step 2. **API:** `POST /admin/users/grant` (PLANT_ADMIN only). Dev: `seed_super_admin.py` → `seed_admin.py`.

---

## 2b. Admin RBAC v1 — Two Roles + Permission Table

Scalable storage (`admin_permissions` + `admin_role_permissions`) with a **simple v1 policy**: two active roles, plant-scoped review.

### Active roles (v1)

| Role | `plant_id` | Can do |
|------|------------|--------|
| **SUPER_ADMIN** | `NULL` (all plants) | View/approve/reject **any** plant; **grant PLANT_ADMIN** |
| **PLANT_ADMIN** | One plant UUID | View/approve/reject **own plant only** |

**SUB_ADMIN** — reserved in DB enum for future; **not granted or used in v1.**

### Who creates whom

```text
SUPER_ADMIN  ──grants──►  PLANT_ADMIN (per plant, via POST /admin/users/grant)
PLANT_ADMIN  ──does──►    approve / reject PENDING for own plant only
```

### v1 permission defaults (copied to `admin_role_permissions` on grant)

| Permission | SUPER_ADMIN | PLANT_ADMIN |
|------------|:-----------:|:-----------:|
| `REGISTRATION_VIEW_PENDING` | ✓ | ✓ |
| `REGISTRATION_VIEW_IMAGE` | ✓ | ✓ |
| `REGISTRATION_APPROVE` | ✓ | ✓ |
| `REGISTRATION_REJECT` | ✓ | ✓ |
| `ADMIN_GRANT_PLANT_ADMIN` | ✓ | ✗ |
| `ADMIN_GRANT_SUB_ADMIN` | ✗ (catalog only, future) | ✗ |

Plant scoping: `PLANT_ADMIN` queue + approve/reject enforced by `session.plant_id == request.plant_id`. `SUPER_ADMIN` bypasses plant filter.

### Grant API (v1)

```text
POST /admin/users/grant
  Body: { employeeId, role: "PLANT_ADMIN", plantId, password }
  Caller: SUPER_ADMIN only (needs ADMIN_GRANT_PLANT_ADMIN)
  Target: must exist in employees (worker-first recommended)
```

### Dev seed order (no worker pre-seed)

```text
1. alembic upgrade head
2. seed_super_admin.py     → SUPER001 + DEV01 plant (bootstrap)
3. seed_admin.py           → PLANT_ADMIN ADMIN001 for portal (DEV01 scope)

Manual test flow:
4. test-harness → register worker (Plant + Employee ID + name) → PENDING
5. Admin Portal → PLANT_ADMIN sees queue for own plant → approve / reject
6. Re-authenticate at kiosk → login succeeds after approve

Do not run seed_employee_only.py for normal Path A testing — workers come from kiosk register.
```

**Alembic:** `20260831_0007` removes `ADMIN_GRANT_SUB_ADMIN` from existing plant admin rows.

---

## 3. Registration Paths (Do Not Merge)

| Path | Who | Capture | Endpoint | Result |
|------|-----|---------|----------|--------|
| **A — Employee self-register** | Employee at kiosk | One capture at auth; **reuse** JPEG on register | `POST /register` | PENDING → Admin Portal approve |
| **B — Admin kiosk batch** | Plant admin at kiosk | **Fresh capture per employee** after admin password login | `POST /kiosk/admin-enroll` | ACTIVE immediately |

Trust models differ — keep separate services/endpoints.

---

## 4. Path A — Registration-First Hybrid (**Implemented**)

HR keeps master data **offline** (paper / separate machine). Kiosk does **not** require a pre-loaded `employees` row at submit time.

### Trigger (SDK opens Register UI)

| Code | Meaning | Register? |
|------|---------|-----------|
| `ENROLLMENT_NOT_FOUND` | Known employee, no ACTIVE face enrollment | Yes |
| `EMPLOYEE_NOT_FOUND` | Not in system yet | Yes |
| `authenticated: false` (200) | Enrolled but wrong face | No |

### Kiosk Register UI fields (SDK `RegisterOverlay`)

| Field | Required |
|-------|----------|
| **Plant** | Yes — from `GET /plants` |
| **Employee ID** | Yes |
| **Full name** | Yes — HR offline matching |
| **Face photo** | Yes — reused from authenticate capture (no second camera) |

### Backend flow

```text
POST /register
  → registration_requests (PENDING, plant_id from form, submitted_full_name)
  → raw_images
  → NO employees / enrollments yet

Admin Portal approve
  → employees + enrollments (ACTIVE)
  → registration_requests APPROVED
  → audit_log APPROVE
```

### Admin Portal API (backend done; React UI pending)

| Endpoint | Purpose |
|----------|---------|
| `POST /admin/login` | Admin Employee ID + password |
| `GET /admin/registrations/pending` | Plant-scoped queue |
| `GET /admin/registrations/{id}/image` | Face photo for HR |
| `POST /admin/registrations/{id}/approve` | Create employee + enrollment |
| `POST /admin/registrations/{id}/reject` | Reject with reason |

**Alembic note:** Migration `20260829_0005` dropped FK from `registration_requests.employee_id` → `employees` so intake works without pre-existing HR row.

---

## 5. SDK State Machine (Target + Current Status)

Mendix never sees states 3–5 — SDK-internal only.

```
STATE 1: IDLE (Mendix — UNCHANGED)
  → Employee ID + Authenticate → SDK.authenticate()

STATE 2: AUTH RESULT
  → Match → login success → STATE 1
  → No match / not enrolled → STATE 3

STATE 3: NOT ENROLLED OVERLAY
  → [Employee Register]  → Path A Register UI (Plant + ID + Full name; reuse auth JPEG)
  → [Admin Login]          → STATE 4 (Path B — NOT BUILT YET)

STATE 4: ADMIN AUTHENTICATING (Path B — NOT BUILT)
  → Admin's own Employee ID + password → POST /kiosk/admin-login → admin_session_token

STATE 5: ADMIN ENROLLMENT LOOP (Path B — NOT BUILT)
  → Target employee ID + FRESH face capture each time → POST /kiosk/admin-enroll
  → ACTIVE immediately; repeat; End Session → POST /kiosk/admin-logout
```

### Implementation status

| State / feature | Status |
|-----------------|--------|
| Authenticate + camera | Done |
| Register overlay (Path A fields) | Done |
| `authenticateOrRegister()` convenience | Done (opens register on ENROLLMENT_NOT_FOUND or EMPLOYEE_NOT_FOUND) |
| STATE 3 two-button overlay (Register vs Admin Login) | **Pending** — register works without explicit two-button UI today |
| STATE 4–5 Path B | **Not built** |

### Critical Path B rule (when implemented)

Once in STATE 5, the loop **never** calls `SDK.authenticate()` again — only internal `enrollNextEmployee()` → `/kiosk/admin-enroll` repeatedly.

Path A register **reuses** auth JPEG. Path B admin enroll **never** reuses the failed auth JPEG — fresh capture per employee.

---

## 6. Path B — Admin Kiosk Batch Enrollment (**Not Built**)

### Problem

Plant admins enroll many joiners at the physical kiosk without PENDING → async review. Admin is the live verifier → ACTIVE at capture.

### New backend routes (add `backend/app/api/routes/kiosk_admin.py`)

#### POST /kiosk/admin-login

```text
Body: { employee_id, password }
Logic: Validate admin_roles (SAME credentials as Admin Portal — no separate admin credential system)
Returns: { admin_session_token, plant_id, expires_at }
```

Admin enters **their own** Employee ID + password (not the employee being enrolled).

#### POST /kiosk/admin-enroll

```text
Headers: { admin_session_token }
Body: { employee_id, captured_frame [, kiosk_id] }
  kiosk_id — optional; omit in current rollout; NULL in DB

Logic:
  1. Validate admin_session_token (every call)
  2. Face pipeline: detect → liveness → SFace embed
  3. Guard: no duplicate ACTIVE enrollment / duplicate face in plant
  4. registration_requests: source=ADMIN_KIOSK, status=APPROVED (never PENDING)
  5. raw_images + enrollments ACTIVE
  6. audit_log: ADMIN_KIOSK_ENROLL
Returns: { success, employee_id, enrollment_status }
```

Admin enters **target employee's** ID + fresh face each time.

#### POST /kiosk/admin-logout

```text
Headers: { admin_session_token }
Logic: Invalidate session immediately
```

### Schema (already in DB)

- `registration_requests.source` includes `'ADMIN_KIOSK'`
- `AuditAction.ADMIN_KIOSK_ENROLL` in enums

No new tables required.

---

## 7. Security (Non-Negotiable)

- Kiosk admin `admin_session_token`: server-side expiry (15–20 min absolute or shorter inactivity between enrolls).
- Path B: full `audit_log` on every `/kiosk/admin-enroll` — bypasses two-person review; audit is the control.
- Re-validate session token on **every** `/kiosk/admin-enroll` call.
- Path A: login blocked until approve; duplicate-face check at register **and** approve (plant-scoped pgvector).
- UI is not the security boundary — backend query scoping by `plant_id` is.

---

## 8. What NOT to Build

- Do NOT change Mendix UI (Employee ID + Authenticate only).
- Do NOT merge Path A and Path B into one code path or one endpoint.
- Do NOT create a separate admin credential system — reuse `admin_roles`.
- Do NOT create PENDING for Path B admin-kiosk enrollments — always APPROVED at capture.
- Do NOT skip audit_log on Path B enrollments.
- Do NOT put face embeddings in `admin_roles` or passwords in `employees`.
- Do NOT let self-register (Path A) grant admin role — admin provisioning is a separate desk action.

---

## 9. Implementation Checklist (Repo Status)

| Area | Status |
|------|--------|
| `POST /authenticate` | Done |
| `POST /register` (registration-first) | Done |
| `GET /plants` | Done |
| Admin approve/reject API | Done (permission-checked) |
| Admin grant role API | Done (`POST /admin/users/grant`) |
| Permission tables + SUB_ADMIN | Done (SUB_ADMIN deferred in v1 policy) |
| `seed_super_admin.py` bootstrap | Done |
| Admin Portal React UI | **Pending** |
| Grant admin role UI (search emp → PLANT_ADMIN + password) | **Pending** (API: SUPER only, PLANT_ADMIN target) |
| SDK STATE 3 two-button overlay | **Pending** |
| Path B `/kiosk/admin-*` + SDK STATE 4–5 | **Not built** |
| `session_id` on auth/register wire-up | Deferred |

**Alembic head:** `20260831_0007`

---

## 10. Summary for Cursor / Any Developer

1. **Path A (built):** Registration-first kiosk intake — Plant + ID + Name + face → PENDING → plant admin approves against offline HR → `employees` + `enrollments` created.
2. **Admin as employee:** One `employee_id`; face login = `enrollments`; desk/kiosk admin = `admin_roles` password. Provision worker first, grant admin second.
3. **Path B (planned):** Kiosk admin password session → batch fresh captures → ACTIVE immediately — separate from Path A; read sections 5–6 before implementing.
4. **Mendix unchanged.** SDK owns all overlay UI. Backend owns all DB and decisions.

When in doubt, read `docs/architecture/registration-flow.md` and `PROJECT_CONTEXT.md` (section **Work completed 2026-08-29**).
