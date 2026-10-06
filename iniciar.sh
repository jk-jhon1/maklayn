#!/usr/bin/env bash
# =====================================================================
#  MAKLAYN — Script de inicialização
#
#  Uso:   bash iniciar.sh      (ou ./iniciar.sh, se tiver permissão de execução)
#
#  O que faz:
#   1. Confere se as dependências estão instaladas (node_modules) e roda
#      "npm install" se estiverem faltando — isso acontece a cada nova
#      sessão do workspace, porque node_modules não é preservado.
#   2. Cria o .env de desenvolvimento na primeira execução.
#   3. Sobe o servidor em http://localhost:3000
# =====================================================================
set -e

cd "$(dirname "$0")"

if [ ! -x "$0" ]; then
  chmod +x "$0" 2>/dev/null || true
fi

echo "▸ Maklayn — verificando o ambiente..."

# 1) Dependências
if [ ! -d node_modules ] || [ ! -d node_modules/express ]; then
  echo "  • node_modules ausente — instalando dependências (npm install)..."
  npm install --no-audit --no-fund --silent
  echo "  • dependências instaladas."
else
  echo "  • dependências já presentes."
fi

# 2) Arquivo .env (só cria se não existir — nunca sobrescreve o seu)
if [ ! -f .env ]; then
  echo "  • criando .env de desenvolvimento (SQLite + motor simulado)..."
  cat > .env <<'ENV'
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DB_CLIENT=sqlite
AI_PROVIDER=mock
ALLOW_DEMO_LOGIN=true
JWT_SECRET=maklayn-dev-secret-para-preview-local
ENV
fi

# 3) Banco: o esquema SQLite é criado automaticamente no primeiro boot
echo "  • banco: $(grep -E '^DB_CLIENT' .env | cut -d= -f2)  ·  motor de IA: $(grep -E '^AI_PROVIDER' .env | cut -d= -f2)"
echo "▸ Subindo o servidor em http://localhost:3000  (Ctrl+C encerra)"
echo ""
exec node src/server.js
