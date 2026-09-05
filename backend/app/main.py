"""
Face Authentication API — FastAPI application entry.

HTTP edge wiring:
  - CORS for Mendix / test-harness
  - /authenticate and /register routers
  - AppError → AuthErrorResponse | RegistrationErrorResponse (single handler)
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.admin import router as admin_router
from app.api.routes.admin_audit import router as admin_audit_router
from app.api.routes.admin_employees import router as admin_employees_router
from app.api.routes.admin_plants import router as admin_plants_router
from app.api.routes.auth import router as auth_router
from app.api.routes.kiosk_admin import router as kiosk_admin_router
from app.api.routes.plants import router as plants_router
from app.api.routes.registration import router as registration_router
from app.common.exceptions import AppError
from app.core.config import settings
from app.core.logging import setup_logging

setup_logging()

app = FastAPI(title="Face Authentication API")

# --- CORS (Week 1: permissive; production sets explicit Mendix origins) ---
_origins = [
    origin.strip()
    for origin in settings.cors_allow_origins.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if _origins != ["*"] else ["*"],
    allow_credentials=_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routes ---
app.include_router(auth_router)
app.include_router(registration_router)
app.include_router(plants_router)
app.include_router(admin_router)
app.include_router(admin_plants_router)
app.include_router(admin_audit_router)
app.include_router(admin_employees_router)
app.include_router(kiosk_admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe for Docker / plant ops."""
    return {"status": "ok"}


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    """
    Map domain errors raised in services/repositories to stable JSON for the SDK.
    """
    body = exc.to_error_response()
    return JSONResponse(
        status_code=exc.http_status,
        content=body.model_dump(by_alias=True),
    )
