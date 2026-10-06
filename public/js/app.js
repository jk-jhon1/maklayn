/**
 * =====================================================================
 *  MAKLAYN — Aplicação de interface (ES Modules, sem framework)
 *
 *  Responsabilidades:
 *   - Autenticação (Google Identity Services ou modo demonstração)
 *   - Chat com o assistente (3 pilares) + histórico da conversa
 *   - Histórico persistido, referências salvas e painel de métricas
 *   - Inspetor do motor de IA, do banco e do system prompt
 * =====================================================================
 */

import { renderMarkdown, ligarBotoesCopiar } from './markdown.js';

/* ------------------------------------------------------------------ */
/* Estado                                                             */
/* ------------------------------------------------------------------ */

const estado = {
  usuario: null,
  modo: 'Codigo',
  mensagens: [],       // { papel: 'usuario'|'ia', texto, consultaId? }
  vista: 'chat',
  config: null,
  enviando: false
};

const ROTULOS = {
  Codigo: { titulo: 'Engenharia de Software', sub: 'Código limpo, padrões de projeto e explicações didáticas' },
  Redacao: { titulo: 'Redação Padrão ENEM', sub: '5 competências · repertório sociocultural · proposta de intervenção' },
  Pesquisa: { titulo: 'Pesquisa Acadêmica', sub: 'Evidências factuais · citações ABNT · referências verificáveis' }
};

const $ = (seletor) => document.querySelector(seletor);
const $$ = (seletor) => [...document.querySelectorAll(seletor)];

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) },
    ...opcoes,
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : {};

  if (!resposta.ok) {
    const erro = new Error(dados.mensagem || `Erro ${resposta.status}`);
    erro.status = resposta.status;
    erro.codigo = dados.erro;
    throw erro;
  }
  return dados;
}

function notificar(mensagem, tipo = 'info', tempo = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = mensagem;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, tempo);
}

const hora = (valor) => {
  const d = valor ? new Date(String(valor).replace(' ', 'T')) : new Date();
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const dataHora = (valor) => {
  if (!valor) return '—';
  const d = new Date(String(valor).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleString('pt-BR');
};

const iniciais = (nome = '') =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

const escapar = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */

async function carregarSessao() {
  const { autenticado, usuario } = await api('/auth/eu');
  estado.usuario = autenticado ? usuario : null;
  pintarUsuario();

  if (!estado.usuario) abrirLogin();
  else {
    buscarContadores();
    if (estado.vista === 'painel') carregarPainel();
  }
}

function pintarUsuario() {
  const u = estado.usuario;
  $('#nomeUsuario').textContent = u?.nome_completo ?? 'Visitante';
  $('#emailUsuario').textContent = u?.email ?? 'não autenticado';
  $('#botaoSessao').textContent = u ? 'Sair' : 'Entrar';

  const avatar = $('#avatarUsuario');
  if (u?.foto_url) {
    avatar.innerHTML = `<img src="${escapar(u.foto_url)}" alt="">`;
  } else {
    avatar.textContent = iniciais(u?.nome_completo ?? '?');
  }
}

function abrirLogin() {
  $('#overlayLogin').hidden = false;
}

function fecharLogin() {
  $('#overlayLogin').hidden = true;
}

async function carregarConfigLogin() {
  try {
    const cfg = await api('/auth/config');
    estado.config = cfg;

    const area = $('#areaGoogle');
    area.innerHTML = '';

    if (cfg.google.configurado && cfg.google.client_id) {
      // Google Identity Services (item 5 da especificação)
      const div = document.createElement('div');
      div.id = 'g_id_onload';
      div.dataset.client_id = cfg.google.client_id;
      div.dataset.callback = 'maklaynLoginGoogle';
      div.dataset.auto_prompt = 'false';
      document.body.appendChild(div);

      const botao = document.createElement('div');
      botao.className = 'g_id_signin';
      botao.dataset.type = 'standard';
      botao.dataset.theme = 'filled_black';
      botao.dataset.size = 'large';
      botao.dataset.text = 'signin_with';
      botao.dataset.shape = 'rectangular';
      botao.dataset.logo_alignment = 'center';
      botao.dataset.locale = 'pt-BR';
      botao.dataset.width = '355';
      area.appendChild(botao);

      window.maklaynLoginGoogle = async ({ credential }) => {
        try {
          const r = await api('/auth/google/credential', { method: 'POST', body: { credential } });
          estado.usuario = r.usuario;
          pintarUsuario();
          fecharLogin();
          notificar(`Bem-vindo, ${r.usuario.nome_completo.split(' ')[0]}!`, 'sucesso');
          buscarContadores();
        } catch (e) {
          notificar(`Falha no login Google: ${e.message}`, 'erro');
        }
      };

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      const link = document.createElement('a');
      link.href = '/api/auth/google';
      link.className = 'botao bloco';
      link.style.marginTop = '10px';
      link.textContent = 'Ou entrar pelo fluxo OAuth 2.0 (server-side)';
      area.appendChild(link);

      $('#avisoLogin').hidden = true;
    } else {
      const aviso = document.createElement('button');
      aviso.type = 'button';
      aviso.className = 'botao ciano bloco';
      aviso.textContent = '🔐 Entrar com Google';
      aviso.addEventListener('click', () => {
        notificar(
          'Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env (veja o README, seção 3) e reinicie o servidor.',
          'info', 9000
        );
      });
      area.appendChild(aviso);

      if (!$('#avisoGoogleAusente')) {
        const aviso = document.createElement('div');
        aviso.className = 'aviso-caixa';
        aviso.id = 'avisoGoogleAusente';
        aviso.innerHTML = 'O login Google ainda não está configurado (<code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>). O botão acima explica como ativar; por enquanto, use o acesso de demonstração.';
        area.appendChild(aviso);
      }
    }
  } catch (e) {
    console.warn('[maklayn] falha ao ler /auth/config:', e.message);
  }
}

async function entrarDemo(evento) {
  evento.preventDefault();
  const nome = $('#loginNome').value.trim();
  const email = $('#loginEmail').value.trim();
  const papel = $('#loginPapel').value;

  try {
    const r = await api('/auth/demo', { method: 'POST', body: { nome, email, papel } });
    estado.usuario = r.usuario;
    pintarUsuario();
    fecharLogin();
    notificar(`Sessão iniciada: ${r.usuario.nome_completo}`, 'sucesso');
    buscarContadores();
  } catch (e) {
    notificar(e.message, 'erro');
  }
}

async function sair() {
  await api('/auth/sair', { method: 'POST' });
  estado.usuario = null;
  estado.mensagens = [];
  pintarUsuario();
  limparConversa();
  abrirLogin();
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

function definirModo(modo) {
  estado.modo = modo;
  $$('#modos .modo').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === modo));
  $$('#miniModos .mini-modo').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === modo));
  $('#tituloVista').textContent = ROTULOS[modo].titulo;
  $('#subtituloVista').textContent = ROTULOS[modo].sub;
}

function limparConversa() {
  $('#conversa').innerHTML = '';
  estado.mensagens = [];
  $('#boasVindas').hidden = false;
}

function adicionarMensagem(papel, texto, { consultaId = null, provedor = null, aviso = null } = {}) {
  $('#boasVindas').hidden = true;

  const usuario = estado.usuario;
  const avatarHtml =
    papel === 'ia'
      ? '<div class="msg-avatar">M</div>'
      : usuario?.foto_url
        ? `<div class="msg-avatar"><img src="${escapar(usuario.foto_url)}" alt=""></div>`
        : `<div class="msg-avatar">${escapar(iniciais(usuario?.nome_completo ?? 'Você'))}</div>`;

  const autor = papel === 'ia' ? 'Maklayn' : usuario?.nome_completo?.split(' ')[0] ?? 'Você';

  const div = document.createElement('div');
  div.className = `mensagem ${papel === 'ia' ? 'do-maklayn' : 'do-usuario'}`;
  div.innerHTML = `
    ${avatarHtml}
    <div class="msg-corpo">
      <div class="msg-cabecalho">
        <span class="msg-autor">${escapar(autor)}</span>
        <span class="msg-hora">${hora()}</span>
        ${provedor ? `<span class="selo"><span class="ponto"></span>${escapar(provedor)}</span>` : ''}
      </div>
      ${aviso ? `<div class="aviso-caixa" style="margin-bottom:9px">${escapar(aviso)}</div>` : ''}
      <div class="msg-texto"></div>
      <div class="msg-acoes"></div>
    </div>`;

  const corpo = div.querySelector('.msg-texto');
  if (papel === 'ia') {
    corpo.innerHTML = renderMarkdown(texto);
    ligarBotoesCopiar(corpo);
    criarAcoesResposta(div.querySelector('.msg-acoes'), texto, consultaId);
  } else {
    corpo.innerHTML = `<p>${escapar(texto)}</p>`;
  }

  $('#conversa').appendChild(div);
  rolarParaFim();
  return div;
}

/** Botões de ação abaixo da resposta: copiar tudo, salvar links, excluir. */
function criarAcoesResposta(area, texto, consultaId) {
  const links = [...texto.matchAll(/\((https?:\/\/[^\s)]+)\)/g)]
    .map((m) => m[1].replace(/[.,;]+$/, ''))
    .filter((v, i, a) => a.indexOf(v) === i);

  const botoes = [
    { rotulo: '📋 Copiar resposta', acao: () => copiarTexto(texto) },
    { rotulo: '🖨️ Exportar .md', acao: () => exportarMarkdown(texto) }
  ];

  if (links.length) {
    botoes.push({
      rotulo: `🔖 Salvar ${links.length} link(s)`,
      acao: async () => {
        if (!estado.usuario) return notificar('Entre para salvar referências.', 'erro');
        let salvos = 0;
        for (const url of links) {
          try {
            await api('/referencias', { method: 'POST', body: { url_referencia: url, titulo_link: new URL(url).hostname.replace(/^www\./, ''), id_consulta: consultaId } });
            salvos++;
          } catch { /* duplicata ou url inválida: ignora */ }
        }
        notificar(`${salvos} referência(s) salva(s).`, 'sucesso');
        buscarContadores();
      }
    });
  }

  if (consultaId) {
    botoes.push({
      rotulo: '🗑️ Remover do histórico',
      acao: async () => {
        try {
          await api(`/consultas/${consultaId}`, { method: 'DELETE' });
          notificar('Consulta removida do histórico.', 'sucesso');
          buscarContadores();
        } catch (e) {
          notificar(e.message, 'erro');
        }
      }
    });
  }

  for (const b of botoes) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao pequeno fantasma';
    botao.textContent = b.rotulo;
    botao.addEventListener('click', b.acao);
    area.appendChild(botao);
  }
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    notificar('Resposta copiada.', 'sucesso');
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    notificar('Resposta copiada.', 'sucesso');
  }
}

function exportarMarkdown(texto) {
  const blob = new Blob([texto], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `maklayn-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function rolarParaFim() {
  const conteudo = $('#conteudo');
  conteudo.scrollTop = conteudo.scrollHeight;
}

function mostrarPensando() {
  const div = document.createElement('div');
  div.className = 'mensagem do-maklayn';
  div.id = 'pensando';
  div.innerHTML = `
    <div class="msg-avatar">M</div>
    <div class="msg-corpo">
      <div class="msg-texto">
        <div class="pensando">
          <span class="pontos"><i></i><i></i><i></i></span>
          <span>Maklayn está elaborando a resposta no pilar <b>${ROTULOS[estado.modo].titulo}</b>…</span>
        </div>
      </div>
    </div>`;
  $('#conversa').appendChild(div);
  rolarParaFim();
}

async function enviar() {
  const campo = $('#prompt');
  const texto = campo.value.trim();
  if (!texto || estado.enviando) return;

  if (!estado.usuario) {
    notificar('Faça login para conversar com o Maklayn.', 'erro');
    abrirLogin();
    return;
  }

  estado.enviando = true;
  $('#botaoEnviar').disabled = true;

  campo.value = '';
  campo.style.height = 'auto';

  adicionarMensagem('usuario', texto);
  estado.mensagens.push({ papel: 'usuario', texto });
  mostrarPensando();

  try {
    const historico = estado.mensagens.slice(-8).map((m) => ({ papel: m.papel, texto: m.texto }));

    const { consulta } = await api('/consultas', {
      method: 'POST',
      body: { prompt: texto, modo: estado.modo, historico }
    });

    $('#pensando')?.remove();
    adicionarMensagem('ia', consulta.resposta_ia, {
      consultaId: consulta.id_consulta,
      provedor: consulta.provedor,
      aviso: consulta.aviso
    });
    estado.mensagens.push({ papel: 'ia', texto: consulta.resposta_ia, consultaId: consulta.id_consulta });

    if (consulta.referencias_detectadas?.length) {
      notificar(`${consulta.referencias_detectadas.length} link(s) detectado(s) na resposta — use "Salvar link(s)".`, 'info');
    }
    buscarContadores();
  } catch (e) {
    $('#pensando')?.remove();
    adicionarMensagem('ia', `⚠️ **Não foi possível concluir a consulta.**\n\n\`${e.message}\``);
    notificar(e.message, 'erro');
  } finally {
    estado.enviando = false;
    $('#botaoEnviar').disabled = false;
    campo.focus();
  }
}

/* ------------------------------------------------------------------ */
/* Histórico                                                           */
/* ------------------------------------------------------------------ */

async function buscarContadores() {
  if (!estado.usuario) return;
  try {
    const r = await api('/consultas?porPagina=1');
    $('#contHistorico').textContent = r.total;
    const refs = await api('/referencias?porPagina=1');
    $('#contReferencias').textContent = refs.total;
  } catch { /* silencioso */ }
}

async function carregarHistorico() {
  const lista = $('#listaHistorico');
  if (!estado.usuario) return vazio(lista, 'Entre para ver seu histórico.');

  const busca = encodeURIComponent($('#buscaHistorico').value.trim());
  const tipo = $('#filtroTipo').value;

  lista.innerHTML = '<div class="vazio">Carregando…</div>';

  try {
    const { itens, total } = await api(`/consultas?busca=${busca}&tipo=${tipo}&porPagina=50`);

    if (!itens.length) {
      return vazio(lista, total === 0 ? 'Nenhuma consulta registrada ainda. Converse com o Maklayn para criar seu histórico.' : 'Nenhum resultado para este filtro.');
    }

    lista.innerHTML = itens
      .map(
        (c) => `
        <article class="item" data-id="${c.id_consulta}">
          <div class="item-topo">
            <span class="pilula ${c.tipo_consulta}">${c.tipo_consulta}</span>
            <h3 class="item-titulo">${escapar(c.resumo_prompt)}</h3>
            <div class="item-acoes">
              <button class="botao pequeno fantasma" data-acao="abrir" data-id="${c.id_consulta}" type="button">Ver</button>
              <button class="botao pequeno fantasma" data-acao="excluir" data-id="${c.id_consulta}" type="button">Excluir</button>
            </div>
          </div>
          <p class="item-meta">
            <span>🕒 ${dataHora(c.data_hora)}</span>
            <span>⚙️ ${escapar(c.modelo_usado ?? '—')}</span>
            <span>⚡ ${c.latencia_ms ?? '—'} ms</span>
            <span>📄 ${c.tamanho_resposta ?? 0} caracteres</span>
          </p>
        </article>`
      )
      .join('');
  } catch (e) {
    vazio(lista, `Erro ao carregar: ${e.message}`);
  }
}

async function abrirConsulta(id) {
  try {
    const { consulta } = await api(`/consultas/${id}`);
    mudarVista('chat');
    limparConversa();
    adicionarMensagem('usuario', consulta.prompt_usuario);
    adicionarMensagem('ia', consulta.resposta_ia, { consultaId: consulta.id_consulta, provedor: consulta.modelo_usado });
    estado.mensagens = [
      { papel: 'usuario', texto: consulta.prompt_usuario },
      { papel: 'ia', texto: consulta.resposta_ia, consultaId: consulta.id_consulta }
    ];
  } catch (e) {
    notificar(e.message, 'erro');
  }
}

/* ------------------------------------------------------------------ */
/* Referências                                                         */
/* ------------------------------------------------------------------ */

async function carregarReferencias() {
  const lista = $('#listaReferencias');
  if (!estado.usuario) return vazio(lista, 'Entre para ver suas referências.');

  const busca = encodeURIComponent($('#buscaReferencias').value.trim());
  lista.innerHTML = '<div class="vazio">Carregando…</div>';

  try {
    const { itens, total } = await api(`/referencias?busca=${busca}&porPagina=100`);
    if (!itens.length) {
      return vazio(lista, 'Nenhuma referência salva. Gere uma pesquisa e clique em "Salvar link(s)".');
    }

    lista.innerHTML = itens
      .map(
        (r) => `
        <article class="item">
          <div class="item-topo">
            <h3 class="item-titulo">🔖 ${escapar(r.titulo_link)}</h3>
            <div class="item-acoes">
              <a class="botao pequeno fantasma" href="${escapar(r.url_referencia)}" target="_blank" rel="noopener noreferrer">Abrir</a>
              <button class="botao pequeno fantasma" data-acao="excluir-ref" data-id="${r.id_referencia}" type="button">Excluir</button>
            </div>
          </div>
          <p class="item-resumo">${escapar(r.url_referencia)}</p>
          ${r.anotacao ? `<p class="item-resumo">📝 ${escapar(r.anotacao)}</p>` : ''}
          <p class="item-meta">
            <span>🕒 ${dataHora(r.data_salvo)}</span>
            ${r.tipo_consulta ? `<span class="pilula ${r.tipo_consulta}">${r.tipo_consulta}</span>` : ''}
          </p>
        </article>`
      )
      .join('');
  } catch (e) {
    vazio(lista, `Erro ao carregar: ${e.message}`);
  }
}

async function salvarNovaReferencia() {
  const titulo = $('#refTitulo').value.trim();
  const url = $('#refUrl').value.trim();
  const anotacao = $('#refAnotacao').value.trim();

  try {
    await api('/referencias', {
      method: 'POST',
      body: { titulo_link: titulo || url, url_referencia: url, anotacao: anotacao || null }
    });
    notificar('Referência salva.', 'sucesso');
    $('#refTitulo').value = $('#refUrl').value = $('#refAnotacao').value = '';
    $('#formReferencia').hidden = true;
    carregarReferencias();
    buscarContadores();
  } catch (e) {
    notificar(e.message, 'erro');
  }
}

async function exportarAbnt() {
  try {
    const resposta = await fetch('/api/referencias/abnt', { credentials: 'include' });
    const texto = await resposta.text();
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'referencias-maklayn-abnt.txt';
    a.click();
    URL.revokeObjectURL(a.href);
    notificar('Arquivo ABNT gerado.', 'sucesso');
  } catch (e) {
    notificar(e.message, 'erro');
  }
}

/* ------------------------------------------------------------------ */
/* Painel de métricas                                                  */
/* ------------------------------------------------------------------ */

async function carregarPainel() {
  if (!estado.usuario) {
    $('#cartoesEstatistica').innerHTML = '';
    return vazio($('#barrasPilar'), 'Entre para ver suas métricas de uso.');
  }

  try {
    const r = await api('/consultas/resumo');

    $('#cartoesEstatistica').innerHTML = [
      ['Consultas totais', r.total],
      ['Redações', r.por_pilar.Redacao],
      ['Códigos', r.por_pilar.Codigo],
      ['Pesquisas', r.por_pilar.Pesquisa],
      ['Referências salvas', r.referencias_salvas],
      ['Latência média', r.latencia_media_ms ? `${r.latencia_media_ms} ms` : '—']
    ]
      .map(
        ([rotulo, valor]) =>
          `<div class="estatistica"><div class="valor">${valor}</div><div class="rotulo">${rotulo}</div></div>`
      )
      .join('');

    const total = Math.max(r.total, 1);
    $('#barrasPilar').innerHTML = Object.entries(r.por_pilar)
      .map(
        ([pilar, qtd]) => `
        <div style="margin:11px 0">
          <div style="display:flex;justify-content:space-between;font-size:12.5px">
            <span><span class="pilula ${pilar}">${pilar}</span></span>
            <span>${qtd} (${Math.round((qtd / total) * 100)}%)</span>
          </div>
          <div class="barra"><i style="width:${(qtd / total) * 100}%"></i></div>
        </div>`
      )
      .join('');

    const maior = Math.max(...r.ultimos_dias.map((d) => d.total), 1);
    $('#graficoDias').innerHTML = r.ultimos_dias.length
      ? r.ultimos_dias
          .map(
            (d) => `
            <div style="margin:9px 0">
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--texto-suave)">
                <span>${d.dia}</span><span>${d.total} consulta(s)</span>
              </div>
              <div class="barra"><i style="width:${(d.total / maior) * 100}%"></i></div>
            </div>`
          )
          .join('')
      : '<p class="item-resumo">Sem consultas nos últimos dias.</p>';
  } catch (e) {
    notificar(`Painel indisponível: ${e.message}`, 'erro');
  }
}

/* ------------------------------------------------------------------ */
/* Vista "Motor e API"                                                 */
/* ------------------------------------------------------------------ */

async function carregarMotor() {
  try {
    const [saude, prompt] = await Promise.all([api('/health'), api('/prompt')]);

    $('#motorAtivo').textContent = saude.ia.rotulo;
    $('#bancoAtivo').textContent = saude.banco.cliente;
    $('#textoSelo').textContent = `${saude.ia.rotulo} · ${saude.banco.cliente}`;
    $('#seloMotor').className = `selo ${saude.ia.ativo === 'mock' ? 'demo' : ''}`;

    $('#listaProvedores').innerHTML = saude.ia.disponiveis
      .map(
        (p) => `
        <div class="item">
          <div class="item-topo">
            <h3 class="item-titulo">${escapar(p.rotulo)}</h3>
            <span class="pilula ${p.id === saude.ia.ativo ? 'Codigo' : 'Pesquisa'}">${p.id === saude.ia.ativo ? 'em uso' : p.configurado ? 'pronto' : 'não configurado'}</span>
          </div>
          <p class="item-resumo">
            ${p.requerChave ? `Requer <code>${p.env}</code> no <code>.env</code>.` : 'Motor determinístico local — não consome tokens.'}
          </p>
        </div>`
      )
      .join('');

    $('#visorPrompt').innerHTML = `<div class="md-codigo"><div class="md-codigo-topo"><span class="md-lang">system prompt</span></div><pre><code>${escapar(prompt.system_prompt)}</code></pre></div>`;

    $('#infoBanco').innerHTML = `
      <p class="item-resumo">Cliente ativo: <b>${escapar(saude.banco.cliente)}</b> · status: <b>${escapar(saude.banco.status)}</b> · ambiente: <b>${escapar(saude.ambiente)}</b></p>
      <p class="item-resumo">Tabelas: <code>Usuarios</code>, <code>Historico_Consultas</code>, <code>Referencias_Salvas</code> + view <code>vw_estatisticas_usuario</code>.</p>
      <p class="item-resumo">Migração MySQL: <code>npm run db:migrate</code> · reset: <code>npm run db:reset</code></p>`;

    const cfg = estado.config ?? (await api('/auth/config'));
    $('#infoGoogle').innerHTML = `
      <p class="item-resumo">Client ID: <b>${cfg.google.configurado ? 'configurado' : 'ausente'}</b> · login de demonstração: <b>${cfg.demo ? 'ativo' : 'desativado'}</b></p>
      <p class="item-resumo">Rotas: <code>GET /api/auth/google</code> (redirect) · <code>GET /api/auth/google/callback</code> · <code>POST /api/auth/google/credential</code> (GIS)</p>`;
  } catch (e) {
    notificar(`Não foi possível inspecionar o motor: ${e.message}`, 'erro');
  }
}

/* ------------------------------------------------------------------ */
/* Navegação entre vistas                                             */
/* ------------------------------------------------------------------ */

function vazio(container, mensagem) {
  container.innerHTML = `<div class="vazio"><div class="icone">🗂️</div><p>${escapar(mensagem)}</p></div>`;
}

function mudarVista(vista) {
  estado.vista = vista;
  $$('#navegacao .nav-item').forEach((b) => b.classList.toggle('ativo', b.dataset.vista === vista));
  ['chat', 'historico', 'referencias', 'painel', 'motor'].forEach((v) => {
    $(`#vista-${v}`).hidden = v !== vista;
  });

  $('#areaEntrada').hidden = vista !== 'chat';
  $('#botaoLimpar').hidden = vista !== 'chat';
  $('#lateral').classList.remove('aberta');

  if (vista === 'historico') carregarHistorico();
  if (vista === 'referencias') carregarReferencias();
  if (vista === 'painel') carregarPainel();
  if (vista === 'motor') carregarMotor();
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function ligarEventos() {
  $('#modos').addEventListener('click', (e) => {
    const botao = e.target.closest('.modo');
    if (botao) definirModo(botao.dataset.modo);
  });

  $('#miniModos').addEventListener('click', (e) => {
    const botao = e.target.closest('.mini-modo');
    if (botao) definirModo(botao.dataset.modo);
  });

  $('#navegacao').addEventListener('click', (e) => {
    const botao = e.target.closest('.nav-item');
    if (botao) mudarVista(botao.dataset.vista);
  });

  document.addEventListener('click', async (e) => {
    const exemplo = e.target.closest('[data-exemplo]');
    if (exemplo) {
      $('#prompt').value = exemplo.dataset.exemplo;
      $('#prompt').focus();
      if (!estado.usuario) abrirLogin();
      return;
    }

    const acao = e.target.closest('[data-acao]');
    if (!acao) return;

    const id = Number(acao.dataset.id);
    if (acao.dataset.acao === 'abrir') abrirConsulta(id);
    if (acao.dataset.acao === 'excluir') {
      try {
        await api(`/consultas/${id}`, { method: 'DELETE' });
        notificar('Consulta removida.', 'sucesso');
        carregarHistorico();
        buscarContadores();
      } catch (err) { notificar(err.message, 'erro'); }
    }
    if (acao.dataset.acao === 'excluir-ref') {
      try {
        await api(`/referencias/${id}`, { method: 'DELETE' });
        notificar('Referência removida.', 'sucesso');
        carregarReferencias();
        buscarContadores();
      } catch (err) { notificar(err.message, 'erro'); }
    }
  });

  const campo = $('#prompt');
  campo.addEventListener('input', () => {
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight, 240)}px`;
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  });

  $('#botaoEnviar').addEventListener('click', enviar);
  $('#botaoLimpar').addEventListener('click', limparConversa);
  $('#botaoSessao').addEventListener('click', () => (estado.usuario ? sair() : abrirLogin()));
  $('#botaoFecharLogin').addEventListener('click', fecharLogin);
  $('#formDemo').addEventListener('submit', entrarDemo);
  $('#botaoVisitante').addEventListener('click', () => {
    const sufixo = Math.random().toString(36).slice(2, 7);
    $('#loginNome').value = 'Visitante Maklayn';
    $('#loginEmail').value = `visitante.${sufixo}@maklayn.dev`;
    $('#loginPapel').value = 'aluno';
    $('#formDemo').dispatchEvent(new Event('submit', { cancelable: true }));
  });

  $('#buscaHistorico').addEventListener('input', debounce(carregarHistorico, 350));
  $('#filtroTipo').addEventListener('change', carregarHistorico);
  $('#botaoAtualizarHistorico').addEventListener('click', carregarHistorico);

  $('#buscaReferencias').addEventListener('input', debounce(carregarReferencias, 350));
  $('#botaoExportarAbnt').addEventListener('click', exportarAbnt);
  $('#botaoNovaReferencia').addEventListener('click', () => {
    $('#formReferencia').hidden = !$('#formReferencia').hidden;
  });
  $('#botaoSalvarReferencia').addEventListener('click', salvarNovaReferencia);
  $('#botaoCancelarReferencia').addEventListener('click', () => ($('#formReferencia').hidden = true));

  $('#botaoMenu').addEventListener('click', () => $('#lateral').classList.toggle('aberta'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('#lateral').classList.remove('aberta');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      mudarVista('chat');
      $('#prompt').focus();
    }
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

async function iniciar() {
  ligarEventos();
  definirModo('Codigo');
  mudarVista('chat');
  await carregarConfigLogin();
  await carregarSessao();
  carregarMotor();

  const url = new URL(location.href);
  if (url.searchParams.get('erro')) {
    notificar(`Erro no login: ${url.searchParams.get('erro')}`, 'erro');
    url.searchParams.delete('erro');
    history.replaceState({}, '', url);
  }
}

iniciar().catch((e) => {
  console.error(e);
  notificar(`Falha na inicialização: ${e.message}`, 'erro');
});
