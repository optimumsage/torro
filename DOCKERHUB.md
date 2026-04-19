# Torro

Self-hosted torrent downloader with a web UI. Add magnet links or `.torrent` files, pick which files to download, then stream or download them straight from the browser.

## What's included

One image runs both the API and the frontend. Pair it with qBittorrent for torrent management and Traefik for automatic HTTPS.

## Quick start

```yaml
services:
  traefik:
    image: traefik:v3
    ports: ["80:80", "443:443"]
    command:
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --entrypoints.websecure.address=:443
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --certificatesresolvers.le.acme.email=you@example.com
      - --certificatesresolvers.le.acme.storage=/acme.json
      - --certificatesresolvers.le.acme.tlschallenge=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./acme.json:/acme.json   # touch acme.json && chmod 600 acme.json

  torro:
    image: yourname/torro:latest
    expose: ["3000"]
    environment:
      - QBIT_URL=http://qbittorrent:8080
      - DOWNLOADS_PATH=/downloads
    volumes:
      - downloads:/downloads
      - ./.env:/run/config/.env:ro
    depends_on:
      qbittorrent:
        condition: service_healthy
    labels:
      - traefik.enable=true
      - traefik.http.routers.torro.rule=Host(`torro.example.com`)
      - traefik.http.routers.torro.entrypoints=websecure
      - traefik.http.routers.torro.tls.certresolver=le
      - traefik.http.services.torro.loadbalancer.server.port=3000

  qbittorrent:
    image: linuxserver/qbittorrent:latest
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
      - WEBUI_PORT=8080
    volumes:
      - downloads:/downloads
      - qbit_config:/config
    expose: ["8080"]
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 30s

volumes:
  downloads:
  qbit_config:
```

## Configuration

All secrets are passed via a `.env` file mounted at `/run/config/.env` inside the container. Docker Compose does not interpolate this file — the app reads it directly via dotenv.

**`.env` file:**

```env
JWT_SECRET=<64+ random hex chars — openssl rand -hex 32>
APP_USERNAME=admin
APP_PASSWORD_HASH=<bcrypt hash — see below>
QBIT_USERNAME=admin
QBIT_PASSWORD=<qbittorrent webui password>
ALLOWED_ORIGIN=https://torro.example.com
```

**Generate a bcrypt hash for your password:**

```bash
docker run --rm node:20-alpine node \
  -e "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword',12));"
```

Paste the output as `APP_PASSWORD_HASH` with no surrounding quotes.

## Volumes

| Volume | Description |
|---|---|
| `downloads` | Shared with qBittorrent — completed files live here |
| `/run/config/.env` | Bind-mount your `.env` file here (read-only) |

## Environment variables (container-level)

These go directly in the `environment:` block of your compose file, not in `.env`:

| Variable | Default | Description |
|---|---|---|
| `QBIT_URL` | — | Internal URL of qBittorrent WebUI, e.g. `http://qbittorrent:8080` |
| `DOWNLOADS_PATH` | `/downloads` | Path inside the container where downloads are stored |
| `NODE_ENV` | — | Set to `production` |

## Tags

| Tag | Description |
|---|---|
| `latest` | Most recent stable release |
| `0.1.0`, `0.2.0`, … | Pinned releases — recommended for production |

## First-run qBittorrent setup

On the very first start, qBittorrent generates a temporary password logged to stdout:

```bash
docker compose logs qbittorrent | grep -i "temporary password"
```

Use it to log in, set a permanent password, update `QBIT_PASSWORD` in your `.env`, then restart the `torro` container:

```bash
docker compose restart torro
```

## Source

[github.com/optimumsage/torro](https://github.com/optimumsage/torro)
