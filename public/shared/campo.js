/**
 * Meio-campo de ataque em SVG, desenhado em metros reais (68 x 52,5) para as
 * marcações ficarem proporcionais em qualquer tamanho de tela.
 *
 * Orientação: gol EM CIMA. O time sempre ataca para cima, tanto no painel do
 * apontador quanto no overlay — o que resolve de graça o problema de os times
 * trocarem de lado no intervalo. A coordenada guardada no evento é sempre
 * relativa ao gol atacado, nunca ao lado do campo.
 *
 *   x = profundidade: 0 no meio-campo, 1 na linha de fundo
 *   y = largura:      0 numa lateral, 1 na outra
 */
(function (global) {
  'use strict';

  const LARGURA = 68;
  const PROFUNDIDADE = 52.5;
  // Uma folga em volta para as linhas rentes ao limite (linha de fundo,
  // laterais, meio-campo) não terem metade do traço cortada pelo viewBox.
  const MARGEM = 1.2;
  const NS = 'http://www.w3.org/2000/svg';

  const paraSvgX = (y) => y * LARGURA;
  const paraSvgY = (x) => (1 - x) * PROFUNDIDADE;
  const daSvgX = (px) => px / LARGURA;
  const daSvgY = (py) => 1 - py / PROFUNDIDADE;

  function el(nome, atributos) {
    const node = document.createElementNS(NS, nome);
    for (const [chave, valor] of Object.entries(atributos)) node.setAttribute(chave, valor);
    return node;
  }

  /** Devolve um <svg> com as linhas do campo, pronto para receber os chutes. */
  function criar({ traco = 'rgba(255,255,255,.45)', espessura = 0.35, grama = 'none' } = {}) {
    const svg = el('svg', {
      viewBox: `${-MARGEM} ${-MARGEM} ${LARGURA + MARGEM * 2} ${PROFUNDIDADE + MARGEM * 2}`,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'campo'
    });

    const linhas = el('g', {
      fill: 'none',
      stroke: traco,
      'stroke-width': espessura,
      'stroke-linecap': 'round'
    });

    if (grama !== 'none') {
      svg.appendChild(el('rect', {
        x: -MARGEM, y: -MARGEM,
        width: LARGURA + MARGEM * 2, height: PROFUNDIDADE + MARGEM * 2,
        fill: grama
      }));
    }

    linhas.appendChild(el('rect', { x: 0, y: 0, width: LARGURA, height: PROFUNDIDADE }));
    // Grande área: 16,5 m de profundidade por 40,32 m de largura.
    linhas.appendChild(el('rect', { x: (LARGURA - 40.32) / 2, y: 0, width: 40.32, height: 16.5 }));
    // Pequena área: 5,5 m por 18,32 m.
    linhas.appendChild(el('rect', { x: (LARGURA - 18.32) / 2, y: 0, width: 18.32, height: 5.5 }));
    linhas.appendChild(el('circle', { cx: LARGURA / 2, cy: 11, r: 0.4, fill: traco, stroke: 'none' }));
    // Meia-lua: arco de 9,15 m em volta da marca do pênalti, fora da área.
    linhas.appendChild(el('path', {
      d: `M ${LARGURA / 2 - 7.31} 16.5 A 9.15 9.15 0 0 0 ${LARGURA / 2 + 7.31} 16.5`
    }));
    // Círculo central, do qual só metade cabe neste meio-campo.
    linhas.appendChild(el('circle', { cx: LARGURA / 2, cy: PROFUNDIDADE, r: 9.15 }));
    linhas.appendChild(el('path', { d: 'M 0 1 A 1 1 0 0 0 1 0' }));
    linhas.appendChild(el(
      'path',
      { d: `M ${LARGURA} 1 A 1 1 0 0 1 ${LARGURA - 1} 0` }
    ));
    // Gol: 7,32 m, traço mais grosso sobre a linha de fundo.
    linhas.appendChild(el('path', {
      d: `M ${(LARGURA - 7.32) / 2} 0.2 H ${(LARGURA + 7.32) / 2}`,
      stroke: 'rgba(255,255,255,.85)',
      'stroke-width': espessura * 3.5
    }));

    svg.appendChild(linhas);
    return svg;
  }

  /** Converte o toque/clique do usuário na coordenada normalizada do evento. */
  function coordenadaDoPonteiro(svg, evento) {
    const caixa = svg.getBoundingClientRect();
    const vbLargura = LARGURA + MARGEM * 2;
    const vbProfundidade = PROFUNDIDADE + MARGEM * 2;
    // O SVG usa xMidYMid meet: sobra margem em um dos eixos, e é preciso
    // descontá-la para o toque cair onde o dedo realmente encostou.
    const escala = Math.min(caixa.width / vbLargura, caixa.height / vbProfundidade);
    const sobraX = (caixa.width - vbLargura * escala) / 2;
    const sobraY = (caixa.height - vbProfundidade * escala) / 2;
    const px = (evento.clientX - caixa.left - sobraX) / escala - MARGEM;
    const py = (evento.clientY - caixa.top - sobraY) / escala - MARGEM;

    return {
      x: Math.min(1, Math.max(0, daSvgY(py))),
      y: Math.min(1, Math.max(0, daSvgX(px)))
    };
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.campo = {
    criar, el, paraSvgX, paraSvgY, coordenadaDoPonteiro,
    LARGURA, PROFUNDIDADE, MARGEM
  };
})(window);
