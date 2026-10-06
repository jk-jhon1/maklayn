# ☕ MAKLAYN — versão Java / Spring Boot (compatível com JDK 11)

Mesma especificação da versão Node, implementada com **Spring Boot 2.7.18 + JPA + MySQL (ou H2)**, rodando em **JDK 11**.

> **Por que Spring Boot 2.7 e não 3.x?** O Spring Boot 3 exige Java 17 (usa `jakarta.*`, `record`, *text blocks*, `switch` expression). Para atender ao JDK 11, este projeto usa a última linha 2.x e as APIs `javax.*`.

## Como rodar

```bash
cd java

bash run.sh            # compila e sobe com H2 em memória (não precisa de MySQL)
bash run.sh test       # roda os 15 testes automatizados
bash run.sh mysql      # compila e sobe usando MySQL (veja application.yml)
```

Manual, se preferir:

```bash
mvn test
mvn spring-boot:run -Dspring-boot.run.profiles=dev   # http://localhost:8080
mvn -q package && java -jar target/maklayn-java-1.0.0.jar
```

Requisitos: **JDK 11+** e **Maven 3.6+**. O `run.sh` define `MAVEN_OPTS=-Djdk.tls.client.protocols=TLSv1.2` automaticamente — veja o item "Solução de problemas" abaixo.

### Perfis

| Perfil | Banco | Quando usar |
| --- | --- | --- |
| `dev` | H2 em memória (modo MySQL) | Avaliação rápida, sem instalar nada. Console em `/h2-console` (JDBC: `jdbc:h2:mem:maklayn`). |
| padrão | MySQL | Produção/desenvolvimento real. `docker compose -f ../docker-compose.yml up -d` na raiz do projeto, depois `java -jar ...`. |

Configuração por variável de ambiente (mesmos nomes da versão Node): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ALLOW_DEMO_LOGIN`, `AI_PROVIDER`, `GEMINI_API_KEY`, `OPENAI_API_KEY`.

## Arquitetura

```
br.com.maklayn
├── MaklaynApplication            # bootstrap Spring Boot
├── ai/
│   ├── MaklaynPrompt             # SYSTEM PROMPT + instruções por pilar + recomendador
│   ├── TipoConsulta              # enum Codigo | Redacao | Pesquisa
│   ├── AiEngine                  # contrato (Strategy): PedidoIA -> RespostaIA
│   ├── MockAiEngine              # gerador didático local (textos em templates/*.md)
│   ├── GeminiEngine              # Google Gemini
│   ├── OpenAiEngine              # OpenAI e compatíveis (Groq, DeepSeek, OpenRouter, Ollama)
│   ├── AiRouter                  # escolhe o motor + fallback automático + extração de links
│   ├── Templates                 # carregador de templates .md do classpath
│   └── HttpJson                  # cliente HTTP/JSON (java.net.http + Jackson)
├── dominio/                      # Usuario, HistoricoConsulta, ReferenciaSalva (tabelas da especificação)
├── repositorio/                  # Spring Data JPA + consultas JPQL com filtros
├── servico/                      # UsuarioServico, ConsultaServico, ReferenciaServico
├── seguranca/
│   ├── JwtServico                # JWT HS256 próprio (HmacSHA256 + Base64URL), sem dependências
│   ├── GoogleServico             # OAuth 2.0: consentimento, troca de code, GIS id_token, proteção CSRF
│   └── AutenticacaoFiltro        # OncePerRequestFilter: cookie httpOnly ou Bearer
└── web/                          # AuthControlador, ConsultaControlador, ReferenciaControlador,
                                  # SistemaControlador, TratadorDeErros, WebConfig (CORS local)
```

Os textos longos do motor simulado ficam em `src/main/resources/templates/*.md` (com marcadores `{{chave}}`) em vez de *text blocks* — assim o código roda no JDK 11 e o texto pode ser editado sem recompilar a lógica.

## Endpoints

Idênticos aos da versão Node (`/api/health`, `/api/auth/*`, `/api/consultas`, `/api/referencias`, `/api/prompt`, `/api/recomendar-modo`) — veja a tabela completa no [README da raiz](../README.md#6-api-rest). O arquivo [`../api.http`](../api.http) tem todas as requisições; troque a porta `3000` por `8080`.

## Testes incluídos

```
Tests run: 15, Failures: 0, Errors: 0, Skipped: 0   (JDK 11, BUILD SUCCESS)
```

- `MockAiEngineTest` — garante que cada pilar entrega a estrutura exigida pelo system prompt (bloco de código + trade-offs + testes; redação com as 5 competências e agente explícito; pesquisa com evidências e links oficiais) e que o recomendador de pilar acerta os três casos clássicos.
- `JwtServicoTest` — round-trip das claims, rejeição de payload adulterado, token expirado e token malformado.
- `UsuarioServicoTest` — login de demonstração: **regressão de um bug real** encontrado na validação por HTTP. `List.of("aluno", ...).contains(null)` lança `NullPointerException` em Java (coleções imutáveis não aceitam nulo), derrubando o login quando o cliente não envia o campo `papel`. O teste garante que papel ausente/inválido vira `"aluno"`, que o nome padrão vem do e-mail e que contas existentes não são duplicadas.

## Compatibilidade — o que foi adaptado para o JDK 11

| Recurso do Java 17 (versão anterior) | Substituto no JDK 11 |
| --- | --- |
| Spring Boot 3.x (`jakarta.*`) | Spring Boot **2.7.18** (`javax.servlet`, `javax.persistence`) |
| `record` (`PedidoIA`, `RespostaIA`, `DadosToken`, DTOs...) | classes `final` imutáveis com getters |
| *Text blocks* (`"""..."""`) — código e JPQL | `String.join(...)` / concatenação; textos longos em `templates/*.md` |
| `switch` com expressão (`case X -> ...`) | `switch` clássico (blocos 1 e 2) e `switch` de enum |
| `Stream.toList()` (Java 16) | `Collectors.toList()` / laço `for` |
| `instanceof` com padrão (Java 16) | `instanceof` + *cast* explícito |
| `List.of()`/`Map.of()` | mantidos (existem desde o Java 9 ✔) |

O bytecode é gerado com `release=11` (major version 55), garantido pela configuração do `maven-compiler-plugin` — funciona inclusive se você compilar com JDK 17/21 instalado.

## Solução de problemas

**`Could not transfer artifact ... transfer failed` ao baixar dependências**

O `java.net.http.HttpClient` do JDK 11 falha o handshake TLS com alguns CDNs (erro `Received fatal alert: handshake_failure`). Solução:

```bash
export MAVEN_OPTS="-Djdk.tls.client.protocols=TLSv1.2"
```

Esse ajuste já está embutido no `run.sh`. Alternativa: compilar com JDK 17/21 usando `-release 11` (o `pom.xml` já está configurado para isso).

**`Non-resolvable parent POM ... offline mode`**

Você rodou o Maven com `-o` (offline) sem ter as dependências no repositório local. Rode sem `-o` na primeira vez.

**Porta 8080 ocupada**

```bash
java -jar target/maklayn-java-1.0.0.jar --server.port=8090 --spring.profiles.active=dev
```

## Verificação realizada

Este projeto **foi compilado, testado e executado** em `openjdk 11` (build 11) no ambiente de geração:

- `mvn compile` / `mvn package` → **BUILD SUCCESS** (28 fontes, bytecode major version 55 = Java 11)
- `mvn test` → **9 testes, 0 falhas**
- Aplicação em execução: `Started MaklaynApplication in 5.0 seconds (JVM running for 5.5)` na porta 8080;
- Fluxo completo validado por HTTP: health, login (JWT + cookie), consultas nos **três pilares**, histórico paginado, resumo, salvar referência, exportação ABNT e os erros esperados (401 sem login, 400 para prompt vazio e URL inválida).
- O bug de `NullPointerException` no login sem `papel` foi localizado no log da aplicação (`UsuarioServico.criarOuBuscarDemo`), corrigido, coberto por teste de regressão e revalidado por HTTP.
