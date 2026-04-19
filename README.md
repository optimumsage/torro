# Torro

Self-hosted torrent downloader with a web UI. Add magnet links or `.torrent` files, select which files to download, then stream or download completed files straight from the browser.

**Stack:** qBittorrent · Node/Express · React · Traefik · Docker

---

## Requirements

- Ubuntu server (EC2 or any VPS)
- A domain pointing at the server
- Ports 80 and 443 open

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/optimumsage/torro/main/install.sh | bash
```

Or download and inspect first:

```bash
curl -fsSL https://raw.githubusercontent.com/optimumsage/torro/main/install.sh -o install.sh
less install.sh
bash install.sh
```

The script installs Docker if needed, prompts for your domain, email (for TLS), and app credentials, then starts everything automatically. Installs to `~/torro` by default — override with `TORRO_DIR=/opt/torro bash install.sh`.

---

## Upgrade

```bash
cd ~/torro
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## Useful commands

```bash
# View logs
docker compose -f ~/torro/docker-compose.prod.yml logs -f

# Check status
docker compose -f ~/torro/docker-compose.prod.yml ps

# Stop
docker compose -f ~/torro/docker-compose.prod.yml down
```

> **qBittorrent WebUI** is not publicly exposed. Access via SSH tunnel if needed:
> `ssh -L 9090:localhost:8080 user@yourserver` → http://localhost:9090
