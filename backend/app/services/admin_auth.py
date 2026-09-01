"""Admin Portal authentication — login and session tokens."""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt
from sqlalchemy.orm import Session

from app.common.enums import AdminRoleType
from app.common.exceptions import AdminError
from app.repositories import admin_role_repository
from app.schemas.admin import AdminErrorCode, AdminLoginResponse


@dataclass(frozen=True, slots=True)
class AdminSession:
    token: str
    employee_id: str
    role: str
    role_id: uuid.UUID
    plant_id: uuid.UUID | None
    permissions: frozenset[str]
    expires_at: datetime


class AdminAuthService:
    """In-memory admin sessions (MVP). Production may move to Redis/DB."""

    _SESSION_TTL = timedelta(hours=8)
    _sessions: dict[str, AdminSession] = {}

    def login(
        self,
        db: Session,
        *,
        employee_id: str,
        password: str,
    ) -> AdminLoginResponse:
        normalized_id = (employee_id or "").strip()
        if not normalized_id or not password:
            raise AdminError(
                "Invalid admin credentials.",
                code=AdminErrorCode.INVALID_CREDENTIALS,
                http_status=401,
            )

        admin = admin_role_repository.get_active_by_employee_id(db, normalized_id)
        if admin is None or not self._verify_password(password, admin.password_hash):
            raise AdminError(
                "Invalid admin credentials.",
                code=AdminErrorCode.INVALID_CREDENTIALS,
                http_status=401,
            )

        permission_codes = admin_role_repository.list_permission_codes(db, admin.role_id)
        expires_at = datetime.now(timezone.utc) + self._SESSION_TTL
        token = secrets.token_urlsafe(32)
        session = AdminSession(
            token=token,
            employee_id=admin.employee_id,
            role=admin.role,
            role_id=admin.role_id,
            plant_id=admin.plant_id,
            permissions=frozenset(permission_codes),
            expires_at=expires_at,
        )
        self._sessions[token] = session

        return AdminLoginResponse(
            admin_session_token=token,
            employee_id=admin.employee_id,
            role=admin.role,
            plant_id=admin.plant_id,
            expires_at=expires_at.isoformat(),
        )

    def resolve_session(self, token: str | None) -> AdminSession:
        normalized = (token or "").strip()
        if not normalized:
            raise AdminError(
                "Admin session required.",
                code=AdminErrorCode.UNAUTHORIZED,
                http_status=401,
            )

        session = self._sessions.get(normalized)
        if session is None:
            raise AdminError(
                "Admin session expired or invalid.",
                code=AdminErrorCode.SESSION_EXPIRED,
                http_status=401,
            )

        if session.expires_at <= datetime.now(timezone.utc):
            self._sessions.pop(normalized, None)
            raise AdminError(
                "Admin session expired.",
                code=AdminErrorCode.SESSION_EXPIRED,
                http_status=401,
            )

        return session

    def invalidate_session(self, token: str | None) -> None:
        """End an admin session (kiosk logout or explicit portal sign-out)."""
        normalized = (token or "").strip()
        if normalized:
            self._sessions.pop(normalized, None)

    @staticmethod
    def hash_password(password: str) -> str:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    @staticmethod
    def _verify_password(password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"),
                password_hash.encode("utf-8"),
            )
        except ValueError:
            return False


_shared_admin_auth_service = AdminAuthService()


def get_shared_admin_auth_service() -> AdminAuthService:
    return _shared_admin_auth_service


__all__ = ["AdminAuthService", "AdminSession", "get_shared_admin_auth_service"]
