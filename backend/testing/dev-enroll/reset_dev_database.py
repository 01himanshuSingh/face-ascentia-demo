#!/usr/bin/env python3
"""
Dev-only — wipe application data and keep schema + permission catalog.

Clears workers, enrollments, registrations, images, audit log, and admin accounts.
Run seed_super_admin.py + seed_admin.py immediately after.

Usage (from backend/ with venv active):

  python testing/dev-enroll/reset_dev_database.py
  python testing/dev-enroll/seed_super_admin.py
  python testing/dev-enroll/seed_admin.py

Does NOT drop tables or admin_permissions catalog rows.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text

from app.database.session import SessionLocal

# FK-safe wipe — admin_permissions catalog is intentionally excluded.
_TRUNCATE_SQL = """
TRUNCATE TABLE
  audit_log,
  raw_images,
  registration_requests,
  enrollments,
  admin_role_permissions,
  admin_roles,
  employees,
  plants
RESTART IDENTITY CASCADE;
"""


def main() -> int:
    db = SessionLocal()
    try:
        db.execute(text(_TRUNCATE_SQL))
        db.commit()
        print("Dev database reset complete.")
        print("  Cleared: plants, employees, enrollments, registrations, images, audit, admins")
        print("  Kept:    schema, admin_permissions catalog")
        print("\nNext:")
        print("  python testing/dev-enroll/seed_super_admin.py")
        print("  python testing/dev-enroll/seed_admin.py")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
