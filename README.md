# Torro

Self-hosted torrent downloader with a web UI. Add magnet links or `.torrent` files, select which files to download, stream or download completed files from the browser.

**Stack:** qBittorrent · Node/Express · React · Traefik · Docker

---

## Local (testing)

**Prerequisites:** Docker with Compose v2

```bash
# 1. Clone and enter the repo
git clone <repo-url> && cd torro

# 2. Copy env file and fill in the required values
cp .env.example .env

# 3. Generate a JWT secret
openssl rand -hex 32
# Paste as JWT_SECRET in .env

# 4. Generate a bcrypt hash for your password
docker run --rm node:20-alpine node -e \
  "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword',12));"
# Paste as APP_PASSWORD_HASH in .env (no quotes)

# 5. Generate a self-signed SSL cert
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem \
  -subj "/CN=localhost"

# 6. Start (builds images locally)
docker compose up -d --build

# 7. Get the qBittorrent temporary password
docker compose logs qbittorrent | grep -i "temporary password"
```

Open **https://localhost:8443** (accept the self-signed cert warning).

> **First run:** log into qBittorrent at **http://localhost:9090** with the temporary password, set a permanent one, update `QBIT_PASSWORD` in `.env`, then run `docker compose restart backend`.

---

## Production (EC2 / any Linux server)

### One-line install (no git clone needed)

```bash
curl -fsSL https://raw.githubusercontent.com/optimumsage/torro/main/install.sh | bash
```

Or download and inspect first:

```bash
curl -fsSL https://raw.githubusercontent.com/optimumsage/torro/main/install.sh -o install.sh
less install.sh
bash install.sh
```

Installs to `~/torro` by default. Override with `TORRO_DIR=/opt/torro bash install.sh`.

### Install from cloned repo

**Prerequisites:** Ubuntu VM, a domain pointing at the server, ports 80 and 443 open.

Production uses prebuilt images from DockerHub via `docker-compose.prod.yml`. A single script handles everything.

```bash
# 1. Clone the repo
git clone <repo-url> && cd torro

# 2. Run the deploy script
bash deploy.sh
```

The script prompts for:
- App username and password (plain text — bcrypt-hashed automatically)
- Domain, Let's Encrypt email
- DockerHub username/org and image version to pull

Everything else (JWT secret, qBittorrent password, TLS certs) is generated automatically.

**Re-running `deploy.sh` is safe** — existing `.env`, certs, and qBittorrent config are preserved.

> **qBittorrent WebUI** is not publicly exposed. Access via SSH tunnel:
> `ssh -L 9090:localhost:8080 user@yourserver` → http://localhost:9090

### Upgrading

```bash
# Edit TORRO_VERSION in .env, then:
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## Publishing images to DockerHub

Images are published automatically by GitHub Actions when you push a version tag.

### One-time setup

1. Create a DockerHub access token at https://hub.docker.com/settings/security
2. Add two secrets to your GitHub repo (`Settings → Secrets → Actions`):
   - `DOCKERHUB_USERNAME` — your DockerHub username or org
   - `DOCKERHUB_TOKEN` — the access token

### Release

```bash
# Bump the version
echo "0.2.0" > VERSION

# Commit, tag, push
git add VERSION && git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

GitHub Actions builds `linux/amd64` + `linux/arm64` images and pushes:
- `yourname/torro-frontend:0.2.0`
- `yourname/torro-frontend:latest`
- `yourname/torro-backend:0.2.0`
- `yourname/torro-backend:latest`

---

## Useful commands

```bash
# Local
docker compose up -d --build
docker compose logs -f backend
docker compose restart backend     # apply .env changes
docker compose down                # stop (volumes preserved)
docker compose down -v             # stop + wipe all data

# Production
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml down
```

---

## .env reference

| Variable | Description |
|---|---|
| `JWT_SECRET` | Random secret. Use `openssl rand -hex 32`. |
| `APP_USERNAME` | Login username for the web UI |
| `APP_PASSWORD_HASH` | bcrypt hash of your password (no quotes) |
| `QBIT_USERNAME` | qBittorrent WebUI username |
| `QBIT_PASSWORD` | qBittorrent WebUI password |
| `ALLOWED_ORIGIN` | Your domain (`https://yourdomain.com`) or empty for local |
| `DOMAIN` | Bare domain for Traefik routing, e.g. `yourdomain.com` (prod only) |
| `ACME_EMAIL` | Email for Let's Encrypt notifications (prod only) |
| `DOCKER_REPO` | DockerHub username/org where images are published (prod only) |
| `TORRO_VERSION` | Image tag to run — `latest` or a specific version e.g. `0.1.0` |
