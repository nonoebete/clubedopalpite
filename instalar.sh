#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  instalar.sh — Clube de Palpites · Instalação completa na VPS
#  Executa UMA VEZ: sudo bash instalar.sh
#
#  O que faz:
#  1. Instala Docker + Docker Compose (se necessário)
#  2. Configura o .env interativamente
#  3. Sobe todos os containers (postgres, backend, frontend, wpp)
#  4. Instala sistema de snapshots com cron
#  5. Conecta o WhatsApp via QR Code
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m';  BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}[✔] $1${NC}"; }
info() { echo -e "${CYAN}[→] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
erro() { echo -e "${RED}[✗] $1${NC}"; exit 1; }
ask()  { echo -e "${BOLD}${CYAN}[?] $1${NC}"; }

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

clear
echo -e "${BOLD}"
cat << 'BANNER'
 ╔══════════════════════════════════════════════════════╗
 ║     CLUBE DE PALPITES · COPA DO MUNDO 2026           ║
 ║     Instalação completa na VPS                       ║
 ╚══════════════════════════════════════════════════════╝
BANNER
echo -e "${NC}"

[[ $EUID -ne 0 ]] && erro "Execute como root: sudo bash instalar.sh"

# ── 1. Docker ─────────────────────────────────────────────────
info "Verificando Docker..."
if ! command -v docker >/dev/null 2>&1; then
  info "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker instalado!"
else
  ok "Docker já instalado: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  info "Instalando Docker Compose plugin..."
  apt-get install -y docker-compose-plugin 2>/dev/null || \
    curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
         -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose
fi
ok "Docker Compose: $(docker compose version 2>/dev/null || docker-compose version)"

# ── 2. Configurar .env ─────────────────────────────────────────
info "Configurando variáveis de ambiente..."

if [[ -f "${APP_DIR}/.env" ]]; then
  warn ".env já existe. Usando as configurações atuais."
else
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"

  echo ""
  echo -e "${BOLD}Preencha as credenciais do sistema:${NC}"
  echo ""

  ask "Senha do banco PostgreSQL (pressione Enter para gerar automaticamente):"
  read -r DB_PASS
  [[ -z "$DB_PASS" ]] && DB_PASS=$(openssl rand -hex 16)

  ask "Token do Mercado Pago (APP_USR-... ou TEST-... para sandbox; Enter para pular):"
  read -r MP_TOKEN

  ask "Chave Evolution API (WhatsApp; Enter para gerar automaticamente):"
  read -r EVO_KEY
  [[ -z "$EVO_KEY" ]] && EVO_KEY=$(openssl rand -hex 32)

  ask "URL pública da VPS (ex: https://seudominio.com.br ou http://$(curl -s ifconfig.me)):"
  read -r APP_URL_INPUT
  [[ -z "$APP_URL_INPUT" ]] && APP_URL_INPUT="http://$(curl -s ifconfig.me 2>/dev/null || echo 'localhost')"

  JWT=$(openssl rand -hex 64)

  sed -i "s|TROQUE_POR_SENHA_FORTE|${DB_PASS}|g"        "${APP_DIR}/.env"
  sed -i "s|TROQUE_POR_STRING_64_CHARS|${JWT}|g"         "${APP_DIR}/.env"
  sed -i "s|APP_USR-COLE_SEU_TOKEN_AQUI|${MP_TOKEN:-vazio}|g" "${APP_DIR}/.env"
  sed -i "s|TROQUE_POR_CHAVE_FORTE|${EVO_KEY}|g"         "${APP_DIR}/.env"
  sed -i "s|https://seudominio.com.br|${APP_URL_INPUT}|g" "${APP_DIR}/.env"
  sed -i "s|TROQUE_POR_SEGREDO_WEBHOOK|$(openssl rand -hex 32)|g" "${APP_DIR}/.env"

  ok ".env configurado!"
fi

source "${APP_DIR}/.env"

# ── 3. Subir containers ────────────────────────────────────────
info "Construindo e subindo containers..."
cd "$APP_DIR"
docker compose build --no-cache
docker compose up -d

info "Aguardando banco de dados..."
MAX=30; COUNT=0
until docker exec cdp_postgres pg_isready -U "${POSTGRES_USER:-cdp_user}" >/dev/null 2>&1; do
  COUNT=$((COUNT+1)); [[ $COUNT -ge $MAX ]] && erro "Banco não respondeu."
  echo -n "."; sleep 2
done
echo ""
ok "Todos os containers rodando!"
docker compose ps

# ── 4. Snapshots ───────────────────────────────────────────────
info "Instalando sistema de snapshots..."
if [[ -d "${APP_DIR}/snapshot" ]]; then
  chmod +x "${APP_DIR}"/snapshot/*.sh
  mkdir -p /var/backups/clube-palpite/{diario,semanal,mensal}
  mkdir -p /opt/snapshot-cdp
  cp "${APP_DIR}"/snapshot/*.sh /opt/snapshot-cdp/
  chmod +x /opt/snapshot-cdp/*.sh
  ln -sf /opt/snapshot-cdp/snapshot.sh        /usr/local/bin/cdp-snapshot   2>/dev/null || true
  ln -sf /opt/snapshot-cdp/restaurar.sh       /usr/local/bin/cdp-restaurar  2>/dev/null || true
  ln -sf /opt/snapshot-cdp/status-snapshot.sh /usr/local/bin/cdp-status     2>/dev/null || true

  # Cron de snapshots
  (crontab -l 2>/dev/null | grep -v "snapshot.sh"; cat << 'CRON'
0 2 2-31 * 1-6 bash /opt/snapshot-cdp/snapshot.sh --silencioso
0 2 * * 0 bash /opt/snapshot-cdp/snapshot.sh --silencioso
0 2 1 * * bash /opt/snapshot-cdp/snapshot.sh --silencioso
CRON
) | crontab -
  ok "Snapshots instalados! Cron: 02:00 diário/domingo/dia1"
fi

# ── 5. WhatsApp QR Code ────────────────────────────────────────
echo ""
info "Aguardando Evolution API inicializar (30s)..."
sleep 30

WPP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:8080/" \
  -H "apikey: ${EVOLUTION_API_KEY:-changeme}" 2>/dev/null || echo "000")

if [[ "$WPP_STATUS" == "200" || "$WPP_STATUS" == "404" ]]; then
  # Cria instância
  curl -s -X POST "http://localhost:8080/instance/create" \
    -H "apikey: ${EVOLUTION_API_KEY:-changeme}" \
    -H "Content-Type: application/json" \
    -d '{"instanceName":"clube-palpite","qrcode":true}' >/dev/null 2>&1 || true
  ok "WhatsApp: instância criada."
  warn "Acesse http://$(curl -s ifconfig.me 2>/dev/null):8080 para escanear o QR Code"
  warn "Ou use o endpoint: GET /api/whatsapp/qrcode (com JWT admin)"
else
  warn "Evolution API ainda iniciando. Acesse o QR Code depois via: GET /api/whatsapp/qrcode"
fi

# ── Resumo final ───────────────────────────────────────────────
IP=$(curl -s ifconfig.me 2>/dev/null || echo "IP_DA_VPS")
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✅  INSTALAÇÃO CONCLUÍDA COM SUCESSO!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 Frontend:       ${CYAN}http://${IP}${NC}"
echo -e "  🚀 API:            ${CYAN}http://${IP}/api/health${NC}"
echo -e "  📱 WhatsApp Admin: ${CYAN}http://${IP}:8080${NC}"
echo -e "  🔐 EasyPanel:      ${CYAN}http://${IP}:3000${NC} (se instalado)"
echo ""
echo -e "  👤 Admin:  ${BOLD}ADMIN001${NC} / ${BOLD}admin@Copa2026${NC}"
echo -e "  ⚠️  ${YELLOW}Troque a senha do admin no primeiro acesso!${NC}"
echo ""
echo -e "  📦 Comandos úteis:"
echo -e "     ${CYAN}cdp-snapshot${NC}           → snapshot manual agora"
echo -e "     ${CYAN}cdp-status${NC}             → painel de status"
echo -e "     ${CYAN}docker compose logs -f backend${NC} → ver logs"
echo ""
