#!/usr/bin/env bash
# deploy.sh — idempotent setup & deploy script for Torro on Ubuntu
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

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
[[ ! -f "$SCRIPT_DIR/$COMPOSE_FILE" ]] && die "$COMPOSE_FILE not found. Run this script from the torro repo root."
command -v curl &>/dev/null || die "curl is required but not installed."

cd "$SCRIPT_DIR"

# ── Docker access (handles fresh install before group membership) ─────────────
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

# ── User inputs ───────────────────────────────────────────────────────────────
SKIP_ENV=false
APP_USERNAME="" APP_PASSWORD="" DOMAIN="" ACME_EMAIL=""

gather_inputs() {
  section "Configuration"

  if [[ -f .env ]]; then
    warn ".env already exists."
    read -rp "  Reconfigure and overwrite it? [y/N]: " ans
    if [[ ! "$ans" =~ ^[Yy]$ ]]; then
      info "Keeping existing .env."
      SKIP_ENV=true
      return
    fi
    echo
  fi

  read -rp "  App username [admin]: " APP_USERNAME
  APP_USERNAME="${APP_USERNAME:-admin}"

  while true; do
    read -rsp "  App password: " APP_PASSWORD; echo
    if [[ -z "$APP_PASSWORD" ]]; then
      warn "Password cannot be empty."
      continue
    fi
    read -rsp "  Confirm password: " _confirm; echo
    if [[ "$APP_PASSWORD" == "$_confirm" ]]; then
      break
    fi
    warn "Passwords do not match — try again."
  done

  read -rp "  Domain (e.g. torro.example.com): " DOMAIN
  if [[ -z "$DOMAIN" ]]; then die "Domain cannot be empty."; fi

  read -rp "  Let's Encrypt email: " ACME_EMAIL
  if [[ -z "$ACME_EMAIL" ]]; then die "Email cannot be empty."; fi
}

# ── Write .env ────────────────────────────────────────────────────────────────
QBIT_PASSWORD=""

write_env() {
  if [[ "$SKIP_ENV" == true ]]; then
    QBIT_PASSWORD=$(grep '^QBIT_PASSWORD=' .env | cut -d= -f2-)
    return
  fi

  info "Generating secrets..."

  local jwt_secret qbit_password app_hash
  jwt_secret=$(openssl rand -hex 32)
  qbit_password=$(openssl rand -hex 12)

  app_hash=$(printf '%s' "$APP_PASSWORD" | python3 -c "
import bcrypt, sys
pw = sys.stdin.buffer.read()
print(bcrypt.hashpw(pw, bcrypt.gensalt(12)).decode())
")

  cat > .env <<EOF
JWT_SECRET=${jwt_secret}

APP_USERNAME=${APP_USERNAME}
APP_PASSWORD_HASH=${app_hash}

QBIT_USERNAME=admin
QBIT_PASSWORD=${qbit_password}

ALLOWED_ORIGIN=https://${DOMAIN}
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

DOCKER_REPO=optimumsage
TORRO_VERSION=latest
EOF

  chmod 600 .env
  QBIT_PASSWORD="$qbit_password"
  success ".env created with chmod 600"
}

# ── Traefik ───────────────────────────────────────────────────────────────────
setup_traefik() {
  mkdir -p traefik
  touch traefik/acme.json   # no-op if already exists
  chmod 600 traefik/acme.json
  success "traefik/acme.json ready (chmod 600)"
}

# ── qBittorrent first-run configuration ───────────────────────────────────────
configure_qbittorrent() {
  info "Waiting for qBittorrent to become healthy..."
  local elapsed=0
  until $SUDO docker compose -f "$COMPOSE_FILE" ps qbittorrent 2>/dev/null | grep -q "(healthy)"; do
    sleep 5
    elapsed=$((elapsed + 5))
    [[ $elapsed -gt 150 ]] && die "qBittorrent did not become healthy after 150s. Check logs: docker compose -f $COMPOSE_FILE logs qbittorrent"
  done

  local result
  result=$($SUDO docker compose -f "$COMPOSE_FILE" exec -T qbittorrent \
    curl -s --max-time 5 \
    --data "username=admin&password=${QBIT_PASSWORD}" \
    http://localhost:8080/api/v2/auth/login 2>/dev/null || echo "fail")

  if [[ "$result" == "Ok." ]]; then
    success "qBittorrent already configured"
    return
  fi

  local temp_pass
  temp_pass=$($SUDO docker compose -f "$COMPOSE_FILE" logs qbittorrent 2>&1 | \
    grep -i "temporary password" | tail -1 | sed 's/.*: //' | tr -d '[:space:]\r\n')

  if [[ -z "$temp_pass" ]]; then die "Could not find qBittorrent temporary password in logs."; fi

  info "Setting permanent qBittorrent password..."
  $SUDO docker compose -f "$COMPOSE_FILE" exec -T qbittorrent sh -c "
    curl -s -c /tmp/qc -b /tmp/qc \
      --data 'username=admin&password=${temp_pass}' \
      http://localhost:8080/api/v2/auth/login > /dev/null && \
    curl -s -c /tmp/qc -b /tmp/qc \
      --data 'json={\"web_ui_password\":\"${QBIT_PASSWORD}\",\"web_ui_max_auth_fail_count\":0}' \
      http://localhost:8080/api/v2/app/setPreferences > /dev/null
    rm -f /tmp/qc
  "
  success "qBittorrent password set (internal use only)"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo
  echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║          Torro  Deploy               ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"

  section "Installing dependencies"
  install_docker
  install_docker_compose
  install_python_bcrypt

  detect_docker_access

  gather_inputs
  write_env
  setup_traefik

  section "Pulling images"
  $SUDO docker compose -f "$COMPOSE_FILE" pull
  success "Images pulled"

  section "Starting services"
  $SUDO docker compose -f "$COMPOSE_FILE" up -d
  success "All containers started"

  configure_qbittorrent

  local domain username
  domain=$(grep '^DOMAIN=' .env | cut -d= -f2-)
  username=$(grep '^APP_USERNAME=' .env | cut -d= -f2-)

  section "Done"
  echo
  echo -e "  ${GREEN}${BOLD}▸ https://${domain}${NC}"
  echo
  echo -e "  Username: ${BOLD}${username}${NC}"
  echo -e "  Password: (the one you entered)"
  echo
  echo -e "  To upgrade:"
  echo -e "    $SUDO docker compose -f $COMPOSE_FILE pull && $SUDO docker compose -f $COMPOSE_FILE up -d"
  echo
  echo -e "  Other commands:"
  echo -e "    $SUDO docker compose -f $COMPOSE_FILE logs -f"
  echo -e "    $SUDO docker compose -f $COMPOSE_FILE ps"
  echo -e "    $SUDO docker compose -f $COMPOSE_FILE down"
  echo
}

main "$@"
