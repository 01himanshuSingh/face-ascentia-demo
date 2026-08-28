# Face Authentication System — Cursor Project Context

## Purpose

This repository is a production-oriented Face Authentication System for Android kiosks running a Mendix web application in Chrome.

The final backend is deployed on the client's Debian server in Docker and uses the client's PostgreSQL + pgvector database. The Mendix team receives the Face Authentication SDK as a React/TypeScript npm package and does not receive the backend source code.

## Architecture

```text
Android Kiosk / Chrome
        |
        v
Mendix Web App
        |
        | authenticate(employeeId)
        v
Face Auth React/TypeScript SDK
        |
        +-- Camera permission/lifecycle
        +-- Camera preview/overlay
        +-- Blink/liveness interaction
        +-- Frame capture
        +-- Registration UI when not enrolled
        +-- HTTPS API communication
        |
        v
FastAPI Backend
        |
        +-- Face detection/processing
        +-- SFace embedding
        +-- PostgreSQL/pgvector matching
        +-- Authentication decision
        |
        v
Client PostgreSQL + pgvector
```

## Component Ownership

### Mendix
Mendix owns the host/business UI and triggers authentication.

Mendix:
- Provides the Employee ID.
- Provides the Authenticate action/button.
- Calls the SDK.
- Receives the authentication result.
- Does NOT directly access the camera.
- Does NOT access PostgreSQL.
- Does NOT implement face-recognition logic.

### SDK
The SDK is the client-side product delivered to the Mendix team as an npm package.

The SDK owns:
- Camera permission.
- Camera lifecycle and preview.
- Camera overlay UI.
- Liveness/blink interaction.
- Frame capture.
- Registration UI.
- Temporary session handling.
- HTTPS communication with the backend.
- Returning results to Mendix.

The SDK must NEVER directly access PostgreSQL.

### Backend
The backend is a separate FastAPI service deployed on the client's Debian server.

The backend owns:
- Face detection and processing.
- SFace embedding generation.
- PostgreSQL/pgvector operations.
- Employee/enrollment lookup.
- Face matching.
- Authentication decisions.
- Registration processing.
- Plant-scoped data access.
- Audit/retention functionality in later phases.

The Mendix team does not receive the backend source code.

## Authentication Flow

1. Employee enters Employee ID in Mendix.
2. Employee clicks Authenticate.
3. Mendix calls the SDK.
4. SDK opens its camera overlay.
5. SDK guides the employee to face the camera.
6. SDK performs the blink/liveness interaction.
7. SDK captures the best frame.
8. SDK sends required data to the backend over HTTPS.
9. Backend checks the employee's ACTIVE enrollment.
10. Backend processes the face and performs matching.
11. Backend returns the decision.
12. SDK returns the result to Mendix.

If the employee is not enrolled, the SDK opens its own Registration UI and uses the existing capture/session according to the registration flow.

## UI Hosting

Camera and Registration UI are SDK-owned React components.

They are bundled into the SDK package and rendered at runtime inside the Mendix web application.

They are NOT separate websites and do NOT need separate hosting.

```text
Mendix page
    |
    +-- Face Auth SDK
          |
          +-- CameraOverlay
          |
          +-- Registration UI
```

Only the backend requires separate server hosting.

## Repository Structure

The repository is a monorepo:

```text
face-auth-system/
├── sdk/
├── backend/
├── admin-portal/
├── test-harness/
├── docs/
└── infrastructure/
```

Follow the established repository structure. Keep components independently deployable and responsibilities separated.

## Week 1 Scope

Week 1 focuses on:
1. Project/setup foundation.
2. PostgreSQL + pgvector development environment.
3. Employee/enrollment database foundation.
4. Camera lifecycle.
5. Face detection foundation.
6. Liveness foundation.
7. SFace embedding foundation.
8. Authentication API foundation.
9. Test harness.

Do NOT prematurely implement Week 2+ infrastructure/features such as Redis, Celery, Nginx, PgBouncer, or production deployment.

## Week 1 Work Completed (current status)

Last updated: 2026-08-28. End-to-end **login with enrolled face** works on **desktop Chrome / laptop kiosk-style testing**.

### Backend — implemented

| Area | Files | Status |
|------|-------|--------|
| FastAPI app + CORS + error handling | `backend/app/main.py` | Done |
| Config (threshold, embedding dim, CORS) | `backend/app/core/config.py` | Done |
| One-line auth logs (score/threshold/match) | `backend/app/core/logging.py`, `authentication.py` | Done |
| DB models | `plants`, `employees`, `enrollments` | Done |
| Alembic migration + pgvector HNSW index | `backend/migrations/versions/20260825_0001_week1_auth_foundation.py` | Done |
| Repositories | `employee_repository.py`, `enrollment_repository.py` | Done |
| Face detect + SFace embed + cosine 1:1 | `face/detector.py`, `face/embedding.py`, `services/face_verification.py` | Done |
| Auth orchestrator | `services/authentication.py` | Done |
| `POST /authenticate` (multipart) | `api/routes/auth.py`, `schemas/auth.py` | Done |
| Health check | `GET /health` | Done |

**Auth log format (backend terminal):**

```text
auth | employee=EMP001 | face_score=0.485 | threshold=0.463 | match=YES | detect=0.933
```

**Key settings:**

- SFace model: `sface_2021dec_opencv_zoo`, **128-D** embeddings
- Cosine threshold: **`0.463`** (`face_match_cosine_threshold` in config)
- Auth is **1:1 by employee_id** — fetch one ACTIVE enrollment, compare in Python (not pgvector gallery search)

### SDK — implemented

| Area | Files | Status |
|------|-------|--------|
| Public SDK facade | `sdk/src/sdk/FaceAuthSDK.ts` | Done |
| Mendix entry: `authenticate(employeeId)` | returns `{ employeeId, authenticated }` only | Done |
| HTTP client | `sdk/src/api/FaceAuthClient.ts` | Done |
| Types + error codes | `sdk/src/types/auth.types.ts` | Done |
| Camera lifecycle | `sdk/src/camera/CameraManager.ts` | Done |
| Camera overlay + capture pipeline | `sdk/src/components/CameraOverlay.tsx` | Done |
| Blink liveness (MediaPipe EAR) | `sdk/src/liveness/BlinkDetector.ts` | Done |
| Burst / best-frame pick | `sdk/src/camera/BurstCapture.ts` | Done |
| Package exports | `sdk/src/index.ts` | Done |

**Mendix boundary:** SDK returns only `{ employeeId, authenticated }`. Backend fields (`score`, `threshold`, `message`) stay internal to SDK/HTTP.

### Test harness — implemented

| Area | File | Status |
|------|------|--------|
| Mendix integration stand-in | `test-harness/src/App.tsx` | Done |
| Dev metrics on screen (score/threshold/match) | harness-only; not Mendix contract | Done |
| Vite alias to local SDK source | `test-harness/vite.config.ts` | Done |
| ngrok host allowlist | `.ngrok-free.dev`, `.ngrok.io`, `.ngrok.app` | Done |

### Dev enrollment (temporary — NOT production registration)

| Area | Path | Status |
|------|------|--------|
| Photo → SFace → DB seed script | `backend/testing/dev-enroll/enroll_from_photo.py` | Done |
| Presets | `himanshu` → EMP001, `anmol` → EMP002 | Done |
| Sample photos | `backend/testing/dev-enroll/sample-images/` (gitignored) | Local only |

**Enrolled test employees (dev DB):**

| Employee ID | Name | Photo preset |
|-------------|------|--------------|
| EMP001 | Himanshu | `my_face.jpeg` |
| EMP002 | Anmol | `anmol_photo.jpeg` |

Replace with real registration API/UI in Week 2+.

### Infrastructure — running locally

| Service | How | Port |
|---------|-----|------|
| PostgreSQL + pgvector | `docker compose up -d` (repo root) | **5433** → 5432 |
| Backend | `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` | **8000** |
| Test harness | `cd test-harness && npm run dev` | **5173** |

**Env files:**

- `face-auth-ascentia/.env` — backend DB (`DATABASE_URL`, postgres creds)
- `test-harness/.env` — `VITE_API_BASE_URL=http://localhost:8000`

**Docker container:** `face-auth-db` (persists data across PC restarts via Docker volume).

### End-to-end flow verified

```text
1. docker compose up -d
2. cd backend && alembic upgrade head
3. python testing/dev-enroll/enroll_from_photo.py --preset <name>
4. uvicorn app.main:app --reload --port 8000
5. cd test-harness && npm run dev
6. Open http://localhost:5173 → Employee ID → Authenticate
```

Observed genuine-match score example: **~0.485** (photo enroll vs live webcam) — above threshold **0.463**.

### pgvector usage (25k users)

- **Login:** 1 row lookup by `employee_id` + cosine compare in app → scales to ~25k users
- **HNSW index** on `enrollments.embedding` exists for **future** 1:N (duplicate/fraud checks), not used in Week 1 auth
- **Not needed for Week 1 login:** Redis, rate limits, gallery search

### ngrok testing (dev only)

- ngrok on port **5173** exposes test harness over HTTPS (camera requires secure context)
- ngrok does **not** enable blink detection — blink runs locally in browser
- **Same laptop:** ngrok frontend + `localhost:8000` backend works
- **Mobile / remote device:** fails unless backend is also tunneled and `VITE_API_BASE_URL` points to backend ngrok URL

### Known limitations (as of Week 1)

| Topic | Status |
|-------|--------|
| Production registration API/UI | Not built — dev enroll script only |
| Redis / Celery / Nginx / PgBouncer | Deferred Week 2+ |
| admin-portal | Not started |
| Mobile browser blink | Unreliable — MediaPipe too slow + EAR tuned for desktop webcam |
| **Android box kiosk (current hardware)** | **Not ready** — needs Android-specific SDK camera/blink tuning or native capture path |
| Desktop Chrome + USB webcam kiosk | **Target platform** — works in testing |
| Mendix npm package publish | SDK code ready; packaging/deploy to Mendix pending |
| Threshold tuning per plant | Starting value 0.463; tune after field score logs |

### Android kiosk — SDK changes still needed (not implemented)

If kiosk is **Android box + browser/WebView** (not PC + USB cam):

1. Android camera profile — lower resolution/fps, optional USB `deviceId`
2. Android blink profile — looser EAR thresholds, longer timeout
3. Throttled landmark loop — avoid full MediaPipe detect every animation frame
4. Optional blink fallback for weak boxes
5. Real backend HTTPS URL on device (not `localhost`)

See conversation notes; do not assume ngrok fixes Android blink.

### Next steps (Week 2+ direction)

1. Production registration flow (replace dev enroll script)
2. Mendix SDK npm package handoff + integration
3. Backend deploy on client Debian server (Docker)
4. Duplicate-face check at enrollment (pgvector HNSW 1:N)
5. Android kiosk SDK profile if Android box remains target hardware
6. Connection pooling / ops for ~70 kiosks (per architecture docs)

## Technology Stack

### SDK
- React
- TypeScript
- Vite
- Browser camera APIs
- MediaPipe for agreed browser-side liveness/landmark work

### Backend
- Python
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- pgvector
- OpenCV SFace
- ONNX Runtime
- MediaPipe where required by the agreed face-processing design

### Development
- Docker
- Docker Compose
- PostgreSQL + pgvector container

### Production Direction
- Client-owned Debian server
- Backend delivered as a Docker image/container
- Client-owned PostgreSQL + pgvector
- HTTPS between SDK and backend

## Cursor Rules

1. Treat this file and the architecture documents under `docs/` as project context.
2. Follow the existing repository structure.
3. Do not casually redesign the architecture.
4. Do not move responsibilities between SDK, Mendix, backend, or database.
5. Never make the SDK access PostgreSQL directly.
6. Do not put biometric processing/database logic into Mendix.
7. Do not introduce a new framework without explaining why it is required first.
8. Do not create unnecessary files.
9. Before modifying an existing file, inspect it and preserve existing behavior unless the task requires a change.
10. Do not overwrite/delete existing project work merely to match an example.
11. Keep SDK public APIs stable once established.
12. Keep SDK/backend API contracts explicit.
13. Never commit real biometric data, credentials, secrets, or production environment values.
14. Use dummy/test data during development.
15. Do not implement future-week features unless explicitly requested.
16. Prefer small, testable changes over large refactors.
17. If an architectural decision is ambiguous or breaking, explain the options before changing it.

## Client Handoff Boundary

Mendix team receives:

```text
Face Auth SDK npm package
+
SDK integration contract
```

Client IT hosts:

```text
Debian Server
    |
    +-- Face Auth Backend Docker container
    |
    +-- PostgreSQL + pgvector
```

The Mendix team should not need the backend implementation details.

## Source of Truth

The repository files, architecture documentation, and this context file are the source of truth for the project.

When working on a task, first inspect the existing code and documentation. Do not assume another Cursor session's chat history or context is available.
