"""
Application logging (Debian FastAPI).

Week 1: one-line INFO logs for auth decisions (score, threshold, match).
"""

from __future__ import annotations

import logging
import sys


def setup_logging(*, level: int = logging.INFO) -> None:
    """Configure root logging once at app startup."""
    root = logging.getLogger()
    if root.handlers:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", datefmt="%H:%M:%S")
    )
    root.addHandler(handler)
    root.setLevel(level)

    # App auth pipeline — INFO; ML internals stay DEBUG.
    logging.getLogger("app.services.authentication").setLevel(logging.INFO)
    logging.getLogger("app.services.face_verification").setLevel(logging.INFO)
    logging.getLogger("app.api.routes.auth").setLevel(logging.INFO)
    logging.getLogger("app.face").setLevel(logging.WARNING)
