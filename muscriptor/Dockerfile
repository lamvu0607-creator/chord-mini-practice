# ChordMini instrument transcription service (MuScriptor medium, GPU).
# Weights are gated and not baked into the image: mount them at /app/ckpts
# (see download_weights.py).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8084 \
    MUSCRIPTOR_CKPT_DIR=/app/ckpts \
    STORAGE_AUDIO_DIR=/app/storage/audio

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN python -m pip install -r requirements.txt

COPY app.py service.py download_weights.py ./

EXPOSE 8084

# Same user as the frontend and stems (uid 1001 / gid 65533); the audio volume is mounted read-only.
ENV HOME=/tmp
USER 1001:65533

# One worker owns the GPU model; extra threads keep /health and /progress responsive
# while a transcription runs (transcriptions themselves are serialized by a lock).
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8084} --workers 1 --threads 4 --timeout 1800 app:app"]
