#!/usr/bin/env python3
"""
Dev tool — create an ACTIVE employee row with NO face enrollment.

Use this to test Path A self-register:
  authenticate → ENROLLMENT_NOT_FOUND → SDK Register overlay → POST /register

Usage (from backend/ with venv active):

  python testing/dev-enroll/seed_employee_only.py --employee-id EMP003 --full-name "Test User"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select

from app.common.enums import EmployeeStatus
from app.database.models.employee import Employee
from app.database.models.plant import Plant
from app.database.session import SessionLocal


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed one ACTIVE employee without enrollment (register flow testing).",
    )
    parser.add_argument(
        "--employee-id",
        default="EMP003",
        help="Business Employee ID. Default EMP003.",
    )
    parser.add_argument(
        "--full-name",
        default="Register Test User",
        help="Display name on employees.full_name.",
    )
    parser.add_argument(
        "--plant-code",
        default="DEV01",
        help="Plant code (creates plant if missing). Default DEV01.",
    )
    parser.add_argument(
        "--plant-name",
        default="Development Plant",
        help="Plant name when creating a new plant row.",
    )
    return parser.parse_args()


def get_or_create_plant(db, *, plant_code: str, plant_name: str) -> Plant:
    plant = db.scalars(
        select(Plant).where(Plant.plant_code == plant_code).limit(1)
    ).first()
    if plant is not None:
        return plant

    plant = Plant(plant_name=plant_name, plant_code=plant_code, is_active=True)
    db.add(plant)
    db.flush()
    return plant


def get_or_create_employee(
    db,
    *,
    employee_id: str,
    plant_id,
    full_name: str,
) -> Employee:
    employee = db.get(Employee, employee_id)
    if employee is not None:
        employee.plant_id = plant_id
        employee.full_name = full_name
        employee.status = EmployeeStatus.ACTIVE.value
        return employee

    employee = Employee(
        employee_id=employee_id,
        plant_id=plant_id,
        full_name=full_name,
        status=EmployeeStatus.ACTIVE.value,
    )
    db.add(employee)
    db.flush()
    return employee


def main() -> int:
    args = parse_args()
    employee_id = args.employee_id.strip()
    full_name = args.full_name.strip()
    if not employee_id or not full_name:
        raise SystemExit("--employee-id and --full-name are required.")

    db = SessionLocal()
    try:
        plant = get_or_create_plant(
            db,
            plant_code=args.plant_code.strip(),
            plant_name=args.plant_name.strip(),
        )
        employee = get_or_create_employee(
            db,
            employee_id=employee_id,
            plant_id=plant.plant_id,
            full_name=full_name,
        )
        db.commit()

        print("Employee seeded (no enrollment):")
        print(f"  plant_code={plant.plant_code}")
        print(f"  employee_id={employee.employee_id} full_name={employee.full_name}")
        print("\nNext: test-harness → Authenticate with this Employee ID.")
        print("Expected: ENROLLMENT_NOT_FOUND → SDK Register overlay.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
