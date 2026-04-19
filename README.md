# Torro

Self-hosted torrent downloader with a web UI. Add magnet links or `.torrent` files, select which files to download, stream or download completed files from the browser.

**Stack:** qBittorrent · Node/Express · React · Nginx · Docker

---

## Local (testing)

**Prerequisites:** Docker with Compose v2

```bash
# 1. Clone and enter the repo
git clone <repo-url> && cd torro

# 2. Copy env file
cp .env.example .env

# 3. Generate a JWT secret
openssl rand -base64 64
# Paste the output as JWT_SECRET in .env

# 4. Generate a bcrypt hash for your password
docker run --rm node:20-alpine node -e \
  "const b=require('bcryptjs'); console.log(b.hashSync('yourpassword',12));"
# Paste the output as APP_PASSWORD_HASH in .env (no quotes)

# 5. Set APP_USERNAME and APP_PASSWORD_HASH in .env, leave ALLOWED_ORIGIN empty

# 6. Generate a self-signed SSL cert
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem \
  -subj "/CN=localhost"

# 7. Start
docker compose up -d --build

# 8. Get the qBittorrent temporary password
docker compose logs qbittorrent | grep -i "temporary password"
```

Open **https://localhost:8443** (accept the self-signed cert warning).

> **First run:** log into qBittorrent at **http://localhost:9090** with the temporary password, set a permanent one, update `QBIT_PASSWORD` in `.env`, then restart: `docker compose restart backend`.

---

## Production (EC2 / any Linux server)

**Prerequisites:** Ubuntu VM, a domain with DNS pointed at the server, ports 80 and 443 open.

A single script handles everything — installs Docker, prompts for credentials, generates all secrets, configures qBittorrent, and starts all services.

```bash
# 1. Clone the repo
git clone <repo-url> && cd torro

# 2. Run the deploy script
bash deploy.sh
```

The script will ask for:
- App username and password (plain text — bcrypt-hashed automatically)
- Your domain (e.g. `torro.example.com`)
- A Let's Encrypt email

Everything else (JWT secret, qBittorrent internal password, TLS certs) is generated automatically.

Access at **https://yourdomain.com**. Traefik obtains and auto-renews the TLS cert.

**Re-running `deploy.sh` is safe** — it skips steps already done (existing `.env`, existing certs, already-configured qBittorrent).

> **qBittorrent WebUI** is not publicly exposed in production. Access it via SSH tunnel if needed:
> `ssh -L 9090:localhost:8080 user@yourserver` → http://localhost:9090

---

## Useful commands

```bash
# Local
docker compose ps
docker compose logs -f backend
docker compose restart backend     # apply .env changes
docker compose down                # stop (data preserved in volumes)
docker compose down -v             # stop + wipe all data

# Production
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml restart backend
```

---

## .env reference

| Variable | Description |
|---|---|
| `JWT_SECRET` | Random string ≥ 64 chars. Use `openssl rand -base64 64`. |
| `APP_USERNAME` | Login username for the web UI |
| `APP_PASSWORD_HASH` | bcrypt hash of your password (no quotes) |
| `QBIT_USERNAME` | qBittorrent WebUI username |
| `QBIT_PASSWORD` | qBittorrent WebUI password |
| `ALLOWED_ORIGIN` | Your domain (`https://yourdomain.com`) or empty for local |
| `DOMAIN` | Bare domain for Traefik routing, e.g. `yourdomain.com` (prod only) |
| `ACME_EMAIL` | Email for Let's Encrypt notifications (prod only) |
