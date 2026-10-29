# Docker setup

Create the environment file from the repository root:

```bash
cp .env.docker.example .env.docker
```

The important persistence values are already configured for container paths:

```dotenv
SQLITE_DATABASE_PATH=/app/storage/db/chordmini.sqlite
LOCAL_AUDIO_STORAGE_DIR=/app/storage/audio
LOCAL_AUDIO_QUOTA_GB=20
```

For published images:

```bash
docker compose -f docker/docker-compose.yml --env-file .env.docker up
```

For running the full local-build stack (Frontend + SQLite, Python Backend, SheetSage, Redis, Nginx):

```bash
# Standard command from root repository:
docker compose --env-file .env.docker up --build

# Or using the docker/ subfolder config:
docker compose -f docker/docker-compose.dev.yml --env-file .env.docker up --build
```

Open <http://localhost:3000> in your browser. Nginx acts as the host reverse proxy on port 3000 and routes requests to the Next.js frontend, while Next.js coordinates with `backend` (port 8080), and `sheetsage` (port 8082) over the internal bridge network.

The named volumes `chordmini-frontend-db` and
`chordmini-frontend-audio` retain the SQLite database and audio across
container restarts. Do not use `down --volumes` unless you intentionally want
to delete that persisted data.

Check persistence health:

```bash
curl http://localhost:3000/api/persistence/health
```

Create a backup from the running frontend container:

```bash
docker exec chordmini-frontend npm run storage:backup
```

Restore requires the application process to be stopped and should be performed
against the mounted volumes using the documented `storage:restore` script.
