# Dev enroll — temporary testing registration (Week 1)

**NOT production registration.** Use this folder only to seed PostgreSQL with **real**
face embeddings so you can test SDK login before the registration API/UI exists.

## Directory layout

```text
backend/testing/dev-enroll/
├── README.md                 ← this file (what is included + how to run)
├── enroll_from_photo.py      ← CLI: photo → SFace embed → DB insert
└── sample-images/            ← put YOUR local test photo here (never commit)
    └── .gitkeep
```

## What `enroll_from_photo.py` does

```text
your photo (JPEG/PNG)
        ↓
MediaPipe face detect  (same as login)
        ↓
SFace 128-D embedding  (same as login)
        ↓
PostgreSQL insert/update:
   1. plants       — create if missing (default DEV01)
   2. employees    — create or update ACTIVE row
   3. enrollments    — ACTIVE embedding for that employee
```

## What gets written to the database

| Table | Fields set |
|-------|------------|
| `plants` | `plant_code`, `plant_name`, `is_active=true` |
| `employees` | `employee_id`, `plant_id`, `full_name`, `department`, `status=ACTIVE` |
| `enrollments` | `employee_id`, `plant_id`, `embedding` (128 floats), `status=ACTIVE`, `model_version` |

If the employee already has an ACTIVE enrollment, the script **updates** the embedding
(re-enroll for testing).

## Prerequisites

1. Docker Postgres running: `docker compose up -d` (repo root)
2. Migrations applied: `cd backend && alembic upgrade head`
3. Python venv + deps: `pip install -r requirements.txt`
4. One photo with **one clear face** in `sample-images/` (e.g. `my_face.jpg`)

## Commands

From `backend/` with venv active:

```bash
# 1) Dry run — only extract embedding, no DB write
python testing/dev-enroll/enroll_from_photo.py \
  --image testing/dev-enroll/sample-images/my_face.jpg \
  --employee-id EMP001 \
  --full-name "Anmol" \
  --dry-run

# 2) Enroll for real — writes plant + employee + enrollment
python testing/dev-enroll/enroll_from_photo.py \
  --image testing/dev-enroll/sample-images/my_face.jpg \
  --employee-id EMP001 \
  --full-name "Anmol"

# 3) Test login
#    Start backend: uvicorn app.main:app --reload --port 8000
#    Start harness: cd test-harness && npm run dev
#    Open http://localhost:5173 → Employee ID EMP001 → Authenticate
```

## CLI options

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--image` | yes | — | Path to JPEG/PNG with one face |
| `--employee-id` | yes | — | Business ID, e.g. `EMP001` |
| `--full-name` | yes | — | Stored on `employees.full_name` |
| `--department` | no | — | Optional department |
| `--plant-code` | no | `DEV01` | Plant code (created if missing) |
| `--plant-name` | no | `Development Plant` | Plant name when creating |
| `--dry-run` | no | off | Extract embedding only, no DB |

## Security notes

- **Never commit** photos in `sample-images/` (gitignored except `.gitkeep`).
- **Never commit** real biometric embeddings or production credentials.
- Replace this tool when the real registration flow ships (Week 2+).
