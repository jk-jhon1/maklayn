# 🤖 MAKLAYN — Assistente de IA Multidisciplinar

[![Repositório](https://img.shields.io/badge/GitHub-jk--jhon1%2Fmaklayn-181717?logo=github)](https://github.com/jk-jhon1/maklayn)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Java](https://img.shields.io/badge/Java-JDK%2011%2B-007396?logo=openjdk&logoColor=white)](https://openjdk.org)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)

Implementação completa do sistema especificado no documento *"Especificação de Sistema Técnico"*: um assistente de Inteligência Artificial com **três pilares** (Engenharia de Software, Redação Padrão ENEM e Pesquisa Acadêmica/Técnica), **banco de dados relacional** (`Usuarios`, `Historico_Consultas`, `Referencias_Salvas`) e **login com Google (OAuth 2.0)**.

Duas implementações equivalentes, com a mesma arquitetura e os mesmos endpoints:

| Versão | Stack | Pasta | Status |
| --- | --- | --- | --- |
| **JavaScript / Node.js** | Express + MySQL/SQLite + interface web completa | `src/`, `public/` | ✅ testada neste ambiente |
| **Java / Spring Boot** | Spring Boot 2.7 + JPA + MySQL/H2 · **roda em JDK 11** | `java/` | ✅ compilada, testada e executada em JDK 11 |

---

## 1. O que o Maklayn faz

O núcleo de inteligência é o **system prompt** (`src/ai/systemPrompt.js` · `java/.../ai/MaklaynPrompt.java`), injetado como instrução de sistema em qualquer provedor de LLM. Ele define os quatro blocos de diretrizes da especificação:

1. **Geração de códigos avançados** — código limpo e documentado, padrões de projeto (MVC, Microsserviços, Strategy, Repository), explicações didáticas, atuação full-stack.
2. **Produção de textos e redação (ENEM)** — 5 competências, introdução com tese e repertório, dois desenvolvimentos, conclusão com **proposta de intervenção completa** (agente, ação, meio/modo, efeito, detalhamento).
3. **Pesquisa e referenciação** — respostas factuais com evidências, links reais e referências em ABNT.
4. **Tom e formato** — direto, técnico quando necessário, altamente didático, com Markdown rico (tabelas, negrito, blocos de código).

A interface tem três modos que concatenam instruções específicas ao prompt base e uma **heurística de recomendação de pilar** (`POST /api/recomendar-modo`) para descobrir automaticamente o modo ideal a partir do texto do usuário.

---

## 2. Como rodar a versão Node.js (recomendado para começar)

```bash
cd maklayn
npm install
cp .env.example .env      # ajuste o que precisar
npm start                 # http://localhost:3000
```

O projeto já vem com um arquivo `.env` de desenvolvimento apontando para **SQLite** e para o **motor simulado** — ou seja, roda na hora, sem instalar nada além do Node 18+.

Para usar **MySQL** (como na especificação):

```bash
docker compose up -d      # sobe MySQL 8 + Adminer (http://localhost:8080)
# no .env: DB_CLIENT=mysql
npm run db:migrate        # cria o banco e as 3 tabelas + view
npm start
```

Outros comandos:

```bash
npm run dev        # recarrega automaticamente ao salvar
npm run db:reset   # apaga e recria o banco de desenvolvimento
```

---

## 3. Login com Google (OAuth 2.0) — seção 3 da especificação

Passo a passo:

1. Acesse o **Google Cloud Console** (`console.cloud.google.com`) e crie um novo projeto.
2. Vá em **APIs e Serviços → Tela de consentimento OAuth** e preencha o nome do app exibido aos usuários: **Maklayn**.
3. Em **APIs e Serviços → Credenciais**, crie uma credencial do tipo **ID do cliente OAuth** para **aplicação web**.
4. Em **URIs de redirecionamento autorizados**, adicione:
   `http://localhost:3000/api/auth/google/callback` (e a URL de produção depois).
5. Copie o **Client ID** e o **Client Secret** para o `.env`:

```env
GOOGLE_CLIENT_ID=1234567890-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

O **Client Secret nunca vai para o frontend** — a troca de `code` por tokens acontece no servidor. Dois fluxos estão implementados:

| Fluxo | Rota | Quando usar |
| --- | --- | --- |
| **Authorization Code (server-side)** | `GET /api/auth/google` → `GET /api/auth/google/callback` | Mais seguro; o `state` é um JWT assinado contra CSRF. |
| **Google Identity Services** | botão do Google no frontend → `POST /api/auth/google/credential` | O frontend recebe um `id_token` e o servidor valida em `tokeninfo`. |

Enquanto as credenciais não existem, o **login de demonstração** (`ALLOW_DEMO_LOGIN=true`) permite testar tudo — histórico, referências e banco funcionam igual. Em produção, defina `ALLOW_DEMO_LOGIN=false`.

---

## 4. Motor de IA: simulado, Gemini ou OpenAI

```env
AI_PROVIDER=mock    # gerador didático local: zero custo, ideal para desenvolver e demonstrar
AI_PROVIDER=gemini  # + GEMINI_API_KEY   (modelo padrão: gemini-2.0-flash)
AI_PROVIDER=openai  # + OPENAI_API_KEY   (compatível com Groq, DeepSeek, OpenRouter, Ollama via OPENAI_BASE_URL)
```

O **motor simulado** (`maklayn-mock-v1`) não é um LLM: é um gerador determinístico que respeita a estrutura exigida pelo system prompt — código + explicação + trade-offs + testes de borda, redação ENEM completa com checklist das 5 competências, ou pesquisa com evidências e referências de portais oficiais (INEP, IBGE, IPEA, SciELO, CAPES, DATASUS).

O **roteador** (`src/ai/index.js` · `AiRouter.java`) troca de motor por variável de ambiente e, se o provedor real falhar (chave ausente, cota, rede), cai automaticamente para o simulado com um aviso visível na resposta — o usuário nunca recebe um erro cru de infraestrutura.

---

## 5. Banco de dados

Modelagem exatamente como na especificação (seção 2), em `db/schema.mysql.sql`:

| Tabela | Colunas |
| --- | --- |
| **Usuarios** | `id_usuario` (PK), `nome_completo`, `email` (único), `google_id`, `data_criacao` (+ `foto_url`, `papel`, `ativo`, `data_acesso`) |
| **Historico_Consultas** | `id_consulta` (PK), `id_usuario` (FK → Usuarios), `tipo_consulta` (ENUM: `Codigo`, `Redacao`, `Pesquisa`), `prompt_usuario`, `resposta_ia`, `data_hora` (+ `modelo_usado`, `tokens_usados`, `latencia_ms`) |
| **Referencias_Salvas** | `id_referencia` (PK), `id_usuario` (FK → Usuarios), `titulo_link`, `url_referencia` (+ `id_consulta`, `anotacao`, `data_salvo`) |

Extras: índice composto `(id_usuario, data_hora DESC)` para o histórico, `ON DELETE CASCADE` nas FKs e a view `vw_estatisticas_usuario` para o painel de métricas.

- `DB_CLIENT=mysql` → MySQL 8 (produção). Use `npm run db:migrate`.
- `DB_CLIENT=sqlite` → SQLite (desenvolvimento/preview), com o **mesmo esquema** em `db/schema.sqlite.sql`, criado automaticamente no boot.
- `DB_CLIENT` é o único ponto de troca: a fachada `src/db/index.js` normaliza dialeto e transações.

---

## 6. API REST

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/health` | Saúde da aplicação, do banco e do motor de IA |
| `GET` | `/api/status` | Resumo da configuração |
| `GET` | `/api/prompt` | System prompt em vigor (auditoria de prompt engineering) |
| `POST` | `/api/recomendar-modo` | Sugere o pilar ideal para um texto livre |
| `GET` | `/api/auth/config` | Status do login Google e do modo demonstração |
| `GET` | `/api/auth/google` | Redireciona para a tela de consentimento do Google |
| `GET` | `/api/auth/google/callback` | Recebe o `code`, cria a sessão (cookie httpOnly) |
| `POST` | `/api/auth/google/credential` | Login via Google Identity Services |
| `POST` | `/api/auth/demo` | Login de demonstração |
| `GET` | `/api/auth/eu` | Usuário da sessão |
| `POST` | `/api/auth/sair` | Encerra a sessão |
| `PATCH` | `/api/auth/perfil` | Atualiza nome/papel |
| **`POST`** | **`/api/consultas`** | **Executa uma consulta e persiste no histórico** |
| `GET` | `/api/consultas` | Histórico paginado (`?tipo=&busca=&pagina=&porPagina=`) |
| `GET` | `/api/consultas/resumo` | Métricas do painel |
| `GET` | `/api/consultas/:id` | Consulta completa |
| `DELETE` | `/api/consultas/:id` | Remove do histórico |
| `POST` | `/api/referencias` | Salva um link sugerido pela IA |
| `GET` | `/api/referencias` | Lista as referências salvas |
| `GET` | `/api/referencias/abnt` | Exporta em formato ABNT (NBR 6023) |
| `DELETE` | `/api/referencias/:id` | Remove uma referência |

Exemplo de consulta (arquivo `api.http` na raiz tem todas elas):

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/demo \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Maria Silva","email":"maria@exemplo.com"}'

curl -b cookies.txt -X POST http://localhost:3000/api/consultas \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Escreva uma redação sobre desinformação digital","modo":"Redacao"}'
```

---

## 7. Interface web

`public/` traz uma SPA em HTML/CSS/JS puro (sem framework, sem CDN):

- **Chat** com os três pilares, renderização de Markdown própria (tabelas, código com botão “Copiar”, checklists) e histórico da conversa.
- **Histórico** com filtro por pilar e busca textual; abrir, revisar e excluir consultas.
- **Referências** com salvamento manual, anotação e **exportação ABNT** em .txt.
- **Painel** com métricas de uso por pilar.
- **Motor e API** mostrando o system prompt em vigor, os provedores disponíveis, o banco conectado e as rotas de OAuth.

---

## 8. Estrutura do projeto

```
maklayn/
├── src/
│   ├── ai/                 # system prompt, roteador e provedores (mock, gemini, openai)
│   ├── auth/               # JWT HS256, Google OAuth 2.0, middlewares
│   ├── db/                 # fachada de banco + mysql.js + sqlite.js + migrate/reset
│   ├── routes/             # auth, consultas, referencias, sistema
│   ├── services/           # usuarioService, consultaService, referenciaService
│   ├── config.js           # configuração central (lê .env sem dependência externa)
│   └── server.js           # Express + CSP + tratamento de erros
├── public/                 # interface web (index.html, css, js/app.js, js/markdown.js)
├── db/                     # schema.mysql.sql · schema.sqlite.sql
├── java/                   # versão Spring Boot 3 (mesma arquitetura)
├── docker-compose.yml      # MySQL 8 + Adminer
├── api.http                # coleção de requisições para teste manual
└── .env.example
```

---

## 9. Segurança implementada

- **Senhas e tokens**: JWT HS256 com comparação em tempo constante; cookie `httpOnly`, `SameSite=Lax` (e `Secure` em produção).
- **OAuth**: `state` assinado (Node) / cookie de estado (Java) contra CSRF; Client Secret apenas no backend; validação de `aud` e `email_verified` do Google.
- **SQL**: 100% de consultas parametrizadas (sem concatenação de strings).
- **XSS**: a renderização de Markdown escapa todo o HTML antes de montar a saída.
- **Abuso**: limitador de requisições por IP no chat (20/min) e no login (15/min).
- **Cabeçalhos**: CSP restritiva, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- **Autorização**: toda consulta/referência é filtrada por `id_usuario` — um usuário não enxerga dados de outro.

Antes de ir para produção: gere um `JWT_SECRET` forte, `ALLOW_DEMO_LOGIN=false`, `NODE_ENV=production`, HTTPS e um MySQL com usuário de privilégio mínimo.

---

## 10. Versão Java / Spring Boot (JDK 11)

```bash
cd java
bash run.sh            # compila e sobe com H2 em memória (não precisa de MySQL)
bash run.sh test       # roda os 15 testes automatizados
bash run.sh mysql      # compila e sobe usando MySQL
```

Manual: `mvn spring-boot:run -Dspring-boot.run.profiles=dev` · `mvn -q package && java -jar target/maklayn-java-1.0.0.jar`

Detalhes em [`java/README.md`](java/README.md). Os 28 arquivos Java espelham a arquitetura Node: `ai/` (contrato `AiEngine` + `MockAiEngine`, `GeminiEngine`, `OpenAiEngine` + `AiRouter`), `dominio/` (entidades JPA das três tabelas), `repositorio/`, `servico/`, `seguranca/` (JWT próprio + filtro + Google OAuth) e `web/` (controladores REST + tratador de erros).

### Compatível com JDK 11 — o que foi adaptado

O Spring Boot 3 exige Java 17. Para rodar em **JDK 11**, o projeto usa **Spring Boot 2.7.18** (última linha 2.x) e as APIs `javax.*`:

| Recurso do Java 17 | Substituto no JDK 11 |
| --- | --- |
| `record` | classes `final` imutáveis com getters |
| *Text blocks* (`"""`) no código e no JPQL | `String.join`/concatenação + textos em `resources/templates/*.md` |
| `switch` com expressão | `switch` clássico |
| `Stream.toList()` | `Collectors.toList()` / laço `for` |
| `instanceof` com padrão | `instanceof` + cast explícito |
| `jakarta.servlet` / `jakarta.persistence` | `javax.servlet` / `javax.persistence` |

O bytecode sai com `release=11` (major version **55**), garantido pelo `maven-compiler-plugin` — válido mesmo compilando com JDK 17/21.

> ⚠️ **Atenção (Maven + JDK 11):** se aparecer `Could not transfer artifact ... transfer failed` ao baixar dependências, é um problema conhecido de TLS do `java.net.http.HttpClient` do JDK 11. Solução: `export MAVEN_OPTS="-Djdk.tls.client.protocols=TLSv1.2"` (já embutido no `java/run.sh`).

### Verificação realizada (JDK 11)

- `mvn compile` / `mvn package` → **BUILD SUCCESS** — 28 fontes, bytecode major version 55.
- `mvn test` → **15 testes, 0 falhas** (inclui teste de regressão de um `NullPointerException` real no login sem o campo `papel`).
- Aplicação executada: `Started MaklaynApplication in 5.0 seconds` na porta 8080.
- Fluxo validado por HTTP: `health` (banco H2 + motor), login com JWT/cookie, consultas nos **três pilares**, histórico paginado, resumo do painel, salvar referência, exportação ABNT e erros esperados (401 sem login; 400 para prompt vazio e URL inválida).

---

## 11. Publicar no GitHub

O projeto já vem com o histórico Git pronto (2 commits na branch `main`). Para publicar:

```bash
# Opção 1 — repositório já criado por você no GitHub:
GITHUB_TOKEN=ghp_xxx GITHUB_REPO=seu-usuario/maklyn bash publicar-github.sh

# Opção 2 — deixe o script criar o repositório:
GITHUB_TOKEN=ghp_xxx bash publicar-github.sh maklyn public
```

O token deve ser **fine-grained** (github.com/settings/tokens) com *Contents: Read and write* — e **revogado** depois do push. O script remove o token da configuração do remote ao terminar.

Manualmente, sem o script:

```bash
git remote add origin https://github.com/jk-jhon1/maklayn.git
git push -u origin main
```

Repositório oficial: **https://github.com/jk-jhon1/maklayn**
