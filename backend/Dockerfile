# Face Auth API — production image (Debian plant / Render-compatible).
#
# - OpenCV system libs for headless server use
# - SFace + MediaPipe weights baked in at build (plant can run without outbound net)
# - PORT from env (Render); defaults to 8000 on Debian

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Bake face models into the image (same URLs the app would auto-download).
RUN mkdir -p models \
    && curl -fsSL -o models/face_recognition_sface_2021dec.onnx \
      "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx" \
    && curl -fsSL -o models/blaze_face_short_range.tflite \
      "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" \
    && test -s models/face_recognition_sface_2021dec.onnx \
    && test -s models/blaze_face_short_range.tflite

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Render sets PORT; Debian compose can leave it unset → 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
