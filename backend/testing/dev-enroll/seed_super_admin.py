#!/usr/bin/env python3
"""
Dev bootstrap — first SUPER_ADMIN (IT root account).

SUPER_ADMIN cannot be created via POST /admin/users/grant.
Run once per environment after alembic upgrade head.

Usage (from backend/ with venv active):

  python testing/dev-enroll/seed_super_admin.py \\
    --employee-id SUPER001 \\
    --password changeme

Creates DEV01 plant if missing. Run seed_admin.py next for PLANT_ADMIN testing.
Workers are registered manually via test-harness (not seeded here).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select

from app.common.enums import AdminRoleType, EmployeeStatus
from app.database.models.admin_role import AdminRole
from app.database.models.employee import Employee
from app.database.models.plant import Plant
from app.database.session import SessionLocal
from app.repositories import admin_role_repository
from app.services.admin_auth import AdminAuthService
from app.services.admin_rbac import assign_default_permissions


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed SUPER_ADMIN bootstrap account.")
    parser.add_argument("--employee-id", default="SUPER001")
    parser.add_argument("--full-name", default="Super Admin")
    parser.add_argument("--password", default="changeme")
    parser.add_argument(
        "--plant-code",
        default="DEV01",
        help="Plant for employees row if created (super admin plant_id stays NULL).",
    )
    return parser.parse_args()


def get_or_create_plant(db, *, plant_code: str) -> Plant:
    plant = db.scalars(
        select(Plant).where(Plant.plant_code == plant_code).limit(1)
    ).first()
    if plant is not None:
        return plant
    plant = Plant(plant_name="Development Plant", plant_code=plant_code, is_active=True)
    db.add(plant)
    db.flush()
    return plant


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        plant = get_or_create_plant(db, plant_code=args.plant_code.strip())

        employee = db.get(Employee, args.employee_id.strip())
        if employee is None:
            employee = Employee(
                employee_id=args.employee_id.strip(),
                plant_id=plant.plant_id,
                full_name=args.full_name.strip(),
                status=EmployeeStatus.ACTIVE.value,
            )
            db.add(employee)
            db.flush()
        else:
            employee.full_name = args.full_name.strip()
            employee.status = EmployeeStatus.ACTIVE.value

        admin = db.scalars(
            select(AdminRole).where(AdminRole.employee_id == employee.employee_id).limit(1)
        ).first()
        password_hash = AdminAuthService.hash_password(args.password)

        if admin is None:
            admin = AdminRole(
                employee_id=employee.employee_id,
                plant_id=None,
                role=AdminRoleType.SUPER_ADMIN.value,
                password_hash=password_hash,
                is_active=True,
                granted_by=None,
            )
            db.add(admin)
        else:
            admin.plant_id = None
            admin.role = AdminRoleType.SUPER_ADMIN.value
            admin.password_hash = password_hash
            admin.is_active = True
            admin_role_repository.clear_permissions(db, admin.role_id)

        db.flush()
        db.refresh(admin)
        assign_default_permissions(db, role_id=admin.role_id, role=AdminRoleType.SUPER_ADMIN)

        db.commit()
        print("SUPER_ADMIN seeded:")
        print(f"  employee_id={employee.employee_id}")
        print(f"  password={args.password}")
        print("\nUse Admin Portal to grant PLANT_ADMIN per plant via POST /admin/users/grant.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
