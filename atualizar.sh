#!/bin/bash
# atualizar.sh — Atualiza o sistema sem perder dados
# Uso: bash atualizar.sh [--backend] [--frontend] [--tudo]

set -euo pipefail
GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[✔] $1${NC}"; }
info() { echo -e "${CYAN}[→] $1${NC}"; }

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

MODO="${1:---tudo}"

info "Fazendo snapshot antes de atualizar..."
bash /opt/snapshot-cdp/snapshot.sh --silencioso 2>/dev/null || true

if [[ "$MODO" == "--backend" || "$MODO" == "--tudo" ]]; then
  info "Rebuilding backend..."
  docker compose up -d --build backend
  ok "Backend atualizado!"
fi

if [[ "$MODO" == "--frontend" || "$MODO" == "--tudo" ]]; then
  info "Rebuilding frontend..."
  docker compose up -d --build frontend
  ok "Frontend atualizado!"
fi

if [[ "$MODO" == "--tudo" ]]; then
  info "Verificando migrações do banco..."
  docker exec cdp_backend npx prisma db push 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}${BOLD}✅ Atualização concluída!${NC}"
docker compose ps
