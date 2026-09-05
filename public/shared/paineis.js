/**
 * Os quatro painéis gráficos que vão ao ar no intervalo e no fim de jogo.
 *
 * Ficam aqui, e não dentro de cada página, porque o resumo final mostra
 * exatamente os mesmos gráficos do intervalo — só que com o jogo inteiro.
 * Tudo é SVG desenhado à mão: nenhuma biblioteca de gráficos, nenhum arquivo
 * externo, nada que possa faltar quando o PC estiver sem internet no campo.
 */
(function (global) {
  'use strict';

  const { el } = global.DuStats.campo;
  const svgNS = 'http://www.w3.org/2000/svg';

  function svg(atributos, filhos = []) {
    const node = document.createElementNS(svgNS, 'svg');
    for (const [k, v] of Object.entries(atributos)) node.setAttribute(k, v);
    for (const filho of filhos) node.appendChild(filho);
    return node;
  }

  function texto(conteudo, atributos) {
    const node = el('text', atributos);
    node.textContent = conteudo;
    return node;
  }

  // ------------------------------------------------------------ cabeçalho

  function cabecalho(estado, subtitulo) {
    const { overlay } = global.DuStats;
    const c = estado.config;
    return `
      <div class="cabecalho">
        <div class="competicao">${[c.competicao, c.local].filter(Boolean).join(' · ')}</div>
        <div class="confronto">
          <div class="time casa">
            <span class="nome-time">${overlay.nome(c, 'casa')}</span>
            ${overlay.escudo(c, 'casa')}
          </div>
          <div class="placar-grande num">
            <span>${estado.placar.casa}</span><span class="x">×</span><span>${estado.placar.fora}</span>
          </div>
          <div class="time fora">
            ${overlay.escudo(c, 'fora')}
            <span class="nome-time">${overlay.nome(c, 'fora')}</span>
          </div>
        </div>
        <div class="subtitulo">${subtitulo}</div>
      </div>`;
  }

  // ----------------------------------------------------------- comparativo

  function comparativo(container, estado) {
    const linhas = estado.comparativo;

    container.innerHTML = `<div class="comparativo">${linhas.map((linha) => {
      const total = linha.casa + linha.fora;
      const fatiaCasa = total > 0 ? (linha.casa / total) * 100 : 50;
      const sufixo = linha.sufixo || '';
      const lider = !linha.destacar || linha.casa === linha.fora
        ? '' : (linha.casa > linha.fora ? 'casa' : 'fora');

      return `
        <div class="linha-comp">
          <div class="valor esq num ${lider === 'casa' ? 'lider-casa' : ''}">${linha.casa}${sufixo}</div>
          <div>
            <div class="rotulo-linha">${linha.rotulo}</div>
            <div class="trilho ${total === 0 ? 'vazio' : ''}">
              <span class="casa" data-largura="${fatiaCasa}" style="width:0%"></span>
              <span class="fora" data-largura="${100 - fatiaCasa}" style="width:0%"></span>
            </div>
          </div>
          <div class="valor dir num ${lider === 'fora' ? 'lider-fora' : ''}">${linha.fora}${sufixo}</div>
        </div>`;
    }).join('')}</div>`;

    // As barras nascem em zero e crescem — é a animação que transforma uma
    // tabela de números numa peça de transmissão.
    requestAnimationFrame(() => {
      for (const barra of container.querySelectorAll('.trilho span')) {
        barra.style.width = `${barra.dataset.largura}%`;
      }
    });
  }

  // -------------------------------------------------------- mapa de chutes

  const ESTILO_CHUTE = {
    // O gol é branco com aro da cor do time: precisa saltar do resto à
    // primeira olhada, sem o espectador estudar a legenda.
    gol: { rotulo: 'Gol', raio: 3.0, branco: true },
    no_gol: { rotulo: 'No gol', raio: 2.0, preenche: true, aro: false },
    trave: { rotulo: 'Na trave', raio: 2.0, preenche: false, aro: false, tracejado: true },
    fora: { rotulo: 'Para fora', raio: 1.8, preenche: false, aro: false },
    bloqueada: { rotulo: 'Bloqueada', raio: 1.5, preenche: false, aro: false, opacidade: 0.5 }
  };

  function mapaDeChutes(container, estado) {
    const { overlay, campo } = global.DuStats;

    container.innerHTML = `<div class="mapas">${['casa', 'fora'].map((lado) => `
      <div class="mapa" data-lado="${lado}">
        <div class="mapa-topo">
          ${overlay.escudo(estado.config, lado)}
          <span class="mapa-nome">${overlay.nome(estado.config, lado)}</span>
          <span class="mapa-total num">
            <strong>${estado.totais[lado].finalizacoes}</strong> finalizações ·
            <strong>${estado.totais[lado].noGol}</strong> no gol
          </span>
        </div>
        <div class="mapa-campo"></div>
        <div class="mapa-nota"></div>
      </div>`).join('')}</div>
      <div class="legenda">${Object.entries(ESTILO_CHUTE).map(([chave, estilo]) => `
        <span class="item-legenda"><i class="ponto ${chave}"></i>${estilo.rotulo}</span>`).join('')}
      </div>`;

    for (const lado of ['casa', 'fora']) {
      const caixa = container.querySelector(`.mapa[data-lado="${lado}"] .mapa-campo`);
      const desenho = campo.criar({ traco: 'rgba(255,255,255,.34)', espessura: 0.32, grama: 'rgba(0,0,0,.26)' });
      caixa.appendChild(desenho);

      const chutes = estado.chutes.filter((c) => c.equipe === lado);
      const comLocal = chutes.filter((c) => c.x !== null && c.y !== null);

      comLocal.forEach((chute, indice) => {
        const estilo = ESTILO_CHUTE[chute.desfecho] || ESTILO_CHUTE.fora;
        const cor = `var(--cor-${lado})`;
        const ponto = el('circle', {
          cx: campo.paraSvgX(chute.y),
          cy: campo.paraSvgY(chute.x),
          r: estilo.raio,
          fill: estilo.branco ? '#fff' : (estilo.preenche ? cor : 'none'),
          stroke: estilo.branco ? cor : (estilo.preenche ? 'rgba(255,255,255,.8)' : cor),
          'stroke-width': estilo.branco ? 1.2 : (estilo.preenche ? 0.35 : 0.7),
          opacity: estilo.opacidade ?? 1
        });
        if (estilo.tracejado) ponto.setAttribute('stroke-dasharray', '1.4 1');
        // Entram um a um, do primeiro ao último chute do tempo.
        ponto.style.animation = `surgirPonto 320ms ease-out ${indice * 55}ms both`;
        desenho.appendChild(ponto);
      });

      // Abaixo do campo, a quebra por desfecho: aproveita o espaço vazio da
      // metade defensiva (num jogo amador quase todo chute sai perto da área)
      // com informação, em vez de encolher o desenho.
      const nota = container.querySelector(`.mapa[data-lado="${lado}"] .mapa-nota`);
      if (chutes.length === 0) {
        nota.textContent = 'Nenhuma finalização';
        continue;
      }

      const porDesfecho = Object.entries(ESTILO_CHUTE)
        .map(([chave, estilo]) => [estilo.rotulo, chutes.filter((c) => c.desfecho === chave).length])
        .filter(([, quantas]) => quantas > 0)
        .map(([rotulo, quantas]) => `<strong>${quantas}</strong> ${rotulo.toLowerCase()}`);

      const semLocal = chutes.length - comLocal.length;
      if (semLocal > 0) porDesfecho.push(`<em>${semLocal} sem local marcado</em>`);
      nota.innerHTML = porDesfecho.join(' · ');
    }
  }

  // ----------------------------------------------------------- pressão

  function pressao(container, estado) {
    const bins = estado.momentum;
    const L = 1440;
    const A = 460;
    const meio = A / 2;

    if (bins.length === 0) {
      container.innerHTML = '<p class="vazio">Sem lances suficientes para medir a pressão ainda.</p>';
      return;
    }

    const maximo = Math.max(3, ...bins.map((b) => Math.max(b.casa, b.fora)));
    const larguraBin = L / bins.length;
    const altura = (valor) => (valor / maximo) * (meio - 34);

    const grafico = svg({ viewBox: `0 0 ${L} ${A}`, class: 'grafico-pressao' });

    // Linhas de referência a cada 15 minutos — o olho precisa de âncora. Os
    // rótulos vão no rodapé: no meio do gráfico eles somem atrás das barras.
    const rotulos = [];
    for (let minuto = 15; minuto < bins.length * 5; minuto += 15) {
      const x = (minuto / 5) * larguraBin;
      grafico.appendChild(el('line', {
        x1: x, y1: 10, x2: x, y2: A - 30,
        stroke: 'rgba(255,255,255,.1)', 'stroke-width': 1, 'stroke-dasharray': '4 6'
      }));
      rotulos.push(texto(`${minuto}'`, {
        x, y: A - 6, fill: 'rgba(255,255,255,.4)', 'font-size': 21, 'text-anchor': 'middle'
      }));
    }

    bins.forEach((bin, i) => {
      const x = i * larguraBin + larguraBin * 0.14;
      const largura = larguraBin * 0.72;
      for (const [lado, direcao] of [['casa', -1], ['fora', 1]]) {
        const h = altura(bin[lado]);
        if (h <= 0.5) continue;
        const barra = el('rect', {
          x,
          y: direcao === -1 ? meio - h : meio,
          width: largura,
          height: h,
          rx: 4,
          fill: `var(--cor-${lado})`,
          opacity: 0.92
        });
        barra.style.animation = `crescerBarra 520ms cubic-bezier(.22,1,.36,1) ${i * 45}ms both`;
        barra.style.transformOrigin = `center ${meio}px`;
        grafico.appendChild(barra);
      }
    });

    grafico.appendChild(el('line', {
      x1: 0, y1: meio, x2: L, y2: meio, stroke: 'rgba(255,255,255,.5)', 'stroke-width': 2
    }));
    for (const rotulo of rotulos) grafico.appendChild(rotulo);

    // Gols marcados sobre o eixo: explicam os picos de pressão.
    for (const item of estado.linhaDoTempo.filter((i) => i.tipo === 'gol')) {
      const x = (item.tTotal / (5 * 60000)) * larguraBin;
      grafico.appendChild(el('circle', {
        cx: x, cy: meio, r: 11, fill: '#fff', stroke: `var(--cor-${item.equipe})`, 'stroke-width': 4
      }));
    }

    container.innerHTML = '';
    container.appendChild(grafico);
    container.insertAdjacentHTML('beforeend', `
      <div class="legenda-pressao">
        <span class="item-legenda"><i class="ponto" style="background: var(--cor-casa); border-color: var(--cor-casa)"></i>${global.DuStats.overlay.nome(estado.config, 'casa')} (acima)</span>
        <span class="explica">Finalizações, escanteios e posse em janelas de 5 minutos</span>
        <span class="item-legenda"><i class="ponto" style="background: var(--cor-fora); border-color: var(--cor-fora)"></i>${global.DuStats.overlay.nome(estado.config, 'fora')} (abaixo)</span>
      </div>`);
  }

  // ---------------------------------------------------------- linha do tempo

  function linhaDoTempo(container, estado) {
    const itens = estado.linhaDoTempo;
    if (itens.length === 0) {
      container.innerHTML = '<p class="vazio">Nenhum gol ou cartão até aqui.</p>';
      return;
    }

    const fimMs = Math.max(45 * 60000, ...itens.map((i) => i.tTotal)) * 1.04;
    const L = 1440;
    const A = 320;
    const meio = A / 2;
    const posicao = (ms) => 40 + (ms / fimMs) * (L - 80);

    const grafico = svg({ viewBox: `0 0 ${L} ${A}`, class: 'grafico-tempo' });
    grafico.appendChild(el('line', {
      x1: 30, y1: meio, x2: L - 30, y2: meio,
      stroke: 'rgba(255,255,255,.25)', 'stroke-width': 3, 'stroke-linecap': 'round'
    }));

    for (let minuto = 15; minuto <= fimMs / 60000; minuto += 15) {
      const x = posicao(minuto * 60000);
      grafico.appendChild(el('line', { x1: x, y1: meio - 9, x2: x, y2: meio + 9, stroke: 'rgba(255,255,255,.3)', 'stroke-width': 2 }));
      grafico.appendChild(texto(`${minuto}'`, { x, y: A - 6, fill: 'rgba(255,255,255,.35)', 'font-size': 20, 'text-anchor': 'middle' }));
    }

    itens.forEach((item, indice) => {
      const x = posicao(item.tTotal);
      const acima = item.equipe === 'casa';
      const y = acima ? meio - 66 : meio + 66;
      const grupo = el('g', {});
      grupo.style.animation = `surgirPonto 340ms ease-out ${indice * 90}ms both`;

      grupo.appendChild(el('line', {
        x1: x, y1: meio, x2: x, y2: acima ? y + 20 : y - 20,
        stroke: `var(--cor-${item.equipe})`, 'stroke-width': 3
      }));

      if (item.tipo === 'gol') {
        grupo.appendChild(el('circle', { cx: x, cy: y, r: 21, fill: `var(--cor-${item.equipe})`, stroke: '#fff', 'stroke-width': 3 }));
        grupo.appendChild(texto('⚽', { x, y: y + 8, 'font-size': 22, 'text-anchor': 'middle' }));
      } else {
        grupo.appendChild(el('rect', {
          x: x - 12, y: y - 18, width: 24, height: 36, rx: 4,
          fill: item.cor === 'vermelho' ? 'var(--vermelho)' : 'var(--amarelo)',
          stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1.5
        }));
      }

      grupo.appendChild(texto(`${item.minuto}'${item.contra ? ' (c)' : ''}`, {
        x, y: acima ? y - 34 : y + 46,
        fill: '#fff', 'font-size': 23, 'font-weight': 700, 'text-anchor': 'middle'
      }));
      grafico.appendChild(grupo);
    });

    container.innerHTML = '';
    container.appendChild(grafico);
  }

  global.DuStats.paineis = { cabecalho, comparativo, mapaDeChutes, pressao, linhaDoTempo };
})(window);
