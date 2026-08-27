"""
Backend face embedding layer (OpenCV SFace ONNX).

Architecture:

    detector.crop_face(...)
            ↓
    face.embedding.embed(...)     ← this module (SFace)
            ↓
    float32 vector (L2-normalized)
            ↓
    pgvector 1:1 cosine match     ← later

Model (free for customer deployment):
- Name: face_recognition_sface_2021dec.onnx
- Source: OpenCV Zoo
- License: Apache License 2.0 (no per-seat / runtime fee for this model)
- Verified output dimension: 128

Design goals:
- Provider-swappable embedder protocol
- Explicit model version string for enrollments.model_version
- Lazy load + shared singleton for API workers
- Deterministic preprocessing for kiosk crops
- Cosine similarity helpers aligned with pgvector usage
- Does NOT talk to the database or decide authentication
"""

from __future__ import annotations

import logging
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import cv2
import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_DIR = BACKEND_DIR / "models"
DEFAULT_MODEL_FILENAME = "face_recognition_sface_2021dec.onnx"
DEFAULT_MODEL_PATH = DEFAULT_MODEL_DIR / DEFAULT_MODEL_FILENAME

# Official OpenCV Zoo release (Apache-2.0). Prefer GitHub raw for automation.
DEFAULT_MODEL_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_recognition_sface/face_recognition_sface_2021dec.onnx"
)

# Verified against face_recognition_sface_2021dec.onnx via FaceRecognizerSF.feature()
SFACE_EMBEDDING_DIMENSIONS = 128
SFACE_MODEL_VERSION = "sface_2021dec_opencv_zoo"
SFACE_INPUT_SIZE = (112, 112)  # width, height — OpenCV SFace aligned input

BGRImage = NDArray[np.uint8]
EmbeddingVector = NDArray[np.float32]


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class FaceEmbeddingError(Exception):
    """Base error for embedding failures."""

    def __init__(self, message: str, *, code: str = "FACE_EMBEDDING_ERROR") -> None:
        super().__init__(message)
        self.code = code


class FaceEmbedderNotReadyError(FaceEmbeddingError):
    def __init__(self, message: str = "Face embedder model is not loaded.") -> None:
        super().__init__(message, code="EMBEDDER_NOT_READY")


class InvalidFaceCropError(FaceEmbeddingError):
    def __init__(self, message: str = "Face crop is empty or invalid.") -> None:
        super().__init__(message, code="INVALID_FACE_CROP")


class FaceEmbedderModelError(FaceEmbeddingError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="EMBEDDER_MODEL_ERROR")


class EmbeddingDimensionError(FaceEmbeddingError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="EMBEDDING_DIMENSION_MISMATCH")


# ---------------------------------------------------------------------------
# Result / config types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class FaceEmbeddingResult:
    """Embedding produced for one face crop."""

    vector: EmbeddingVector
    model_version: str
    dimensions: int
    l2_normalized: bool

    def as_list(self) -> list[float]:
        return self.vector.astype(np.float32).tolist()

    def as_pgvector_literal(self) -> str:
        """Format suitable for manual SQL / debugging (not for logging in prod)."""
        return "[" + ",".join(f"{x:.8f}" for x in self.as_list()) + "]"


@dataclass(frozen=True, slots=True)
class FaceEmbedderConfig:
    """Runtime configuration for SFace embedding."""

    model_path: Path = DEFAULT_MODEL_PATH
    model_url: str = DEFAULT_MODEL_URL
    model_version: str = SFACE_MODEL_VERSION
    expected_dimensions: int = SFACE_EMBEDDING_DIMENSIONS
    input_size: tuple[int, int] = SFACE_INPUT_SIZE
    """If True, download the official Apache-2.0 Zoo model when missing."""
    auto_download_model: bool = True
    """L2-normalize vectors for cosine similarity / pgvector consistency."""
    l2_normalize: bool = True
    """OpenCV backend string for FaceRecognizerSF.create (usually empty)."""
    backend_id: str = ""
    target_id: str = ""


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------


class FaceEmbedder(ABC):
    """Swappable face-embedding contract used by verification services."""

    @abstractmethod
    def embed(self, face_bgr: BGRImage) -> FaceEmbeddingResult:
        """Create an embedding from a BGR face crop."""

    def embed_many(self, faces_bgr: Sequence[BGRImage]) -> list[FaceEmbeddingResult]:
        return [self.embed(face) for face in faces_bgr]

    @abstractmethod
    def close(self) -> None:
        """Release native resources."""

    def __enter__(self) -> FaceEmbedder:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


# ---------------------------------------------------------------------------
# OpenCV SFace implementation (ONNX model, Apache-2.0)
# ---------------------------------------------------------------------------


class OpenCVSFaceEmbedder(FaceEmbedder):
    """
    OpenCV FaceRecognizerSF backed by the free SFace ONNX model.

    Customer deployment:
    - Model license is Apache 2.0 (OpenCV Zoo)
    - No cloud API key and no per-authentication fee for the model itself
    - Ship the .onnx under backend/models/ or download once at startup
    """

    def __init__(self, config: FaceEmbedderConfig | None = None) -> None:
        self.config = config or FaceEmbedderConfig()
        self._recognizer: Any | None = None

    @property
    def is_ready(self) -> bool:
        return self._recognizer is not None

    @property
    def model_version(self) -> str:
        return self.config.model_version

    @property
    def dimensions(self) -> int:
        return self.config.expected_dimensions

    def load(self) -> None:
        model_path = ensure_sface_model(
            model_path=self.config.model_path,
            model_url=self.config.model_url,
            auto_download=self.config.auto_download_model,
        )

        try:
            recognizer = cv2.FaceRecognizerSF.create(
                str(model_path),
                self.config.backend_id,
            )
        except Exception as exc:  # noqa: BLE001
            raise FaceEmbedderModelError(
                f"Failed to initialize OpenCV SFace embedder: {exc}"
            ) from exc

        # Verify output dimension against the real model (never invent).
        probe = np.zeros(
            (self.config.input_size[1], self.config.input_size[0], 3),
            dtype=np.uint8,
        )
        try:
            raw = np.asarray(recognizer.feature(probe), dtype=np.float32).reshape(-1)
        except Exception as exc:  # noqa: BLE001
            raise FaceEmbedderModelError(
                f"SFace model probe failed during load: {exc}"
            ) from exc

        if raw.shape[0] != self.config.expected_dimensions:
            raise EmbeddingDimensionError(
                "SFace output dimension mismatch: "
                f"model produced {raw.shape[0]}, config expected "
                f"{self.config.expected_dimensions}. Update DB Vector(N) / "
                "settings.face_embedding_dimensions to match the model."
            )

        self._recognizer = recognizer
        logger.info(
            "Loaded SFace embedder model=%s version=%s dim=%s license=Apache-2.0",
            model_path,
            self.config.model_version,
            self.config.expected_dimensions,
        )

    def embed(self, face_bgr: BGRImage) -> FaceEmbeddingResult:
        if self._recognizer is None:
            self.load()
        assert self._recognizer is not None

        prepared = preprocess_face_crop(
            face_bgr,
            input_size=self.config.input_size,
        )

        try:
            raw = np.asarray(
                self._recognizer.feature(prepared),
                dtype=np.float32,
            ).reshape(-1)
        except Exception as exc:  # noqa: BLE001
            raise FaceEmbeddingError(
                f"SFace feature extraction failed: {exc}",
                code="FEATURE_EXTRACTION_FAILED",
            ) from exc

        if raw.shape[0] != self.config.expected_dimensions:
            raise EmbeddingDimensionError(
                f"Unexpected embedding size {raw.shape[0]} "
                f"(expected {self.config.expected_dimensions})."
            )

        vector = raw
        if self.config.l2_normalize:
            vector = l2_normalize(vector)

        return FaceEmbeddingResult(
            vector=vector.astype(np.float32, copy=False),
            model_version=self.config.model_version,
            dimensions=int(vector.shape[0]),
            l2_normalized=self.config.l2_normalize,
        )

    def cosine_similarity(
        self,
        left: EmbeddingVector | FaceEmbeddingResult,
        right: EmbeddingVector | FaceEmbeddingResult,
    ) -> float:
        """
        Cosine similarity in [-1, 1].
        Prefer this for 1:1 verification thresholds (higher = more similar).
        """
        a = _as_vector(left)
        b = _as_vector(right)
        if a.shape != b.shape:
            raise EmbeddingDimensionError("Cannot compare embeddings of different sizes.")
        if self._recognizer is not None:
            try:
                score = float(
                    self._recognizer.match(a, b, cv2.FaceRecognizerSF_FR_COSINE)
                )
                return score
            except Exception:  # noqa: BLE001 — fall back to numpy
                pass
        return float(np.dot(l2_normalize(a), l2_normalize(b)))

    def close(self) -> None:
        # FaceRecognizerSF has no explicit close; drop reference for GC.
        self._recognizer = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def preprocess_face_crop(
    face_bgr: BGRImage,
    *,
    input_size: tuple[int, int] = SFACE_INPUT_SIZE,
) -> BGRImage:
    if face_bgr is None or face_bgr.size == 0:
        raise InvalidFaceCropError()
    if face_bgr.ndim != 3 or face_bgr.shape[2] != 3:
        raise InvalidFaceCropError("Expected a BGR face crop with shape (H, W, 3).")

    width, height = input_size
    if face_bgr.shape[1] == width and face_bgr.shape[0] == height:
        return np.ascontiguousarray(face_bgr)

    resized = cv2.resize(face_bgr, (width, height), interpolation=cv2.INTER_AREA)
    return np.ascontiguousarray(resized)


def l2_normalize(vector: EmbeddingVector, *, eps: float = 1e-12) -> EmbeddingVector:
    arr = np.asarray(vector, dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(arr))
    if norm < eps:
        return arr
    return (arr / norm).astype(np.float32, copy=False)


def cosine_similarity(left: EmbeddingVector, right: EmbeddingVector) -> float:
    a = l2_normalize(np.asarray(left, dtype=np.float32))
    b = l2_normalize(np.asarray(right, dtype=np.float32))
    if a.shape != b.shape:
        raise EmbeddingDimensionError("Cannot compare embeddings of different sizes.")
    return float(np.dot(a, b))


def _as_vector(value: EmbeddingVector | FaceEmbeddingResult) -> EmbeddingVector:
    if isinstance(value, FaceEmbeddingResult):
        return value.vector
    return np.asarray(value, dtype=np.float32).reshape(-1)


def ensure_sface_model(
    *,
    model_path: Path = DEFAULT_MODEL_PATH,
    model_url: str = DEFAULT_MODEL_URL,
    auto_download: bool = True,
) -> Path:
    """
    Ensure the Apache-2.0 SFace ONNX model exists on disk.
    Does not invent weights — downloads from OpenCV Zoo when allowed.
    """
    if model_path.is_file() and model_path.stat().st_size > 0:
        return model_path

    if not auto_download:
        raise FaceEmbedderModelError(
            f"SFace model not found at {model_path}. "
            f"Place the Apache-2.0 OpenCV Zoo file there or enable auto_download_model. "
            f"Source: {model_url}"
        )

    model_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = model_path.with_suffix(model_path.suffix + ".download")

    logger.info("Downloading free SFace ONNX model (Apache-2.0) from %s", model_url)
    try:
        urllib.request.urlretrieve(model_url, tmp_path)  # noqa: S310 — fixed Zoo URL
        tmp_path.replace(model_path)
    except Exception as exc:  # noqa: BLE001
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise FaceEmbedderModelError(f"Failed to download SFace model: {exc}") from exc

    if not model_path.is_file() or model_path.stat().st_size <= 0:
        raise FaceEmbedderModelError(
            f"Downloaded SFace model is missing or empty: {model_path}"
        )

    return model_path


def create_face_embedder(
    config: FaceEmbedderConfig | None = None,
    *,
    load: bool = True,
) -> OpenCVSFaceEmbedder:
    """Factory used by services — prefer this over constructing internals."""
    embedder = OpenCVSFaceEmbedder(config=config)
    if load:
        embedder.load()
    return embedder


_shared_embedder: OpenCVSFaceEmbedder | None = None


def get_shared_face_embedder(
    config: FaceEmbedderConfig | None = None,
) -> OpenCVSFaceEmbedder:
    """Process-wide lazy singleton for request handlers."""
    global _shared_embedder
    if _shared_embedder is None:
        _shared_embedder = create_face_embedder(config=config, load=True)
    return _shared_embedder


def close_shared_face_embedder() -> None:
    global _shared_embedder
    if _shared_embedder is not None:
        _shared_embedder.close()
        _shared_embedder = None
