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
    let cursor = alinha === 'center' ? x - largura / 2 : x;
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

    const fundo = ctx.createLinearGradient(0, 0, 0, LADO);
    fundo.addColorStop(0, NAVY_TOPO);
    fundo.addColorStop(0.5, '#141d45');
    fundo.addColorStop(1, NAVY_BASE);
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, LADO, LADO);

    // A faixa do topo — acento da transmissão à esquerda, branco no resto.
    // É a mesma assinatura de forma do painel e da faixa do rodapé.
    caixa(ctx, 0, 0, LADO * 0.26, 10, 0, acento);
    caixa(ctx, LADO * 0.26, 0, LADO * 0.74, 10, 0, 'rgba(255,255,255,.85)');

    const cabecalho = [estado.config.competicao, estado.config.local].filter(Boolean).join('  ·  ');
    escreve(ctx, cabecalho.toUpperCase(), LADO / 2, 82, { tamanho: 25, cor: '#93a0c4', espaco: 4 });

    // --------------------------------------------------------------- placar
    await desenharEscudo(ctx, estado, 'casa', 168, 208, 128);
    await desenharEscudo(ctx, estado, 'fora', LADO - 168, 208, 128);

    // Bloco do placar num tom próprio, como o "2 x 0" do overlay do placar.
    caixa(ctx, LADO / 2 - 170, 112, 340, 150, 8, NAVY_BLOCO);
    escreve(ctx, `${estado.placar.casa}`, LADO / 2 - 88, 240, { tamanho: 132, peso: 700 });
    escreve(ctx, '×', LADO / 2, 228, { tamanho: 58, cor: 'rgba(255,255,255,.3)' });
    escreve(ctx, `${estado.placar.fora}`, LADO / 2 + 88, 240, { tamanho: 132, peso: 700 });

    escreve(ctx, global.DuStats.overlay.nome(estado.config, 'casa').toUpperCase(), 168, 316, { tamanho: 27, peso: 700 });
    escreve(ctx, global.DuStats.overlay.nome(estado.config, 'fora').toUpperCase(), LADO - 168, 316, { tamanho: 27, peso: 700 });
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

      escreve(ctx, `${linha.casa}${sufixo}`, 150, y + 26, { tamanho: 38, peso: 700, alinha: 'right' });
      escreve(ctx, `${linha.fora}${sufixo}`, LADO - 150, y + 26, { tamanho: 38, peso: 700, alinha: 'left' });
      escreve(ctx, linha.rotulo.toUpperCase(), LADO / 2, y + 8, { tamanho: 19, cor: '#93a0c4', espaco: 2.5 });

      const barraX = 178;
      const barraL = LADO - barraX * 2;
      caixa(ctx, barraX, y + 22, barraL, 11, 6, 'rgba(0,0,0,.34)');
      caixa(ctx, barraX, y + 22, barraL * fatia, 11, 6, corCasa);
      caixa(ctx, barraX + barraL * fatia, y + 22, barraL * (1 - fatia), 11, 6, corFora);
    });

    // ----------------------------------------------------------------- gols
    const gols = estado.linhaDoTempo.filter((i) => i.tipo === 'gol');
    if (gols.length > 0) {
      caixa(ctx, 100, 812, LADO - 200, 2, 1, 'rgba(255,255,255,.14)');
      // Marca de acento ao lado do título, no desenho do chip verde do placar.
      caixa(ctx, LADO / 2 - 66, 848, 5, 20, 2, acento);
      escreve(ctx, 'GOLS', LADO / 2 + 6, 865, { tamanho: 20, cor: '#fff', espaco: 3 });

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
            tamanho: 22, peso: 700, alinha, cor: '#93a0c4'
          });
        }
      }
    }

    const data = new Date(estado.criadaEm).toLocaleDateString('pt-BR');
    escreve(ctx, `${data}  ·  DuStats`, LADO / 2, LADO - 34, { tamanho: 19, cor: '#6a78a4', espaco: 2 });

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
})(window);
