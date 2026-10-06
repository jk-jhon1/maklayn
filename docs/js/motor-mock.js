/**
 * =====================================================================
 *  MAKLAYN — Provedor SIMULADO (maklayn-mock)
 *
 *  Motor determinístico usado quando nenhuma chave de API está
 *  configurada. Ele NÃO é um LLM: é um gerador de respostas
 *  didáticas por template, que respeita a estrutura exigida pelo
 *  system prompt (código + explicação + trade-offs | redação ENEM
 *  completa | pesquisa com referências).
 *
 *  Serve para: desenvolvimento, testes, demonstração e avaliação da
 *  arquitetura sem custo de tokens.
 * =====================================================================
 */

const AVISO = (modelo) => `
---

> **⚙️ Motor simulado ativo (` + '`' + modelo + '`' + `).**
> Esta resposta foi montada pelo gerador determinístico do Maklayn, sem chamada a LLM.
> Para ativar inteligência real, defina \`AI_PROVIDER=gemini\` (ou \`openai\`) e a respectiva
> chave de API no arquivo \`.env\` — o restante do sistema continua idêntico.`;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const escape = (s = '') => String(s).replace(/\n+/g, ' ').trim();

function detectarLinguagem(texto = '') {
  const t = texto.toLowerCase();
  const mapa = [
    [['python', 'pandas', 'django', 'flask', 'fastapi', '.py'], 'python'],
    [['java ', 'spring', 'springboot', 'jvm', 'maven'], 'java'],
    [['javascript', 'js ', 'node', 'typescript', 'ts ', 'react', 'express', 'promise', 'async await'], 'javascript'],
    [['sql', 'select', 'join', 'banco de dados', 'mysql', 'postgres'], 'sql'],
    [['php', 'laravel', 'composer'], 'php'],
    [['c#', 'csharp', '.net', 'dotnet'], 'csharp'],
    [['c++', 'cpp'], 'cpp'],
    [['go ', 'golang'], 'go'],
    [['ruby', 'rails'], 'ruby']
  ];
  for (const [chaves, lang] of mapa) if (chaves.some((c) => t.includes(c))) return lang;
  return 'javascript';
}

function detectarTema(prompt = '') {
  return escape(prompt)
    .replace(/^(por favor[, ]*)?(me )?(ajude?|fa[aç]a|gere|crie|escreva|monte|explique|pesquise|sobre|um|uma)\s+/i, '')
    .replace(/[?？]+$/, '')
    .slice(0, 160) || 'o tema proposto';
}

/* ------------------------------------------------------------------ */
/* 1. PILAR: CÓDIGO                                                   */
/* ------------------------------------------------------------------ */

const RECEITAS = [
  {
    id: 'crud-rest',
    match: /crud|api rest|endpoint|rotas|restful|swagger/i,
    titulo: 'API REST completa com camadas (Controller → Service → Repository)',
    linguagem: 'javascript',
    codigo: `// src/modules/aluno/aluno.service.js
/**
 * Camada de SERVIÇO — regra de negócio isolada do HTTP e do banco.
 * Padrão aplicado: Repository + Service Layer (Clean Architecture leve).
 */
export class AlunoService {
  /** @param {import('./aluno.repository.js').AlunoRepository} repo */
  constructor(repo) {
    this.repo = repo;
  }

  /** Cria um aluno validando as regras de negócio antes de persistir. */
  async criar({ nome, email }) {
    if (!nome?.trim() || nome.trim().length < 3) {
      throw new Error('VALIDACAO: nome precisa ter ao menos 3 caracteres.');
    }
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email ?? '')) {
      throw new Error('VALIDACAO: e-mail inválido.');
    }
    if (await this.repo.buscarPorEmail(email)) {
      throw new Error('CONFLITO: e-mail já cadastrado.');
    }
    return this.repo.inserir({ nome: nome.trim(), email: email.toLowerCase() });
  }

  async listar({ pagina = 1, porPagina = 20 } = {}) {
    const limite = Math.min(Math.max(Number(porPagina) || 20, 1), 100); // sanidade
    const offset = (Math.max(Number(pagina) || 1, 1) - 1) * limite;
    const [itens, total] = await Promise.all([
      this.repo.listar({ limite, offset }),
      this.repo.contar()
    ]);
    return { itens, total, pagina: Number(pagina), paginas: Math.ceil(total / limite) };
  }
}

// src/modules/aluno/aluno.controller.js
import { Router } from 'express';

/** Controller fino: só traduz HTTP <-> domínio. */
export function criarRotasAluno(service) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try { res.json(await service.listar(req.query)); }
    catch (e) { next(e); }
  });

  router.post('/', async (req, res, next) => {
    try { res.status(201).json(await service.criar(req.body)); }
    catch (e) {
      if (e.message.startsWith('VALIDACAO')) return res.status(400).json({ erro: e.message });
      if (e.message.startsWith('CONFLITO')) return res.status(409).json({ erro: e.message });
      next(e);
    }
  });

  return router;
}`,
    comoFunciona: [
      'O **Controller** não contém regra de negócio: ele apenas converte HTTP em chamadas de método (`req.body` → `service.criar()`). Isso permite trocar Express por Fastify ou gRPC sem tocar no domínio.',
      'O **Service** concentra as invariantes: tamanho mínimo do nome, formato do e-mail e unicidade. Falhas viram erros tipados (`VALIDACAO:`, `CONFLITO:`) que o controller traduz para status HTTP corretos (400, 409).',
      'O **Repository** é uma abstração de persistência. O service depende da *interface*, não do MySQL — em teste você injeta um repositório em memória e roda tudo sem banco.',
      'O `Promise.all` paraleliza a busca de itens e a contagem total: como as duas consultas são independentes, o tempo total é o da mais lenta, não a soma das duas.',
      'A paginação é *clampada* (`Math.min`/`Math.max`) para impedir que um cliente malicioso peça `porPagina=1000000` e derrube o banco.'
    ],
    tradeoffs: [
      ['Camadas extras', 'Mais arquivos para um CRUD simples; ganho aparece quando há 2+ consumidores (web, mobile, bot).'],
      ['Paginação por OFFSET', 'Simples, mas degrada em tabelas gigantes — `OFFSET 500000` obriga o banco a varrer tudo. Alternativa: *keyset pagination* (`WHERE id > :ultimoId`).'],
      ['Erros por string', 'Rápido de escrever, frágil. Em produção troque por classes (`ValidationError`, `ConflictError`) e um middleware de erro central.'],
      ['Contagem em toda listagem', 'Gera um `COUNT(*)` a cada requisição; em tabelas grandes use contagem aproximada ou cache com TTL.']
    ],
    testes: [
      '`criar()` com nome de 2 caracteres → deve lançar `VALIDACAO`.',
      '`criar()` com e-mail duplicado → deve lançar `CONFLITO` e status 409.',
      '`listar({ porPagina: 999999 })` → deve retornar no máximo 100 itens.',
      '`listar({ pagina: 0 })` → deve tratar como página 1, sem `OFFSET` negativo.',
      'Requisição concorrente criando o mesmo e-mail → validar se há `UNIQUE` no banco como última linha de defesa (race condition).'
    ]
  },
  {
    id: 'ordenacao',
    match: /orden(a|e|ç)|sort|quicksort|mergesort|bubble|busca bin[aá]ria|complexidade/i,
    titulo: 'Algoritmos de ordenação comparados (Bubble / Quick / Merge)',
    linguagem: 'javascript',
    codigo: `/**
 * Três estratégias de ordenação lado a lado, com análise de complexidade.
 * Todas são puras: não mutam o array recebido.
 */

/** O(n²) — didático, inviável em produção acima de ~10k itens. */
function bubbleSort(arr) {
  const a = [...arr];
  for (let fim = a.length - 1; fim > 0; fim--) {
    let trocou = false;
    for (let i = 0; i < fim; i++) {
      if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; trocou = true; }
    }
    if (!trocou) break; // melhor caso O(n): já ordenado
  }
  return a;
}

/** O(n log n) médio, O(n²) no pior caso (pivô ruim). In-place. */
function quickSort(arr, ini = 0, fim = (arr.length - 1), a = [...arr]) {
  if (ini >= fim) return a;
  const pivo = a[fim];
  let p = ini;
  for (let i = ini; i < fim; i++) {
    if (a[i] <= pivo) { [a[p], a[i]] = [a[i], a[p]]; p++; }
  }
  [a[p], a[fim]] = [a[fim], a[p]];
  quickSort(a, ini, p - 1, a);
  quickSort(a, p + 1, fim, a);
  return a;
}

/** O(n log n) garantido, estável, porém usa O(n) de memória extra. */
function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const meio = arr.length >> 1;
  const esq = mergeSort(arr.slice(0, meio));
  const dir = mergeSort(arr.slice(meio));
  const out = [];
  let i = 0, j = 0;
  while (i < esq.length && j < dir.length) out.push(esq[i] <= dir[j] ? esq[i++] : dir[j++]);
  return out.concat(esq.slice(i), dir.slice(j));
}`,
    comoFunciona: [
      '**Bubble Sort** compara vizinhos e "empurra" o maior para o fim a cada passagem. A flag `trocou` faz o melhor caso (array já ordenado) parar na primeira passagem: O(n).',
      '**Quick Sort** escolhe um pivô e particiona o array em "menores ou iguais" e "maiores". A recursão não cria arrays novos: o particionamento é *in-place*, trocando elementos no próprio vetor.',
      '**Merge Sort** divide até sobrar 1 elemento e intercala os pares já ordenados. É **estável** (empates mantêm a ordem original) e tem pior caso garantido de O(n log n).'
    ],
    tradeoffs: [
      ['Bubble O(n²)', 'Só para ensino ou arrays < 50 elementos.'],
      ['Quick Sort O(n log n) médio', 'Melhor desempenho na prática (cache-friendly), mas o pior caso O(n²) exige pivô aleatório ou mediana-de-três.'],
      ['Merge Sort O(n log n) garantido', 'Previsível e estável, mas aloca O(n) de memória — ruim em sistemas embarcados.'],
      ['Estabilidade', 'Importante ao ordenar objetos por múltiplos critérios em sequência: só Merge/Tim Sort preservam a ordem anterior.']
    ],
    testes: [
      'Array vazio e array de 1 elemento → retornam sem erro.',
      'Array já ordenado → Bubble deve sair na primeira passagem (meça com contador de comparações).',
      'Array em ordem inversa (pior caso do Quick) → confirme que não estoura a pilha de recursão.',
      'Elementos duplicados → verificar estabilidade do Merge Sort.',
      '10.000 itens aleatórios → comparar `performance.now()` entre os três (Bubble será ordens de magnitude mais lento).'
    ]
  },
  {
    id: 'mysql',
    match: /mysql|select|join|sql|banco de dados|tabela|consulta|indexar|[íi]ndice/i,
    titulo: 'SQL: índice, JOIN e otimização de consultas',
    linguagem: 'sql',
    codigo: `-- Cenário: histórico de consultas do Maklayn por usuário.
-- PROBLEMA: consulta lenta em tabela com milhões de linhas.

-- 1) O índice composto. A ORDEM das colunas importa:
--    primeiro a igualdade (id_usuario), depois o range/ordenação (data_hora).
CREATE INDEX idx_hist_usuario_data
  ON Historico_Consultas (id_usuario, data_hora DESC);

-- 2) A consulta usa o índice como "covering index" (nada de ler a tabela).
EXPLAIN ANALYZE
SELECT  h.id_consulta,
        h.tipo_consulta,
        LEFT(h.prompt_usuario, 80) AS resumo_prompt,
        h.data_hora
FROM    Historico_Consultas h
WHERE   h.id_usuario = 42
  AND   h.data_hora >= NOW() - INTERVAL 30 DAY
ORDER BY h.data_hora DESC
LIMIT   20;

-- 3) Agregação com JOIN eficiente: só os usuários ativos entram na conta.
SELECT  u.nome_completo,
        COUNT(h.id_consulta)                                  AS consultas,
        ROUND(AVG(h.latencia_ms))                             AS latencia_media_ms,
        SUM(h.tipo_consulta = 'Redacao')                      AS redacoes
FROM    Usuarios u
JOIN    Historico_Consultas h ON h.id_usuario = u.id_usuario
WHERE   u.ativo = 1
  AND   h.data_hora >= NOW() - INTERVAL 90 DAY
GROUP BY u.id_usuario, u.nome_completo
HAVING  consultas > 5
ORDER BY consultas DESC
LIMIT   10;`,
    comoFunciona: [
      'Um índice B-Tree funciona como o índice remissivo de um livro: em vez de ler todas as páginas (full table scan), o banco salta direto para o intervalo procurado. A coluna `Extra` do `EXPLAIN` mostrando `Using index` significa que a resposta saiu só do índice.',
      'A regra de ouro do índice composto é **"igualdade antes de ordenação"**. Com `(id_usuario, data_hora)`, o banco filtra o usuário e já entrega as datas ordenadas — sem `filesort`. Se a ordem fosse invertida, o índice seria praticamente inútil para esta query.',
      '`LIMIT 20` combinado com índice ordenado ativa a leitura *early termination*: o MySQL para de varrer ao atingir a 20ª linha em vez de ler as 30 mil do período.',
      '`SUM(h.tipo_consulta = \'Redacao\')` explora a avaliação booleana do MySQL (1 ou 0) — evita um `CASE WHEN` e é ligeiramente mais rápido.'
    ],
    tradeoffs: [
      ['Índice acelera leitura, encarece escrita', 'Cada INSERT/UPDATE precisa atualizar todos os índices. Não indexe tudo: meça com `EXPLAIN` antes e depois.'],
      ['Índice composto ≠ vários índices simples', 'Um `(a, b)` serve para `WHERE a` e `WHERE a AND b`, mas não para `WHERE b` sozinho.'],
      ['LEFT() no SELECT', 'Traz só um resumo, evitando transferir textos longos (o maior gargalo costuma ser rede, não CPU).'],
      ['LIKE \'%termo%\'', 'Não usa índice. Para busca textual real, avalie `FULLTEXT` ou um motor dedicado (Elasticsearch/Meilisearch).']
    ],
    testes: [
      'Rode `EXPLAIN` antes e depois do índice e compare `rows` e `type` (deve sair de `ALL` para `range`/`ref`).',
      'Insira 1M de linhas de teste e compare o tempo com e sem índice.',
      'Verifique se `SHOW INDEX FROM Historico_Consultas` lista o índice com `Cardinality` coerente.',
      'Teste o plano com `ORDER BY data_hora ASC` — o índice DESC não serve para ASC, e você verá `filesort` no plano.',
      'Monitore `Handler_read_next` no `SHOW STATUS` para confirmar a redução de leituras.'
    ]
  },
  {
    id: 'login',
    match: /login|autentica|jwt|token|oauth|senha|hash|sess[aã]o|auth/i,
    titulo: 'Autenticação: hash de senha (scrypt) e sessão JWT',
    linguagem: 'javascript',
    codigo: `import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const N = 16384, r = 8, p = 1, KEYLEN = 64; // custo do scrypt (~100ms por hash)

/** Gera "scrypt$N$r$p$salt$hash" — formato autodescritivo, fácil de migrar. */
export async function hashSenha(senha) {
  const salt = randomBytes(16);                       // salt único por usuário
  const derivada = await scryptAsync(senha, salt, KEYLEN, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64'), derivada.toString('base64')].join('$');
}

/** Compara em tempo constante para não vazar informação por timing. */
export async function verificarSenha(senha, armazenado) {
  const [algo, n, R, P, saltB64, hashB64] = armazenado.split('$');
  if (algo !== 'scrypt') throw new Error('Algoritmo de hash desconhecido');
  const salt = Buffer.from(saltB64, 'base64');
  const esperado = Buffer.from(hashB64, 'base64');
  const derivada = await scryptAsync(senha, salt, esperado.length,
    { N: Number(n), r: Number(R), p: Number(P) });
  return timingSafeEqual(esperado, derivada);
}

/** JWT HS256 assinado com a Web Crypto — sem dependência externa. */
export function assinarJWT(payload, segredo, expiraEmSegundos = 7200) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { ...payload, iat: agora, exp: agora + expiraEmSegundos };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const semAssinatura = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(corpo);
  const assinatura = createHmac('sha256', segredo).update(semAssinatura).digest('base64url');
  return semAssinatura + '.' + assinatura;
}`,
    comoFunciona: [
      '**Nunca guarde a senha.** O `scrypt` deriva uma chave de 64 bytes usando o salt. Salt único por usuário impede *rainbow tables*; o custo de memória (N=16384) inviabiliza ataques com GPU.',
      'O formato `scrypt$N$r$p$salt$hash` é **autodescritivo**: quando o hardware evoluir e você aumentar o N, os hashes antigos continuam verificáveis porque os parâmetros vão guardados junto.',
      '`timingSafeEqual` compara em tempo constante. Um `===` comum para no primeiro byte divergente e vaza, pelo tempo de resposta, quantos bytes o atacante acertou.',
      'O **JWT** tem três partes: cabeçalho, payload e assinatura HMAC. A assinatura garante *integridade*, não *sigilo* — qualquer um lê o payload em base64. Nunca coloque dado sensível ali.'
    ],
    tradeoffs: [
      ['scrypt vs bcrypt vs argon2', 'Argon2id é o estado da arte (vencedor da Password Hashing Competition); scrypt é nativo no Node e não exige dependência nativa.'],
      ['JWT vs sessão em banco', 'JWT dispensa consulta ao banco a cada requisição, mas **não pode ser revogado** antes de expirar. Sessão em banco é revogável, porém exige I/O.'],
      ['Access + refresh token', 'Access curto (15 min) + refresh longo e rotativo reduz o dano de vazamento — o padrão recomendado para produção.'],
      ['LocalStorage vs cookie httpOnly', 'Token em `localStorage` é vulnerável a XSS. Cookie `httpOnly; Secure; SameSite=Strict` protege contra XSS e CSRF simultaneamente.']
    ],
    testes: [
      'Hash da mesma senha duas vezes → resultados diferentes (salt aleatório), mas ambos verificam.',
      'Senha errada → `verificarSenha` retorna `false` sem lançar exceção.',
      'Payload adulterado → a verificação da assinatura deve falhar.',
      'Token expirado → `exp` no passado deve ser rejeitado pelo middleware.',
      'Medir o tempo de resposta de verificação: deve ser estável (~100ms) mesmo para senhas inexistentes, evitando enumeração de usuários.'
    ]
  }
];

function respostaCodigo({ prompt, modelo }) {
  const tema = detectarTema(prompt);
  const receita = RECEITAS.find((r) => r.match.test(prompt)) ?? null;
  const lang = receita?.linguagem ?? detectarLinguagem(prompt);

  if (receita) {
    return `## 💻 ${receita.titulo}

> **Pedido:** ${escape(prompt)}

**Linguagem:** \`${receita.linguagem}\` · **Padrão de projeto:** camadas isoladas / algoritmo com análise de complexidade

### Implementação

\`\`\`${receita.linguagem}
${receita.codigo}
\`\`\`

### Como funciona

${receita.comoFunciona.map((p, i) => `${i + 1}. ${p}`).join('\n')}

### Complexidade e trade-offs

| Decisão | Ganho | Custo / alternativa |
| --- | --- | --- |
${receita.tradeoffs.map(([a, b]) => `| **${a}** | ${b} | — |`).join('\n')}

### Testes sugeridos

${receita.testes.map((t) => `- [ ] ${t}`).join('\n')}
` + AVISO(modelo);
  }

  // Fallback genérico: estrutura de solução profissional para o tema pedido.
  return `## 💻 Solução de engenharia para: ${tema}

> **Pedido:** ${escape(prompt)}
> **Linguagem sugerida:** \`${lang}\`

### 1. Modelagem do problema

| Item | Definição |
| --- | --- |
| **Entrada** | ${tema} |
| **Saída esperada** | Resultado determinístico, validado e testável |
| **Restrições** | Legibilidade, segurança, custo de memória previsível |
| **Padrão de projeto** | \`Strategy\` para variar a regra + \`Repository\` para isolar a persistência |

### 2. Esqueleto de código

\`\`\`javascript
/**
 * Esqueleto inicial para: ${tema}
 * Princípios aplicados: responsabilidade única, injeção de dependência,
 * funções puras e falha explícita (throw em vez de retorno silencioso).
 */

/** Contrato da regra de negócio — trocar de implementação não afeta o resto. */
export class Regra${lang === 'javascript' ? '' : 'Negocio'} {
  #dependencias;

  constructor(dependencias = {}) {
    this.#dependencias = dependencias;   // injeção: testável sem mocks globais
  }

  /** Ponto único de entrada — valida, executa e devolve resultado imutável. */
  executar(entrada) {
    const dados = this.validar(entrada);
    const resultado = this.processar(dados);
    return Object.freeze({ ok: true, resultado, processadoEm: new Date().toISOString() });
  }

  validar(entrada) {
    if (entrada == null) throw new TypeError('Entrada obrigatória não informada.');
    return entrada;
  }

  processar(dados) {
    // TODO: aplicar a regra específica de "${tema}"
    return dados;
  }
}
\`\`\`

### 3. Como funciona

1. A **validação vem antes do processamento**: erros de entrada são baratos; erros descobertos no meio do cálculo custam caro para depurar.
2. O **construtor recebe dependências** em vez de criar as suas. Isso permite injetar um banco falso no teste e rodar a suíte em milissegundos.
3. \`Object.freeze\` no retorno impede que quem chama altere o resultado por acidente — efeito colateral silencioso é a origem mais comum de bug em produção.
4. As **exceções são o caminho de erro**; o caminho feliz é o retorno normal. Nunca devolver \`null\` para "deu algo errado".

### 4. Complexidade e trade-offs

| Cenário | Complexidade | Comentário |
| --- | --- | --- |
| Sem cache | O(n) | Uma varredura por chamada |
| Com cache em memória | O(1) amortizado | Cresce em memória; precisa de política de expiração (LRU) |
| Precisão estrita | O(n log n) | Necessário se a ordenação for parte do resultado |

### 5. Testes sugeridos

- [ ] Entrada nula/\`undefined\` → \`TypeError\` claro.
- [ ] Caso feliz com dado real → resultado esperado.
- [ ] Caso de borda (coleção vazia, string vazia, número negativo) → comportamento definido.
- [ ] Teste de regressão antes de refatorar.

> 💡 **Quer o código já pronto para um caso específico?** Descreva a entrada, a saída esperada e o erro atual. Com um provedor real configurado (\`AI_PROVIDER\`), o Maklayn gera o código executável direto.
` + AVISO(modelo);
}

/* ------------------------------------------------------------------ */
/* 2. PILAR: REDAÇÃO ENEM                                              */
/* ------------------------------------------------------------------ */

const REPERTORIOS = [
  'a Constituição Federal de 1988, que no artigo 205 estabelece a educação como direito de todos',
  'o sociólogo Zygmunt Bauman e o conceito de "modernidade líquida"',
  'o Relatório Anual do Fórum Brasileiro de Segurança Pública',
  'a filósofa Hannah Arendt, para quem a "banalidade do mal" decorre da ausência de reflexão crítica',
  'o educador Paulo Freire, que defende a educação como ato de liberdade',
  'dados do IBGE e da PNAD Contínua sobre desigualdade no acesso à informação',
  'o conceito de "sociedade disciplinar" de Michel Foucault',
  'a Declaração Universal dos Direitos Humanos (ONU, 1948)'
];

function respostaRedacao({ prompt, modelo }) {
  const tema = detectarTema(prompt);
  const r = REPERTORIOS;

  return `## ✍️ Redação padrão ENEM

**Tema:** ${tema}

---

### Proposta de redação

> A partir do tema acima, produza uma redação dissertativo-argumentativa completa com introdução, dois desenvolvimentos e conclusão, defendendo um ponto de vista apoiado em repertório sociocultural.

---

### Texto

A discussão sobre **${tema}** ocupa posição central no debate público brasileiro contemporâneo, uma vez que atravessa a garantia de direitos fundamentais e a própria noção de cidadania. Nesse sentido, ${r[0]} — dispositivo legal que assegura a formação integral do indivíduo — evidencia que o Estado tem o dever de atuar sobre essa realidade. Não obstante, o cenário observado na prática segue distante do previsto em lei, o que revela um problema estrutural cuja superação exige a articulação entre poder público e sociedade civil.

Em primeiro plano, convém analisar a **omissão do poder público** como fator determinante para a permanência de tal impasse. ${r[4]}, ao afirmar que a leitura crítica do mundo antecede a leitura da palavra, demonstra que a ausência de políticas educacionais efetivas reduz a capacidade de intervenção consciente do cidadão. Desse modo, quando o acesso à informação de qualidade não se universaliza, a população passa a se posicionar sobre a questão sem os subsídios necessários, o que perpetua a desigualdade e naturaliza ${tema} como uma circunstância imutável, e não como problema político.

Além disso, cabe destacar o papel desempenhado pela **desigualdade socioeconômica** na manutenção desse quadro. ${r[1]} ao descrever a "modernidade líquida" esclarece como os laços sociais, na contemporaneidade, se tornam frágeis e provisórios — o que fragiliza o engajamento coletivo em torno de causas comuns. Somado a isso, os dados da PNAD Contínua demonstram que o acesso a serviços essenciais ainda é distribuído de forma desigual pelo território nacional, de modo que os grupos socialmente vulnerabilizados enfrentam a dimensão mais severa do problema. Essa dinâmica transforma uma questão coletiva em vulnerabilidade individualizada, reduzindo a pressão social por mudanças.

Portanto, medidas concretas são indispensáveis para reverter esse cenário. Cabe ao **Ministério da Educação**, em parceria com as **secretarias estaduais de educação**, **implementar** um programa permanente de formação crítica — por meio de **oficinas curriculares obrigatórias, materiais didáticos atualizados e plataformas digitais de acesso gratuito**, articulado com universidades públicas e organizações da sociedade civil. Essa ação deve ter como **finalidade** ampliar a consciência cidadã da população sobre ${tema}, garantindo que o direito previsto na Constituição se efetive. Com isso, espera-se **formar cidadãos capazes de identificar, questionar e transformar** a realidade em que estão inseridos, de modo que o Brasil avance na consolidação de uma sociedade efetivamente democrática e igualitária.

---

### Checklist das 5 Competências

| Competência | O que avaliar no texto | Nota sugerida |
| --- | --- | --- |
| **1. Norma-padrão** | Gramática, concordância, pontuação e ortografia impecáveis; registro formal sem marcas de oralidade. | **200** |
| **2. Compreensão do tema** | Tema delimitado, abordagem dissertativo-argumentativa sem tangenciar o recorte proposto. | **200** |
| **3. Projeto de texto** | Introdução com tese, dois desenvolvimentos com tópico frasal e conclusão fechando o raciocínio; conectivos variados (*Nesse sentido, Não obstante, Em primeiro plano, Além disso, Portanto*). | **200** |
| **4. Coesão e repertório** | Repertório legitimado e **pertinente** (Constituição, Paulo Freire, Bauman, PNAD), sempre ligado ao argumento — nunca decorativo. | **160–200** |
| **5. Proposta de intervenção** | Agente (*Ministério da Educação*), Ação (*programa de formação*), Meio/Modo (*oficinas, materiais, plataformas*), Finalidade (*ampliar consciência*) e Detalhamento (*parceria com universidades*). | **200** |

**Projeção de nota: 960–1000** — desde que preservados norma-padrão e ausência de clichês como "desde os tempos remotos".

> ⚠️ **Atenção:** este texto é um *modelo estrutural* gerado pelo motor simulado, montado a partir do tema informado. Com \`AI_PROVIDER=gemini\` ou \`openai\` configurado, o Maklayn escreve uma redação **original e sob medida** para o seu recorte temático.
` + AVISO(modelo);
}

/* ------------------------------------------------------------------ */
/* 3. PILAR: PESQUISA                                                  */
/* ------------------------------------------------------------------ */

const BIBLIOTECA = {
  educacao: {
    titulo: 'Educação no Brasil',
    evidencias: 'Segundo o Censo Escolar do INEP, o Brasil conta com cerca de 47 milhões de matrículas na educação básica. O índice de aprendizado adequado em Matemática no 9º ano, porém, permanece abaixo de 20% na rede pública, conforme o SAEB — dado que expõe a distância entre acesso e qualidade.',
    refs: [
      ['INEP — Instituto Nacional de Estudos e Pesquisas Educacionais', 'https://www.gov.br/inep/pt-br'],
      ['SciELO — artigos revisados por pares em educação', 'https://www.scielo.br/'],
      ['Banco de Teses e Dissertações da CAPES', 'https://catalogodeteses.capes.gov.br/']
    ]
  },
  tecnologia: {
    titulo: 'Tecnologia e Inteligência Artificial',
    evidencias: 'A documentação oficial do Google identifica a IA generativa como sistemas capazes de produzir conteúdo original a partir de padrões estatísticos aprendidos. Do ponto de vista jurídico, o PL 2338/2023 (Marco Legal da IA no Brasil) propõe classificação de riscos dos sistemas, inspirado no AI Act europeu.',
    refs: [
      ['Documentação oficial do Google AI for Developers', 'https://ai.google.dev/'],
      ['MDN Web Docs — referência técnica para web', 'https://developer.mozilla.org/pt-BR/'],
      ['Senado Federal — Marco Legal da IA (PL 2338/2023)', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/157233']
    ]
  },
  seguranca: {
    titulo: 'Segurança pública no Brasil',
    evidencias: 'O Anuário Brasileiro de Segurança Pública (FBSP) é a principal compilação independente de dados do setor, reunindo registros das 27 unidades federativas. O IPEA, por sua vez, publica séries históricas sobre criminalidade e sistema prisional, permitindo análise longitudinal.',
    refs: [
      ['Fórum Brasileiro de Segurança Pública — Anuários', 'https://forumseguranca.org.br/'],
      ['IPEA — Instituto de Pesquisa Econômica Aplicada', 'https://www.ipea.gov.br/']
    ]
  },
  saude: {
    titulo: 'Saúde pública e saúde mental',
    evidencias: 'O Ministério da Saúde mantém séries do DATASUS, com dados de mortalidade, internações e cobertura de atenção primária. A OMS estima que cerca de 1 em cada 8 pessoas no mundo vive com algum transtorno mental, o que sustenta a defesa de políticas públicas de saúde mental.',
    refs: [
      ['DATASUS — Departamento de Informática do SUS', 'https://datasus.saude.gov.br/'],
      ['Organização Pan-Americana da Saúde / OMS', 'https://www.paho.org/pt'],
      ['SciELO Saúde Pública', 'https://www.scielo.br/']
    ]
  },
  geral: {
    titulo: 'Pesquisa acadêmica multidisciplinar',
    evidencias: 'A produção científica brasileira responde por cerca de 2% dos artigos indexados mundialmente (Scopus), concentrada principalmente nas áreas de saúde, ciências agrárias e exatas. A busca sistemática exige combinar bases indexadas com repositórios de teses, para reduzir viés de seleção.',
    refs: [
      ['Google Acadêmico — busca em literatura revisada', 'https://scholar.google.com.br/'],
      ['SciELO Brasil — coleção de periódicos revisados por pares', 'https://www.scielo.br/'],
      ['Portal de Periódicos da CAPES', 'https://www.periodicos.capes.gov.br/'],
      ['IBGE — dados oficiais brasileiros', 'https://www.ibge.gov.br/'],
      ['Biblioteca Digital do Senado Federal', 'https://www2.senado.leg.br/bdsf/']
    ]
  }
};

function detectarArea(prompt = '') {
  const t = prompt.toLowerCase();
  if (/educa|escola|enem|ensino|professor|aluno|aprendiz|universidade/.test(t)) return 'educacao';
  if (/tecnolog|intelig[êe]ncia artificial|ia\b|software|internet|dados|algoritm|digital|celular|redes sociais/.test(t)) return 'tecnologia';
  if (/seguran|crime|criminal|viol[êe]ncia|polícia|carcer/.test(t)) return 'seguranca';
  if (/sa[úu]de|doen|mental|sus|vacina|hospital|epidemi/.test(t)) return 'saude';
  return 'geral';
}

function respostaPesquisa({ prompt, modelo }) {
  const tema = detectarTema(prompt);
  const area = BIBLIOTECA[detectarArea(prompt)];
  const ano = new Date().getFullYear();

  return `## 🔎 ${tema}

**Resposta direta:** ${tema} é um objeto de estudo consolidado nas ciências humanas e sociais aplicadas, com evidências disponíveis em bases oficiais de dados e periódicos revisados por pares. Abaixo estão os fundamentos, as evidências e as fontes para a consulta acadêmica.

### Contexto e conceitos-chave

| Dimensão | Descrição sintética |
| --- | --- |
| **Natureza** | Fenômeno multifatorial: precisa ser analisado por dados quantitativos e interpretação qualitativa. |
| **Área de concentração** | ${area.titulo} |
| **Bases de dados prioritárias** | IBGE, IPEA, INEP, DATASUS, SciELO e Google Acadêmico — conforme a área. |
| **Nível de consenso** | Existe consenso sobre a existência e a relevância do fenômeno; **divergência** sobre a magnitude e as melhores soluções de política pública. |

### Evidências

${area.evidencias}

Complementarmente, em uma revisão sistemática é recomendável:
1. Fixar as palavras-chave em português **e** inglês (a maior parte da literatura está em inglês).
2. Definir critérios de inclusão/exclusão *antes* da busca, para evitar viés de confirmação.
3. Triangular fontes: dado oficial (IBGE/INEP/IPEA) + artigo revisado por pares + documento normativo.

> ⚠️ **Ponto em debate:** a interpretação causal e a eficácia das políticas propostas variam entre autores. Sinalize sempre no seu trabalho quando a afirmação for **consenso** e quando for **hipótese**.

### Referências

${area.refs.map(([titulo, url], i) => `${i + 1}. **${titulo}**. Disponível em: <${url}>. Acesso em: ${new Date().toLocaleDateString('pt-BR')}.`).join('\n')}

*Citação no padrão ABNT:* conforme orienta a NBR 6023, referências de mídia eletrônica exigem o endereço disponível entre os sinais \`< >\`, precedido de "Disponível em:" e seguido de "Acesso em:".

### Como citar esta resposta no seu trabalho

> MAKLAYN. Assistente de Inteligência Artificial Multidisciplinar. *${tema}*. ${ano}. Resposta gerada em resposta a consulta do usuário.

**Sugestão de recorte para trabalho acadêmico:** delimite o fenômeno a uma unidade de análise concreta (um estado, uma faixa etária, um período de ${ano - 10}–${ano}) — isso transforma um tema amplo em pergunta de pesquisa respondível.

> 💡 Motor simulado: os links acima apontam para **portais oficiais reais** (INEP, IBGE, SciELO, FBSP, DATASUS, Google Acadêmico). Com \`AI_PROVIDER\` real configurado, o Maklayn produz a síntese específica do seu recorte e indica as obras exatas.
` + AVISO(modelo);
}

/* ------------------------------------------------------------------ */
/* API pública do provedor                                            */
/* ------------------------------------------------------------------ */

/** Latência artificial para reproduzir o comportamento de streaming real. */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export const meta = {
  id: 'mock',
  rotulo: 'Maklayn Simulado',
  modeloPadrao: 'maklayn-mock-v1'
};

export async function gerar({ prompt, modo = 'Pesquisa', modelo = meta.modeloPadrao }) {
  const inicio = Date.now();
  await delay(350 + Math.random() * 450); // simula latência de rede

  let texto;
  if (modo === 'Codigo') texto = respostaCodigo({ prompt, modelo });
  else if (modo === 'Redacao') texto = respostaRedacao({ prompt, modelo });
  else texto = respostaPesquisa({ prompt, modelo });

  return {
    texto,
    modelo,
    tokens: Math.round(texto.length / 4),
    latencia_ms: Date.now() - inicio
  };
}

export default { meta, gerar };
