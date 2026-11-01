# ChordMini

ChordMini is a Next.js music-analysis application with Python services for beat,
chord, melody, lyrics, and song-structure processing. Application data is stored
locally: structured results and jobs use SQLite, while audio uses the host
filesystem.

## Requirements

- Node.js 20.9+ and npm 10+
- Conda with Python 3.10 for local Python development
- Git LFS for model checkpoints
- Docker and Docker Compose for the production-style stack

## Local setup

```bash
git lfs install
git clone --recursive https://github.com/lamvu0607-creator/chord-mini-practice.git
cd chord-mini-practice
git lfs pull
npm install
cp .env.example .env.local
```

The default persistence settings are:

```dotenv
SQLITE_DATABASE_PATH=./storage/db/chordmini.sqlite
LOCAL_AUDIO_STORAGE_DIR=./storage/audio
LOCAL_AUDIO_QUOTA_GB=20
SEGMENTATION_WORKER_CONCURRENCY=1
SEGMENTATION_WORKER_MAX_ATTEMPTS=3
```

The database schema is migrated automatically when the Next.js process starts.
Only server modules access SQLite; browser reads and writes go through
`/api/*` routes.

### Python backend with Conda

```bash
conda create -n chordmini python=3.10 -y
conda activate chordmini
cd python_backend
python -m pip install --upgrade pip setuptools wheel
python -m pip install "Cython>=0.29.0" numpy==1.26.4
python -m pip install git+https://github.com/CPJKU/madmom
python -m pip install -r requirements.txt
python app.py
```

If the optional source-separation dependency conflicts on the current platform,
use `python_backend/requirements_nospleeter.txt`.

### Next.js frontend

```bash
npm run dev
```

Open <http://localhost:3000>.

## Docker

```bash
cp .env.docker.example .env.docker
docker compose -f docker/docker-compose.dev.yml --env-file .env.docker up --build
```

Nginx is the only public entry point. The Next.js and Python containers expose
ports only to the Compose network. Persistent named volumes keep:

- `/app/storage/db/chordmini.sqlite`
- `/app/storage/audio`

See [docker/README.md](docker/README.md) for published-image and operational
commands.

## Persistence

The SQLite layer uses Drizzle ORM with `better-sqlite3`, WAL mode, foreign-key
checks, and a busy timeout. It stores transcriptions, search keys, melodies,
lyrics, translations, key detections, status reports, and audio metadata.

Audio files are written to a temporary file and atomically renamed before their
metadata is committed. LRU cleanup starts above the configured quota and reduces
usage to 90% of the quota.

## Backup and restore

Create an online database snapshot plus the referenced audio files:

```bash
npm run storage:backup
```

Restore only after stopping the application:

```bash
npm run storage:restore -- --from=storage/backups/chordmini-<timestamp> --app-stopped
```

Validate an exported migration archive without modifying local data:

```bash
npm run storage:import -- --from=<archive-directory> --dry-run
```

Run the final import only while the old application is write-frozen and the new
application is stopped:

```bash
npm run storage:import -- --from=<archive-directory> --app-stopped
```

All backup and import paths are protected by checksums and schema validation.

## Verification

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Useful health endpoint:

```bash
curl http://localhost:3000/api/persistence/health
```

## Optional services

- Sheet Sage: [sheetsage/README.md](sheetsage/README.md)
- Main Python backend: [python_backend/README.md](python_backend/README.md)

API keys for YouTube, Gemini, Genius, and Music.ai remain optional and are
documented in [.env.example](.env.example).
