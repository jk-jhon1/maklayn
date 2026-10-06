#!/usr/bin/env bash
# =====================================================================
#  MAKLAYN — Publicação no GitHub
#
#  Uso A (repositório já criado por você):
#     GITHUB_TOKEN=ghp_xxx GITHUB_REPO=seu-usuario/maklyn bash publicar-github.sh
#
#  Uso B (deixa o script criar o repositório):
#     GITHUB_TOKEN=ghp_xxx bash publicar-github.sh maklyn public
#
#  O que faz:
#     1. Valida o token em /user (descobre o seu login).
#     2. Se GITHUB_REPO não for informado, cria o repositório via API.
#     3. Configura o remote e envia a branch main.
#
#  Token recomendado (fine-grained, escopo mínimo):
#     GitHub > Settings > Developer settings > Personal access tokens
#       > Fine-grained tokens > Generate new token
#       - Repository access: apenas o repositório maklyn
#       - Permissions: Contents = Read and write
#     Revogue o token depois de publicar.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

NOME_REPO="${1:-maklyn}"
VISIBILIDADE="${2:-public}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "✖ Defina o token:  GITHUB_TOKEN=ghp_xxx GITHUB_REPO=usuario/maklyn bash publicar-github.sh" >&2
  exit 1
fi

API="https://api.github.com"
AUTH=(-H "Authorization: Bearer ${GITHUB_TOKEN}"
      -H "Accept: application/vnd.github+json"
      -H "X-GitHub-Api-Version: 2022-11-28")

echo "▸ Validando o token..."
RESPOSTA_USUARIO=$(curl -s "${AUTH[@]}" "$API/user")
LOGIN=$(printf '%s' "$RESPOSTA_USUARIO" \
  | sed -n 's/.*"login"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

if [ -z "$LOGIN" ]; then
  echo "✖ Token inválido, expirado ou sem permissão de leitura do perfil." >&2
  printf '%s\n' "$RESPOSTA_USUARIO" | head -10 >&2
  exit 1
fi
echo "  ✔ autenticado como: $LOGIN"

REPO="${GITHUB_REPO:-${LOGIN}/${NOME_REPO}}"

# ---------------------------------------------------------------- cria o repo
if [ -z "${GITHUB_REPO:-}" ]; then
  echo "▸ Verificando se ${REPO} já existe..."
  if curl -s -o /dev/null -w "%{http_code}" "${AUTH[@]}" "$API/repos/${REPO}" | grep -q "^200$"; then
    echo "  • já existe — vou apenas enviar os commits"
  else
    echo "▸ Criando o repositório ${REPO} (${VISIBILIDADE})..."
    PRIVADO=false
    [ "$VISIBILIDADE" = "private" ] && PRIVADO=true

    CORPO=$(cat <<JSON
{
  "name": "${NOME_REPO}",
  "description": "Maklayn — Assistente de IA Multidisciplinar: engenharia de software, redação padrão ENEM e pesquisa acadêmica. Node.js/Express e Java/Spring Boot.",
  "private": ${PRIVADO},
  "has_issues": true,
  "has_projects": false,
  "has_wiki": false,
  "auto_init": false
}
JSON
)
    CRIACAO=$(curl -s -X POST "${AUTH[@]}" -H "Content-Type: application/json" -d "$CORPO" "$API/user/repos")
    if printf '%s' "$CRIACAO" | grep -q '"full_name"'; then
      echo "  ✔ repositório criado"
    else
      echo "✖ Falha ao criar o repositório:" >&2
      printf '%s\n' "$CRIACAO" | head -15 >&2
      exit 1
    fi
  fi
else
  echo "▸ Usando o repositório informado: ${REPO}"
fi

# ---------------------------------------------------------------- push
echo "▸ Enviando os commits (branch main)..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://${LOGIN}:${GITHUB_TOKEN}@github.com/${REPO}.git"
git push -u origin main

# O token sai da configuração do remote assim que o push termina
git remote set-url origin "https://github.com/${REPO}.git"

echo
echo "✅ Publicado: https://github.com/${REPO}"
echo "   Revogue o token em github.com/settings/tokens"
