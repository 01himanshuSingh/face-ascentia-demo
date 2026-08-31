# Database Schema Specification

**Database:** PostgreSQL + pgvector

**Purpose:** The database supports the Face Authentication System running on the organization's own infrastructure.

The schema must support:

- Employee identity
- Plant/workspace isolation
- Face enrollment
- Face embeddings
- Authentication matching
- Registration requests
- Captured registration images
- Admin roles
- Audit history

This document is the authoritative database design for the Face Authentication System.

---

## 1. Schema Design Principles

1. Every table that holds employee/plant data carries `plant_id` where applicable. `plant_id` is the workspace boundary.

2. Metadata and raw image data are separated:
   - `registration_requests` stores request metadata.
   - `raw_images` stores captured image bytes.

3. Face embeddings are stored separately in `enrollments`.

4. Authentication should primarily access the enrollment data required for employee verification rather than image-heavy registration/history data.

5. No hard deletes for lifecycle-managed records. Status fields represent lifecycle states such as:
   - `PENDING`
   - `APPROVED`
   - `REJECTED`
   - `ACTIVE`
   - `REVOKED`

6. `audit_log` is append-only.

7. UUIDs are used for system-generated primary keys where specified.

8. `employee_id` is the business Employee ID and remains `TEXT` because it comes from the organization's employee identity system.

---

## 2. Entity Relationship Overview

```
plants
  ├──< employees
  │      ├──< enrollments
  │      ├──< registration_requests
  │      │       └──< raw_images
  │      └──< audit_log
  │
  └──< admin_roles
          │
          └── employees
```

**Legend:** `──<` means one-to-many. FK relationships are shown by nesting.

### Relationship meaning

- One plant contains many employees.
- An employee can have enrollment records over time.
- An employee can have multiple registration requests over time.
- A registration request can have one raw image record.
- Admin roles associate an employee with a plant workspace.
- Audit records record actions against employees/requests/enrollments.

---

## 3. plants

**Table:** `plants`

**Purpose:** Root entity for plant/workspace isolation. One row per plant/location.

| Column | Type | Constraint / Note |
|--------|------|-------------------|
| `plant_id` | UUID | PRIMARY KEY, default `gen_random_uuid()` |
| `plant_name` | TEXT | NOT NULL |
| `plant_code` | TEXT | UNIQUE — short code used in kiosk_id references |
| `is_active` | BOOLEAN | DEFAULT `true` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

---

## 4. employees

**Table:** `employees`

**Purpose:** Permanent employee identity record, independent of how many times they register.

| Column | Type | Constraint / Note |
|--------|------|-------------------|
| `employee_id` | TEXT | PRIMARY KEY (business ID, e.g. company Employee ID) |
| `plant_id` | UUID | FK → `plants(plant_id)`, NOT NULL, INDEXED |
| `full_name` | TEXT | NOT NULL |
| `department` | TEXT | nullable |
| `status` | TEXT | CHECK IN (`'ACTIVE'`, `'INACTIVE'`), DEFAULT `'ACTIVE'` |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

### Index

```sql
CREATE INDEX idx_employees_plant ON employees(plant_id);
```

`employee_id` is the organization's business identifier, not a generated UUID.

---

## 5. enrollments

**Table:** `enrollments`

**Purpose:** Stores face embeddings used for authentication. This is the only table the login/authenticate flow reads from for the stored template.

Stores **one active embedding per employee**.

| Column | Type | Constraint / Note |
|--------|------|-------------------|
| `enrollment_id` | UUID | PRIMARY KEY, default `gen_random_uuid()` |
| `employee_id` | TEXT | FK → `employees(employee_id)`, NOT NULL, INDEXED |
| `plant_id` | UUID | FK → `plants(plant_id)`, NOT NULL, INDEXED |
| `embedding` | VECTOR(128) | pgvector type — dimension depends on model (e.g. SFace=128) |
| `status` | TEXT | CHECK IN (`'ACTIVE'`, `'REVOKED'`), DEFAULT `'ACTIVE'` |
| `source_request_id` | UUID | FK → `registration_requests(request_id)` |
| `model_version` | TEXT | NOT NULL — tracks which embedding model generated this |
| `revoked_by` | TEXT | FK → `employees(employee_id)`, nullable |
| `revoked_reason` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

### Indexes

```sql
CREATE UNIQUE INDEX idx_enroll_active_emp
  ON enrollments(employee_id)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_enroll_vector
  ON enrollments
  USING hnsw (embedding vector_cosine_ops);
```

### Notes

- One active enrollment per employee is enforced by the partial unique index.
- `model_version` is retained so embeddings can be associated with the model version that generated them.
- HNSW is intended for 1:N vector searches such as future duplicate/fraud checks.
- Authentication with a known Employee ID is primarily a 1:1 verification flow.

> **Schema Decision / Verification Required:** confirm the embedding dimension from the exact SFace model selected for production before creating the final migration. Do not assume `VECTOR(128)` is final without verifying the actual SFace model output dimension during implementation.

---

## 6. registration_requests

**Table:** `registration_requests`

**Purpose:** Permanent history of employee registration attempts (kiosk or admin-initiated). Never deleted; only status changes.

**Kiosk employee self-register (Path A):** row created by `POST /register` after authenticate returns `ENROLLMENT_NOT_FOUND`. The employee confirms Employee ID on Mendix Register UI; the SDK reuses the auth capture JPEG (no second camera session). Status starts `PENDING`, `source=KIOSK`. See `registration-flow.md`.

| Column | Type | Constraint / Note |
|--------|------|-------------------|
| `request_id` | UUID | PRIMARY KEY, default `gen_random_uuid()` |
| `employee_id` | TEXT | FK → `employees(employee_id)`, NOT NULL, INDEXED |
| `plant_id` | UUID | FK → `plants(plant_id)`, NOT NULL, INDEXED |
| `kiosk_id` | TEXT | nullable — **optional; not sent in current rollout** (Path A + Path B) |
| `source` | TEXT | CHECK IN (`'KIOSK'`, `'ADMIN_PORTAL'`, `'ADMIN_KIOSK'`) |
| `status` | TEXT | CHECK IN (`'PENDING'`, `'APPROVED'`, `'REJECTED'`), DEFAULT `'PENDING'` |
| `session_id` | TEXT | SDK capture-session id (Path A: same as auth capture; nullable until SDK sends) |
| `reviewed_by` | TEXT | FK → `employees(employee_id)`, nullable |
| `reviewed_at` | TIMESTAMPTZ | nullable |
| `decision_reason` | TEXT | nullable |
| `captured_at` | TIMESTAMPTZ | DEFAULT `now()` |

### Indexes

```sql
CREATE UNIQUE INDEX idx_one_pending_per_emp
  ON registration_requests(employee_id)
  WHERE status = 'PENDING';

CREATE INDEX idx_reqs_plant_status
  ON registration_requests(plant_id, status);
```

### Notes

- The unique partial index prevents more than one pending registration request for the same employee.
- The registration request row is retained as history and changes state rather than being hard-deleted.

---

## 7. raw_images

**Table:** `raw_images`

**Purpose:** Stores the actual captured registration image separately from registration metadata so list/history queries stay lightweight.

| Column | Type | Constraint / Note |
|--------|------|-------------------|
| `image_id` | UUID | PRIMARY KEY, default `gen_random_uuid()` |
| `request_id` | UUID | FK → `registration_requests(request_id)`, NOT NULL, UNIQUE |
| `image_data` | BYTEA | nullable (nulled out after retention window expires) |
| `captured_at` | TIMESTAMPTZ | DEFAULT `now()` |

### Notes

- One registration request has at most one raw image record.
- Admin request/history list queries should not load image bytes.
- Image data should be fetched only when needed (single `request_id` lookup), never joined into list queries.
- Retention cleanup can null `image_data` without deleting the registration request history.
- Future storage abstraction may allow image bytes to move to filesystem/object storage without changing registration request semantics.

---

## 8. admin_roles

**Table:** `admin_roles`

**Purpose:** Maps an employee to an admin role, plant workspace, and password. Permissions are in **`admin_role_permissions`**.

| Column | Type | Constraint / Note |
|--------|------|-------------------|
| `role_id` | UUID | PRIMARY KEY |
| `employee_id` | TEXT | FK → `employees(employee_id)`, NOT NULL, UNIQUE |
| `plant_id` | UUID | FK → `plants(plant_id)`, nullable if `SUPER_ADMIN` |
| `role` | TEXT | CHECK IN (`'SUPER_ADMIN'`, `'PLANT_ADMIN'`, `'SUB_ADMIN'`) |
| `password_hash` | TEXT | NOT NULL |
| `is_active` | BOOLEAN | DEFAULT `true` |
| `granted_by` | TEXT | FK → `employees(employee_id)`, nullable — who granted this admin row |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()` |

### Notes

- **SUPER_ADMIN** — `plant_id` NULL; all plants; grants `PLANT_ADMIN` only (v1).
- **PLANT_ADMIN** — one plant; approve/reject registrations for **that plant only**.
- **SUB_ADMIN** — schema reserved; **not used in v1** (future sub-delegation).
- Worker-first: grant admin only after `employees` row exists (ideally with enrollment).

---

## 8b. admin_permissions + admin_role_permissions

**Tables:** permission catalog + junction (scalable; v1 uses fixed defaults per role).

| `admin_permissions` | |
|---------------------|---|
| `permission_code` | TEXT PK |
| `description` | TEXT |

| `admin_role_permissions` | |
|--------------------------|---|
| `role_id` | FK → `admin_roles(role_id)` |
| `permission_code` | FK → `admin_permissions(permission_code)` |

**v1 active permissions:** four `REGISTRATION_*` + `ADMIN_GRANT_PLANT_ADMIN` (super only).  
`ADMIN_GRANT_SUB_ADMIN` stays in catalog for a future phase — not assigned in v1.

Default set assigned per role when grant runs or bootstrap seed scripts run.

---

## 9. audit_log

**Table:** `audit_log`

**Purpose:** Append-only audit record for sensitive system actions. Never updated or deleted by normal application operations; partition by month at scale.

| Column | Type | Constraint / Note |
|--------|------|-------------------|
| `log_id` | UUID | PRIMARY KEY, default `gen_random_uuid()` |
| `actor_id` | TEXT | FK → `employees(employee_id)` |
| `actor_role` | TEXT | nullable |
| `action` | TEXT | e.g. `LOGIN`, `APPROVE`, `REJECT`, `VIEW_IMAGE`, `REVOKE` |
| `target_type` | TEXT | e.g. `'employee'`, `'request'`, `'enrollment'` |
| `target_id` | TEXT | identifier of the target record |
| `plant_id` | UUID | FK → `plants(plant_id)` |
| `ip_address` | TEXT | nullable |
| `metadata` | JSONB | flexible extra context |
| `created_at` | TIMESTAMPTZ | DEFAULT `now()`, INDEXED |

### Index

```sql
CREATE INDEX idx_audit_plant_time ON audit_log(plant_id, created_at);
```

### Notes

- `audit_log` is append-only and must not be updated or deleted by normal application operations.
- At larger scale, monthly partitioning may be considered.

---

## 10. Foreign Key Relationships

```
plants.plant_id
    ↓
employees.plant_id

employees.employee_id
    ↓
enrollments.employee_id

plants.plant_id
    ↓
enrollments.plant_id

employees.employee_id
    ↓
registration_requests.employee_id

plants.plant_id
    ↓
registration_requests.plant_id

registration_requests.request_id
    ↓
raw_images.request_id

employees.employee_id
    ↓
admin_roles.employee_id

plants.plant_id
    ↓
admin_roles.plant_id

employees.employee_id
    ↓
audit_log.actor_id

plants.plant_id
    ↓
audit_log.plant_id

enrollments.source_request_id
    ↓
registration_requests.request_id

enrollments.revoked_by
    ↓
employees.employee_id

registration_requests.reviewed_by
    ↓
employees.employee_id
```

> **Schema Decision / Verification Required:** `enrollments.source_request_id` references `registration_requests`, while `registration_requests` does not reference `enrollments`. Migration ordering must create `registration_requests` before adding the `enrollments.source_request_id` FK (or add that FK in a later migration step). Confirm FK creation order when generating Alembic migrations.

---

## 11. Index Strategy

| Table | Index | Purpose |
|-------|--------|---------|
| `employees` | `idx_employees_plant` | Fast plant-scoped employee lookups and workspace isolation queries |
| `enrollments` | `idx_enroll_active_emp` | Enforce at most one ACTIVE enrollment per employee; speed auth lookup by Employee ID |
| `enrollments` | `idx_enroll_vector` | HNSW index for 1:N cosine vector search (duplicate/fraud checks) |
| `registration_requests` | `idx_one_pending_per_emp` | Prevent more than one PENDING request per employee |
| `registration_requests` | `idx_reqs_plant_status` | Plant admin queues filtered by plant + status |
| `audit_log` | `idx_audit_plant_time` | Plant-scoped audit history ordered by time |

---

## 12. Plant / Workspace Isolation

`plant_id` is the structural workspace boundary.

Every relevant employee-related table contains `plant_id`.

Application-level authorization will later ensure:

```
PLANT_ADMIN
    ↓
their plant_id
    ↓
only records belonging to that plant
```

The UI must never be considered the security boundary.

Database/application query scoping must enforce workspace isolation.

---

## 13. Authentication Data Access Pattern

Intended Week 1 authentication path:

```
Employee ID
    ↓
employees
    ↓
active enrollment
    ↓
stored embedding
    ↓
face embedding from captured frame
    ↓
cosine similarity
    ↓
authentication decision
```

Authentication should **not** need to scan:

- `registration_requests`
- `raw_images`
- `audit_log`

for normal employee login.

---

## 14. Vector Matching

pgvector provides the vector data type and similarity operations.

The intended similarity metric is cosine similarity/distance.

```
embedding VECTOR(...)
        ↓
pgvector
        ↓
cosine comparison
```

- HNSW is intended for 1:N searches.
- Known Employee ID authentication is primarily a 1:1 verification flow.
- Do not hardcode an unverified embedding dimension in implementation.

> **Schema Decision / Verification Required:** confirm the embedding dimension from the exact SFace model selected for production before creating the final migration.

---

## 15. Data Lifecycle

### Employee

- `ACTIVE`
- `INACTIVE`

### Enrollment

- `ACTIVE`
- `REVOKED`

### Registration request

- `PENDING`
- `APPROVED`
- `REJECTED`

### Raw image

```
Captured
    ↓
Retained temporarily
    ↓
image_data nulled after retention period
```

Registration request history remains.

Audit log remains append-only.

---

## 16. Scalability

This schema is intended to support approximately:

- **25,000 employees**
- **70 kiosks**

without requiring a fundamental schema redesign.

Reasons:

- `plant_id` enables workspace scaling
- `enrollments` remains relatively small (one ACTIVE template per employee)
- HNSW supports vector search
- Metadata/image separation prevents image bytes from affecting normal list queries
- UUIDs support distributed inserts
- `audit_log` can be partitioned later
- Raw image storage can later be moved behind a storage abstraction

Do not claim a specific performance number unless it is benchmarked.

---

## 17. Implementation Verification Before Migration

Before creating Alembic migrations or applying schema to any environment:

1. Verify the exact SFace embedding dimension.
2. Verify the exact pgvector version supported by the selected PostgreSQL version.
3. Verify the PostgreSQL extension required for `gen_random_uuid()`.
4. Verify all FK relationships before generating Alembic migrations.
5. Verify partial unique indexes in PostgreSQL.
6. Verify HNSW index support for the selected pgvector version.
7. Verify retention behavior for `raw_images`.
8. Verify whether `audit_log` will use monthly partitioning at the expected production volume.

---

## 18. Important Development Rule

This document is the database specification.

Future SQLAlchemy models and Alembic migrations must follow this document.

Do not modify the schema during implementation without explicitly documenting the change first.

Do not create database models for future features merely because they are described here.

The documentation can describe the complete final schema, while Week 1 implementation may only activate the models required for authentication (`plants`, `employees`, `enrollments`).
