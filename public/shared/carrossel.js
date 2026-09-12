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

  /**
   * A skin `desk` põe os QUATRO painéis no ar ao mesmo tempo, em grade, em vez
   * de girar um carrossel.
   *
   * É a única skin que muda conteúdo e não só aparência, e a exceção é
   * deliberada: o painel do intervalo é UMA Fonte de Navegador no OBS, e fazer
   * disto uma peça separada obrigaria o operador a reconfigurar o OBS para
   * trocar de aparência. Trocando pela skin, ele troca no celular e pronto.
   */
  const ehDesk = (estado) => estado.config?.skin === 'desk';

  function iniciar({ modo, painel, titulo }) {
    let slideNoAr = null;
    let assinaturaAtual = null;
    let deskNoAr = null;

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

    /*
     * No carrossel os slides se refazem quando o operador troca de slide, o que
     * acontece a cada poucos segundos de qualquer jeito. O desk não troca de
     * slide nunca, então precisa de um gatilho próprio — e ele NÃO pode ser a
     * assinatura acima: ela carrega a porcentagem de posse, que muda sozinha a
     * cada troca de bola, e os seis cards ficariam piscando no ar.
     *
     * `totalEventos` sobe a cada lance de verdade registrado, e é isso: o desk
     * se refaz quando algo aconteceu no jogo, não quando o relógio andou.
     */
    const assinaturaDoDesk = (estado) => JSON.stringify([
      estado.placar, estado.totalEventos, estado.config
    ]);
    let deskAtual = null;

    function desenhar(estado, { forcar = false } = {}) {
      const desk = ehDesk(estado);
      // No desk todos os slides estão no ar; `slide` deixa de selecionar um.
      const slide = desk ? 0 : (estado.transmissao.slide || 0) % SLIDES.length;
      const nova = assinatura(estado);
      const novaDesk = assinaturaDoDesk(estado);
      if (!forcar && slide === slideNoAr && nova === assinaturaAtual
          && desk === deskNoAr && novaDesk === deskAtual) return;

      const deskMudou = desk && (novaDesk !== deskAtual || desk !== deskNoAr);
      const trocouDeSlide = slide !== slideNoAr || desk !== deskNoAr;
      const assinaturaAnterior = assinaturaAtual;
      slideNoAr = slide;
      assinaturaAtual = nova;
      deskNoAr = desk;
      deskAtual = novaDesk;

      painel.classList.toggle('desk', desk);
      // O card de patrocínio só existe com patrocinador configurado, e a grade
      // se reorganiza sem ele: um bloco "seu patrocínio aqui" no ar é pior que
      // nenhum.
      cuidarDoPatrocinio(estado, desk);

      // O cabeçalho só é reconstruído quando os DADOS mudam. Trocar de slide
      // mexe apenas no subtítulo: refazer o HTML inteiro destruía e recriava
      // escudos e placar a cada 12 segundos, sem necessidade.
      const cabecalho = painel.querySelector('[data-cabecalho]');
      /*
       * No carrossel o subtítulo diz qual dos quatro está no ar. No desk os
       * quatro estão no ar ao mesmo tempo, e cada card tem seu próprio título:
       * repetir um deles no cabeçalho seria mentira. Lá o subtítulo vira o
       * chip de período — "INTERVALO", "FIM DE JOGO" — que é o que a maquete
       * mostra e a informação que falta na barra do topo.
       */
      const subtitulo = desk
        ? (estado.relogio?.periodoNome || '').toUpperCase()
        : `${titulo(estado)} · ${SLIDES[slide].nome}`;
      const precisaRefazer = forcar || nova !== assinaturaAnterior || !cabecalho.firstElementChild;

      if (precisaRefazer) {
        cabecalho.innerHTML = global.DuStats.paineis.cabecalho(estado, subtitulo);
      } else {
        const alvo = cabecalho.querySelector('.subtitulo');
        if (alvo && alvo.textContent !== subtitulo) trocarTexto(alvo, subtitulo);
      }

      painel.querySelectorAll('.slide').forEach((secao, indice) => {
        const ativo = desk || indice === slide;
        secao.classList.toggle('ativo', ativo);
        // O nome do painel vira o título do card na skin desk, por CSS. No
        // carrossel ele não aparece: lá quem diz o nome é o subtítulo.
        secao.dataset.nome = SLIDES[indice].nome;
        secao.style.setProperty('--ordem', indice);
        if (ativo && (trocouDeSlide || forcar || deskMudou || secao.childElementCount === 0)) {
          SLIDES[indice].desenhar()(secao, estado);
        }
      });

      painel.querySelectorAll('[data-pontinhos] i').forEach((ponto, indice) => {
        ponto.classList.toggle('ativo', indice === slide);
      });
    }

    /** Cria, atualiza ou remove o card de patrocínio. */
    function cuidarDoPatrocinio(estado, desk) {
      const corpo = painel.querySelector('.corpo');
      let card = corpo?.querySelector('[data-patrocinio]');
      const texto = (estado.config?.patrocinador || '').trim();

      if (!desk || !texto) {
        card?.remove();
        painel.removeAttribute('data-com-patrocinio');
        return;
      }
      if (!card) {
        card = document.createElement('div');
        card.setAttribute('data-patrocinio', '');
        card.dataset.nome = 'Patrocinador';
        corpo.appendChild(card);
      }
      card.textContent = texto;
      painel.setAttribute('data-com-patrocinio', 'sim');
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
