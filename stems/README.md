# Stems service (SCNet)

GPU service that splits a song into `vocals`, `drums`, `bass` and `other` using SCNet.
It is called only by the Next.js stem worker (`src/server/stems/stemWorker.ts`), never by browsers.

## Models

| `STEMS_MODEL` | Checkpoint | MUSDB18HQ SDR | Notes |
|---|---|---|---|
| `scnet_xl_ihf` (default) | `model_scnet_ep_36_sdr_10.0891.ckpt` (214 MB) | 10.08 | Best quality; meant for GPU |
| `scnet_small` | `scnet_checkpoint_musdb18.ckpt` (42 MB) | 9.03 | ~1.5x realtime on CPU |

Model code is vendored from [ZFTurbo/Music-Source-Separation-Training](https://github.com/ZFTurbo/Music-Source-Separation-Training)
(MIT, commit `6fdad13`, see `scnet/LICENSE`). The checkpoints were trained on MUSDB18-HQ, whose
license allows non-commercial use only.

Download/verify weights (SHA-256 checked) into `ckpts/`, which compose mounts read-only:

```bash
python download_weights.py            # default model
python download_weights.py --model all
```

## Speed (RTX 3060 Ti, measured)

- XL IHF, overlap 2: ~3.5x realtime (4-minute song in ~70 s), peak VRAM ~4.5 GB
- XL IHF, overlap 4: ~1.5x realtime
- Small, overlap 4: ~22x realtime

## API

- `GET /health` (`?warmup=true` loads the model)
- `GET /info`
- `POST /separate` `{ jobId, inputPath, outputDir }`: both paths are **relative to the shared
  audio volume** (`STORAGE_AUDIO_DIR`); `outputDir` must be inside `stems/`. Writes
  `<stem>.flac` files and returns `{ model, duration, processingTime, stems: [{ name, file, bytes }] }`.
- `GET /progress/<jobId>`: `{ progress: 0..1 }` while a separation runs.

Paths that resolve outside the audio volume are rejected, and the service never downloads URLs.

## Environment

| Variable | Default |
|---|---|
| `STEMS_MODEL` | `scnet_xl_ihf` |
| `STEMS_DEVICE` | `cuda` (falls back to CPU when CUDA is unavailable) |
| `STEMS_OVERLAP` | `2` (chunk overlap; `4` matches upstream configs but is ~2.3x slower) |
| `STEMS_CKPT_DIR` | `/app/ckpts` |
| `STORAGE_AUDIO_DIR` | `/app/storage/audio` |

Frontend side: `STEMS_API_URL`, `STEMS_BACKEND_TIMEOUT_MS`, `STEMS_QUOTA_GB` (LRU limit for
stored stems, default 10), `STEMS_MAX_UPLOAD_MB` (default 100).
