# Torro

Self-hosted torrent downloader with a modern web UI. Add magnet links or `.torrent` files, select which files to download, then stream or download completed files straight from the browser.

**Stack:** qBittorrent · Node/Express (TypeScript) · React + Vite · Traefik · Docker
**Auth:** Passkeys (WebAuthn) with a recovery-password fallback · server-side sessions

---

## Features

- **Passkey login** (WebAuthn) — sign in with Bitwarden, a security key, Face ID, etc. A recovery password is the fallback and is used to enrol your first passkey.
- **Manage devices** — list and revoke active sessions; register multiple passkeys.
- **Live progress** over a WebSocket with automatic reconnect and a polling fallback.
- **Selective downloading** — pick exactly which files in a torrent to fetch.
- **Stream or download** completed files (with HTTP range support) directly in the browser.
- Dark/light theme, drag-and-drop `.torrent` upload, paste-to-add magnets.

---

## Requirements

- Ubuntu server (EC2 or any VPS)
- A domain pointing at the server (passkeys require a stable hostname over HTTPS)
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

The script installs Docker if needed, prompts for your domain, email (for TLS), and a recovery password, then starts everything automatically. Installs to `~/torro` by default — override with `TORRO_DIR=/opt/torro bash install.sh`.

### First sign-in

1. Open `https://yourdomain.com` and choose **Use recovery password**.
2. Enter your username and the recovery password you set during install.
3. Create your first passkey (e.g. save it to Bitwarden).
4. From then on, sign in with your passkey. Add more passkeys or revoke sessions under **Settings**.

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
