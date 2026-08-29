#!/usr/bin/env python3
"""
TEMPORARY Week 1 dev tool — enroll test data from one local photo.

Location: backend/testing/dev-enroll/enroll_from_photo.py
See README.md in this folder for full documentation.

Usage (from backend/ with venv active):

  # Presets (photo must exist under sample-images/)
  python testing/dev-enroll/enroll_from_photo.py --preset himanshu
  python testing/dev-enroll/enroll_from_photo.py --preset anmol

  # Explicit
  python testing/dev-enroll/enroll_from_photo.py \\
    --image testing/dev-enroll/sample-images/anmol_face.jpeg \\
    --employee-id EMP002 \\
    --full-name "Anmol"
"""

from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

# Allow: python testing/dev-enroll/enroll_from_photo.py (from backend/)
BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select

from app.common.enums import EmployeeStatus, EnrollmentStatus
from app.core.config import settings
from app.database.models.employee import Employee
from app.database.models.enrollment import Enrollment
from app.database.models.plant import Plant
from app.database.session import SessionLocal
from app.services.face_verification import create_face_verification_service

DEV_ENROLL_DIR = Path(__file__).resolve().parent
SAMPLE_IMAGES_DIR = DEV_ENROLL_DIR / "sample-images"

# Quick dev seeds — add matching photo to sample-images/ before running.
DEV_PRESETS: dict[str, dict[str, str]] = {
    "himanshu": {
        "employee_id": "EMP001",
        "full_name": "Himanshu",
        "image": "my_face.jpeg",
    },
    "anmol": {
        "employee_id": "EMP002",
        "full_name": "Anmol",
        "image": "anmol_photo.jpeg",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enroll one employee from a local face photo (dev/testing only).",
    )
    parser.add_argument(
        "--preset",
        choices=sorted(DEV_PRESETS),
        default=None,
        help=(
            "Dev shortcut: himanshu → EMP001, anmol → EMP002. "
            "Uses sample-images/<preset>_face.jpeg unless --image is set."
        ),
    )
    parser.add_argument(
        "--image",
        type=Path,
        default=None,
        help="Path to a JPEG/PNG with one clear face.",
    )
    parser.add_argument(
        "--employee-id",
        default=None,
        help="Business Employee ID, e.g. EMP001.",
    )
    parser.add_argument(
        "--full-name",
        default=None,
        help="Display name stored on employees.full_name.",
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
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract embedding only; do not write to the database.",
    )
    return parser.parse_args()


def resolve_enrollment_target(args: argparse.Namespace) -> tuple[Path, str, str]:
    preset = DEV_PRESETS.get(args.preset) if args.preset else None

    employee_id = (args.employee_id or (preset or {}).get("employee_id") or "").strip()
    full_name = (args.full_name or (preset or {}).get("full_name") or "").strip()

    if args.image is not None:
        image_path = args.image.expanduser().resolve()
    elif preset is not None:
        image_path = (SAMPLE_IMAGES_DIR / preset["image"]).resolve()
    else:
        image_path = None

    missing: list[str] = []
    if image_path is None:
        missing.append("--image or --preset")
    if not employee_id:
        missing.append("--employee-id or --preset")
    if not full_name:
        missing.append("--full-name or --preset")
    if missing:
        raise SystemExit(
            "Missing enrollment target. Provide --preset (himanshu|anmol) "
            f"or all of: {', '.join(missing)}."
        )

    return image_path, employee_id, full_name


def load_image_bytes(path: Path) -> bytes:
    if not path.is_file():
        raise SystemExit(f"Image not found: {path}")
    data = path.read_bytes()
    if not data:
        raise SystemExit(f"Image file is empty: {path}")
    if len(data) > settings.auth_max_image_bytes:
        raise SystemExit(
            f"Image exceeds auth_max_image_bytes ({settings.auth_max_image_bytes})."
        )
    return data


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
    plant_id: uuid.UUID,
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


def upsert_active_enrollment(
    db,
    *,
    employee_id: str,
    plant_id: uuid.UUID,
    embedding: list[float],
    model_version: str,
) -> Enrollment:
    active = db.scalars(
        select(Enrollment).where(
            Enrollment.employee_id == employee_id,
            Enrollment.status == EnrollmentStatus.ACTIVE.value,
        )
    ).first()

    if active is not None:
        active.embedding = embedding
        active.model_version = model_version
        active.plant_id = plant_id
        return active

    enrollment = Enrollment(
        employee_id=employee_id,
        plant_id=plant_id,
        embedding=embedding,
        status=EnrollmentStatus.ACTIVE.value,
        model_version=model_version,
    )
    db.add(enrollment)
    db.flush()
    return enrollment


def main() -> int:
    args = parse_args()
    image_path, employee_id, full_name = resolve_enrollment_target(args)
    image_bytes = load_image_bytes(image_path)

    print("Extracting SFace embedding (MediaPipe detect → SFace embed)…")
    verification = create_face_verification_service()
    live = verification.extract_live_embedding(image_bytes)
    embedding = list(live.vector)

    print(f"  model_version={live.model_version}")
    print(f"  dimensions={live.dimensions}")
    print(f"  detection_score={live.detection_score:.3f}")

    if args.dry_run:
        print("Dry run — no database changes.")
        return 0

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
        enrollment = upsert_active_enrollment(
            db,
            employee_id=employee.employee_id,
            plant_id=plant.plant_id,
            embedding=embedding,
            model_version=live.model_version,
        )
        db.commit()

        print("\nEnrolled successfully (dev seed):")
        print(f"  plant_code={plant.plant_code} plant_id={plant.plant_id}")
        print(f"  employee_id={employee.employee_id} full_name={employee.full_name}")
        print(f"  enrollment_id={enrollment.enrollment_id} status={enrollment.status}")
        print("\nNext: test-harness → authenticate with this Employee ID.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130) from None
