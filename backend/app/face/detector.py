"""
Backend face detection layer (MediaPipe Face Detector).

Architecture:

    SDK capture (best frame bytes)
            ↓
    FastAPI /authenticate  (later)
            ↓
    face.detector.detect(...)     ← this module
            ↓
    face.embedding.embed(crop)    ← later (SFace)
            ↓
    1:1 pgvector match            ← later

Design goals:
- Provider-swappable protocol (MediaPipe today; another detector later)
- Explicit, serializable detection results for services/API layers
- Lazy model load (no MediaPipe init at import time)
- Works with image bytes or OpenCV BGR arrays
- Does NOT decide authentication, enrollment, or liveness
"""

from __future__ import annotations

import logging
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core import base_options as mp_base_options
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_DIR = BACKEND_DIR / "models"
DEFAULT_MODEL_FILENAME = "blaze_face_short_range.tflite"
DEFAULT_MODEL_PATH = DEFAULT_MODEL_DIR / DEFAULT_MODEL_FILENAME
DEFAULT_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_detector/blaze_face_short_range/float16/1/"
    "blaze_face_short_range.tflite"
)

BGRImage = NDArray[np.uint8]


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class FaceDetectionError(Exception):
    """Base error for face detection failures."""

    def __init__(self, message: str, *, code: str = "FACE_DETECTION_ERROR") -> None:
        super().__init__(message)
        self.code = code


class FaceDetectorNotReadyError(FaceDetectionError):
    def __init__(self, message: str = "Face detector model is not loaded.") -> None:
        super().__init__(message, code="DETECTOR_NOT_READY")


class InvalidFaceImageError(FaceDetectionError):
    def __init__(self, message: str = "Input image is empty or undecodable.") -> None:
        super().__init__(message, code="INVALID_IMAGE")


class FaceDetectorModelError(FaceDetectionError):
    def __init__(self, message: str) -> None:
        super().__init__(message, code="DETECTOR_MODEL_ERROR")


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class NormalizedBoundingBox:
    """Bounding box in normalized image coordinates (0..1)."""

    origin_x: float
    origin_y: float
    width: float
    height: float

    def clamp(self) -> NormalizedBoundingBox:
        x = min(max(self.origin_x, 0.0), 1.0)
        y = min(max(self.origin_y, 0.0), 1.0)
        w = min(max(self.width, 0.0), 1.0 - x)
        h = min(max(self.height, 0.0), 1.0 - y)
        return NormalizedBoundingBox(x, y, w, h)


@dataclass(frozen=True, slots=True)
class PixelBoundingBox:
    """Bounding box in absolute pixel coordinates (x_min, y_min, x_max, y_max)."""

    x_min: int
    y_min: int
    x_max: int
    y_max: int

    @property
    def width(self) -> int:
        return max(0, self.x_max - self.x_min)

    @property
    def height(self) -> int:
        return max(0, self.y_max - self.y_min)

    def as_xywh(self) -> tuple[int, int, int, int]:
        return self.x_min, self.y_min, self.width, self.height


@dataclass(frozen=True, slots=True)
class DetectedFace:
    """One detected face with confidence and boxes."""

    score: float
    normalized_box: NormalizedBoundingBox
    pixel_box: PixelBoundingBox
    keypoints: tuple[tuple[float, float], ...] = ()


@dataclass(frozen=True, slots=True)
class FaceDetectionResult:
    """Full detector response for one image."""

    faces: tuple[DetectedFace, ...]
    image_width: int
    image_height: int
    model_name: str

    @property
    def face_count(self) -> int:
        return len(self.faces)

    @property
    def has_single_face(self) -> bool:
        return len(self.faces) == 1

    @property
    def primary_face(self) -> DetectedFace | None:
        if not self.faces:
            return None
        return max(self.faces, key=lambda face: face.score)


@dataclass(frozen=True, slots=True)
class FaceDetectorConfig:
    """Runtime configuration for MediaPipe face detection."""

    model_path: Path = DEFAULT_MODEL_PATH
    model_url: str = DEFAULT_MODEL_URL
    min_detection_confidence: float = 0.5
    min_suppression_threshold: float = 0.3
    """If True, download the official model when model_path is missing."""
    auto_download_model: bool = True
    """Extra padding ratio when cropping a face for embedding (0.2 = 20%)."""
    crop_padding_ratio: float = 0.25


# ---------------------------------------------------------------------------
# Protocol / abstract detector
# ---------------------------------------------------------------------------


class FaceDetector(ABC):
    """Swappable face-detection contract used by face services."""

    @abstractmethod
    def detect(self, image_bgr: BGRImage) -> FaceDetectionResult:
        """Detect faces in an OpenCV BGR image."""

    def detect_bytes(self, image_bytes: bytes) -> FaceDetectionResult:
        image = decode_image_bytes(image_bytes)
        return self.detect(image)

    def detect_primary_face(self, image_bgr: BGRImage) -> DetectedFace | None:
        return self.detect(image_bgr).primary_face

    def crop_face(
        self,
        image_bgr: BGRImage,
        face: DetectedFace,
        *,
        padding_ratio: float = 0.25,
    ) -> BGRImage:
        """
        Crop a face region for downstream embedding.
        Padding helps SFace robustness on tight boxes.
        """
        if image_bgr.ndim != 3 or image_bgr.size == 0:
            raise InvalidFaceImageError("Cannot crop an empty image.")

        height, width = image_bgr.shape[:2]
        pad = padding_ratio

        box = face.pixel_box
        bw = box.width
        bh = box.height
        pad_x = int(bw * pad)
        pad_y = int(bh * pad)

        x_min = max(0, box.x_min - pad_x)
        y_min = max(0, box.y_min - pad_y)
        x_max = min(width, box.x_max + pad_x)
        y_max = min(height, box.y_max + pad_y)

        if x_max <= x_min or y_max <= y_min:
            raise FaceDetectionError(
                "Invalid face crop bounds.",
                code="INVALID_FACE_CROP",
            )

        crop = image_bgr[y_min:y_max, x_min:x_max]
        if crop.size == 0:
            raise FaceDetectionError(
                "Face crop produced an empty image.",
                code="INVALID_FACE_CROP",
            )
        return crop

    @abstractmethod
    def close(self) -> None:
        """Release native resources."""

    def __enter__(self) -> FaceDetector:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


# ---------------------------------------------------------------------------
# MediaPipe implementation
# ---------------------------------------------------------------------------


class MediaPipeFaceDetector(FaceDetector):
    """
    MediaPipe Tasks Face Detector (BlazeFace short-range by default).

    Suitable for kiosk selfie / USB webcam frames after SDK capture.
    """

    def __init__(self, config: FaceDetectorConfig | None = None) -> None:
        self.config = config or FaceDetectorConfig()
        self._detector: Any | None = None
        self._model_name = self.config.model_path.name

    @property
    def is_ready(self) -> bool:
        return self._detector is not None

    def load(self) -> None:
        """Load (or reload) the MediaPipe face detector model."""
        model_path = ensure_face_detector_model(
            model_path=self.config.model_path,
            model_url=self.config.model_url,
            auto_download=self.config.auto_download_model,
        )

        base_options = mp_base_options.BaseOptions(
            model_asset_path=str(model_path),
        )
        options = vision.FaceDetectorOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            min_detection_confidence=self.config.min_detection_confidence,
            min_suppression_threshold=self.config.min_suppression_threshold,
        )

        try:
            detector = vision.FaceDetector.create_from_options(options)
        except Exception as exc:  # noqa: BLE001 — surface as domain error
            raise FaceDetectorModelError(
                f"Failed to initialize MediaPipe FaceDetector: {exc}"
            ) from exc

        if self._detector is not None:
            self._detector.close()

        self._detector = detector
        self._model_name = model_path.name
        logger.info("Loaded MediaPipe face detector model=%s", model_path)

    def detect(self, image_bgr: BGRImage) -> FaceDetectionResult:
        if self._detector is None:
            self.load()

        assert self._detector is not None

        if image_bgr is None or image_bgr.size == 0:
            raise InvalidFaceImageError()

        if image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
            raise InvalidFaceImageError(
                "Expected a BGR color image with shape (H, W, 3)."
            )

        height, width = image_bgr.shape[:2]
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        try:
            raw = self._detector.detect(mp_image)
        except Exception as exc:  # noqa: BLE001
            raise FaceDetectionError(
                f"MediaPipe face detection failed: {exc}",
                code="DETECTION_FAILED",
            ) from exc

        faces: list[DetectedFace] = []
        for detection in raw.detections or []:
            mapped = self._map_detection(detection, width=width, height=height)
            if mapped is not None:
                faces.append(mapped)

        faces.sort(key=lambda face: face.score, reverse=True)
        return FaceDetectionResult(
            faces=tuple(faces),
            image_width=width,
            image_height=height,
            model_name=self._model_name,
        )

    def close(self) -> None:
        if self._detector is not None:
            self._detector.close()
            self._detector = None

    def _map_detection(
        self,
        detection: Any,
        *,
        width: int,
        height: int,
    ) -> DetectedFace | None:
        bbox = detection.bounding_box
        if bbox is None:
            return None

        # MediaPipe Tasks bounding_box is in pixel coordinates.
        x_min = int(bbox.origin_x)
        y_min = int(bbox.origin_y)
        x_max = int(bbox.origin_x + bbox.width)
        y_max = int(bbox.origin_y + bbox.height)

        x_min = max(0, min(x_min, width - 1))
        y_min = max(0, min(y_min, height - 1))
        x_max = max(0, min(x_max, width))
        y_max = max(0, min(y_max, height))

        if x_max <= x_min or y_max <= y_min:
            return None

        norm = NormalizedBoundingBox(
            origin_x=x_min / width,
            origin_y=y_min / height,
            width=(x_max - x_min) / width,
            height=(y_max - y_min) / height,
        ).clamp()

        score = 0.0
        if detection.categories:
            score = float(detection.categories[0].score or 0.0)

        keypoints: list[tuple[float, float]] = []
        for keypoint in detection.keypoints or []:
            keypoints.append((float(keypoint.x), float(keypoint.y)))

        return DetectedFace(
            score=score,
            normalized_box=norm,
            pixel_box=PixelBoundingBox(x_min, y_min, x_max, y_max),
            keypoints=tuple(keypoints),
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def decode_image_bytes(image_bytes: bytes) -> BGRImage:
    if not image_bytes:
        raise InvalidFaceImageError("Image bytes are empty.")

    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise InvalidFaceImageError("Failed to decode image bytes.")
    return image


def ensure_face_detector_model(
    *,
    model_path: Path = DEFAULT_MODEL_PATH,
    model_url: str = DEFAULT_MODEL_URL,
    auto_download: bool = True,
) -> Path:
    """
    Ensure the MediaPipe face-detector model file exists on disk.
    Does not invent weights — downloads the official BlazeFace short-range model.
    """
    if model_path.is_file() and model_path.stat().st_size > 0:
        return model_path

    if not auto_download:
        raise FaceDetectorModelError(
            f"Face detector model not found at {model_path}. "
            f"Download it from {model_url} or enable auto_download_model."
        )

    model_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = model_path.with_suffix(model_path.suffix + ".download")

    logger.info("Downloading face detector model from %s", model_url)
    try:
        urllib.request.urlretrieve(model_url, tmp_path)  # noqa: S310 — fixed Google model URL
        tmp_path.replace(model_path)
    except Exception as exc:  # noqa: BLE001
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise FaceDetectorModelError(
            f"Failed to download face detector model: {exc}"
        ) from exc

    if not model_path.is_file() or model_path.stat().st_size <= 0:
        raise FaceDetectorModelError(
            f"Downloaded face detector model is missing or empty: {model_path}"
        )

    return model_path


def create_face_detector(
    config: FaceDetectorConfig | None = None,
    *,
    load: bool = True,
) -> MediaPipeFaceDetector:
    """Factory used by services — prefer this over constructing internals."""
    detector = MediaPipeFaceDetector(config=config)
    if load:
        detector.load()
    return detector


_shared_detector: MediaPipeFaceDetector | None = None


def get_shared_face_detector(
    config: FaceDetectorConfig | None = None,
) -> MediaPipeFaceDetector:
    """
    Process-wide lazy singleton for request handlers.
    Call close_shared_face_detector() on app shutdown if desired.
    """
    global _shared_detector
    if _shared_detector is None:
        _shared_detector = create_face_detector(config=config, load=True)
    return _shared_detector


def close_shared_face_detector() -> None:
    global _shared_detector
    if _shared_detector is not None:
        _shared_detector.close()
        _shared_detector = None
