#!/usr/bin/env bash
# install.sh — one-line installer for Torro (no git clone required)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/optimumsage/torro/main/install.sh | bash
#
# Or download and inspect first (recommended):
#   curl -fsSL https://raw.githubusercontent.com/optimumsage/torro/main/install.sh -o install.sh
#   less install.sh
#   bash install.sh
set -euo pipefail

INSTALL_DIR="${TORRO_DIR:-$HOME/torro}"
COMPOSE_FILE="docker-compose.prod.yml"
MANUAL_TLS_FILE="docker-compose.manual-tls.yml"
GITHUB_RAW="https://raw.githubusercontent.com/optimumsage/torro/main"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "  ${BLUE}▸${NC} $*"; }
success() { echo -e "  ${GREEN}✓${NC} $*"; }
warn()    { echo -e "  ${YELLOW}!${NC} $*"; }
die()     { echo -e "\n  ${RED}✗ ERROR:${NC} $*\n" >&2; exit 1; }
section() { echo; echo -e "${BOLD}── $*${NC}"; }

# ── Sanity checks ─────────────────────────────────────────────────────────────
[[ "$(id -u)" -eq 0 ]] && die "Do not run as root. Run as a regular user with sudo access."
command -v curl &>/dev/null || die "curl is required but not installed."

# All interactive reads go through /dev/tty so the script works when piped via curl
TTY=/dev/tty

# ── Docker access ─────────────────────────────────────────────────────────────
SUDO=""
detect_docker_access() {
  if docker info &>/dev/null 2>&1; then
    SUDO=""
  elif sudo docker info &>/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "Cannot connect to Docker daemon. You may need to log out and back in, then re-run this script."
  fi
}

# Wrapper so all compose calls automatically include the right -f flags
COMPOSE_EXTRA="-f $COMPOSE_FILE"
dc() { $SUDO docker compose $COMPOSE_EXTRA "$@"; }

# ── Dependencies ──────────────────────────────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null; then
    success "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1) already installed"
    return
  fi
  info "Installing Docker..."
  sudo apt-get update -qq
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  success "Docker installed — you've been added to the 'docker' group"
  warn "Group membership takes effect on next login. Using 'sudo docker' for this session."
}

install_docker_compose() {
  if docker compose version &>/dev/null 2>&1 || sudo docker compose version &>/dev/null 2>&1; then
    success "Docker Compose already installed"
    return
  fi
  info "Installing Docker Compose plugin..."
  if ! apt-cache show docker-compose-plugin &>/dev/null 2>&1; then
    info "Adding Docker apt repository..."
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
  fi
  sudo apt-get install -y docker-compose-plugin
  success "Docker Compose plugin installed"
}

install_python_bcrypt() {
  if python3 -c "import bcrypt" &>/dev/null 2>&1; then
    success "python3-bcrypt already installed"
    return
  fi
  info "Installing python3-bcrypt..."
  sudo apt-get update -qq
  sudo apt-get install -y python3-bcrypt
  success "python3-bcrypt installed"
}

# ── Install directory ─────────────────────────────────────────────────────────
setup_directory() {
  if [[ -d "$INSTALL_DIR" ]]; then
    success "Using existing directory $INSTALL_DIR"
  else
    mkdir -p "$INSTALL_DIR"
    success "Created $INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
}

# ── Download docker-compose.prod.yml ─────────────────────────────────────────
# Always refresh from GitHub so upgrades pick up compose changes (new env vars,
# healthchecks, volumes). This file is managed — local overrides belong in the
# generated $MANUAL_TLS_FILE, never in here. Falls back to the existing copy if
# the network is unavailable, and only fails hard when there's no copy at all.
write_compose_file() {
  info "Fetching latest $COMPOSE_FILE..."
  local tmp
  tmp=$(mktemp)
  if curl -fsSL "$GITHUB_RAW/$COMPOSE_FILE" -o "$tmp"; then
    mv "$tmp" "$COMPOSE_FILE"
    success "$COMPOSE_FILE up to date"
  else
    rm -f "$tmp"
    if [[ -f "$COMPOSE_FILE" ]]; then
      warn "Could not fetch latest $COMPOSE_FILE — keeping existing copy"
    else
      die "Failed to download $COMPOSE_FILE from $GITHUB_RAW"
    fi
  fi
}

# ── User inputs ───────────────────────────────────────────────────────────────
SKIP_ENV=false
USE_MANUAL_CERT=false
APP_USERNAME="" APP_PASSWORD="" DOMAIN="" ACME_EMAIL=""
CERT_SRC="" KEY_SRC=""

gather_inputs() {
  section "Configuration"

  if [[ -f .env ]]; then
    warn ".env already exists."
    read -rp "  Reconfigure and overwrite it? [y/N]: " ans <"$TTY"
    if [[ ! "$ans" =~ ^[Yy]$ ]]; then
      info "Keeping existing .env."
      SKIP_ENV=true
      return
    fi
    echo
  fi

  read -rp "  App username [admin]: " APP_USERNAME <"$TTY"
  APP_USERNAME="${APP_USERNAME:-admin}"

  info "Login uses passkeys (WebAuthn). This recovery password is the fallback if"
  info "you lose your passkey, and is used to enroll your first passkey on first run."
  while true; do
    read -rsp "  Recovery password: " APP_PASSWORD <"$TTY"; echo
    if [[ -z "$APP_PASSWORD" ]]; then
      warn "Password cannot be empty."
      continue
    fi
    read -rsp "  Confirm recovery password: " _confirm <"$TTY"; echo
    if [[ "$APP_PASSWORD" == "$_confirm" ]]; then
      break
    fi
    warn "Passwords do not match — try again."
  done

  read -rp "  Domain (e.g. torro.example.com): " DOMAIN <"$TTY"
  if [[ -z "$DOMAIN" ]]; then die "Domain cannot be empty."; fi

  echo
  read -rp "  Use a custom SSL certificate instead of Let's Encrypt? [y/N]: " use_cert <"$TTY"
  if [[ "$use_cert" =~ ^[Yy]$ ]]; then
    USE_MANUAL_CERT=true
    while true; do
      read -rp "  Path to certificate file (cert.crt): " CERT_SRC <"$TTY"
      if [[ -f "$CERT_SRC" ]]; then break; fi
      warn "File not found: $CERT_SRC"
    done
    while true; do
      read -rp "  Path to private key file (cert.key): " KEY_SRC <"$TTY"
      if [[ -f "$KEY_SRC" ]]; then break; fi
      warn "File not found: $KEY_SRC"
    done
  else
    read -rp "  Let's Encrypt email: " ACME_EMAIL <"$TTY"
    if [[ -z "$ACME_EMAIL" ]]; then die "Email cannot be empty."; fi
  fi
}

# ── Write .env ────────────────────────────────────────────────────────────────
QBIT_PASSWORD=""
JACKETT_API_KEY=""

write_env() {
  if [[ "$SKIP_ENV" == true ]]; then
    QBIT_PASSWORD=$(grep '^QBIT_PASSWORD=' .env | cut -d= -f2-)
    JACKETT_API_KEY=$(grep '^JACKETT_API_KEY=' .env | cut -d= -f2- || true)
    return
  fi

  info "Generating secrets..."

  local qbit_password recovery_hash
  qbit_password=$(openssl rand -hex 12)
  JACKETT_API_KEY=$(openssl rand -hex 16)

  # Bcrypt hash of the recovery password (verified by bcryptjs in the app).
  recovery_hash=$(printf '%s' "$APP_PASSWORD" | python3 -c "
import bcrypt, sys
pw = sys.stdin.buffer.read()
print(bcrypt.hashpw(pw, bcrypt.gensalt(12)).decode())
")

  cat > .env << EOF
APP_USERNAME=${APP_USERNAME}
RECOVERY_PASSWORD_HASH=${recovery_hash}

QBIT_USERNAME=admin
QBIT_PASSWORD=${qbit_password}

JACKETT_API_KEY=${JACKETT_API_KEY}

ALLOWED_ORIGIN=https://${DOMAIN}
DOMAIN=${DOMAIN}
RP_ID=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

DOCKER_REPO=optimumsage
TORRO_VERSION=latest
EOF

  chmod 600 .env
  QBIT_PASSWORD="$qbit_password"
  success ".env created (chmod 600)"
}

# ── Traefik ───────────────────────────────────────────────────────────────────
setup_traefik() {
  mkdir -p traefik
  # Only create acme.json if it doesn't exist — never wipe it.
  # Traefik reuses existing certs and LE accounts across reinstalls.
  # Wiping it on every install burns through LE's 5-certs-per-week rate limit.
  if [[ ! -f traefik/acme.json ]]; then
    touch traefik/acme.json
  fi
  chmod 600 traefik/acme.json

  if [[ "$USE_MANUAL_CERT" == true ]]; then
    cp "$CERT_SRC" traefik/cert.crt
    cp "$KEY_SRC"  traefik/cert.key
    chmod 600 traefik/cert.key

    mkdir -p traefik/dynamic
    cat > traefik/dynamic/tls.yml << 'EOF'
tls:
  stores:
    default:
      defaultCertificate:
        certFile: /certs/cert.crt
        keyFile: /certs/cert.key
EOF

    # Override compose file: replaces Traefik command (removes ACME, adds file
    # provider) and mounts the cert files + dynamic config directory.
    # The torro router label sets tls=true with no certresolver so Traefik
    # serves the default cert from the file provider instead of requesting ACME.
    cat > "$MANUAL_TLS_FILE" << 'EOF'
services:
  traefik:
    command:
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --entrypoints.websecure.address=:443
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.file.directory=/etc/traefik/dynamic
      - --ping=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/acme.json:/acme.json
      - ./traefik/cert.crt:/certs/cert.crt:ro
      - ./traefik/cert.key:/certs/cert.key:ro
      - ./traefik/dynamic:/etc/traefik/dynamic:ro

  torro:
    labels:
      - traefik.enable=true
      - "traefik.http.routers.torro.rule=Host(`${DOMAIN}`)"
      - traefik.http.routers.torro.entrypoints=websecure
      - traefik.http.routers.torro.tls=true
      - traefik.http.services.torro.loadbalancer.server.port=3000
EOF

    success "Manual SSL certificates configured"
  fi

  set_compose_extra
}

# Include the manual-tls override if it exists (handles fresh installs with
# manual certs, idempotent reinstalls, and upgrades).
set_compose_extra() {
  if [[ -f "$MANUAL_TLS_FILE" ]]; then
    COMPOSE_EXTRA="-f $COMPOSE_FILE -f $MANUAL_TLS_FILE"
  else
    COMPOSE_EXTRA="-f $COMPOSE_FILE"
  fi
}

# ── Reclaim leaked disk space ─────────────────────────────────────────────────
# A file deleted while a process still has it open keeps its disk space until
# that handle closes. Recreating the torro container (done by `up -d` after a
# pull) releases handles torro held; if qBittorrent is still holding deleted
# files, restart it too so the space is actually freed.
reclaim_disk_space() {
  command -v lsof &>/dev/null || return 0
  local pids
  pids=$(sudo lsof -nP +L1 2>/dev/null | awk '/\/downloads/ {print $2}' | sort -u || true)
  if [[ -z "$pids" ]]; then
    success "No disk space held by deleted files"
    return 0
  fi
  warn "Deleted files are still held open — restarting qBittorrent to reclaim space..."
  dc restart qbittorrent
  wait_qbit_healthy
  success "Disk space from deleted files reclaimed"
}

# ── qBittorrent first-run ─────────────────────────────────────────────────────
wait_qbit_healthy() {
  local elapsed=0
  while true; do
    if dc ps qbittorrent 2>/dev/null | grep -q "(healthy)"; then
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    if [[ $elapsed -gt 150 ]]; then
      die "qBittorrent did not become healthy after 150s. Check: dc logs qbittorrent"
    fi
  done
}

get_qbit_temp_pass() {
  # grep returns non-zero when no match — use || true so set -e doesn't fire
  dc logs qbittorrent 2>&1 \
    | grep -i "temporary password" | tail -1 \
    | sed 's/.*: //' | tr -d '[:space:]\r\n' || true
}

set_qbit_password() {
  local temp_pass="$1"
  local login_result verify

  login_result=$(dc exec -T qbittorrent \
    curl -s -c /tmp/qc -b /tmp/qc \
      --data "username=admin&password=${temp_pass}" \
      http://localhost:8080/api/v2/auth/login 2>/dev/null || echo "fail")

  if [[ "$login_result" != "Ok." ]]; then
    die "Could not log into qBittorrent with temporary password (got: $login_result)."
  fi

  dc exec -T qbittorrent \
    curl -s -c /tmp/qc -b /tmp/qc \
      --data "json={\"web_ui_password\":\"${QBIT_PASSWORD}\",\"web_ui_max_auth_fail_count\":0}" \
      http://localhost:8080/api/v2/app/setPreferences > /dev/null 2>&1 || true
  dc exec -T qbittorrent rm -f /tmp/qc 2>/dev/null || true

  verify=$(dc exec -T qbittorrent \
    curl -s --data "username=admin&password=${QBIT_PASSWORD}" \
    http://localhost:8080/api/v2/auth/login 2>/dev/null || echo "fail")

  if [[ "$verify" != "Ok." ]]; then
    die "qBittorrent password verification failed after setting it."
  fi
}

reset_qbit_password_config() {
  dc stop qbittorrent

  # Derive the compose project name to find the correct Docker volume
  local project_name
  project_name=$(dc config --format json 2>/dev/null \
    | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  if [[ -z "$project_name" ]]; then
    project_name="torro"
  fi

  $SUDO docker run --rm \
    -v "${project_name}_qbit_config:/config" \
    alpine sh -c "sed -i '/WebUI.Password_PBKDF2/d' /config/qBittorrent/qBittorrent.conf 2>/dev/null || true"

  dc start qbittorrent
}

configure_qbittorrent() {
  info "Waiting for qBittorrent to become healthy..."
  wait_qbit_healthy

  # Happy path: password already matches (idempotent re-run)
  local result
  result=$(dc exec -T qbittorrent \
    curl -s --max-time 5 \
    --data "username=admin&password=${QBIT_PASSWORD}" \
    http://localhost:8080/api/v2/auth/login 2>/dev/null || echo "fail")

  if [[ "$result" == "Ok." ]]; then
    success "qBittorrent already configured"
    return
  fi

  # Try the temporary password from logs (fresh first-run)
  local temp_pass
  temp_pass=$(get_qbit_temp_pass)

  if [[ -n "$temp_pass" ]]; then
    info "Setting permanent qBittorrent password..."
    set_qbit_password "$temp_pass"
    success "qBittorrent configured"
    return
  fi

  # Reinstall case: qBit has an existing config with an unknown old password.
  # Clear the stored password so it generates a fresh temporary one.
  info "Resetting qBittorrent password (existing config detected)..."
  reset_qbit_password_config

  info "Waiting for qBittorrent to become healthy again..."
  wait_qbit_healthy

  temp_pass=$(get_qbit_temp_pass)
  if [[ -z "$temp_pass" ]]; then
    die "Could not get a temporary password from qBittorrent after config reset. Check: dc logs qbittorrent"
  fi

  info "Setting permanent qBittorrent password..."
  set_qbit_password "$temp_pass"
  success "qBittorrent configured"
}

# ── Jackett (torrent search) ──────────────────────────────────────────────────
# Derive the compose project name so we can address its named volumes directly.
compose_project_name() {
  local name
  name=$(dc config --format json 2>/dev/null \
    | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  echo "${name:-torro}"
}

# Pre-seed Jackett's API key into its config volume BEFORE first boot. Jackett
# reads /config/Jackett/api_key.txt when no key is set, making the key
# deterministic (no log-scraping, no race). Idempotent — skips if already set.
seed_jackett_key() {
  [[ -z "$JACKETT_API_KEY" ]] && return 0
  local project vol
  project=$(compose_project_name)
  vol="${project}_jackett_config"
  $SUDO docker volume inspect "$vol" >/dev/null 2>&1 || $SUDO docker volume create "$vol" >/dev/null
  $SUDO docker run --rm -v "${vol}:/config" alpine sh -c "
    mkdir -p /config/Jackett
    if ! grep -q '\"APIKey\"' /config/Jackett/ServerConfig.json 2>/dev/null; then
      printf '%s' '${JACKETT_API_KEY}' > /config/Jackett/api_key.txt
    fi
  " >/dev/null 2>&1 || warn "Could not pre-seed Jackett API key (will fall back to generated key)"
}

wait_jackett_healthy() {
  local elapsed=0
  while true; do
    # GET (not --spider) — Jackett redirects HEAD requests to a cookie test.
    if dc exec -T jackett curl -fsS -o /dev/null http://localhost:9117/UI/Login 2>/dev/null; then
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    if [[ $elapsed -gt 90 ]]; then
      warn "Jackett didn't come up within 90s — search may be unavailable until it does."
      return 1
    fi
  done
}

# Enable a default set of public indexers (incl. the required YTS). Jackett's
# indexer-config API is gated by a UI session rather than the api key, so we
# drive the cookie flow (no admin password → an empty POST enables a public
# indexer). All best-effort; never fatal.
# Point Jackett at FlareSolverr so Cloudflare-protected indexers (e.g. 1337x)
# can be reached. Patches the config file directly (the api differs across
# versions) and only when unset — idempotent.
set_flaresolverr_url() {
  local project vol
  project=$(compose_project_name)
  vol="${project}_jackett_config"
  $SUDO docker volume inspect "$vol" >/dev/null 2>&1 || return 0
  $SUDO docker run --rm -v "${vol}:/config" alpine \
    grep -q '"FlareSolverrUrl": null' /config/Jackett/ServerConfig.json 2>/dev/null || return 0
  info "Linking Jackett to FlareSolverr (Cloudflare bypass)..."
  dc stop jackett >/dev/null 2>&1 || true
  $SUDO docker run --rm -v "${vol}:/config" alpine \
    sed -i 's#"FlareSolverrUrl": null#"FlareSolverrUrl": "http://flaresolverr:8191"#' \
    /config/Jackett/ServerConfig.json 2>/dev/null || true
  dc start jackett >/dev/null 2>&1 || true
  wait_jackett_healthy || true
}

configure_jackett() {
  info "Waiting for Jackett (torrent search) to start..."
  wait_jackett_healthy || return 0

  set_flaresolverr_url

  info "Enabling default indexers (YTS, The Pirate Bay, 1337x)..."
  local enabled
  enabled=$(dc exec -T jackett sh -c '
    J=/tmp/jck.jar; rm -f "$J"
    curl -sL -c "$J" -b "$J" http://localhost:9117/UI/Dashboard -o /dev/null || exit 0
    for idx in yts thepiratebay 1337x; do
      curl -s -b "$J" -c "$J" -X POST -H "Content-Type: application/json" --data "[]" \
        http://localhost:9117/api/v2.0/indexers/$idx/config -o /dev/null 2>/dev/null || true
    done
    curl -s -b "$J" -c "$J" http://localhost:9117/api/v2.0/indexers 2>/dev/null \
      | grep -o "\"configured\":true" | wc -l
  ' 2>/dev/null | tr -cd '0-9' || echo 0)

  if [[ "${enabled:-0}" -gt 0 ]]; then
    success "Torrent search ready (${enabled} indexer(s) enabled, including YTS)"
    return 0
  fi

  warn "Could not auto-enable Jackett indexers — add at least one (e.g. YTS) manually:"
  echo -e "    1) ${BOLD}ssh -L 9117:localhost:9117 <user>@<server>${NC} (temporarily bind 127.0.0.1:9117:9117)"
  echo -e "    2) open ${BOLD}http://localhost:9117${NC} → ${BOLD}+ Add Indexer${NC} → search ${BOLD}yts${NC} → Add"
}

# Ensure JACKETT_API_KEY exists in an already-installed .env (for upgrades from
# versions that predate search). Generates + persists + seeds it if missing.
ensure_jackett_key() {
  JACKETT_API_KEY=$(grep '^JACKETT_API_KEY=' .env | cut -d= -f2- || true)
  if [[ -n "$JACKETT_API_KEY" ]]; then
    return 0
  fi
  info "Adding a Jackett API key for torrent search..."
  JACKETT_API_KEY=$(openssl rand -hex 16)
  printf 'JACKETT_API_KEY=%s\n' "$JACKETT_API_KEY" >> .env
  seed_jackett_key
}

# ── Upgrade ───────────────────────────────────────────────────────────────────
# `install.sh upgrade` — pull the latest image, refresh the compose file, restart
# services, and reclaim disk space from previously-deleted files. No prompts; the
# existing .env and certs are left untouched.
do_upgrade() {
  echo
  echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║          Torro  Upgrade              ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"

  detect_docker_access

  [[ -d "$INSTALL_DIR" ]] || die "No install found at $INSTALL_DIR. Run install.sh first."
  cd "$INSTALL_DIR"
  [[ -f .env ]] || die "No .env in $INSTALL_DIR — this doesn't look like a Torro install."

  section "Updating compose file"
  write_compose_file
  set_compose_extra
  ensure_jackett_key   # backfill the search API key for installs predating it

  section "Pulling images"
  dc pull
  success "Images pulled"

  section "Restarting services"
  dc up -d --remove-orphans
  success "Services restarted on the latest image"

  configure_jackett

  section "Reclaiming disk space"
  reclaim_disk_space

  local domain
  domain=$(grep '^DOMAIN=' .env | cut -d= -f2-)
  section "Done"
  echo
  echo -e "  ${GREEN}${BOLD}▸ https://${domain}${NC}"
  echo
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo
  echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║          Torro  Install              ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
  echo -e "  Installing to: ${BOLD}${INSTALL_DIR}${NC}"

  section "Installing dependencies"
  install_docker
  install_docker_compose
  install_python_bcrypt

  detect_docker_access

  setup_directory    # sets cwd to $INSTALL_DIR
  write_compose_file

  gather_inputs
  write_env
  setup_traefik      # sets COMPOSE_EXTRA; dc() is ready after this
  seed_jackett_key   # pre-seed the search API key before Jackett's first boot

  section "Pulling images"
  dc pull
  success "Images pulled"

  section "Starting services"
  dc up -d
  success "All containers started"

  # If .env was rewritten, the torro container may still be running with old
  # env values cached by dotenv. Force a restart so it picks up the new secrets.
  if [[ "$SKIP_ENV" == false ]]; then
    dc restart torro
  fi

  configure_qbittorrent
  configure_jackett

  local domain username
  domain=$(grep '^DOMAIN=' .env | cut -d= -f2-)
  username=$(grep '^APP_USERNAME=' .env | cut -d= -f2-)

  section "Done"
  echo
  echo -e "  ${GREEN}${BOLD}▸ https://${domain}${NC}"
  echo
  echo -e "  ${BOLD}First step:${NC} open the site and enroll your first passkey."
  echo -e "  Choose ${BOLD}Use recovery password${NC}, enter username ${BOLD}${username}${NC} and"
  echo -e "  the recovery password you set, then create a passkey (e.g. with Bitwarden)."
  echo -e "  After that, sign in with your passkey. You can add more passkeys in Settings."
  echo
  echo -e "  Installation directory: ${BOLD}${INSTALL_DIR}${NC}"
  echo
  echo -e "  ${BOLD}Torrent search:${NC} the ${BOLD}Search${NC} tab uses Jackett. Add at least one"
  echo -e "  indexer (e.g. ${BOLD}YTS${NC}) in the Jackett UI for results to appear (see above)."
  echo
  local compose_cmd="$SUDO docker compose $COMPOSE_EXTRA"
  echo -e "  To upgrade:"
  echo -e "    cd ${INSTALL_DIR} && ./install.sh upgrade"
  echo
  echo -e "  Other commands:"
  echo -e "    ${compose_cmd} logs -f"
  echo -e "    ${compose_cmd} ps"
  echo -e "    ${compose_cmd} down"
  echo
}

case "${1:-install}" in
  upgrade|update) do_upgrade ;;
  install|"")     main "$@" ;;
  -h|--help|help)
    echo "Usage: install.sh [install|upgrade]"
    echo "  install   Install Torro (default) — prompts for config on first run"
    echo "  upgrade   Pull the latest image, restart, and reclaim disk space"
    ;;
  *) die "Unknown command: $1 (try: install.sh [install|upgrade])" ;;
esac
