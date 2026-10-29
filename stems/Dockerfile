# ChordMini stem separation service (SCNet, GPU).
# Checkpoints are not baked into the image: mount them at /app/ckpts
# (see download_weights.py).
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8083 \
    STEMS_CKPT_DIR=/app/ckpts \
    STORAGE_AUDIO_DIR=/app/storage/audio

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN python -m pip install -r requirements.txt

COPY app.py service.py download_weights.py ./
COPY scnet ./scnet

EXPOSE 8083

# Run as the frontend's user (nextjs, uid 1001 / gid 65533) so stems written into the shared
# audio volume stay deletable by the frontend (manual delete, LRU eviction, upload dirs).
# numba (via librosa) needs a writable cache dir once site-packages is read-only to us.
ENV HOME=/tmp NUMBA_CACHE_DIR=/tmp/numba-cache
USER 1001:65533

# One worker owns the GPU model; extra threads keep /health and /progress responsive
# while a separation runs (separations themselves are serialized by a lock).
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8083} --workers 1 --threads 4 --timeout 1800 app:app"]
