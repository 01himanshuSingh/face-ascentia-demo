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

If the employee is not face-enrolled (or not in the system yet), the SDK opens **Register UI** (Path A):

- **[Employee Register] (Path A — registration-first hybrid)** — SDK overlay: **Plant + Employee ID + Full name**. SDK **reuses the JPEG from authenticate** → `POST /register` (PENDING). **No pre-existing HR row required** — employee + enrollment created only when plant admin **approves** in Admin Portal (HR compares against offline backup).
- **[Admin Login] (Path B)** — Admin enters ID + password at kiosk, then **fresh face capture + Employee ID per employee** → `POST /kiosk/admin-enroll` (ACTIVE immediately). **Not built yet** — see `AGENTS.md`.

See `docs/architecture/registration-flow.md` and `AGENTS.md`.

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
          +-- RegisterOverlay (Plant + Employee ID + Full name)
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

## Week 1 Work Completed (baseline — 2026-08-28)

End-to-end **login with enrolled face** works on **desktop Chrome / laptop kiosk-style testing**.

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
| HTTP client | `sdk/src/api/FaceAuthClient.ts` | Done (Android WebView timeout fix 2026-08-31) |
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

**Note:** For quick login testing without the register→approve flow, use `enroll_from_photo.py` (creates employee + ACTIVE enrollment directly). Production kiosk path uses `POST /register` + admin approve.

### Infrastructure — running locally

| Service | How | Port |
|---------|-----|------|
| PostgreSQL + pgvector | `docker compose up -d` (repo root) | **5433** → 5432 |
| Backend | `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` | **8000** |
| Test harness | `cd test-harness && npm run dev` | **5173** |
| Admin Portal | `cd admin-portal && npm run dev` | **5174** |

**Env files:**

- `face-auth-ascentia/.env` — backend DB (`DATABASE_URL`, postgres creds)
- `test-harness/.env` — `VITE_API_BASE_URL=/api` (dev default; Vite proxies `/api` → `localhost:8000`)
- `admin-portal/.env` — optional; dev default proxies `/api` → `localhost:8000`

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
- **Recommended for Android kiosk / phone:** one ngrok tunnel on **5173** only; set `VITE_API_BASE_URL=/api` so API calls go same-origin through Vite proxy → `localhost:8000` on the dev laptop
- **Do not use `http://localhost:8000` on a remote device** — on Android, `localhost` is the kiosk/phone itself, not the dev machine
- **Alternative:** second ngrok tunnel on **8000** and set `VITE_API_BASE_URL=https://your-backend.ngrok-free.dev`
- Test harness loads SDK from `sdk/src` via Vite alias — save SDK files and hard-refresh kiosk page; restart `npm run dev` if HMR does not apply on device

### Known limitations (pre–Aug 29)

| Topic | Status |
|-------|--------|
| Production registration API/UI | Was dev enroll script only — **Path A built Aug 29** (see below) |
| Redis / Celery / Nginx / PgBouncer | Deferred Week 2+ |
| admin-portal UI | **Done (2026-08-31)** — login, plant-scoped queue, approve/reject, image view |
| Mobile browser blink | Unreliable — MediaPipe too slow + EAR tuned for desktop webcam |
| **Android box kiosk (current hardware)** | **Not ready** — needs Android-specific SDK camera/blink tuning or native capture path |
| Desktop Chrome + USB webcam kiosk | **Target platform** — works in testing |
| Mendix npm package publish | SDK code ready; packaging/deploy to Mendix pending |
| Threshold tuning per plant | Starting value 0.463; tune after field score logs |
| Admin kiosk batch (Path B) | Documented in `AGENTS.md`; **not implemented** |

### Android kiosk — SDK changes still needed (not implemented)

If kiosk is **Android box + browser/WebView** (not PC + USB cam):

1. Android camera profile — lower resolution/fps, optional USB `deviceId`
2. Android blink profile — looser EAR thresholds, longer timeout
3. Throttled landmark loop — avoid full MediaPipe detect every animation frame
4. Optional blink fallback for weak boxes
5. Real backend HTTPS URL on device (not `localhost`)

See conversation notes; do not assume ngrok fixes Android blink.

## Work completed 2026-08-29 — Registration-first hybrid (Path A)

**Design decision:** HR keeps employee master data **offline** (separate machine / paper). Kiosk intake does **not** require a pre-loaded `employees` row. Plant admin reviews PENDING requests plant-wise against offline records; **approve** creates `employees` + ACTIVE `enrollments`.

### Architecture (Path A)

```text
Authenticate → face capture → ENROLLMENT_NOT_FOUND or EMPLOYEE_NOT_FOUND
       ↓
Register overlay: Plant + Employee ID + Full name (photo reused)
       ↓
POST /register → registration_requests (PENDING) + raw_images
       ↓
Plant admin queue (filtered by plant_id)
       ↓
Approve → employees row + ACTIVE enrollment   |   Reject → reason + audit
```

### Backend — implemented today

| Area | Files / endpoints | Status |
|------|-------------------|--------|
| Migration `20260829_0005` | Drop `registration_requests.employee_id` FK; add `submitted_full_name` | Done |
| `POST /register` | `plant_id`, `employee_id`, `full_name`, `image` — no HR pre-row | Done |
| `GET /plants` | Active plant list for kiosk dropdown | Done |
| Registration service | `services/registration.py` — plant-scoped duplicate check at submit | Done |
| Admin login | `POST /admin/login` (bcrypt, `admin_roles`) | Done |
| Admin pending queue | `GET /admin/registrations/pending` (plant-scoped) | Done |
| Admin image view | `GET /admin/registrations/{id}/image` | Done |
| Admin approve / reject | Creates employee + enrollment on approve; audit log | Done |
| Repositories | `plant_repository`, `admin_role_repository`, extended registration/employee/enrollment/audit | Done |

**Alembic head:** `20260829_0005`

### SDK — implemented today

| Area | Files | Status |
|------|-------|--------|
| `RegisterOverlay` | Plant dropdown + Employee ID + Full name | Done |
| `FaceAuthClient.listPlants()` | `GET /plants` | Done |
| `FaceAuthClient.register()` | Sends `plant_id`, `full_name` multipart fields | Done |
| `authenticateOrRegister()` | Opens register on `ENROLLMENT_NOT_FOUND` **or** `EMPLOYEE_NOT_FOUND` | Done |
| `isFaceAuthApiError()` | Duck-type guard for error handling | Done |
| Types | `registration.types.ts` — plant list + new error codes | Done |

### Test harness — updated today

| Area | Change |
|------|--------|
| `test-harness/src/App.tsx` | Uses `sdk.authenticateOrRegister()`; documents Plant + name register UI |

### Dev scripts — added today

| Script | Purpose |
|--------|---------|
| `backend/testing/dev-enroll/seed_super_admin.py` | Bootstrap `SUPER_ADMIN` + `DEV01` plant (`SUPER001` / `changeme`) |
| `backend/testing/dev-enroll/seed_admin.py` | Seed `PLANT_ADMIN` for portal (`ADMIN001` / `changeme`, DEV01 scope) |
| `backend/testing/dev-enroll/seed_employee_only.py` | Optional legacy — not needed for registration-first Path A |

### Docs updated today

| File | Change |
|------|--------|
| `docs/architecture/registration-flow.md` | Registration-first hybrid spec, admin review endpoints |

### End-to-end self-register test flow

```text
1. docker compose up -d && alembic upgrade head
2. python testing/dev-enroll/seed_super_admin.py
3. python testing/dev-enroll/seed_admin.py
4. uvicorn app.main:app --reload --port 8000
5. cd test-harness && npm run dev
6. Authenticate with any new Employee ID → Register UI → select DEV01, enter name → Submit → PENDING
7. Admin Portal (ADMIN001): pending queue for DEV01 only → approve or reject
8. Re-authenticate → login succeeds after approve
```

### Still not built (Path A / B gaps — partial update 2026-08-31)

| Area | Status |
|------|--------|
| Admin Portal React UI | **Done** — see 2026-08-31 section |
| Admin Portal grant PLANT_ADMIN UI | API done; SUPER_ADMIN UI pending |
| SDK Not Enrolled two-button overlay (Register vs Admin Login) | Register path works via `authenticateOrRegister`; explicit STATE 3 UI pending |
| Path B — `/kiosk/admin-login`, `/kiosk/admin-enroll`, `/kiosk/admin-logout` | Not built (`AGENTS.md`) |
| Android kiosk capture profile (camera + blink) | Not built — field testing blocked blink smoothness |
| `session_id` on authenticate/register | Optional column; SDK generates UUID but full auth contract wiring deferred |

### Next steps (superseded — see 2026-08-31 section below)

1. ~~Wire **admin-portal** React app~~ — done
2. SDK **Not Enrolled** overlay with [Employee Register] / [Admin Login] buttons (STATE 3 per `AGENTS.md`)
3. Implement Path B admin kiosk batch enrollment (`/kiosk/admin-*`)
4. Mendix SDK npm package handoff + integration
5. Backend deploy on client Debian server (Docker)
6. Android kiosk SDK capture profile if Android box remains target hardware

## Work completed 2026-08-31 — Admin Portal, RBAC, SDK polish, kiosk HTTP fix

### Backend — implemented

| Area | Files / endpoints | Status |
|------|-------------------|--------|
| Admin RBAC catalog | `admin_permissions`, `admin_role_permissions` models | Done |
| Migrations | `20260831_0006_admin_permissions_rbac`, `20260831_0007_v1_plant_admin_registration_only` | Done |
| v1 roles | `SUPER_ADMIN` (all plants) + `PLANT_ADMIN` (one plant); `SUB_ADMIN` deferred | Done |
| Grant API | `POST /admin/users/grant` — SUPER_ADMIN grants PLANT_ADMIN | Done |
| Permission checks on review | `admin_rbac.py`, `admin_grant.py`; approve/reject gated | Done |
| Dev seeds | `seed_super_admin.py`, `seed_admin.py` (Path A flow; no worker pre-seed) | Done |

**Alembic head:** `20260831_0007`

### Admin Portal — implemented

| Area | Files | Status |
|------|-------|--------|
| React app + Vite + Tailwind v4 | `admin-portal/src/` | Done |
| Login | `LoginForm.tsx`, `useAdminSession.ts` — `ADMIN001` / `changeme` | Done |
| Pending queue | `RequestTable.tsx`, `useRegistrationQueue.ts` (TanStack Query) | Done |
| Review UI | `RequestDetails.tsx`, `DecisionDialog.tsx` — approve/reject + face image | Done |
| API client | `adminApi.ts` — `X-Admin-Session-Token` header (not cookies for v1) | Done |
| Dev proxy | `admin-portal/vite.config.ts` — `/api` → `localhost:8000` | Done |

### SDK — implemented

| Area | Files | Status |
|------|-------|--------|
| Register UI redesign | `RegisterOverlay.tsx`, `PlantSelectDropdown.tsx` | Done |
| Operator feedback toast | `AuthScoreToast.tsx`, `showSdkFeedbackToast.ts`, wired in `FaceAuthSDK.ts` | Done |
| Register cancel → new capture | `handleRegisterCancel()` clears capture session | Done |
| Android WebView HTTP timeout fix | `FaceAuthClient.ts` — `fetchWithTimeout()` via `AbortController` (no `AbortSignal.timeout()`) | Done |

**Config surfaced on SDK:** `showFeedbackToast`, `feedbackToastDurationMs`, `faceTimeoutMs`, `blinkTimeoutMs`, `authTimeoutMs`, `camera`.

### End-to-end Path A test flow (current)

```text
1. docker compose up -d && cd backend && alembic upgrade head
2. python testing/dev-enroll/seed_super_admin.py
3. python testing/dev-enroll/seed_admin.py
4. uvicorn app.main:app --reload --port 8000
5. cd test-harness && npm run dev          # :5173
6. cd admin-portal && npm run dev          # :5174 (optional, for approve/reject)
7. ngrok http 5173                         # Android kiosk opens HTTPS ngrok URL
8. Kiosk: authenticateOrRegister → Register if not enrolled → admin approves → re-auth succeeds
```

## Android / kiosk field testing (2026-08-31)

Real-device testing on **Android mobile / Android box kiosk** via **ngrok + test harness** surfaced issues separate from desktop Chrome.

### Errors observed on kiosk

| Error / symptom | Root cause | Status |
|-----------------|------------|--------|
| `AbortSignal.timeout is not a function` during `authenticateOrRegister` | `FaceAuthClient` used `AbortSignal.timeout()` — missing on many Android WebViews | **Fixed** — `fetchWithTimeout()` uses `AbortController` + `setTimeout` |
| Request failed / cannot reach backend when API is `http://localhost:8000` | On Android, `localhost` = the device itself, not the dev laptop | **Config fix** — use `VITE_API_BASE_URL=/api` with ngrok on **5173**, or tunnel backend separately |
| Blink slow, misses fast blinks, or times out | MediaPipe landmark loop + EAR thresholds tuned for desktop webcam; Android runs fewer samples per second | **Not fixed** — needs SDK capture profile (see below) |
| Camera may work but liveness feels laggy | High default camera resolution on phones + heavy `landmarker.detect()` every frame | **Not fixed** — needs profile-based camera + loop throttle |

### Fixes applied (network / WebView)

- `sdk/src/api/FaceAuthClient.ts` — no `AbortSignal.timeout()`; Android-safe timeout wrapper
- Dev routing: ngrok **5173** + harness `VITE_API_BASE_URL=/api` → Vite proxy → backend **8000** on laptop
- No SDK `npm run build` required for harness dev — Vite aliases `@face-auth/sdk` → `sdk/src`; hard-refresh kiosk after SDK edits

### Kiosk face auth — what we can do now

**Immediate (ready today — config + retest):**

1. Run backend + test harness + ngrok as documented above
2. Confirm harness footer shows **`API /api`**, not `localhost:8000`
3. Retest `authenticateOrRegister` on Android after hard refresh
4. Use Admin Portal (`:5174`, `ADMIN001`) to approve PENDING registrations from kiosk Path A
5. Keep desktop testing on `localhost:5173` — unchanged

**Next SDK work (capture / liveness — not started):**

Implement **device profiles** so desktop behavior stays the same while Android kiosks get tuned settings:

| File | Purpose |
|------|---------|
| `sdk/src/components/CameraOverlay.tsx` | Orchestrator — throttle detection loop on slow devices |
| `sdk/src/liveness/BlinkDetector.ts` | Mobile/Android blink preset (looser EAR); MediaPipe delegate/confidence |
| `sdk/src/camera/CameraManager.ts` | Lower resolution/fps for mobile/kiosk (e.g. 640×480 @ 24fps) |
| `sdk/src/sdk/FaceAuthSDK.ts` | Expose `captureProfile: "desktop" \| "mobile" \| "android_kiosk"` |
| `sdk/src/capture/deviceProfile.ts` (new, recommended) | Central profile detection + mapping |

**Design rule:** profile-based tuning — do **not** replace global desktop defaults; desktop keeps current `KIOSK_LIGHT_BLINK` and default camera.

**Do not jump to native Android camera yet** — browser SDK + profiles should be tried first. Native CameraX/Mendix widget is Plan B only if WebView pipeline still fails after profiling.

**Production kiosk (later):** real HTTPS backend URL on device (not ngrok); optional `showFeedbackToast: false` in Mendix; threshold tuning from field score logs.

### Known limitations (updated 2026-08-31)

| Topic | Status |
|-------|--------|
| Desktop Chrome + USB webcam kiosk | **Works** — primary dev target |
| Android box / mobile browser kiosk | **Partial** — HTTP/WebView fixed; blink/capture profile **pending** |
| Admin Portal grant PLANT_ADMIN UI | API done (`POST /admin/users/grant`); SUPER_ADMIN UI **not built** |
| Path B kiosk admin batch | Not built (`AGENTS.md`) |
| SDK STATE 3 two-button overlay | Register works via `authenticateOrRegister`; explicit UI pending |
| Mendix npm package publish | SDK code ready; packaging pending |

### Next steps (current priority)

1. **Retest Android kiosk** with `/api` ngrok setup + `FaceAuthClient` fix — confirm auth/register HTTP works
2. **SDK capture profiles** for Android kiosk (files above) — blink + face smoothness
3. SDK **Not Enrolled** two-button overlay (Register vs Admin Login)
4. Admin Portal **grant PLANT_ADMIN** UI (SUPER_ADMIN only)
5. Path B `/kiosk/admin-*` when batch enroll at kiosk is required
6. Mendix SDK npm package handoff + client Debian backend deploy

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
