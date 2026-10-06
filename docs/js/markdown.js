/**
 * =====================================================================
 *  MAKLAYN — Renderizador Markdown minimalista (sem dependências)
 *
 *  Suporta o que o system prompt exige: títulos, negrito, itálico,
 *  código inline, blocos de código com cerca (```), tabelas com
 *  alinhamento, listas ordenadas e não ordenadas, citações, réguas,
 *  links e quebras de linha.
 *
 *  Segurança: todo o HTML é escapado ANTES da montagem, então o texto
 *  vindo da IA nunca é interpretado como marcação.
 * =====================================================================
 */

const escapar = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* ---------------------------------------------------------------- */
/* Inline                                                            */
/* ---------------------------------------------------------------- */

function inline(texto) {
  let t = escapar(texto);

  // Código inline (protegido antes do resto para não aplicar negrito dentro)
  const codigos = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => {
    codigos.push(c);
    return `\u0000CODE${codigos.length - 1}\u0000`;
  });

  // Imagens ![alt](url) -> link
  t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '🔗 <a href="$2" target="_blank" rel="noopener">$1</a>');

  // Links markdown
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Autolinks <https://...>
  t = t.replace(
    /&lt;(https?:\/\/[^\s&]+)&gt;/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  t = t
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Devolve o código inline
  t = t.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codigos[Number(i)]}</code>`);

  return t;
}

/* ---------------------------------------------------------------- */
/* Blocos                                                            */
/* ---------------------------------------------------------------- */

function tabela(linhas) {
  const celulas = (linha) =>
    linha
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());

  const cabecalho = celulas(linhas[0]);
  const alinhamentos = celulas(linhas[1]).map((c) =>
    /^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : /^:-+/.test(c) ? 'left' : 'left'
  );
  const corpo = linhas.slice(2).map(celulas);

  const th = cabecalho
    .map((c, i) => `<th style="text-align:${alinhamentos[i] ?? 'left'}">${inline(c)}</th>`)
    .join('');
  const trs = corpo
    .map(
      (linha) =>
        `<tr>${linha
          .map((c, i) => `<td style="text-align:${alinhamentos[i] ?? 'left'}">${inline(c)}</td>`)
          .join('')}</tr>`
    )
    .join('');

  return `<div class="md-tabela"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function listas(linhas) {
  const itens = linhas.map((linha) => {
    const check = linha.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (check) {
      return { tipo: 'check', feito: check[1].toLowerCase() === 'x', texto: check[2] };
    }
    const comum = linha.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
    return { tipo: 'normal', texto: comum ? comum[1] : linha.trim() };
  });

  if (itens.some((i) => i.tipo === 'check')) {
    // Lista mista: preserva TODOS os itens, marcando apenas os de checklist.
    const html = itens
      .map((i) =>
        i.tipo === 'check'
          ? `<li class="md-check ${i.feito ? 'feito' : ''}"><span class="box">${i.feito ? '✔' : ''}</span> ${inline(i.texto)}</li>`
          : `<li class="md-normal">${inline(i.texto)}</li>`
      )
      .join('');
    return `<ul class="md-checklist">${html}</ul>`;
  }

  const tag = linhas.some((l) => /^\s*\d+\.\s/.test(l)) ? 'ol' : 'ul';
  return `<${tag}>${itens.map((i) => `<li>${inline(i.texto)}</li>`).join('')}</${tag}>`;
}

/* ---------------------------------------------------------------- */
/* Render principal                                                  */
/* ---------------------------------------------------------------- */

export function renderMarkdown(markdown = '') {
  const texto = String(markdown).replace(/\r\n/g, '\n');

  // 1) Extrai os blocos de código antes de qualquer outra regra.
  const blocos = [];
  const comMarcadores = texto.replace(/```([\w+#-]*)\n?([\s\S]*?)```/g, (_, lang, codigo) => {
    blocos.push({ lang: lang || 'texto', codigo: codigo.replace(/\n$/, '') });
    return `\u0000BLOCO${blocos.length - 1}\u0000`;
  });

  const linhas = comMarcadores.split('\n');
  const saida = [];
  let i = 0;

  const paragrafo = (buffer) => {
    const conteudo = buffer.join(' ').trim();
    if (conteudo) saida.push(`<p>${inline(conteudo)}</p>`);
  };

  while (i < linhas.length) {
    const linha = linhas[i];

    // Bloco de código
    const bloco = linha.match(/^\u0000BLOCO(\d+)\u0000$/);
    if (bloco) {
      const { lang, codigo } = blocos[Number(bloco[1])];
      const id = `cp${Math.random().toString(36).slice(2, 9)}`;
      saida.push(
        `<div class="md-codigo" data-lang="${escapar(lang)}">
           <div class="md-codigo-topo">
             <span class="md-lang">${escapar(lang)}</span>
             <button class="md-copiar" data-alvo="${id}" type="button">Copiar</button>
           </div>
           <pre><code id="${id}">${escapar(codigo)}</code></pre>
         </div>`
      );
      i++;
      continue;
    }

    // Linha vazia
    if (!linha.trim()) {
      i++;
      continue;
    }

    // Régua
    if (/^\s*([-*_])\1{2,}\s*$/.test(linha)) {
      saida.push('<hr>');
      i++;
      continue;
    }

    // Títulos
    const titulo = linha.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      const nivel = Math.min(titulo[1].length + 1, 6);
      saida.push(`<h${nivel}>${inline(titulo[2])}</h${nivel}>`);
      i++;
      continue;
    }

    // Tabela
    if (/\|/.test(linha) && /^\s*\|?[\s:-]*\|[\s:|-]*$/.test(linhas[i + 1] ?? '')) {
      const grupo = [];
      while (i < linhas.length && /\|/.test(linhas[i]) && linhas[i].trim()) grupo.push(linhas[i++]);
      saida.push(tabela(grupo));
      continue;
    }

    // Citação
    if (/^\s*>\s?/.test(linha)) {
      const grupo = [];
      while (i < linhas.length && /^\s*>\s?/.test(linhas[i])) {
        grupo.push(linhas[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      saida.push(`<blockquote>${grupo.map((g) => (g.trim() ? inline(g) : '<br>')).join('<br>')}</blockquote>`);
      continue;
    }

    // Listas
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(linha)) {
      const grupo = [];
      while (i < linhas.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(linhas[i])) grupo.push(linhas[i++]);
      saida.push(listas(grupo));
      continue;
    }

    // Parágrafo (agrupa linhas consecutivas)
    const grupo = [];
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      !/^\s*(#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|```|\u0000BLOCO)/.test(linhas[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(linhas[i])
    ) {
      grupo.push(linhas[i++]);
    }
    paragrafo(grupo);
  }

  return saida.join('\n');
}

/** Liga os botões "Copiar" de um container já renderizado. */
export function ligarBotoesCopiar(container) {
  container.querySelectorAll('.md-copiar').forEach((botao) => {
    if (botao.dataset.ligado) return;
    botao.dataset.ligado = '1';
    botao.addEventListener('click', async () => {
      const alvo = container.querySelector(`#${CSS.escape(botao.dataset.alvo)}`);
      if (!alvo) return;
      try {
        await navigator.clipboard.writeText(alvo.textContent);
        botao.textContent = 'Copiado ✔';
      } catch {
        // Fallback para navegadores sem clipboard API (iframe sem permissão)
        const area = document.createElement('textarea');
        area.value = alvo.textContent;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        botao.textContent = 'Copiado ✔';
      }
      setTimeout(() => {
        botao.textContent = 'Copiar';
      }, 1800);
    });
  });
}

export default { renderMarkdown, ligarBotoesCopiar };
