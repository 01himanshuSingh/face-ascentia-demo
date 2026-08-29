# Kiosk Registration Flows — Registration-first (Hybrid)

Two registration paths from the **Not Enrolled** branch. Do not merge them.

| Path | Who | Capture rule | Endpoint | Result |
|------|-----|--------------|----------|--------|
| **A — Employee self-register** | Employee | **One capture** at auth; **reuse** JPEG on register | `POST /register` | PENDING → plant admin approve |
| **B — Admin kiosk batch** | Plant admin at kiosk | **Fresh capture per employee** after admin login | `POST /kiosk/admin-enroll` | ACTIVE immediately |

---

# Path A — Registration-first self-enroll (Hybrid)

HR keeps employee master data **offline** (separate machine / paper). The face-auth system does **not** require a pre-existing `employees` row at kiosk submit time.

## Kiosk Register UI fields

| Field | Required | Source |
|-------|----------|--------|
| **Plant** | Yes | Employee selects from `GET /plants` |
| **Employee ID** | Yes | Employee enters business ID |
| **Full name** | Yes | HR offline matching hint |
| **Face photo** | Yes | Reused from authenticate capture |

## Sequence

```text
1. Mendix — Employee ID → Authenticate
2. SDK    — Camera → blink → JPEG (once)
3. SDK    — POST /authenticate
4. Backend — 404 ENROLLMENT_NOT_FOUND or EMPLOYEE_NOT_FOUND
5. SDK    — retain lastCapture
6. SDK    — Register overlay: Plant + Employee ID + Full name
7. SDK    — POST /register { plant_id, employee_id, full_name, image }
8. Backend — registration_requests PENDING (plant_id from form)
             raw_images — NO employees / enrollments row yet
9. Plant admin — Admin Portal queue filtered by plant_id
10. HR compares offline backup → Approve or Reject
11. On APPROVE — backend creates employees + ACTIVE enrollment
12. Employee may authenticate on next visit
```

## POST /register contract

| Field | Required | Notes |
|-------|----------|-------|
| `plant_id` | Yes | Routes request to plant admin queue |
| `employee_id` | Yes | Business ID |
| `full_name` | Yes | Submitted for HR verification |
| `image` | Yes | Reused from authenticate capture |
| `kiosk_id` | No | Omitted → NULL |
| `session_id` | No | SDK capture session when wired |

## Admin Portal review

| Endpoint | Purpose |
|----------|---------|
| `POST /admin/login` | Plant admin credentials |
| `GET /admin/registrations/pending` | Plant-scoped PENDING queue |
| `GET /admin/registrations/{id}/image` | Face photo for HR comparison |
| `POST /admin/registrations/{id}/approve` | Creates employee + enrollment |
| `POST /admin/registrations/{id}/reject` | Rejects with reason |

`PLANT_ADMIN` sees only their plant. `SUPER_ADMIN` sees all plants.

## Trust model

- Employee **self-declares** plant + ID + name at kiosk.
- Login stays **blocked** until admin approves against offline HR records.
- Duplicate face check runs at register and again at approve (plant-scoped pgvector).

---

# Path B — Admin Kiosk Batch (optional, orientation days)

See `AGENTS.md`. Admin present at kiosk → fresh capture per employee → ACTIVE immediately (no PENDING queue).
