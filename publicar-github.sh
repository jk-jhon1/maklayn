#!/usr/bin/env bash
# =====================================================================
#  MAKLAYN — Publicação no GitHub
#
#  Uso:
#     GITHUB_TOKEN=ghp_xxx bash publicar-github.sh [nome-do-repo] [public|private]
#
#  O que faz:
#     1. Valida o token consultando /user (descobre o seu login).
#     2. Cria o repositório via API (se ainda não existir).
#     3. Configura o remote e envia a branch main.
#
#  Como obter um token (recomendado: fine-grained, escopo mínimo):
#     GitHub > Settings > Developer settings > Personal access tokens
#       - Fine-grained: permissão "Repository creation" + "Contents: Read and write"
#       - Classic: escopo "repo"
#     Depois de publicar, REVOGUE o token.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

NOME_REPO="${1:-maklayn}"
VISIBILIDADE="${2:-public}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "✖ Defina o token:  GITHUB_TOKEN=ghp_xxx bash publicar-github.sh" >&2
  exit 1
fi

API="https://api.github.com"
AUTH=(-H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

echo "▸ Validando o token..."
LOGIN=$(curl -s "${AUTH[@]}" "$API/user" | sed -n 's/.*"login"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

if [ -z "$LOGIN" ]; then
  echo "✖ Token inválido ou sem permissão de leitura do perfil." >&2
  exit 1
fi
echo "  ✔ autenticado como: $LOGIN"

echo "▸ Criando o repositório $LOGIN/$NOME_REPO ($VISIBILIDADE)..."
PRIVADO=false
[ "$VISIBILIDADE" = "private" ] && PRIVADO=true

CORPO=$(cat <<JSON
{
  "name": "$NOME_REPO",
  "description": "Maklayn — Assistente de IA Multidisciplinar: engenharia de software, redação padrão ENEM e pesquisa acadêmica. Node.js/Express e Java/Spring Boot.",
  "private": $PRIVADO,
  "has_issues": true,
  "has_projects": false,
  "has_wiki": false,
  "auto_init": false
}
JSON
)

RESPOSTA=$(curl -s -X POST "${AUTH[@]}" -H "Content-Type: application/json" -d "$CORPO" "$API/user/repos")
if echo "$RESPOSTA" | grep -q '"full_name"'; then
  echo "  ✔ repositório criado: https://github.com/$LOGIN/$NOME_REPO"
elif echo "$RESPOSTA" | grep -qi "already exists"; then
  echo "  • repositório já existia — usando o existente"
else
  echo "✖ Falha ao criar o repositório:" >&2
  echo "$RESPOSTA" | head -20 >&2
  exit 1
fi

echo "▸ Enviando os commits (branch main)..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://${LOGIN}:${GITHUB_TOKEN}@github.com/${LOGIN}/${NOME_REPO}.git"
git push -u origin main --quiet

# Remove o token da configuração do remote (fica apenas como remote público)
git remote set-url origin "https://github.com/${LOGIN}/${NOME_REPO}.git"

echo "  ✔ envio concluído"
echo
echo "✅ Pronto: https://github.com/$LOGIN/$NOME_REPO"
echo "   Lembre-se de REVOGAR o token em github.com/settings/tokens"
