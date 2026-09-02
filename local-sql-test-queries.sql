-- =============================================================================
-- LOCAL SQL TEST QUERIES — Face Auth Detection (READ-ONLY)
-- =============================================================================
-- Standalone file for manual testing. NOT used by the app, migrations, or CI.
--
-- Database: PostgreSQL + pgvector (NOT Microsoft SQL Server).
-- Local default (see .env): host=localhost port=5433 db=face_auth user=face_auth
--
-- Run examples:
--   psql "postgresql://face_auth:change_me_local_only@localhost:5433/face_auth" -f local-sql-test-queries.sql
--   psql ... -c "SELECT ..."   (copy one query block)
--
-- Replace placeholder IDs: ADMIN001, SUPER001, EMP003, DEV01 plant UUID, etc.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SCHEMA / CATALOG (inspection)
-- -----------------------------------------------------------------------------

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';

SELECT version_num
FROM alembic_version;


-- -----------------------------------------------------------------------------
-- 2. PLANTS (GET /plants — plant_repository.list_active)
-- Equivalent ORM: SELECT * FROM plants WHERE is_active = true
-- -----------------------------------------------------------------------------

SELECT plant_id, plant_code, plant_name, is_active, created_at
FROM plants
WHERE is_active = true
ORDER BY plant_code;

SELECT plant_id, plant_code, plant_name
FROM plants
WHERE plant_code = 'DEV01';


-- -----------------------------------------------------------------------------
-- 3. EMPLOYEES (worker identity — plant is fixed at enroll/approve)
-- Equivalent ORM: employee_repository.get_by_id / get_by_id_with_plant
-- -----------------------------------------------------------------------------

SELECT employee_id, plant_id, full_name, status, created_at
FROM employees
ORDER BY employee_id;

SELECT
  e.employee_id,
  e.full_name,
  e.plant_id,
  p.plant_code,
  p.plant_name,
  e.status
FROM employees e
JOIN plants p ON p.plant_id = e.plant_id
WHERE e.employee_id = 'EMP003';

SELECT employee_id, full_name, plant_id, status
FROM employees
WHERE plant_id = (
  SELECT plant_id FROM plants WHERE plant_code = 'DEV01' LIMIT 1
);


-- -----------------------------------------------------------------------------
-- 4. ENROLLMENTS (POST /authenticate — active face rows per plant)
-- Equivalent ORM: enrollment_repository lookups + duplicate_check
-- -----------------------------------------------------------------------------

SELECT
  enrollment_id,
  employee_id,
  plant_id,
  status,
  model_version,
  created_at
FROM enrollments
WHERE status = 'ACTIVE'
ORDER BY employee_id;

SELECT *
FROM enrollments
WHERE employee_id = 'EMP003'
  AND status = 'ACTIVE';

-- pgvector nearest-neighbor (duplicate_check / authenticate match pattern)
-- Replace the vector literal with a real 128-D embedding from your DB for experiments.
-- SQLAlchemy uses: ORDER BY embedding <=> query_vector LIMIT 1
-- Cosine distance operator: <=>   Cosine similarity ≈ (1 - distance)

SELECT
  employee_id,
  1 - (embedding <=> '[0.0,0.0,0.0]'::vector) AS cosine_similarity
FROM enrollments
WHERE plant_id = (SELECT plant_id FROM plants WHERE plant_code = 'DEV01' LIMIT 1)
  AND status = 'ACTIVE'
ORDER BY embedding <=> '[0.0,0.0,0.0]'::vector
LIMIT 1;


-- -----------------------------------------------------------------------------
-- 5. REGISTRATION QUEUE (Admin Portal — GET /admin/registrations/pending)
-- Equivalent ORM: registration_repository.list_pending_by_plant / list_pending_all
-- -----------------------------------------------------------------------------

-- PLANT_ADMIN scope (one plant)
SELECT
  rr.request_id,
  rr.employee_id,
  rr.submitted_full_name,
  rr.plant_id,
  p.plant_code,
  p.plant_name,
  rr.status,
  rr.source,
  rr.captured_at
FROM registration_requests rr
LEFT JOIN plants p ON p.plant_id = rr.plant_id
WHERE rr.status = 'PENDING'
  AND rr.plant_id = (SELECT plant_id FROM plants WHERE plant_code = 'DEV01' LIMIT 1)
ORDER BY rr.captured_at DESC;

-- SUPER_ADMIN scope (all plants)
SELECT
  rr.request_id,
  rr.employee_id,
  rr.submitted_full_name,
  rr.plant_id,
  rr.status,
  rr.source,
  rr.captured_at
FROM registration_requests rr
WHERE rr.status = 'PENDING'
ORDER BY rr.plant_id, rr.captured_at DESC;

-- Guard before POST /register (one PENDING per employee)
SELECT request_id, employee_id, status, plant_id, captured_at
FROM registration_requests
WHERE employee_id = 'EMP003'
  AND status = 'PENDING'
LIMIT 1;


-- -----------------------------------------------------------------------------
-- 6. RAW IMAGES (admin registration image — binary metadata only in SQL)
-- -----------------------------------------------------------------------------

SELECT
  ri.image_id,
  ri.request_id,
  ri.employee_id,
  ri.plant_id,
  length(ri.image_bytes) AS jpeg_bytes,
  ri.created_at
FROM raw_images ri
ORDER BY ri.created_at DESC
LIMIT 20;


-- -----------------------------------------------------------------------------
-- 7. ADMIN ROLES + RBAC (login + grant)
-- Equivalent ORM: admin_role_repository + admin_auth login permission load
-- -----------------------------------------------------------------------------

SELECT
  ar.role_id,
  ar.employee_id,
  ar.role,
  ar.plant_id,
  p.plant_code,
  ar.is_active,
  ar.granted_by,
  ar.created_at
FROM admin_roles ar
LEFT JOIN plants p ON p.plant_id = ar.plant_id
ORDER BY ar.employee_id;

-- Permissions loaded at login (admin_role_permissions)
SELECT
  ar.employee_id,
  ar.role,
  arp.permission_code
FROM admin_roles ar
JOIN admin_role_permissions arp ON arp.role_id = ar.role_id
WHERE ar.employee_id = 'ADMIN001'
  AND ar.is_active = true
ORDER BY arp.permission_code;

SELECT
  ar.employee_id,
  ar.role,
  arp.permission_code
FROM admin_roles ar
JOIN admin_role_permissions arp ON arp.role_id = ar.role_id
WHERE ar.employee_id = 'SUPER001'
  AND ar.is_active = true
ORDER BY arp.permission_code;

-- Permission catalog (admin_permissions — seeded by migration 20260831_0006)
SELECT permission_code, description
FROM admin_permissions
ORDER BY permission_code;

-- Grant preview pattern (GET /admin/users/grant-preview/{employeeId})
-- Plant is derived from employees.plant_id — not chosen in the form.
SELECT
  e.employee_id,
  e.full_name,
  e.plant_id,
  p.plant_code,
  p.plant_name
FROM employees e
JOIN plants p ON p.plant_id = e.plant_id
WHERE e.employee_id = 'EMP003';

-- Verify PLANT_ADMIN has grant permission (migration 20260831_0008 backfill)
SELECT
  ar.employee_id,
  ar.role,
  arp.permission_code
FROM admin_roles ar
JOIN admin_role_permissions arp ON arp.role_id = ar.role_id
WHERE ar.role = 'PLANT_ADMIN'
  AND arp.permission_code = 'ADMIN_GRANT_PLANT_ADMIN';


-- -----------------------------------------------------------------------------
-- 8. AUDIT LOG (append-only — approve, reject, grant, kiosk enroll)
-- -----------------------------------------------------------------------------

SELECT
  audit_id,
  action,
  actor_id,
  actor_role,
  target_type,
  target_id,
  plant_id,
  metadata,
  created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 50;

SELECT action, count(*) AS n
FROM audit_log
GROUP BY action
ORDER BY n DESC;


-- -----------------------------------------------------------------------------
-- 9. REFERENCE — raw SQL shapes used in Alembic migrations (SELECT previews)
-- These are the SQL *patterns* from backend/migrations/versions/*.py
-- -----------------------------------------------------------------------------

-- 20260831_0006 — seed role permissions (preview who would get a permission)
SELECT ar.role_id, ar.role, ar.employee_id
FROM admin_roles ar
WHERE ar.role = 'PLANT_ADMIN';

-- 20260831_0008 — backfill preview (read-only; migration runs INSERT)
SELECT ar.role_id, 'ADMIN_GRANT_PLANT_ADMIN' AS permission_code
FROM admin_roles ar
WHERE ar.role = 'PLANT_ADMIN';

-- 20260831_0007 — rows that migration removes (SUB_ADMIN grant on plant admins)
SELECT ar.employee_id, arp.permission_code
FROM admin_role_permissions arp
JOIN admin_roles ar ON ar.role_id = arp.role_id
WHERE arp.permission_code = 'ADMIN_GRANT_SUB_ADMIN';


-- -----------------------------------------------------------------------------
-- 10. JOINED CHECKS (grant business rules — read-only validation)
-- -----------------------------------------------------------------------------

-- Employee plant must equal admin_roles.plant_id after grant
SELECT
  e.employee_id,
  e.plant_id AS employee_plant,
  ar.plant_id AS admin_plant,
  (e.plant_id = ar.plant_id) AS plant_match
FROM employees e
JOIN admin_roles ar ON ar.employee_id = e.employee_id
WHERE ar.role = 'PLANT_ADMIN';

-- Workers in DEV01 eligible for grant (exist as employee; may or may not be admin yet)
SELECT
  e.employee_id,
  e.full_name,
  p.plant_code,
  CASE WHEN ar.role_id IS NULL THEN 'worker_only' ELSE ar.role END AS admin_state
FROM employees e
JOIN plants p ON p.plant_id = e.plant_id
LEFT JOIN admin_roles ar ON ar.employee_id = e.employee_id
WHERE p.plant_code = 'DEV01'
ORDER BY e.employee_id;


-- =============================================================================
-- OPTIONAL — DESTRUCTIVE (commented out; dev reset only)
-- Source: backend/testing/dev-enroll/reset_dev_database.py
-- Do NOT run on production. Uncomment only if you intend to wipe dev data.
-- =============================================================================

-- TRUNCATE TABLE
--   audit_log,
--   raw_images,
--   registration_requests,
--   enrollments,
--   admin_role_permissions,
--   admin_roles,
--   employees,
--   plants
-- RESTART IDENTITY CASCADE;
