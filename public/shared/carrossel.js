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

  /** Troca o texto com um respiro, em vez de estalar de um para o outro. */
  function trocarTexto(elemento, texto) {
    elemento.classList.add('trocando');
    setTimeout(() => {
      elemento.textContent = texto;
      elemento.classList.remove('trocando');
    }, 150);
  }

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
      const assinaturaAnterior = assinaturaAtual;
      slideNoAr = slide;
      assinaturaAtual = nova;

      // O cabeçalho só é reconstruído quando os DADOS mudam. Trocar de slide
      // mexe apenas no subtítulo: refazer o HTML inteiro destruía e recriava
      // escudos e placar a cada 12 segundos, sem necessidade.
      const cabecalho = painel.querySelector('[data-cabecalho]');
      const subtitulo = `${titulo(estado)} · ${SLIDES[slide].nome}`;
      const precisaRefazer = forcar || nova !== assinaturaAnterior || !cabecalho.firstElementChild;

      if (precisaRefazer) {
        cabecalho.innerHTML = global.DuStats.paineis.cabecalho(estado, subtitulo);
      } else {
        const alvo = cabecalho.querySelector('.subtitulo');
        if (alvo && alvo.textContent !== subtitulo) trocarTexto(alvo, subtitulo);
      }

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
