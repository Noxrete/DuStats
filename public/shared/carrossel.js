/** Carrossel compartilhado pelos overlays de intervalo e resumo. */
(function (global) {
  'use strict';

  const SLIDES = [
    { nome: 'Comparativo', desenhar: () => global.DuStats.paineis.comparativo,
      dados: (e) => e.comparativo },
    { nome: 'Mapa de chutes', desenhar: () => global.DuStats.paineis.mapaDeChutes,
      dados: (e) => [e.chutes, ['casa', 'fora'].map((lado) => [e.totais?.[lado]?.finalizacoes, e.totais?.[lado]?.noGol]), e.config.casa, e.config.fora] },
    { nome: 'Pressão', desenhar: () => global.DuStats.paineis.pressao,
      dados: (e) => [e.momentum, e.linhaDoTempo.filter((i) => i.tipo === 'gol'), e.config.casa, e.config.fora] },
    { nome: 'Gols e cartões', desenhar: () => global.DuStats.paineis.linhaDoTempo,
      dados: (e) => e.linhaDoTempo }
  ];

  function iniciar({ modo, painel, titulo, sempreVisivel = false }) {
    let slideNoAr = null;
    let assinaturaCorpo = null;
    let assinaturaCabecalho = null;

    function desenhar(estado, { forcar = false } = {}) {
      const slide = Math.max(0, Math.trunc(Number(estado.transmissao.slide) || 0)) % SLIDES.length;
      const trocou = slide !== slideNoAr;
      const dados = JSON.stringify([estado.id, SLIDES[slide].dados(estado)]);
      const cab = JSON.stringify([estado.id, estado.placar, estado.config.casa, estado.config.fora,
        estado.config.competicao, estado.config.local]);
      const cabecalho = painel.querySelector('[data-cabecalho]');
      const subtitulo = `${titulo(estado)} · ${SLIDES[slide].nome}`;

      // Atualizar uma posse não pode reconstruir os escudos animados do cabeçalho.
      if (forcar || cab !== assinaturaCabecalho || !cabecalho.firstElementChild) {
        cabecalho.innerHTML = global.DuStats.paineis.cabecalho(estado, subtitulo);
      } else {
        const alvo = cabecalho.querySelector('.subtitulo');
        if (alvo && alvo.textContent !== subtitulo) alvo.textContent = subtitulo;
      }

      painel.querySelectorAll('.slide').forEach((secao, indice) => {
        const ativo = indice === slide;
        secao.classList.toggle('ativo', ativo);
        if (ativo && (trocou || forcar || dados !== assinaturaCorpo || secao.childElementCount === 0)) {
          const animar = trocou || forcar || secao.childElementCount === 0;
          secao.classList.toggle('atualizando', !animar);
          SLIDES[indice].desenhar()(secao, estado, { animar });
        }
      });
      painel.querySelectorAll('[data-pontinhos] i').forEach((ponto, indice) => {
        ponto.classList.toggle('ativo', indice === slide);
      });
      slideNoAr = slide;
      assinaturaCorpo = dados;
      assinaturaCabecalho = cab;
    }

    if (sempreVisivel) painel.classList.add('no-ar');
    else global.DuStats.overlay.aoModo(modo, painel, {
      aoEntrar: (estado) => desenhar(estado, { forcar: true })
    });

    global.DuStats.aoEstado((estado) => {
      if (!sempreVisivel && estado.transmissao.modo !== modo) return;
      desenhar(estado);
    });
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.carrossel = { iniciar, SLIDES };
})(window);
