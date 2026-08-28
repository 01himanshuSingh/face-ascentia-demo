"""
Face verification service (1:1 cosine match).

Architecture
------------
  authentication service
        ↓
  face_verification.verify_image_against_reference(...)   ← this module
        ↓
  face.detector (MediaPipe)  +  face.embedding (SFace)
        ↓
  cosine score vs enrollment vector (from DB — passed in, not loaded here)

System boundary
---------------
- IN:  JPEG/PNG bytes from SDK + reference embedding (ACTIVE enrollment row)
- OUT: FaceVerificationResult (score, threshold, matched) OR AuthError subclass

Wrong face (score below threshold) is **not** an exception — `matched=False`.
Pipeline failures (no face, bad image, embed error) raise AuthError for the
HTTP layer to map once in main.py.

Does NOT
--------
- Look up employee / enrollment (repositories + authentication service)
- Expose HTTP routes
- Perform liveness (SDK-owned)
- Run 1:N gallery search (Employee ID → 1:1 only)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Sequence

import numpy as np
from numpy.typing import NDArray

from app.common.exceptions import (
    EmbeddingDimensionMismatchError,
    EmptyImageError,
    FaceDetectFailedError,
    FaceEmbedFailedError,
    ImageTooLargeError,
    InvalidImageError,
    MultipleFacesError,
    NoFaceDetectedError,
)
from app.core.config import Settings, get_settings, settings
from app.face.detector import (
    DetectedFace,
    FaceDetectionError,
    FaceDetector,
    InvalidFaceImageError,
    decode_image_bytes,
    get_shared_face_detector,
)
from app.face.embedding import (
    EmbeddingDimensionError,
    FaceEmbeddingError,
    FaceEmbeddingResult,
    FaceEmbedder,
    get_shared_face_embedder,
)

logger = logging.getLogger(__name__)

EmbeddingVector = NDArray[np.float32]


# ---------------------------------------------------------------------------
# Result types (service layer — consumed by authentication.py)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class LiveFaceEmbedding:
    """Embedding extracted from a kiosk capture (no DB reference yet)."""

    vector: tuple[float, ...]
    model_version: str
    dimensions: int
    detection_score: float

    @classmethod
    def from_embedding_result(
        cls,
        embedding: FaceEmbeddingResult,
        *,
        detection_score: float,
    ) -> LiveFaceEmbedding:
        return cls(
            vector=tuple(float(x) for x in embedding.as_list()),
            model_version=embedding.model_version,
            dimensions=embedding.dimensions,
            detection_score=detection_score,
        )


@dataclass(frozen=True, slots=True)
class FaceVerificationResult:
    """
    Outcome of 1:1 verification.

    `matched` is True when score >= threshold (same gate as AuthenticateResponse).
    """

    score: float
    threshold: float
    matched: bool
    live_model_version: str
    live_dimensions: int
    detection_score: float


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class FaceVerificationService:
    """
    Orchestrates detect → crop → embed → cosine 1:1 for authentication.

    Dependencies are injectable for unit tests; production uses shared
    process-wide detector/embedder singletons.
    """

    def __init__(
        self,
        *,
        detector: FaceDetector,
        embedder: FaceEmbedder,
        app_settings: Settings | None = None,
    ) -> None:
        self._detector = detector
        self._embedder = embedder
        self._settings = app_settings or settings

    def verify_image_against_reference(
        self,
        image_bytes: bytes,
        reference_embedding: Sequence[float],
        *,
        threshold: float | None = None,
    ) -> FaceVerificationResult:
        """
        Full Week 1 verification path for one captured still vs one enrollment.

        Args:
            image_bytes: Best JPEG from SDK burst capture.
            reference_embedding: ACTIVE enrollment vector (128-D SFace).
            threshold: Cosine gate; defaults to settings.face_match_cosine_threshold.

        Returns:
            FaceVerificationResult including matched flag.

        Raises:
            AuthError subclasses when the pipeline cannot produce a score.
        """
        live = self.extract_live_embedding(image_bytes)
        gate = (
            threshold
            if threshold is not None
            else self._settings.face_match_cosine_threshold
        )
        return self.compare_to_reference(
            live.vector,
            reference_embedding,
            threshold=gate,
            live_model_version=live.model_version,
            live_dimensions=live.dimensions,
            detection_score=live.detection_score,
        )

    def extract_live_embedding(self, image_bytes: bytes) -> LiveFaceEmbedding:
        """
        Detect exactly one face and return its SFace embedding.

        Reusable for future enrollment capture on the server; authentication
        service calls verify_image_against_reference for the login path.
        """
        self._validate_image_payload(image_bytes)

        try:
            image_bgr = decode_image_bytes(image_bytes)
        except InvalidFaceImageError as exc:
            raise InvalidImageError(str(exc)) from exc

        face, crop = self._detect_and_crop(image_bgr)

        try:
            embedding = self._embedder.embed(crop)
        except EmbeddingDimensionError as exc:
            raise EmbeddingDimensionMismatchError(
                got=self._infer_got_dimension(str(exc)),
                expected=self._settings.face_embedding_dimensions,
            ) from exc
        except FaceEmbeddingError as exc:
            raise FaceEmbedFailedError(str(exc)) from exc

        logger.debug(
            "Live embedding extracted model=%s dim=%s detection_score=%.3f",
            embedding.model_version,
            embedding.dimensions,
            face.score,
        )
        return LiveFaceEmbedding.from_embedding_result(
            embedding,
            detection_score=face.score,
        )

    def compare_to_reference(
        self,
        live_embedding: Sequence[float],
        reference_embedding: Sequence[float],
        *,
        threshold: float | None = None,
        live_model_version: str | None = None,
        live_dimensions: int | None = None,
        detection_score: float = 0.0,
    ) -> FaceVerificationResult:
        """
        Cosine 1:1 compare when live embedding is already computed.

        Used by verify_image_against_reference; also handy for tests.
        """
        gate = (
            threshold
            if threshold is not None
            else self._settings.face_match_cosine_threshold
        )
        expected = self._settings.face_embedding_dimensions

        live = self._coerce_reference_vector(live_embedding, expected=expected)
        reference = self._coerce_reference_vector(reference_embedding, expected=expected)

        try:
            score = float(self._embedder.cosine_similarity(live, reference))
        except EmbeddingDimensionError as exc:
            raise EmbeddingDimensionMismatchError(
                got=int(live.shape[0]),
                expected=expected,
            ) from exc

        matched = score >= gate
        model_version = live_model_version or self._settings.face_embedding_model_version
        dimensions = live_dimensions or int(live.shape[0])

        logger.debug(
            "verify | face_score=%.3f | threshold=%.3f | match=%s",
            score,
            gate,
            matched,
        )

        return FaceVerificationResult(
            score=score,
            threshold=gate,
            matched=matched,
            live_model_version=model_version,
            live_dimensions=dimensions,
            detection_score=detection_score,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _validate_image_payload(self, image_bytes: bytes) -> None:
        if not image_bytes:
            raise EmptyImageError()
        max_bytes = self._settings.auth_max_image_bytes
        if len(image_bytes) > max_bytes:
            raise ImageTooLargeError(max_bytes=max_bytes)

    def _detect_and_crop(self, image_bgr: NDArray[np.uint8]) -> tuple[DetectedFace, NDArray[np.uint8]]:
        try:
            detection = self._detector.detect(image_bgr)
        except FaceDetectionError as exc:
            raise FaceDetectFailedError(str(exc)) from exc

        if detection.face_count == 0:
            raise NoFaceDetectedError()
        if detection.face_count > 1:
            raise MultipleFacesError()

        face = detection.primary_face
        if face is None:
            raise NoFaceDetectedError()

        try:
            crop = self._detector.crop_face(image_bgr, face)
        except FaceDetectionError as exc:
            raise FaceDetectFailedError(str(exc)) from exc

        return face, crop

    def _coerce_reference_vector(
        self,
        values: Sequence[float],
        *,
        expected: int,
    ) -> EmbeddingVector:
        vector = np.asarray(values, dtype=np.float32).reshape(-1)
        if vector.size == 0:
            raise EmbeddingDimensionMismatchError(got=0, expected=expected)
        if vector.shape[0] != expected:
            raise EmbeddingDimensionMismatchError(
                got=int(vector.shape[0]),
                expected=expected,
            )
        return vector

    @staticmethod
    def _infer_got_dimension(message: str) -> int:
        """Best-effort parse when EmbeddingDimensionError message carries sizes."""
        for token in message.replace(",", " ").split():
            if token.isdigit():
                return int(token)
        return 0


# ---------------------------------------------------------------------------
# Factory (process-wide default for authentication service / routes)
# ---------------------------------------------------------------------------


def create_face_verification_service(
    *,
    detector: FaceDetector | None = None,
    embedder: FaceEmbedder | None = None,
    app_settings: Settings | None = None,
) -> FaceVerificationService:
    """Construct service with explicit or shared ML backends."""
    return FaceVerificationService(
        detector=detector or get_shared_face_detector(),
        embedder=embedder or get_shared_face_embedder(),
        app_settings=app_settings or get_settings(),
    )


_shared_verification_service: FaceVerificationService | None = None


def get_shared_face_verification_service() -> FaceVerificationService:
    """Lazy singleton for request handlers (same pattern as detector/embedder)."""
    global _shared_verification_service
    if _shared_verification_service is None:
        _shared_verification_service = create_face_verification_service()
    return _shared_verification_service


__all__ = [
    "FaceVerificationService",
    "FaceVerificationResult",
    "LiveFaceEmbedding",
    "create_face_verification_service",
    "get_shared_face_verification_service",
]
