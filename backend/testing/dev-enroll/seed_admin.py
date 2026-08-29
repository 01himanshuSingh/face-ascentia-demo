#!/usr/bin/env python3
"""
Dev tool — seed a PLANT_ADMIN for Admin Portal review testing.

Usage (from backend/ with venv active):

  python testing/dev-enroll/seed_admin.py \\
    --employee-id ADMIN001 \\
    --password changeme \\
    --plant-code DEV01
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
from app.services.admin_auth import AdminAuthService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed plant admin credentials.")
    parser.add_argument("--employee-id", default="ADMIN001")
    parser.add_argument("--full-name", default="Plant Admin")
    parser.add_argument("--password", default="changeme")
    parser.add_argument("--plant-code", default="DEV01")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        plant = db.scalars(
            select(Plant).where(Plant.plant_code == args.plant_code.strip()).limit(1)
        ).first()
        if plant is None:
            raise SystemExit(f"Plant {args.plant_code!r} not found. Run seed_employee_only.py first.")

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
            employee.plant_id = plant.plant_id
            employee.full_name = args.full_name.strip()
            employee.status = EmployeeStatus.ACTIVE.value

        admin = db.scalars(
            select(AdminRole).where(AdminRole.employee_id == employee.employee_id).limit(1)
        ).first()
        password_hash = AdminAuthService.hash_password(args.password)
        if admin is None:
            admin = AdminRole(
                employee_id=employee.employee_id,
                plant_id=plant.plant_id,
                role=AdminRoleType.PLANT_ADMIN.value,
                password_hash=password_hash,
                is_active=True,
            )
            db.add(admin)
        else:
            admin.plant_id = plant.plant_id
            admin.role = AdminRoleType.PLANT_ADMIN.value
            admin.password_hash = password_hash
            admin.is_active = True

        db.commit()
        print("Plant admin seeded:")
        print(f"  employee_id={employee.employee_id}")
        print(f"  plant_code={plant.plant_code}")
        print(f"  password={args.password}")
        print("\nAdmin Portal login → review PENDING registrations for this plant.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
