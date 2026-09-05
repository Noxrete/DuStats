/**
 * Carrossel de painéis. Serve tanto ao intervalo quanto ao resumo final —
 * são os mesmos quatro gráficos, mudando só o recorte de tempo e o título.
 */
(function (global) {
  'use strict';

  const SLIDES = [
    { nome: 'Comparativo', desenhar: () => global.DuStats.paineis.comparativo },
    { nome: 'Mapa de chutes', desenhar: () => global.DuStats.paineis.mapaDeChutes },
    { nome: 'Pressão', desenhar: () => global.DuStats.paineis.pressao },
    { nome: 'Gols e cartões', desenhar: () => global.DuStats.paineis.linhaDoTempo }
  ];

  function iniciar({ modo, painel, titulo }) {
    let slideNoAr = null;
    let assinaturaAtual = null;

    /**
     * Redesenhar reinicia todas as animações. Com o relógio correndo o servidor
     * manda estado a cada 2 s; sem esta assinatura o painel ficaria piscando no
     * ar sem parar.
     */
    const assinatura = (estado) => JSON.stringify([
      estado.placar, estado.posse.casa, estado.comparativo,
      estado.chutes.length, estado.momentum.length, estado.linhaDoTempo.length,
      estado.config
    ]);

    function desenhar(estado, { forcar = false } = {}) {
      const slide = (estado.transmissao.slide || 0) % SLIDES.length;
      const nova = assinatura(estado);
      if (!forcar && slide === slideNoAr && nova === assinaturaAtual) return;

      const trocouDeSlide = slide !== slideNoAr;
      slideNoAr = slide;
      assinaturaAtual = nova;

      painel.querySelector('[data-cabecalho]').innerHTML =
        global.DuStats.paineis.cabecalho(estado, `${titulo(estado)} · ${SLIDES[slide].nome}`);

      painel.querySelectorAll('.slide').forEach((secao, indice) => {
        const ativo = indice === slide;
        secao.classList.toggle('ativo', ativo);
        if (ativo && (trocouDeSlide || forcar || secao.childElementCount === 0)) {
          SLIDES[indice].desenhar()(secao, estado);
        }
      });

      painel.querySelectorAll('[data-pontinhos] i').forEach((ponto, indice) => {
        ponto.classList.toggle('ativo', indice === slide);
      });
    }

    global.DuStats.overlay.aoModo(modo, painel, {
      aoEntrar: (estado) => desenhar(estado, { forcar: true })
    });

    global.DuStats.aoEstado((estado) => {
      if (estado.transmissao.modo !== modo) return;
      desenhar(estado);
    });
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.carrossel = { iniciar, SLIDES };
})(window);
