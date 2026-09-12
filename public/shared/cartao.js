/**
 * Cartão de resumo em PNG para postar no grupo/Instagram depois do jogo.
 *
 * Desenhado direto em <canvas>, sem html2canvas nem nenhuma outra biblioteca:
 * é um layout fixo de uma tela só, e escrevê-lo à mão sai menor que a
 * dependência que evitaria escrevê-lo — além de não ter problema nenhum com
 * fontes, escudos ou SVG na hora de virar bitmap.
 */
(function (global) {
  'use strict';

  const LADO = 1080;
  const FONTE = "'Bahnschrift', 'DIN Alternate', 'Arial Narrow', Arial, sans-serif";

  function carregarImagem(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // escudo faltando não pode quebrar a exportação
      img.src = url;
    });
  }

  function corDoTime(config, lado, padrao) {
    return config?.[lado]?.cor || padrao;
  }

  /* Mesma paleta dos overlays, para o post não parecer de outro sistema. */
  const NAVY_TOPO = '#1d2a5e';
  const NAVY_BASE = '#0b1130';
  const NAVY_BLOCO = 'rgba(0, 0, 0, .3)';

  /**
   * A skin do card.
   *
   * Nos overlays a skin é CSS; aqui não dá — isto é canvas, e o navegador não
   * aplica folha de estilo em pixel desenhado à mão. O jeito de não espalhar
   * `if (skin === ...)` por trinta linhas de desenho é este: cada skin devolve
   * as MESMAS chaves, e `desenhar()` só consulta.
   *
   * Uma diferença importante em relação aos overlays: o card é um PNG, não tem
   * vídeo por trás. Skins que lá vivem de translucidez (Vidro) ou de ausência
   * de fundo (Traço) precisam aqui de uma tradução, não de uma cópia — senão
   * viram um retângulo escuro sem graça.
   */
  function paletaDaSkin(skin, acento, acentoEscuro, corDaCasa, corDaFora) {
    const gradiente = (ctx, paradas) => {
      const g = ctx.createLinearGradient(0, 0, 0, LADO);
      for (const [pos, cor] of paradas) g.addColorStop(pos, cor);
      return g;
    };

    const skins = {
      placar: {
        palco: '#141d45',        // o navy do meio do gradiente
        texto: '#fff',
        separador: 'rgba(255,255,255,.3)',
        rodape: '#6a78a4',
        textoFraco: '#93a0c4',
        bloco: NAVY_BLOCO,
        trilho: 'rgba(0,0,0,.34)',
        divisor: 'rgba(255,255,255,.14)',
        fundo(ctx) {
          ctx.fillStyle = gradiente(ctx, [[0, NAVY_TOPO], [0.5, '#141d45'], [1, NAVY_BASE]]);
          ctx.fillRect(0, 0, LADO, LADO);
        },
        faixaTopo(ctx) {
          caixa(ctx, 0, 0, LADO * 0.26, 10, 0, acento);
          caixa(ctx, LADO * 0.26, 0, LADO * 0.74, 10, 0, 'rgba(255,255,255,.85)');
        }
      },

      // Claro e arejado, com um facho de luz atravessando: é o que sobra da
      // ideia de lâmina translúcida quando não há vídeo para atravessar.
      vidro: {
        palco: '#18224a',        // o azul do meio da lâmina
        texto: '#fff',
        separador: 'rgba(255,255,255,.3)',
        rodape: '#6a78a4',
        textoFraco: '#cdd6ea',
        bloco: 'rgba(255,255,255,.08)',
        trilho: 'rgba(0,0,0,.28)',
        divisor: 'rgba(255,255,255,.20)',
        fundo(ctx) {
          ctx.fillStyle = gradiente(ctx, [[0, '#243055'], [0.45, '#18224a'], [1, '#0d1330']]);
          ctx.fillRect(0, 0, LADO, LADO);
          const facho = ctx.createLinearGradient(0, 0, LADO, LADO);
          facho.addColorStop(0, 'rgba(255,255,255,.16)');
          facho.addColorStop(0.42, 'rgba(255,255,255,.03)');
          facho.addColorStop(0.75, 'rgba(255,255,255,0)');
          ctx.fillStyle = facho;
          ctx.fillRect(0, 0, LADO, LADO);
        },
        faixaTopo(ctx) {
          caixa(ctx, 0, 0, LADO * 0.14, 3, 0, acento);
          caixa(ctx, LADO * 0.14, 0, LADO * 0.86, 3, 0, 'rgba(255,255,255,.5)');
        }
      },

      // Sem blocos e sem faixa: só o fundo mais escuro possível e os filetes.
      traco: {
        palco: '#05070f',        // o quase-preto da ausência
        texto: '#fff',
        separador: 'rgba(255,255,255,.3)',
        rodape: '#6a78a4',
        textoFraco: 'rgba(255,255,255,.72)',
        bloco: 'rgba(255,255,255,.04)',
        trilho: 'rgba(255,255,255,.16)',
        divisor: 'rgba(255,255,255,.28)',
        fundo(ctx) {
          ctx.fillStyle = '#05070f';
          ctx.fillRect(0, 0, LADO, LADO);
        },
        faixaTopo() { /* a ausência de faixa é o ponto desta skin */ }
      },

      bandeira: {
        palco: '#0e1533',        // o navy da bandeira
        texto: '#fff',
        separador: 'rgba(255,255,255,.3)',
        rodape: '#6a78a4',
        textoFraco: '#b9c6e4',
        bloco: 'rgba(0,0,0,.42)',
        trilho: 'rgba(0,0,0,.4)',
        divisor: 'rgba(255,255,255,.14)',
        fundo(ctx) {
          ctx.fillStyle = gradiente(ctx, [[0, '#16204a'], [0.5, '#0e1533'], [1, '#0a1024']]);
          ctx.fillRect(0, 0, LADO, LADO);

          // O campo diagonal só no terço de cima, pela mesma razão do overlay:
          // atravessando tudo, ele põe o vermelho do time da casa sobre verde.
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(LADO * 0.62, 0);
          ctx.lineTo(LADO * 0.34, LADO * 0.33);
          ctx.lineTo(0, LADO * 0.33);
          ctx.closePath();
          ctx.clip();
          const campo = ctx.createLinearGradient(0, 0, LADO * 0.62, LADO * 0.38);
          campo.addColorStop(0, acento);
          campo.addColorStop(1, acentoEscuro);
          ctx.globalAlpha = 0.38;
          ctx.fillStyle = campo;
          ctx.fillRect(0, 0, LADO, LADO * 0.33);
          ctx.restore();

          caixa(ctx, 0, 0, 8, LADO, 0, acento);   // a aresta do clube
        },
        faixaTopo(ctx) { caixa(ctx, 0, 0, LADO, 6, 0, acento); }
      },

      estadio: {
        palco: '#0a0f19',        // o quase-preto do refletor
        texto: '#fff',
        separador: 'rgba(255,255,255,.3)',
        rodape: '#6a78a4',
        textoFraco: '#7c8ba8',
        bloco: 'rgba(255,255,255,.04)',
        trilho: 'rgba(255,255,255,.05)',
        divisor: 'rgba(255,255,255,.10)',
        fundo(ctx) {
          ctx.fillStyle = gradiente(ctx, [[0, '#0c111c'], [1, '#05070d']]);
          ctx.fillRect(0, 0, LADO, LADO);

          const holofote = ctx.createRadialGradient(LADO / 2, LADO * 0.30, 0, LADO / 2, LADO * 0.30, LADO * 0.62);
          holofote.addColorStop(0, 'rgba(255,255,255,.09)');
          holofote.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = holofote;
          ctx.fillRect(0, 0, LADO, LADO);

          // A aresta de neon, por dentro da borda para o brilho não ser cortado.
          ctx.save();
          ctx.strokeStyle = acento;
          ctx.lineWidth = 2;
          ctx.shadowColor = acento;
          ctx.shadowBlur = 26;
          ctx.strokeRect(1, 1, LADO - 2, LADO - 2);
          ctx.restore();
        },
        faixaTopo(ctx) {
          ctx.save();
          ctx.shadowColor = acento;
          ctx.shadowBlur = 18;
          caixa(ctx, 0, 0, LADO, 4, 0, acento);
          ctx.restore();
        }
      },

      // ---------------------------------------------------- as quatro claras
      //
      // A partir daqui o cartão pode sair CLARO, e é por isso que a pele ganhou
      // `texto`, `separador` e `rodape`: antes o branco estava escrito na mão
      // no meio do desenho, o que num fundo de linho apaga o placar inteiro.

      capsulas: {
        palco: '#e8e2d2',        // o linho cru
        texto: '#16180f',
        textoPlacar: '#f4f1e8',      // o bloco do placar é preto sobre linho
        textoFraco: '#6f776a',
        separador: 'rgba(244,241,232,.34)',   // o × mora no bloco escuro, não no linho
        rodape: '#8b9384',
        bloco: '#0f100e',
        trilho: 'rgba(15,16,14,.14)',
        divisor: 'rgba(15,16,14,.16)',
        fundo(ctx) {
          ctx.fillStyle = gradiente(ctx, [[0, '#f1ede1'], [1, '#e2dbc8']]);
          ctx.fillRect(0, 0, LADO, LADO);
        },
        // A lona não leva faixa clara no topo — some. O acento assina embaixo.
        faixaTopo(ctx) { caixa(ctx, 0, LADO - 9, LADO, 9, 0, acento); }
      },

      costura: {
        palco: '#e8e2d2',        // o linho cru
        texto: '#16180f',
        textoPlacar: '#f4f1e8',
        textoTopo: 'rgba(255,255,255,.86)',   // a linha de competição cai sobre os campos de cor
        textoFraco: '#6f776a',
        separador: 'rgba(255,255,255,.42)',
        rodape: '#8b9384',
        bloco: '#0f100e',
        trilho: 'rgba(15,16,14,.14)',
        divisor: 'rgba(15,16,14,.16)',
        fundo(ctx) {
          ctx.fillStyle = '#e8e2d2';
          ctx.fillRect(0, 0, LADO, LADO);

          // Os dois campos de cor só na tarja do topo, onde moram escudos e
          // placar. Atravessando o cartão inteiro, eles poriam o número da casa
          // sobre o campo do visitante — o mesmo erro da Bandeira.
          const altura = 272;   // acaba acima dos nomes dos times, que ficam no linho
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(LADO * 0.54, 0);
          ctx.lineTo(LADO * 0.46, altura); ctx.lineTo(0, altura);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = corDaCasa; ctx.fill();
          ctx.beginPath();
          ctx.moveTo(LADO * 0.58, 0); ctx.lineTo(LADO, 0);
          ctx.lineTo(LADO, altura); ctx.lineTo(LADO * 0.50, altura);
          ctx.closePath();
          ctx.fillStyle = corDaFora; ctx.fill();
          ctx.restore();
        },
        faixaTopo() { /* a costura entre os dois campos já é a assinatura */ }
      },

      noturno: {
        palco: '#141610',        // o quase-preto da lona à noite
        texto: '#e8e2d2',
        textoFraco: '#8d9a86',
        separador: 'rgba(232,226,210,.3)',
        rodape: '#6e7a68',
        bloco: 'rgba(232,226,210,.07)',
        trilho: 'rgba(232,226,210,.12)',
        divisor: 'rgba(232,226,210,.16)',
        fundo(ctx) {
          ctx.fillStyle = gradiente(ctx, [[0, '#1b1e14'], [1, '#0d0f0a']]);
          ctx.fillRect(0, 0, LADO, LADO);
        },
        faixaTopo(ctx) {
          caixa(ctx, 0, 0, LADO / 2, 5, 0, corDaCasa);
          caixa(ctx, LADO / 2, 0, LADO / 2, 5, 0, corDaFora);
        }
      },

      // A Desk é a peça grande do intervalo; no card do Instagram, que é um
      // quadrado, ela usa a mesma paleta de navy escuro do painel.
      desk: {
        palco: '#0d1430',
        texto: '#fff',
        textoPlacar: '#0c1330',   // o bloco do placar da Desk é branco
        separador: 'rgba(12,19,48,.35)',
        rodape: '#6a78a4',
        textoFraco: '#8b97b8',
        bloco: '#ffffff',
        trilho: 'rgba(0,0,0,.34)',
        divisor: 'rgba(255,255,255,.10)',
        fundo(ctx) {
          ctx.fillStyle = gradiente(ctx, [[0, '#121a3c'], [1, '#0a1024']]);
          ctx.fillRect(0, 0, LADO, LADO);
        },
        faixaTopo(ctx) { caixa(ctx, 0, 0, LADO, 6, 0, acento); }
      },

      diurno: {
        palco: '#f7f6f2',        // o branco do cartaz
        texto: '#11141a',
        textoTopo: 'rgba(255,255,255,.78)',   // a linha de competição mora na tarja escura
        textoFraco: '#6b7280',
        separador: '#9aa0aa',
        rodape: '#9aa0aa',
        bloco: '#ffffff',
        trilho: '#e4e2dc',
        divisor: 'rgba(17,20,26,.12)',
        fundo(ctx) {
          ctx.fillStyle = '#f7f6f2';
          ctx.fillRect(0, 0, LADO, LADO);
          // A tarja escura do topo, como no painel.
          caixa(ctx, 0, 0, LADO, 104, 0, '#11141a');
        },
        faixaTopo() { /* a tarja do fundo já é a faixa desta skin */ }
      }
    };

    // Skin desconhecida cai no padrão: um post é publicado e não dá para
    // desfazer, então nunca sai um card sem estilo nenhum.
    const pele = skins[skin] || skins.placar;

    /*
     * Duas cores que NÃO seguem a cor do corpo, e é por isso que existem:
     *
     *  - `textoPlacar`: o bloco do placar tem tom próprio, e numa skin clara
     *    ele é escuro. Usar a cor do corpo ali escreve preto sobre preto — o
     *    placar, que é a informação mais importante do card, some.
     *  - `textoTopo`: a linha de competição pode cair sobre tarja escura ou
     *    sobre campo de cor, dependendo da skin.
     *
     * O padrão mantém as cinco primeiras exatamente como eram.
     */
    return {
      textoPlacar: pele.texto,
      textoTopo: pele.textoFraco,
      ...pele
    };
  }

  function escreve(ctx, texto, x, y, { tamanho = 32, peso = 400, cor = '#fff', alinha = 'center', espaco = 0 }) {
    ctx.save();
    ctx.font = `${peso} ${tamanho}px ${FONTE}`;
    ctx.fillStyle = cor;
    ctx.textAlign = espaco ? 'left' : alinha;
    ctx.textBaseline = 'alphabetic';

    if (!espaco) {
      ctx.fillText(texto, x, y);
      ctx.restore();
      return;
    }

    // Canvas não tem letter-spacing confiável em todos os navegadores, então o
    // espaçamento das linhas em caixa alta é feito letra a letra.
    const letras = [...texto];
    const largura = letras.reduce((soma, l) => soma + ctx.measureText(l).width + espaco, -espaco);
    // `alinha: 'right'` precisa ser tratado aqui também. Sem esta linha ele caía
    // no ramo do alinhamento à esquerda e a linha vazava pela borda direita —
    // foi assim que "CAMPEONATO AMADOR" saiu cortado nos quatro formatos do
    // Match Pack, que são os primeiros a alinhar texto espaçado à direita.
    let cursor = alinha === 'center' ? x - largura / 2
      : alinha === 'right' ? x - largura
      : x;
    for (const letra of letras) {
      ctx.fillText(letra, cursor, y);
      cursor += ctx.measureText(letra).width + espaco;
    }
    ctx.restore();
  }

  function caixa(ctx, x, y, largura, altura, raio, cor) {
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect(x, y, largura, altura, raio);
    ctx.fill();
  }

  async function desenharEscudo(ctx, estado, lado, cx, cy, tamanho) {
    const img = await carregarImagem(estado.config?.[lado]?.escudo);
    const cor = corDoTime(estado.config, lado, lado === 'casa' ? '#1f6feb' : '#d92d20');

    if (img) {
      const escala = Math.min(tamanho / img.width, tamanho / img.height);
      const l = img.width * escala;
      const a = img.height * escala;
      ctx.drawImage(img, cx - l / 2, cy - a / 2, l, a);
      return;
    }

    caixa(ctx, cx - tamanho / 2, cy - tamanho / 2, tamanho, tamanho, 16, cor);
    escreve(ctx, global.DuStats.overlay.sigla(estado.config, lado), cx, cy + 14, { tamanho: 40, peso: 700 });
  }

  /** Devolve um canvas 1080×1080 pronto para virar PNG. */
  async function desenhar(estado, { titulo = 'Fim de jogo' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = LADO;
    canvas.height = LADO;
    const ctx = canvas.getContext('2d');

    const corCasa = corDoTime(estado.config, 'casa', '#1f6feb');
    const corFora = corDoTime(estado.config, 'fora', '#d92d20');

    const acento = estado.config?.acento || '#17b64a';
    const pele = paletaDaSkin(estado.config?.skin, acento, global.DuStats.escurecer(acento), corCasa, corFora);

    pele.fundo(ctx);
    // A faixa do topo é assinatura de forma, e cada skin assina do seu jeito —
    // a Traço, por exemplo, assina não desenhando nada.
    pele.faixaTopo(ctx);

    const cabecalho = [estado.config.competicao, estado.config.local].filter(Boolean).join('  ·  ');
    escreve(ctx, cabecalho.toUpperCase(), LADO / 2, 82, { tamanho: 25, cor: pele.textoTopo, espaco: 4 });

    // --------------------------------------------------------------- placar
    await desenharEscudo(ctx, estado, 'casa', 168, 208, 128);
    await desenharEscudo(ctx, estado, 'fora', LADO - 168, 208, 128);

    // Bloco do placar num tom próprio, como o "2 x 0" do overlay do placar.
    caixa(ctx, LADO / 2 - 170, 112, 340, 150, 8, pele.bloco);
    escreve(ctx, `${estado.placar.casa}`, LADO / 2 - 88, 240, { tamanho: 132, peso: 700, cor: pele.textoPlacar });
    escreve(ctx, '×', LADO / 2, 228, { tamanho: 58, cor: pele.separador });
    escreve(ctx, `${estado.placar.fora}`, LADO / 2 + 88, 240, { tamanho: 132, peso: 700, cor: pele.textoPlacar });

    escreve(ctx, global.DuStats.overlay.nome(estado.config, 'casa').toUpperCase(), 168, 316, { tamanho: 27, peso: 700, cor: pele.texto });
    escreve(ctx, global.DuStats.overlay.nome(estado.config, 'fora').toUpperCase(), LADO - 168, 316, { tamanho: 27, peso: 700, cor: pele.texto });
    escreve(ctx, titulo.toUpperCase(), LADO / 2, 316, { tamanho: 22, cor: acento, espaco: 3 });

    // ---------------------------------------------------------- estatísticas
    const linhas = estado.comparativo.filter((l) => l.barra).slice(0, 7);
    const topo = 392;
    const alturaLinha = (784 - topo) / Math.max(linhas.length, 1);

    linhas.forEach((linha, i) => {
      const y = topo + i * alturaLinha;
      const total = linha.casa + linha.fora;
      const fatia = total > 0 ? linha.casa / total : 0.5;
      const sufixo = linha.sufixo || '';

      escreve(ctx, `${linha.casa}${sufixo}`, 150, y + 26, { tamanho: 38, peso: 700, alinha: 'right', cor: pele.texto });
      escreve(ctx, `${linha.fora}${sufixo}`, LADO - 150, y + 26, { tamanho: 38, peso: 700, alinha: 'left', cor: pele.texto });
      escreve(ctx, linha.rotulo.toUpperCase(), LADO / 2, y + 8, { tamanho: 19, cor: pele.textoFraco, espaco: 2.5 });

      const barraX = 178;
      const barraL = LADO - barraX * 2;
      caixa(ctx, barraX, y + 22, barraL, 11, 6, pele.trilho);
      caixa(ctx, barraX, y + 22, barraL * fatia, 11, 6, corCasa);
      caixa(ctx, barraX + barraL * fatia, y + 22, barraL * (1 - fatia), 11, 6, corFora);
    });

    // ----------------------------------------------------------------- gols
    const gols = estado.linhaDoTempo.filter((i) => i.tipo === 'gol');
    if (gols.length > 0) {
      caixa(ctx, 100, 812, LADO - 200, 2, 1, pele.divisor);
      // Marca de acento ao lado do título, no desenho do chip verde do placar.
      caixa(ctx, LADO / 2 - 66, 848, 5, 20, 2, acento);
      escreve(ctx, 'GOLS', LADO / 2 + 6, 865, { tamanho: 20, cor: pele.texto, espaco: 3 });

      // Cabem quatro linhas antes do rodapé; uma goleada vira "+N" em vez de
      // vazar o cartão pela borda de baixo.
      const CABEM = 4;
      for (const [lado, x, alinha] of [['casa', 120, 'left'], ['fora', LADO - 120, 'right']]) {
        const doTime = gols.filter((g) => g.equipe === lado);
        const mostrados = doTime.slice(0, CABEM);
        const cor = lado === 'casa' ? corCasa : corFora;

        mostrados.forEach((gol, i) => {
          escreve(ctx, `${gol.minuto}'${gol.contra ? ' (contra)' : ''}`, x, 908 + i * 33, {
            tamanho: 26, peso: 700, alinha, cor
          });
        });

        if (doTime.length > CABEM) {
          escreve(ctx, `+${doTime.length - CABEM}`, x, 908 + CABEM * 33, {
            tamanho: 22, peso: 700, alinha, cor: pele.textoFraco
          });
        }
      }
    }

    const data = new Date(estado.criadaEm).toLocaleDateString('pt-BR');
    escreve(ctx, `${data}  ·  DuStats`, LADO / 2, LADO - 34, { tamanho: 19, cor: pele.rodape, espaco: 2 });

    return canvas;
  }

  async function baixar(estado, opcoes = {}) {
    const canvas = await desenhar(estado, opcoes);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dustats-${estado.id}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.cartao = { desenhar, baixar, LADO };

  /*
   * As primitivas ficam expostas porque o Match Pack (social.js) desenha em
   * canvas exatamente como este arquivo: a alternativa era uma segunda cópia
   * de `escreve` com espaçamento letra a letra, de `desenharEscudo` com o
   * substituto de sigla, e — pior — de nove paletas de skin. Duas cópias de
   * paleta divergem no dia em que alguém mexe numa cor, e aí o post deixa de
   * casar com o que foi ao ar.
   */
  global.DuStats.pincel = {
    FONTE, escreve, caixa, carregarImagem, desenharEscudo, paletaDaSkin, corDoTime
  };
})(window);
