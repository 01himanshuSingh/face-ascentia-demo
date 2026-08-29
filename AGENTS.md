# Face Authentication System — Architecture Update
## New Module: Admin Kiosk Batch Enrollment

> **Purpose of this file**: This is a project context file for Cursor (or any dev reading the repo) to understand the NEW addition to the existing architecture. Read this before touching SDK state-machine code or backend kiosk routes. Do not code yet — understand the intent first, exactly as the rest of this project's docs are structured.

---

## 1. What Already Exists (Unchanged — Do Not Modify)

The full end-to-end flow, free tech stack, plant-based workspace/RBAC, metadata/image storage split, duplicate prevention, 25K scalability design, and component ownership are ALL already finalized and documented in `docs/architecture/system-architecture.md`. This update does not change any of that — it ADDS one new capability on top of it.

Recap of what stays exactly the same:
- Mendix Web only ever shows: Employee ID field + Authenticate button. This NEVER changes, even with this update.
- SDK owns camera, liveness, capture, session handling.
- Backend (FastAPI + PostgreSQL/pgvector) owns matching, enrollment state, duplicate blocking, plant-scoped access, audit logging.
- Admin Portal (separate web app) still owns Accept/Reject review workflow, Employee history, Admin-Initiated Registration (one employee at a time, from a desk).
- Free stack (MediaPipe, OpenCV SFace, ONNX Runtime, pgvector) unchanged.

---

## 2. What's NEW: Admin Kiosk Batch Enrollment

### The Problem This Solves
Plant admins need to enroll multiple employees (e.g., a new joiner batch of 10) directly at the physical kiosk, without each employee going through the PENDING → separate admin review cycle. The admin is physically present verifying identity in real time, so this path skips the async review step — but is still fully auditable.

### Why This Is Different From Existing Admin-Initiated Registration
The existing "Admin-Initiated Registration" module lives in the Admin Portal (a desk-based web app, one employee registered at a time, still creates a request that could be reviewed). This NEW module is:
- Triggered directly from the KIOSK (not the Admin Portal)
- Session-based, batch-oriented (many employees enrolled in one continuous admin session)
- Auto-approved at the point of capture (no separate review step) — because the admin IS the reviewer, standing right there

These are two distinct features. Do not merge them into one code path — keep `AdminPortalInitiatedRegistration` and `AdminKioskBatchEnrollment` as separate services/endpoints, since their trust models differ (Portal = admin recalls a photo already taken by SDK earlier; Kiosk Batch = admin actively present for a fresh live capture, right now, repeatedly).

---

## 3. SDK State Machine — Full Update

This state machine REPLACES the SDK's previous simpler "not enrolled → register" flow with this expanded version. Mendix itself never sees or needs to know about states 3-5 — they are entirely SDK-internal, rendered by the SDK on top of the container Mendix gives it.

```
STATE 1: IDLE (Mendix's normal screen — UNCHANGED)
  → Employee ID + Authenticate button visible (Mendix-rendered)
  → Employee types ID, taps Authenticate → SDK.authenticate() called

STATE 2: AUTH RESULT
  → Match found → login success → back to STATE 1 (idle)
  → No match found → SDK takes over screen → STATE 3

STATE 3: SDK OVERLAY — Not Enrolled (NEW: now has two buttons, was one)
  → SDK renders its own UI (not Mendix's):
       [Employee Register]   [Admin Login]
  → Employee taps "Employee Register" → Path A: Mendix Register UI (Employee ID only);
       SDK reuses the JPEG from the failed authenticate capture — NO second camera session
  → Admin taps "Admin Login" → STATE 4 (NEW)

STATE 4: ADMIN AUTHENTICATING (NEW)
  → SDK shows admin login fields (Employee ID + password) — SDK-rendered, not Mendix
  → Calls POST /kiosk/admin-login
  → On success → admin_session_token issued → STATE 5
  → On failure → back to STATE 3

STATE 5: ADMIN ENROLLMENT LOOP (NEW — session active)
  → SDK shows: "Enter Employee ID to Enroll" + Capture button
  → Admin enters target employee ID, then captures face (FRESH capture every time —
       do NOT reuse the JPEG from the earlier Mendix authenticate attempt)
  → Calls POST /kiosk/admin-enroll (with admin_session_token)
  → Backend enrolls directly as ACTIVE (bypasses PENDING state)
  → Screen shows "✅ Enrolled" briefly → AUTOMATICALLY resets to same screen
  → Repeats for employee #2, #3 ... #10 — NO re-login required, NO routing back
    through Mendix's Authenticate button at all — SDK handles this loop entirely
    internally, calling only /kiosk/admin-enroll repeatedly
  → Admin taps "End Session" (persistent button, visible throughout STATE 5)
    OR session times out from inactivity (recommended: 15-20 min, or shorter
    idle-timeout e.g. 2 min between captures)
       → calls POST /kiosk/admin-logout → session_token invalidated
       → returns to STATE 1 (Mendix's normal idle screen)
```

### Critical Implementation Rule
Once in STATE 5, the loop between employees NEVER touches `SDK.authenticate()` (Mendix's entrypoint) again. It only calls the internal `enrollNextEmployee()` function repeatedly. This is what makes the batch loop fast — no re-authentication overhead per employee, only per admin session.

---

## 4. New Backend Endpoints (Add to `backend/app/api/routes/`)

Create a new route file: `backend/app/api/routes/kiosk_admin.py`

### POST /kiosk/admin-login
```
Body: { employee_id, password }
Logic: Validate against existing admin_roles table (SAME credentials as Admin Portal login — do not create a separate admin credential system)
Returns: { admin_session_token, plant_id, expires_at }
```

### POST /kiosk/admin-enroll
```
Headers: { admin_session_token }
Body: { employee_id, captured_frame [, kiosk_id] }
  kiosk_id — optional; omit in current rollout (same as POST /register); NULL in DB
Logic:
  1. Validate admin_session_token is still valid (not expired, not logged out)
  2. Run existing face pipeline: MediaPipe detect -> liveness check -> SFace embed
  3. Check employee_id doesn't already have an ACTIVE enrollment (reuse existing duplicate-prevention logic)
  4. Write registration_requests row:
       source = 'ADMIN_KIOSK'   (NEW allowed value, alongside existing 'KIOSK', 'ADMIN_PORTAL')
       status = 'APPROVED'       (written directly, NEVER 'PENDING' for this source)
       reviewed_by = <admin's employee_id from session>
       decision_reason = 'Kiosk batch enrollment'
  5. Write raw_images row (same as existing pattern, linked by request_id)
  6. Generate embedding, write to enrollments table as ACTIVE (reuse existing enrollment-write logic from the Accept path)
  7. Write audit_log entry: action = 'ADMIN_KIOSK_ENROLL', actor = admin's employee_id, target = enrolled employee_id, plant_id
Returns: { success, employee_id, enrollment_status }
```

### POST /kiosk/admin-logout
```
Headers: { admin_session_token }
Logic: Invalidate the session_token immediately
Returns: { success }
```

---

## 5. Schema Impact — No New Tables, Two Small Additions

Update `backend/app/database/models/registration_request.py`:
- Add `'ADMIN_KIOSK'` as a valid value in the `source` column's allowed values (alongside existing `'KIOSK'`, `'ADMIN_PORTAL'`)

Update `backend/app/common/enums.py`:
- Add `ADMIN_KIOSK_ENROLL` to the audit action enum (alongside existing `LOGIN`, `APPROVE`, `REJECT`, `VIEW_IMAGE`, `REVOKE`)

No new tables. No changes to `enrollments`, `raw_images`, `audit_log`, `plants`, `employees`, or `admin_roles` structure — this feature reuses everything that already exists.

---

## 6. Security Requirements (Non-Negotiable)

- `admin_session_token` MUST have a server-side expiry (recommended: 15-20 min absolute, OR 2 min inactivity timeout between enrollments — whichever comes first)
- Every single enrollment via this path MUST write a full audit_log entry — this bypasses the normal two-person review process, so the audit trail is what keeps it defensible, not optional
- `/kiosk/admin-enroll` MUST re-validate the session token on EVERY call (not just at login) — do not trust a client-side "still logged in" flag
- Consider (flag to client, not a code requirement yet): admin login at a shared kiosk device is a higher-risk credential-entry point than a private Admin Portal screen — recommend the client consider additional protection here (e.g., shorter timeout, or admin's own face+password) as a future hardening item

---

## 7. What NOT to Build (Explicitly Out of Scope for This Update)

- Do NOT change Mendix's UI — it still only ever shows Employee ID + Authenticate button, forever
- Do NOT merge this with Admin-Initiated Registration (Admin Portal) — keep them as separate code paths
- Do NOT create a new admin credential system — reuse existing `admin_roles` table and login logic
- Do NOT create a PENDING state for admin-kiosk enrollments — they are always directly APPROVED, this is the entire point of this feature
- Do NOT skip the audit_log write for any enrollment in this flow, even under time pressure

---

## 8. Summary for Cursor / Any Developer Reading This

You are adding ONE new capability to an already-complete architecture: **a session-based batch enrollment mode, triggered from the kiosk itself (not the Admin Portal), that lets a logged-in admin enroll many employees back-to-back without re-authenticating between each one.** It reuses the existing face-processing pipeline, existing admin credentials, existing database schema (with two small additive changes: a new `source` value and a new audit action type). Mendix's UI is completely unaffected. The SDK's internal state machine gains three new states (4, 5, and the two-button branch in state 3) on top of its existing simple flow.