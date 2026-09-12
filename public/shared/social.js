/**
 * Match Pack: o jogo virando post, nos três formatos que o Instagram usa.
 *
 *   Feed 4:5     1080 × 1350   resumo completo da partida
 *   Quadrado 1:1 1080 × 1080   uma estatística só, para postar no meio do jogo
 *   Story 9:16   1080 × 1920   o gol, com o minuto, para subir na hora
 *   Resumo 1:1   1080 × 1080   o resultado, para carrossel ou feed
 *
 * Por que canvas e não uma página para o operador printar: print de tela sai
 * no tamanho do monitor, com a barra do navegador, e o Instagram recorta.
 * Aqui o arquivo já nasce no formato exato, na hora, sem depender de ninguém
 * saber recortar imagem no celular à beira do campo.
 *
 * Duas coisas que os formatos NÃO têm, e é melhor dizer do que fingir:
 *
 *  - Foto. Nem de estádio, nem de jogador. O DuStats roda offline no campo e
 *    não tem banco de imagem; o que dá profundidade aqui é o escudo em marca
 *    d'água e a grama pintada, não uma foto que não existe. Se um dia houver
 *    upload de foto de fundo, é aqui que ela entra.
 *  - Nome de jogador, a menos que o apontador tenha digitado. O gol aceita um
 *    autor OPCIONAL, perguntado depois de o placar já ter subido; sem ele o
 *    post mostra o minuto e o time, que é informação verdadeira.
 *
 * Tudo desenhado com o mesmo pincel do cartao.js e com a MESMA pele da skin
 * que foi ao ar — o post precisa parecer do mesmo sistema que a transmissão.
 */
(function (global) {
  'use strict';

  const FORMATOS = {
    // `agua` é a altura, em fração da peça, onde os escudos em marca d'água
    // ficam centrados. Não é decoração ajustável a gosto: fixo no meio, o
    // escudo caía atrás do texto principal nos formatos altos e disputava a
    // leitura com ele. Cada formato tem sua zona vazia, e é lá que ele vai.
    feed:     { largura: 1080, altura: 1350, agua: 0.20, nome: 'Feed 4:5',     nota: 'resumo completo da partida' },
    quadrado: { largura: 1080, altura: 1080, agua: 0.18, nome: 'Quadrado 1:1', nota: 'uma estatística só' },
    story:    { largura: 1080, altura: 1920, agua: 0.14, nome: 'Story 9:16',   nota: 'o gol, com o minuto' },
    resumo:   { largura: 1080, altura: 1080, agua: 0.16, nome: 'Resumo final', nota: 'o resultado' }
  };

  const p = () => global.DuStats.pincel;

  // ------------------------------------------------------------- fundo

  /**
   * O palco: gradiente da skin, grama no rodapé e os dois escudos em marca
   * d'água nas pontas. Os escudos ficam com opacidade baixa e MUITO grandes,
   * saindo pela borda — é o que dá profundidade sem foto.
   */
  async function palco(ctx, L, A, estado, pele, { agua = 0.2 } = {}) {
    /*
     * O fundo é pintado AQUI, e não por `pele.fundo()`.
     *
     * `fundo()` existe para o card quadrado e pinta exatamente 1080 × 1080. Num
     * story de 1080 × 1920 ele deixa a metade de baixo sem tinta, e o que
     * aparece é uma emenda horizontal reta em y = 1080, atravessando a peça.
     * A pele passa a dizer só a sua cor de base; o palco a estica na altura
     * certa de cada formato.
     */
    ctx.fillStyle = pele.palco;
    ctx.fillRect(0, 0, L, A);

    const g = ctx.createLinearGradient(0, 0, 0, A);
    g.addColorStop(0, pele.palcoTopo);
    g.addColorStop(1, pele.palcoBase);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, A);

    // Escudos em marca d'água. Vêm ANTES da grama e da vinheta, para as duas
    // camadas de cima os assentarem no fundo em vez de deixá-los flutuando.
    const { carregarImagem } = p();
    const largo = L * 0.66;
    for (const [time, x] of [['casa', -largo * 0.26], ['fora', L - largo * 0.74]]) {
      const img = await carregarImagem(estado.config?.[time]?.escudo);
      if (!img) continue;
      const escala = largo / Math.max(img.width, img.height);
      const alto = img.height * escala;
      ctx.save();
      ctx.globalAlpha = 0.038;
      ctx.drawImage(img, x, A * agua - alto / 2, img.width * escala, alto);
      ctx.restore();
    }

    /*
     * Grama: listras de corte, subindo esmaecida. A transição é LONGA (a faixa
     * inteira) porque uma faixa curta desenha uma emenda horizontal visível no
     * meio da peça — o primeiro desenho tinha essa costura, e ela salta aos
     * olhos mais que a grama.
     */
    const grama = A * 0.30;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, A - grama, L, grama);
    ctx.clip();
    const base = ctx.createLinearGradient(0, A - grama, 0, A);
    base.addColorStop(0, 'rgba(20, 58, 28, 0)');
    base.addColorStop(0.55, pele.gramaMeio);
    base.addColorStop(1, pele.grama);
    ctx.fillStyle = base;
    ctx.fillRect(0, A - grama, L, grama);
    // As listras também esmaecem, senão elas aparecem onde a grama já não está.
    const listras = ctx.createLinearGradient(0, A - grama, 0, A);
    listras.addColorStop(0, 'rgba(255, 255, 255, 0)');
    listras.addColorStop(1, 'rgba(255, 255, 255, .03)');
    ctx.fillStyle = listras;
    for (let x = 0; x < L; x += 108) ctx.fillRect(x, A - grama, 54, grama);
    ctx.restore();

    // Vinheta discreta: puxa o olho para o miolo sem chapar as bordas.
    const v = ctx.createRadialGradient(L / 2, A * 0.44, L * 0.28, L / 2, A * 0.44, L * 1.05);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, pele.vinheta);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, L, A);
  }

  /**
   * Uma bola, desenhada: é o separador do deck e não há arquivo para carregar.
   *
   * O que faz o ícone ler como bola são as costuras SAINDO DOS VÉRTICES do
   * pentágono central. Na primeira versão elas começavam fora dele e iam até a
   * borda: o resultado era uma flor, não uma bola.
   */
  function bola(ctx, cx, cy, r) {
    const vertice = (i, raio) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      return [cx + Math.cos(a) * raio, cy + Math.sin(a) * raio];
    };

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f6f6f2';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.strokeStyle = 'rgba(21,23,28,.25)';
    ctx.stroke();

    ctx.fillStyle = '#15171c';
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const [px, py] = vertice(i, r * 0.38);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#15171c';
    ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i += 1) {
      const [x1, y1] = vertice(i, r * 0.38);
      const [x2, y2] = vertice(i, r * 0.82);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A marca, desenhada — não há arquivo de logo para carregar. */
  function marca(ctx, x, y, pele, { escala = 1 } = {}) {
    const { escreve, caixa } = p();
    const h = 30 * escala;
    caixa(ctx, x, y - h, 8 * escala, h, 3 * escala, pele.acento);
    caixa(ctx, x + 12 * escala, y - h * 0.72, 8 * escala, h * 0.72, 3 * escala, pele.marcaClara);
    escreve(ctx, 'DuStats', x + 30 * escala, y, {
      tamanho: 34 * escala, peso: 700, alinha: 'left', cor: pele.texto
    });
  }

  /** Título grande em itálico sintético: a energia do deck sem arquivo de fonte. */
  function manchete(ctx, texto, x, y, { tamanho, cor, alinha = 'center' }) {
    ctx.save();
    ctx.font = `italic 700 ${tamanho}px ${p().FONTE}`;
    ctx.fillStyle = cor;
    ctx.textAlign = alinha;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(texto, x, y);
    ctx.restore();
  }

  /** Rodapé: assinatura e data. Fecha a peça e identifica a origem do número. */
  function rodape(ctx, L, A, estado, pele) {
    const { escreve } = p();
    const data = new Date(estado.criadaEm).toLocaleDateString('pt-BR');
    escreve(ctx, `${data}  ·  DUSTATS`, L / 2, A - 40, {
      tamanho: 20, cor: pele.rodape, espaco: 3
    });
  }

  /** O bloco do placar: escudo · caixa com o placar · escudo, nomes embaixo. */
  async function blocoDePlacar(ctx, estado, pele, { cx, cy, escala = 1 }) {
    const { escreve, caixa, desenharEscudo } = p();
    const lCaixa = 300 * escala;
    const aCaixa = 128 * escala;
    const afast = 232 * escala;

    await desenharEscudo(ctx, estado, 'casa', cx - afast, cy, 112 * escala);
    await desenharEscudo(ctx, estado, 'fora', cx + afast, cy, 112 * escala);

    caixa(ctx, cx - lCaixa / 2, cy - aCaixa / 2, lCaixa, aCaixa, 14 * escala, pele.placarFundo);
    const dy = cy + 34 * escala;
    escreve(ctx, `${estado.placar.casa}`, cx - 76 * escala, dy, { tamanho: 104 * escala, peso: 700, cor: pele.placarTexto });
    escreve(ctx, '×', cx, dy - 8 * escala, { tamanho: 46 * escala, cor: pele.separador });
    escreve(ctx, `${estado.placar.fora}`, cx + 76 * escala, dy, { tamanho: 104 * escala, peso: 700, cor: pele.placarTexto });

    const yNome = cy + 104 * escala;
    for (const [time, x] of [['casa', cx - afast], ['fora', cx + afast]]) {
      escreve(ctx, global.DuStats.overlay.nome(estado.config, time).toUpperCase(), x, yNome, {
        tamanho: 24 * escala, peso: 700, cor: pele.texto, espaco: 1.5
      });
    }
  }

  /**
   * Uma linha de estatística: valor · barra ← rótulo → barra · valor.
   *
   * As barras crescem do CENTRO para fora, como na skin Diurno: com o rótulo no
   * meio, o olho compara os dois lados sem reler o nome da estatística.
   */
  function linhaDeEstatistica(ctx, linha, { x, y, largura, cores, pele, escala = 1 }) {
    const { escreve, caixa } = p();
    const sufixo = linha.sufixo || '';
    const total = linha.casa + linha.fora;
    const fatia = total > 0 ? linha.casa / total : 0.5;

    const colValor = 96 * escala;
    const colRotulo = 260 * escala;
    const trilho = (largura - colValor * 2 - colRotulo) / 2;
    const esqFim = x + colValor + trilho;
    const dirIni = esqFim + colRotulo;
    const alturaBarra = 15 * escala;
    const yBarra = y - alturaBarra / 2;
    const lider = linha.destacar && linha.casa !== linha.fora
      ? (linha.casa > linha.fora ? 'casa' : 'fora') : null;

    escreve(ctx, `${linha.casa}${sufixo}`, x + colValor - 14 * escala, y + 11 * escala, {
      tamanho: 34 * escala, peso: 700, alinha: 'right',
      cor: lider === 'casa' ? cores.casa : pele.textoLinha
    });
    escreve(ctx, `${linha.fora}${sufixo}`, dirIni + trilho + 14 * escala, y + 11 * escala, {
      tamanho: 34 * escala, peso: 700, alinha: 'left',
      cor: lider === 'fora' ? cores.fora : pele.textoLinha
    });
    escreve(ctx, linha.rotulo.toUpperCase(), esqFim + colRotulo / 2, y + 7 * escala, {
      tamanho: 18 * escala, cor: pele.textoFraco, espaco: 2
    });

    // Trilho vazio dos dois lados e, em cima, a parte de cada time.
    caixa(ctx, x + colValor, yBarra, trilho, alturaBarra, alturaBarra / 2, pele.trilhoVazio);
    caixa(ctx, dirIni, yBarra, trilho, alturaBarra, alturaBarra / 2, pele.trilhoVazio);
    const lEsq = trilho * fatia;
    const lDir = trilho * (1 - fatia);
    if (lEsq > 1) caixa(ctx, esqFim - lEsq, yBarra, lEsq, alturaBarra, alturaBarra / 2, cores.casa);
    if (lDir > 1) caixa(ctx, dirIni, yBarra, lDir, alturaBarra, alturaBarra / 2, cores.fora);
  }

  /** Só o que tem barra e vira gráfico; o resto não cabe num post. */
  function linhasDoPost(estado, quantas) {
    return (estado.comparativo || []).filter((l) => l.barra).slice(0, quantas);
  }

  function golsDoJogo(estado) {
    return (estado.linhaDoTempo || []).filter((i) => i.tipo === 'gol');
  }

  /** Como o post se chama, conforme o momento do jogo. */
  function tituloDoMomento(estado) {
    const periodo = estado.relogio?.periodo;
    if (periodo === 'FIM') return 'FIM DE JOGO';
    if (periodo === 'INTERVALO') return 'INTERVALO';
    if (periodo === 'PRE') return 'PRÉ-JOGO';
    return (estado.relogio?.periodoNome || '').toUpperCase();
  }

  // ------------------------------------------------------------- formatos

  /** FEED 4:5 — o post de resumo: placar, estatísticas e os gols. */
  async function feed(ctx, estado, pele, cores, L, A) {
    const { escreve, caixa } = p();

    await palco(ctx, L, A, estado, pele, { agua: 0.20 });

    marca(ctx, 60, 108, pele);
    const cabecalho = [estado.config.competicao, estado.config.local].filter(Boolean);
    cabecalho.forEach((linha, i) => {
      escreve(ctx, linha.toUpperCase(), L - 60, 84 + i * 30, {
        tamanho: 21, peso: 700, alinha: 'right', cor: pele.textoFraco, espaco: 2.5
      });
    });

    manchete(ctx, tituloDoMomento(estado), 60, 248, { tamanho: 94, cor: pele.texto, alinha: 'left' });

    await blocoDePlacar(ctx, estado, pele, { cx: L / 2, cy: 372, escala: 1 });

    // Cartão de estatísticas.
    const linhas = linhasDoPost(estado, 5);
    const alturaLinha = 62;
    const cartaoA = 46 + linhas.length * alturaLinha;
    const cartaoY = 528;
    caixa(ctx, 52, cartaoY, L - 104, cartaoA, 22, pele.cartao);
    linhas.forEach((linha, i) => {
      linhaDeEstatistica(ctx, linha, {
        x: 84, y: cartaoY + 46 + i * alturaLinha, largura: L - 168, cores, pele
      });
    });

    // Cartão dos gols. Sem gol nenhum ele não entra: um bloco vazio com título
    // "DESTAQUES DO JOGO" é pior que a ausência dele.
    const gols = golsDoJogo(estado);
    const golY = cartaoY + cartaoA + 26;
    const temPatrocinio = Boolean((estado.config.patrocinador || '').trim());
    const sobra = A - golY - (temPatrocinio ? 186 : 84);
    if (gols.length > 0) {
      const cabem = Math.max(1, Math.min(gols.length, Math.floor((sobra - 74) / 58)));
      const golA = 74 + cabem * 58;
      caixa(ctx, 52, golY, L - 104, golA, 22, pele.cartaoEscuro);
      escreve(ctx, 'DESTAQUES DO JOGO', 84, golY + 46, {
        tamanho: 22, peso: 700, alinha: 'left', cor: pele.textoSobreEscuro, espaco: 3
      });
      gols.slice(0, cabem).forEach((gol, i) => {
        const y = golY + 96 + i * 58;
        const cor = gol.equipe === 'casa' ? cores.casa : cores.fora;
        caixa(ctx, 84, y - 17, 7, 24, 3, cor);
        escreve(ctx, `${gol.minuto}'`, 108, y, {
          tamanho: 27, peso: 700, alinha: 'left', cor: pele.textoSobreEscuro
        });
        const time = global.DuStats.overlay.nome(estado.config, gol.equipe);
        const quem = (gol.autor || '').trim();
        const texto = `Gol · ${time}${gol.contra ? ' (contra)' : ''}${quem ? `  —  ${quem}` : ''}`;
        escreve(ctx, texto, 186, y, { tamanho: 25, alinha: 'left', cor: pele.textoSobreEscuroFraco });
      });
      if (gols.length > cabem) {
        escreve(ctx, `+${gols.length - cabem}`, L - 84, golY + 96, {
          tamanho: 24, peso: 700, alinha: 'right', cor: pele.textoFraco
        });
      }
    }

    if (temPatrocinio) {
      const y = A - 166;
      caixa(ctx, 52, y, L - 104, 88, 18, pele.cartao);
      escreve(ctx, estado.config.patrocinador.toUpperCase(), L / 2, y + 44, {
        tamanho: 26, peso: 700, cor: pele.textoLinha, espaco: 2
      });
      escreve(ctx, 'JUNTOS PELO FUTEBOL LOCAL', L / 2, y + 70, {
        tamanho: 16, cor: pele.textoFraco, espaco: 3
      });
    }

    rodape(ctx, L, A, estado, pele);
  }

  /** QUADRADO 1:1 — uma estatística só, grande, para postar no meio do jogo. */
  async function quadrado(ctx, estado, pele, cores, L, A, { rotulo } = {}) {
    const { escreve, caixa, desenharEscudo } = p();
    await palco(ctx, L, A, estado, pele, { agua: 0.18 });

    marca(ctx, 60, 104, pele);
    escreve(ctx, (estado.config.competicao || '').toUpperCase(), L - 60, 94, {
      tamanho: 21, peso: 700, alinha: 'right', cor: pele.textoFraco, espaco: 2.5
    });

    const linhas = linhasDoPost(estado, 20);
    const linha = linhas.find((l) => l.rotulo === rotulo) || linhas[0];
    if (!linha) {
      escreve(ctx, 'SEM ESTATÍSTICA AINDA', L / 2, A / 2, { tamanho: 34, cor: pele.textoFraco, espaco: 3 });
      rodape(ctx, L, A, estado, pele);
      return;
    }

    const total = linha.casa + linha.fora;
    const fatia = total > 0 ? linha.casa / total : 0.5;
    const sufixo = linha.sufixo || '';

    caixa(ctx, 76, 246, L - 152, 470, 26, pele.cartao);
    escreve(ctx, linha.rotulo.toUpperCase(), L / 2, 324, {
      tamanho: 34, peso: 700, cor: pele.textoLinha, espaco: 4
    });

    await desenharEscudo(ctx, estado, 'casa', 232, 424, 108);
    await desenharEscudo(ctx, estado, 'fora', L - 232, 424, 108);
    bola(ctx, L / 2, 424, 38);

    escreve(ctx, `${linha.casa}${sufixo}`, 344, 552, { tamanho: 86, peso: 700, alinha: 'left', cor: cores.casa });
    escreve(ctx, `${linha.fora}${sufixo}`, L - 344, 552, { tamanho: 86, peso: 700, alinha: 'right', cor: cores.fora });

    const bx = 132;
    const bl = L - bx * 2;
    caixa(ctx, bx, 586, bl, 24, 12, pele.trilhoVazio);
    if (bl * fatia > 1) caixa(ctx, bx, 586, bl * fatia, 24, 12, cores.casa);
    if (bl * (1 - fatia) > 1) caixa(ctx, bx + bl * fatia, 586, bl * (1 - fatia), 24, 12, cores.fora);

    // Os nomes DENTRO do cartão: em 660 eles caíam exatamente na borda, metade
    // no branco e metade no fundo escuro.
    for (const [time, x, alinha] of [['casa', bx, 'left'], ['fora', L - bx, 'right']]) {
      escreve(ctx, global.DuStats.overlay.nome(estado.config, time).toUpperCase(), x, 666, {
        tamanho: 23, peso: 700, alinha, cor: pele.textoLinhaFraco, espaco: 2
      });
    }

    manchete(ctx, 'O jogo em um número.', L / 2, 812, { tamanho: 44, cor: pele.acento });
    rodape(ctx, L, A, estado, pele);
  }

  /** STORY 9:16 — o gol, com o minuto, para subir enquanto o jogo corre. */
  async function story(ctx, estado, pele, cores, L, A, { golIndice } = {}) {
    const { escreve, caixa, desenharEscudo } = p();
    await palco(ctx, L, A, estado, pele, { agua: 0.14 });

    marca(ctx, 60, 180, pele, { escala: 1.1 });

    const gols = golsDoJogo(estado);
    const gol = gols.length > 0
      ? (gols[golIndice] || gols[gols.length - 1])
      : null;

    // Badge do minuto, no alto à direita: é o que faz o story parecer ao vivo.
    const minuto = gol ? `${gol.minuto}'` : (estado.relogio?.periodoCurto || '');
    if (minuto) {
      caixa(ctx, L - 214, 128, 154, 66, 16, pele.placarFundo);
      escreve(ctx, minuto, L - 137, 174, { tamanho: 40, peso: 700, cor: pele.placarTexto });
    }

    // Sem gol o story não pode mentir um "GOOOL!": ele vira o placar do momento.
    const time = gol ? gol.equipe : null;
    const cor = time === 'casa' ? cores.casa : time === 'fora' ? cores.fora : pele.acento;

    manchete(ctx, gol ? 'GOOOL!' : tituloDoMomento(estado), L / 2, 700, {
      tamanho: gol ? 186 : 116, cor: pele.texto
    });
    caixa(ctx, L / 2 - 150, 746, 300, 12, 6, cor);

    if (gol) {
      await desenharEscudo(ctx, estado, time, L / 2, 916, 180);
      escreve(ctx, global.DuStats.overlay.nome(estado.config, time).toUpperCase(), L / 2, 1064, {
        tamanho: 44, peso: 700, cor: pele.texto, espaco: 3
      });
      const quem = (gol.autor || '').trim();
      if (quem) {
        escreve(ctx, quem.toUpperCase(), L / 2, 1146, { tamanho: 62, peso: 700, cor, espaco: 2 });
      }
      if (gol.contra) {
        escreve(ctx, 'GOL CONTRA', L / 2, quem ? 1192 : 1128, { tamanho: 26, cor: pele.textoFraco, espaco: 3 });
      }

      // Linha fina do placar, para quem vê o story sem ter visto os outros.
      const y = quem ? 1262 : 1206;
      caixa(ctx, L / 2 - 300, y, 600, 78, 18, pele.cartaoEscuro);
      const sigla = (lado) => global.DuStats.overlay.sigla(estado.config, lado);
      escreve(ctx, `${sigla('casa')}  ${estado.placar.casa}  ×  ${estado.placar.fora}  ${sigla('fora')}`,
        L / 2, y + 52, { tamanho: 36, peso: 700, cor: pele.textoSobreEscuro, espaco: 2 });
    } else {
      await blocoDePlacar(ctx, estado, pele, { cx: L / 2, cy: 980, escala: 1.15 });
    }

    manchete(ctx, 'A emoção em tempo real.', L / 2, A - 260, { tamanho: 46, cor: pele.acento });
    rodape(ctx, L, A, estado, pele);
  }

  /** RESUMO 1:1 — o resultado, para carrossel ou feed. */
  async function resumo(ctx, estado, pele, cores, L, A) {
    const { escreve, caixa } = p();
    await palco(ctx, L, A, estado, pele, { agua: 0.16 });

    marca(ctx, 60, 104, pele);
    escreve(ctx, (estado.config.competicao || '').toUpperCase(), L - 60, 94, {
      tamanho: 21, peso: 700, alinha: 'right', cor: pele.textoFraco, espaco: 2.5
    });

    const { casa, fora } = estado.placar;
    const venceu = casa === fora ? null : (casa > fora ? 'casa' : 'fora');
    const nome = venceu ? global.DuStats.overlay.nome(estado.config, venceu) : null;

    // Duas linhas em vez de uma: "VITÓRIA DO GRÊMIO DA VILA" numa linha só sai
    // pequeno demais para valer como manchete.
    if (nome) {
      manchete(ctx, 'VITÓRIA DO', L / 2, 316, { tamanho: 78, cor: pele.texto });
      manchete(ctx, `${nome.toUpperCase()}!`, L / 2, 404, {
        tamanho: nome.length > 12 ? 66 : 88,
        cor: venceu === 'casa' ? cores.casa : cores.fora
      });
    } else {
      manchete(ctx, 'EMPATE', L / 2, 372, { tamanho: 104, cor: pele.texto });
    }

    await blocoDePlacar(ctx, estado, pele, { cx: L / 2, cy: 620, escala: 1.12 });

    const assinatura = (estado.config.patrocinador || '').trim();
    escreve(ctx, (assinatura || 'RAÇA · COMUNIDADE · FUTEBOL').toUpperCase(), L / 2, A - 120, {
      tamanho: 26, peso: 700, cor: pele.textoFraco, espaco: 4
    });
    rodape(ctx, L, A, estado, pele);
  }

  const PINTORES = { feed, quadrado, story, resumo };

  /**
   * A pele do post: a mesma da skin que foi ao ar, mais as chaves que só um
   * post tem (palco, grama, vinheta). Sem isto cada formato reinventaria o
   * fundo e os quatro deixariam de parecer do mesmo pacote.
   */
  function peleDoPost(estado) {
    const acento = estado.config?.acento || '#17b64a';
    const cores = {
      casa: p().corDoTime(estado.config, 'casa', '#1f6feb'),
      fora: p().corDoTime(estado.config, 'fora', '#d92d20')
    };
    const base = p().paletaDaSkin(
      estado.config?.skin, acento, global.DuStats.escurecer(acento), cores.casa, cores.fora
    );
    const claro = ['capsulas', 'costura', 'diurno'].includes(estado.config?.skin);

    return {
      ...base,
      acento,
      palco: base.palco,
      // Skin clara pede palco claro, senão o post sai com a cara de outra skin.
      palcoTopo: claro ? 'rgba(255,255,255,.16)' : 'rgba(9,14,34,.22)',
      palcoBase: claro ? 'rgba(0,0,0,.10)' : 'rgba(0,0,0,.46)',
      grama: claro ? 'rgba(40, 92, 48, .26)' : 'rgba(16, 48, 24, .62)',
      gramaMeio: claro ? 'rgba(40, 92, 48, .10)' : 'rgba(17, 50, 25, .26)',
      vinheta: claro ? 'rgba(0,0,0,.07)' : 'rgba(0,0,0,.26)',
      marcaClara: claro ? 'rgba(17,20,26,.35)' : 'rgba(255,255,255,.55)',
      cartao: claro ? 'rgba(255,255,255,.90)' : 'rgba(255,255,255,.94)',
      // O cartão escuro tem que ser mais escuro que o palco para LER como
      // cartão. A 80% de opacidade sobre navy ele desaparecia: ficava um
      // retângulo que ninguém vê, com texto escuro dentro, ilegível.
      cartaoEscuro: claro ? 'rgba(14,17,24,.95)' : 'rgba(4,6,14,.92)',
      // Dentro do cartão branco o texto é sempre escuro, em qualquer skin: é
      // um retângulo claro, não o fundo da peça. E dentro do cartão escuro é
      // sempre claro, pela mesma razão invertida.
      textoLinha: '#16181f',
      textoLinhaFraco: '#5c6472',
      textoSobreEscuro: '#f2f4f8',
      textoSobreEscuroFraco: 'rgba(242,244,248,.72)',
      textoFraco: claro ? '#6b7280' : '#7b869e',
      trilhoVazio: 'rgba(17,20,26,.12)',
      placarFundo: base.bloco,
      placarTexto: base.textoPlacar,
      rodape: claro ? 'rgba(17,20,26,.45)' : 'rgba(255,255,255,.42)'
    };
  }

  /** Desenha um formato e devolve o canvas. */
  async function desenhar(estado, formato = 'feed', opcoes = {}) {
    const medida = FORMATOS[formato] || FORMATOS.feed;
    const canvas = document.createElement('canvas');
    canvas.width = medida.largura;
    canvas.height = medida.altura;
    const ctx = canvas.getContext('2d');

    const pele = peleDoPost(estado);
    const cores = {
      casa: p().corDoTime(estado.config, 'casa', '#1f6feb'),
      fora: p().corDoTime(estado.config, 'fora', '#d92d20')
    };

    await (PINTORES[formato] || feed)(ctx, estado, pele, cores, medida.largura, medida.altura, opcoes);
    return canvas;
  }

  /**
   * JPEG por padrão: é o que o Instagram quer, e um feed 1080 × 1350 em PNG
   * passa de 2 MB por causa da grama e da vinheta — anexo grande demais para
   * mandar pelo WhatsApp no vestiário.
   */
  async function baixar(estado, formato = 'feed', opcoes = {}, tipo = 'image/jpeg') {
    const canvas = await desenhar(estado, formato, opcoes);
    const blob = await new Promise((r) => canvas.toBlob(r, tipo, 0.94));
    const ext = tipo === 'image/png' ? 'png' : 'jpg';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dustats-${formato}-${estado.id}.${ext}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.social = { desenhar, baixar, FORMATOS, linhasDoPost, golsDoJogo };
})(window);
