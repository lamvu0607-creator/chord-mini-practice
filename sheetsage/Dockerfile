# Sheet Sage melody service.
# The upstream Sheet Sage weights (sheetsage.s3.amazonaws.com) now return 403, so the
# service runs Spotify Basic Pitch, which needs Python >= 3.7. The previous Ubuntu 18.04 /
# Python 3.6 / torch 1.4 image is kept as Dockerfile.legacy-sheetsage.
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8082 \
    SHEETSAGE_PRELOAD=false \
    SHEETSAGE_CACHE_DIR=/app/cache

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN python -m pip install -r requirements.txt

COPY app.py ./app.py
COPY service.py ./service.py
COPY cache ./cache
COPY src/sheetsage_upstream/sheetsage ./src/sheetsage_upstream/sheetsage

RUN mkdir -p /app/cache

EXPOSE 8082

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8082} --workers 1 --threads 4 --timeout 900 app:app"]
