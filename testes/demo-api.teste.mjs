/**
 * =====================================================================
 *  MAKLAYN — Teste do adaptador de demonstração estática
 * =====================================================================
 *
 *  Executa o adaptador `docs/js/demo-api.js` fora do navegador
 *  (simulando `localStorage`/`sessionStorage`) e verifica os mesmos
 *  endpoints que a interface consome.
 *
 *  Rodar:  node testes/demo-api.teste.mjs    (ou: npm run teste:demo)
 * =====================================================================
 */

function criarStorage() {
  const dados = new Map();
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
    clear: () => dados.clear()
  };
}
globalThis.localStorage = criarStorage();
globalThis.sessionStorage = criarStorage();
globalThis.window = globalThis;

const urlAdaptador = new URL('../docs/js/demo-api.js', import.meta.url);
await import(urlAdaptador.href);

const chamar = async (caminho, opcoes = {}) => {
  const r = await fetch(`/api${caminho}`, {
    method: opcoes.method || 'GET',
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });
  const tipo = r.headers.get('Content-Type') || '';
  const dados = tipo.includes('json') ? await r.json() : await r.text();
  return { status: r.status, dados };
};

let falhas = 0;
const verificar = (nome, condicao, detalhe = '') => {
  console.log(`  ${condicao ? '✔' : '✖'} ${nome}${detalhe ? '  → ' + detalhe : ''}`);
  if (!condicao) falhas++;
};

console.log('\n=== 1. ROTAS PÚBLICAS ===');
let r = await chamar('/health');
verificar('GET /health', r.status === 200 && r.dados.banco.status === 'ok', `${r.dados.ia.rotulo} · banco ${r.dados.banco.cliente}`);
r = await chamar('/status');
verificar('GET /status', r.status === 200 && r.dados.modos.length === 3, `modos: ${r.dados.modos.join(', ')}`);
r = await chamar('/prompt');
verificar('GET /prompt', r.status === 200 && r.dados.system_prompt.includes('Multidisciplinar'), `${r.dados.system_prompt.length} caracteres`);
r = await chamar('/auth/config');
verificar('GET /auth/config', r.status === 200 && r.dados.demo === true && r.dados.google.configurado === false);
r = await chamar('/auth/eu');
verificar('GET /auth/eu (anônimo)', r.status === 200 && r.dados.autenticado === false);

console.log('\n=== 2. EXIGÊNCIA DE LOGIN ===');
r = await chamar('/consultas');
verificar('GET /consultas sem sessão → 401', r.status === 401 && r.dados.erro === 'NAO_AUTENTICADO');

console.log('\n=== 3. LOGIN DE DEMONSTRAÇÃO ===');
r = await chamar('/auth/demo', { method: 'POST', body: { nome: 'Ana Souza', email: 'ana@exemplo.com' } });
verificar('POST /auth/demo', r.status === 200 && r.dados.usuario.nome_completo === 'Ana Souza', `papel: ${r.dados.usuario.papel}`);
r = await chamar('/auth/demo', { method: 'POST', body: { email: 'ana@exemplo.com' } });   // sem nome e sem papel
verificar('login sem nome/papel (caso do bug corrigido)', r.status === 200 && r.dados.usuario.papel === 'aluno', `nome: ${r.dados.usuario.nome_completo}`);
r = await chamar('/auth/sair', { method: 'POST' });
r = await chamar('/auth/demo', { method: 'POST', body: { nome: 'Dev Teste', email: 'dev@exemplo.com', papel: 'dev' } });
verificar('perfil "dev" é preservado (não vira aluno)', r.dados.usuario.papel === 'dev', `papel: ${r.dados.usuario.papel}`);
r = await chamar('/auth/sair', { method: 'POST' });
r = await chamar('/auth/demo', { method: 'POST', body: { nome: 'Novo', email: 'novo@exemplo.com', papel: 'inexistente' } });
verificar('perfil inválido → aluno (conta nova)', r.dados.usuario.papel === 'aluno', `papel: ${r.dados.usuario.papel}`);
r = await chamar('/auth/demo', { method: 'POST', body: { email: 'dev@exemplo.com', papel: 'aluno' } });
verificar('conta existente mantém o próprio perfil', r.dados.usuario.papel === 'dev', `papel: ${r.dados.usuario.papel}`);
r = await chamar('/auth/sair', { method: 'POST' });
r = await chamar('/auth/demo', { method: 'POST', body: { nome: 'Ana Souza', email: 'ana@exemplo.com' } });
r = await chamar('/auth/demo', { method: 'POST', body: { email: 'invalido' } });
verificar('e-mail inválido → 400', r.status === 400 && r.dados.erro === 'EMAIL_INVALIDO');
r = await chamar('/auth/demo', { method: 'POST', body: { nome: 'Ana Souza', email: 'ana@exemplo.com' } });
r = await chamar('/auth/eu');
verificar('GET /auth/eu (autenticado)', r.status === 200 && r.dados.autenticado === true, r.dados.usuario.email);

console.log('\n=== 4. OS TRÊS PILARES ===');
const prompts = {
  Codigo: 'Como estruturar um microsserviço em Node.js?',
  Redacao: 'Redação sobre os desafios da educação digital no Brasil',
  Pesquisa: 'Quais são os dados mais recentes sobre analfabetismo no Brasil?'
};
const criadas = {};
for (const [modo, prompt] of Object.entries(prompts)) {
  const inicio = Date.now();
  r = await chamar('/consultas', { method: 'POST', body: { prompt, modo } });
  const c = r.dados.consulta;
  criadas[modo] = c;
  verificar(`${modo}`, r.status === 201 && c.resposta_ia.length > 500 && c.tipo_consulta === modo,
    `${c.resposta_ia.length} caracteres em ${Date.now() - inicio}ms · ${c.tokens_usados} tokens · ${c.referencias_detectadas.length} referências`);
}
verificar('Pesquisa detecta referências', criadas.Pesquisa.referencias_detectadas.length > 0,
  criadas.Pesquisa.referencias_detectadas.slice(0, 2).map((x) => x.titulo_link).join(', '));
r = await chamar('/consultas', { method: 'POST', body: { prompt: 'oi' } });
verificar('prompt curto → 400', r.status === 400 && r.dados.erro === 'PROMPT_INVALIDO');
r = await chamar('/consultas', { method: 'POST', body: { prompt: 'Explique Domain-Driven Design', modo: 'Inexistente' } });
verificar('modo inválido → pilar recomendado', r.status === 201 && ['Codigo','Redacao','Pesquisa'].includes(r.dados.consulta.tipo_consulta), `escolheu: ${r.dados.consulta.tipo_consulta}`);
r = await chamar('/consultas', { method: 'POST', body: { prompt: 'texto dissertativo para o ENEM', modo: 'redação' } });
verificar('alias "redação" → Redacao', r.status === 201 && r.dados.consulta.tipo_consulta === 'Redacao');
r = await chamar('/recomendar-modo', { method: 'POST', body: { texto: 'preciso de uma redacao com proposta de intervencao para o enem' } });
verificar('POST /recomendar-modo', r.status === 200 && r.dados.modo === 'Redacao', `modo: ${r.dados.modo} · placar: ${JSON.stringify(r.dados.placar)}`);

console.log('\n=== 5. HISTÓRICO E MÉTRICAS ===');
r = await chamar('/consultas?pagina=1&limite=2');
verificar('GET /consultas (paginado)', r.status === 200 && r.dados.itens.length === 2 && r.dados.total >= 5, `total ${r.dados.total}, página ${r.dados.pagina}`);
verificar('item traz resumo do prompt', typeof r.dados.itens[0].resumo_prompt === 'string' && r.dados.itens[0].tamanho_resposta > 0);
r = await chamar('/consultas/resumo');
verificar('GET /consultas/resumo', r.status === 200 && r.dados.total >= 5 && r.dados.por_pilar.Codigo >= 1,
  `latência média ${r.dados.latencia_media_ms}ms · ${JSON.stringify(r.dados.por_pilar)}`);
verificar('placar só tem os 3 pilares (regressão do "[object Object]")',
  Object.keys(r.dados.por_pilar).every((k) => ['Codigo', 'Redacao', 'Pesquisa'].includes(k)),
  Object.keys(r.dados.por_pilar).join(', '));
r = await chamar(`/consultas/${criadas.Codigo.id_consulta}`);
verificar('GET /consultas/:id', r.status === 200 && r.dados.consulta.id_consulta === criadas.Codigo.id_consulta);
r = await chamar('/consultas/99999');
verificar('consulta inexistente → 404', r.status === 404);

console.log('\n=== 6. REFERÊNCIAS E ABNT ===');
r = await chamar('/referencias', { method: 'POST', body: { titulo_link: 'INEP', url_referencia: 'https://www.gov.br/inep/pt-br' } });
verificar('POST /referencias', r.status === 201 && r.dados.referencia.titulo_link === 'INEP');
await chamar('/referencias', { method: 'POST', body: { url_referencia: 'https://www.ibge.gov.br' } });
r = await chamar('/referencias', { method: 'POST', body: { url_referencia: 'nao-e-url' } });
verificar('URL inválida → 400', r.status === 400 && r.dados.erro === 'URL_INVALIDA');
r = await chamar('/referencias');
verificar('GET /referencias', r.status === 200 && r.dados.total === 2, `título automático: ${r.dados.itens[0].titulo_link}`);
r = await chamar('/referencias/abnt');
verificar('GET /referencias/abnt', r.status === 200 && /^\d+\. /.test(r.dados), r.dados.split('\n')[0]);
r = await chamar(`/referencias/${r.dados ? 1 : 1}`, { method: 'DELETE' });
verificar('DELETE /referencias/:id', r.status === 200 && r.dados.removidas === 1);
r = await chamar(`/consultas/${criadas.Redacao.id_consulta}`, { method: 'DELETE' });
verificar('DELETE /consultas/:id', r.status === 200 && r.dados.removidas === 1);
r = await chamar('/consultas/resumo');
verificar('resumo reflete exclusão', r.dados.por_pilar.Redacao >= 1 && r.dados.referencias_salvas === 1, `total ${r.dados.total}`);

console.log('\n=== 7. SESSÃO E PERSISTÊNCIA ===');
r = await chamar('/auth/sair', { method: 'POST' });
verificar('POST /auth/sair', r.status === 200 && r.dados.autenticado === false);
r = await chamar('/consultas');
verificar('após sair → 401', r.status === 401);
r = await chamar('/auth/demo', { method: 'POST', body: { email: 'ana@exemplo.com' } });
r = await chamar('/consultas/resumo');
verificar('dados sobrevivem ao novo login (localStorage)', r.dados.total >= 3, `total ${r.dados.total} · refs ${r.dados.referencias_salvas}`);
const bruto = JSON.parse(localStorage.getItem('maklayn-demo-banco-v1'));
verificar('banco local íntegro', bruto.usuarios.length === 3 && bruto.consultas.length >= 3, `${bruto.usuarios.length} usuário(s), ${bruto.consultas.length} consulta(s), ${bruto.referencias.length} referência(s)`);

console.log(`\n${falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : `❌ ${falhas} FALHA(S)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
