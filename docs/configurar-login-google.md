# 🔐 Como ativar o login Google no Maklayn

O Maklayn já tem o login Google **implementado e testado** nos três cenários:

| Onde | O que precisa | Situação |
|---|---|---|
| **Aplicação local** (Node :3000 e Java :8080) | Client ID **+** Client Secret no `.env` | código pronto — verificado com um Google emulado |
| **Demonstração online** (GitHub Pages) | **só** o Client ID | código pronto — basta colar o ID |
| **Modo demonstração** (sem Google) | nada | já funciona |

O que **só você pode fazer** é criar as credenciais no Google Cloud Console — elas são
da sua conta Google, e o Client Secret não deve ser compartilhado com ninguém.

⏱️ **Tempo: cerca de 3 minutos. Não custa nada e não exige cartão de crédito.**

---

## 1. Criar o projeto e a credencial

1. Acesse **https://console.cloud.google.com/apis/credentials**
2. Aceite os termos se for a primeira vez.
3. No seletor de projeto (topo da página), clique em **"Novo projeto"**
   - Nome: `Maklayn`
   - Clique em **Criar** e espere alguns segundos
4. Clique em **"+ Criar credenciais"** → **"ID do cliente OAuth"**
5. Se pedir para configurar a tela de consentimento, clique em **"Configurar tela de consentimento"**:
   - **Tipo de usuário:** `Externo` (funciona para qualquer conta Google)
   - **Nome do app:** `Maklayn`
   - **E-mail de suporte:** seu e-mail
   - **E-mail do desenvolvedor:** seu e-mail
   - **Público-alvo:** deixe em **"Teste"** — para uso próprio não precisa publicar
     (em "Teste", só contas cadastradas em *Usuários de teste* conseguem entrar;
     adicione a sua conta lá: **Público-alvo → Usuários de teste → Add users**)
   - Salve

---

## 2. Preencher as URLs autorizadas (etapa que mais dá erro)

Ao criar o **ID do cliente OAuth**, escolha o tipo **"Aplicativo da Web"** e preencha
com **exatamente** estes valores:

### Origens JavaScript autorizadas
*(usadas pelo botão do Google no navegador — Google Identity Services)*

```
https://jk-jhon1.github.io
http://localhost:3000
http://localhost:8080
```

### URIs de redirecionamento autorizados
*(usadas pelo fluxo server-side, com Client Secret)*

```
http://localhost:3000/api/auth/google/callback
http://localhost:8080/api/auth/google/callback
```

> Se você roda a versão Node em outra porta, troque `3000` pela sua.
> A URI de redirecionamento **precisa ser idêntica** à do `.env`
> (`GOOGLE_REDIRECT_URI`) — uma barra a mais ou a menos já causa
> `redirect_uri_mismatch`.

Clique em **Criar**. O Google mostra o **Client ID** e o **Client Secret**.

---

## 3. Onde colocar cada valor

### 🅰️ Demonstração online (GitHub Pages)

Cole o **Client ID** em uma destas duas opções (o Client ID é público — aparece no
HTML de qualquer site que usa o Google):

- **Na tela de login do site**: clique em *Entrar* → campo
  "Ativar o login Google nesta demonstração" → cole o ID → **Usar**.
  Ele fica salvo no seu navegador (`localStorage`).
- **No código** (vale para todos os visitantes): abra
  [`docs/js/config.js`](js/config.js) e preencha:

  ```js
  globalThis.MAKLAYN_DEMO = {
    googleClientId: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
    googleJwksUri: 'https://www.googleapis.com/oauth2/v3/certs'
  };
  ```

  Depois é só commitar — o site publica em ~1 minuto.

> **Por que não precisa do Client Secret aqui?** No fluxo do Google Identity
> Services, o Google devolve ao navegador um `id_token` já assinado. A
> demonstração confere essa assinatura com as **chaves públicas** do Google
> (`https://www.googleapis.com/oauth2/v3/certs`) — o Secret não participa.
> É a mesma verificação que um servidor faria, só que sem servidor.

### 🅱️ Aplicação local (Node ou Java)

**Jeito mais rápido (sem editar arquivos):** rode `bash iniciar.sh`, abra
http://localhost:3000, clique em **Entrar** e cole o Client ID no campo
*"Ativar o login Google"*. O botão oficial do Google aparece na hora — e o valor
fica guardado em `.runtime/` para as próximas execuções.

**Jeito permanente:** no arquivo `.env` (copie de `.env.example` se ainda não tiver):

```ini
GOOGLE_CLIENT_ID=1234567890-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

- Versão **Node** (`bash iniciar.sh` → :3000): a variável `PORT` define a porta.
- Versão **Java** (`bash java/run.sh` → :8080): use
  `GOOGLE_REDIRECT_URI=http://localhost:8080/api/auth/google/callback`.

Depois reinicie o servidor. O aviso "Google em modo demonstração" some e o botão
**"Entrar com Google"** aparece na tela de login.

> ℹ️ O botão oficial do Google — o que abre a **lista de contas Gmail** — precisa
> apenas do **Client ID**. O `GOOGLE_CLIENT_SECRET` só é necessário se você quiser
> também o fluxo server-side (`GET /api/auth/google`), que devolve o perfil por
> redirect. Em produção, defina `ALLOW_RUNTIME_CLIENT_ID=false` para desativar a
> configuração pela interface.

> ⚠️ **O Client Secret nunca vai para o front-end** — ele fica só no backend,
> que é quem troca o `code` por tokens (fluxo Authorization Code).

---

## 4. Testar sem criar credenciais (opcional, e útil)

O repositório inclui um **Google emulado** que reproduz os endpoints reais
(consentimento, token, perfil, JWKS, tokeninfo) — com chave RSA de verdade,
código de uso único e validação de `client_secret`:

```bash
node testes/google-falso.mjs          # sobe em http://localhost:9099
```

E a bateria que já valida tudo (24 verificações em cada backend):

```bash
npm run teste:login        # 24 verificações — Node (Express)
npm run teste:login:java   # 24 verificações — Java (Spring Boot); exige o jar
npm run teste:login:demo   # 11 verificações — demonstração estática (JWKS no navegador)
npm run teste:client-id    # 15 verificações — ativação do Google pela interface
```

O que essas verificações cobrem:

- ✅ fluxo completo: redirecionamento → consentimento → callback → tokens → perfil → sessão
- ✅ usuário criado com `google_id` (o `sub` do Google) e foto do perfil
- ✅ `state` antifraude (CSRF): assinatura falsa, payload alterado e segredo errado são recusados
- ✅ código de autorização de uso único (reuso → `401 GOOGLE_TOKEN_INVALIDO`)
- ✅ `id_token` de outra aplicação, expirado ou adulterado → `401`
- ✅ Client Secret errado → falha na troca do código com mensagem explicativa
- ✅ sem credenciais → `503 GOOGLE_NAO_CONFIGURADO` com instrução
- ✅ a conta não é duplicada em logins repetidos
- ✅ o login de demonstração continua funcionando em paralelo

---

## 5. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `redirect_uri_mismatch` | URI do `.env` diferente da cadastrada | Confira caractere por caractere (http, porta, caminho). Use `http://` em localhost, `https://` no Pages |
| `403 access_denied` no login | Conta não está em "Usuários de teste" | Google Cloud → **Público-alvo → Usuários de teste → Add users** |
| `origin_mismatch` (no navegador) | Origem não cadastrada | Adicione `https://jk-jhon1.github.io` em **Origens JavaScript autorizadas** |
| `invalid_client` | Client ID/Secret trocados ou de outro projeto | Confira os valores no `.env`; o erro mostra a causa traduzida |
| `invalid_grant` | Código expirado ou já usado | Faça login novamente (é proteção contra replay, não é defeito) |
| O botão do Google não aparece | `GOOGLE_CLIENT_ID` ausente | O app avisa na tela e oferece o login de demonstração |
| `503 GOOGLE_NAO_CONFIGURADO` | Sem credenciais no servidor | Preencha `.env` e reinicie |

---

## 6. Como o código está organizado

| Arquivo | Papel |
|---|---|
| `src/auth/google.js` | Node: Authorization Code + validação do `id_token`, endpoints configuráveis |
| `src/routes/auth.js` | Node: rotas `/api/auth/google`, `/callback`, `/google/credential` |
| `java/.../seguranca/GoogleServico.java` | Java: mesma lógica, com `ErroGoogle` (status + código) |
| `java/.../web/AuthControlador.java` | Java: mesmas rotas e códigos de erro |
| `docs/js/demo-api.js` | Demonstração: verificação da assinatura no navegador (Web Crypto + JWKS) |
| `src/auth/clienteGoogleRuntime.js` | Node: guarda o Client ID colado na tela (`.runtime/`), desativado em produção |
| `testes/client-id-interface.teste.mjs` | 15 verificações da ativação pela interface |
| `testes/google-falso.mjs` | Google emulado para testes offline |
| `testes/login-google.teste.mjs` | 24 verificações ponta a ponta (serve Node **e** Java) |
| `testes/login-google-demo.teste.mjs` | 11 verificações do login na demonstração estática |

**Contrato idêntico nas duas stacks** — o mesmo teste roda contra Node e Java, e ambos
respondem com os mesmos códigos: `STATE_INVALIDO`, `GOOGLE_TOKEN_INVALIDO`,
`CREDENCIAL_INVALIDA`, `CREDENCIAL_OUTRA_APLICACAO`, `EMAIL_NAO_VERIFICADO`,
`GOOGLE_NAO_CONFIGURADO`, `CALLBACK_INCOMPLETO`.
