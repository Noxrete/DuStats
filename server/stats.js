'use strict';

const clock = require('./clock');

const EQUIPES = ['casa', 'fora'];
const BIN_MS = 5 * 60 * 1000; // janela do gráfico de pressão: 5 minutos

/** Peso de cada ação ofensiva no índice de pressão. */
const PESO_PRESSAO = {
  gol: 4,
  finalizacao: { no_gol: 3, trave: 3, fora: 1.5, bloqueada: 1 },
  escanteio: 1
};
const PESO_POSSE = 2; // domínio total da posse numa janela vale 2 pontos

function novoAcumulador() {
  return {
    gols: 0,
    finalizacoes: 0,
    noGol: 0,
    paraFora: 0,
    bloqueadas: 0,
    trave: 0,
    escanteios: 0,
    faltas: 0,
    amarelos: 0,
    vermelhos: 0,
    impedimentos: 0,
    defesas: 0,
    substituicoes: 0,
    posseMs: 0
  };
}

function contar(acc, evento) {
  const meta = evento.meta || {};
  switch (evento.type) {
    case 'gol':
      acc.gols += 1;
      break;
    case 'finalizacao':
      acc.finalizacoes += 1;
      if (meta.desfecho === 'no_gol') acc.noGol += 1;
      else if (meta.desfecho === 'trave') acc.trave += 1;
      else if (meta.desfecho === 'bloqueada') acc.bloqueadas += 1;
      else acc.paraFora += 1;
      break;
    case 'escanteio': acc.escanteios += 1; break;
    case 'falta': acc.faltas += 1; break;
    case 'cartao':
      if (meta.cor === 'vermelho') acc.vermelhos += 1;
      else acc.amarelos += 1;
      break;
    case 'impedimento': acc.impedimentos += 1; break;
    case 'defesa': acc.defesas += 1; break;
    case 'substituicao': acc.substituicoes += 1; break;
    default: break;
  }
}

/**
 * Um gol também é uma finalização no gol. O apontador registra só GOL (um
 * toque), então a contagem de finalizações é fechada aqui, na derivação.
 */
function fecharAcumulador(acc) {
  const finalizacoes = acc.finalizacoes + acc.gols;
  const noGol = acc.noGol + acc.gols;
  return {
    ...acc,
    finalizacoes,
    noGol,
    precisao: finalizacoes > 0 ? Math.round((noGol / finalizacoes) * 100) : 0
  };
}

function creditarPosseEmBins(bins, equipe, de, ate) {
  if (!equipe || ate <= de) return;
  let cursor = de;
  while (cursor < ate) {
    const idx = Math.floor(cursor / BIN_MS);
    const fimDoBin = (idx + 1) * BIN_MS;
    const fim = Math.min(ate, fimDoBin);
    garantirBin(bins, idx);
    bins[idx].posse[equipe] += fim - cursor;
    cursor = fim;
  }
}

function garantirBin(bins, idx) {
  while (bins.length <= idx) {
    bins.push({
      idx: bins.length,
      minutoInicio: (bins.length * BIN_MS) / 60000,
      acoes: { casa: 0, fora: 0 },
      posse: { casa: 0, fora: 0 }
    });
  }
}

function pesoDe(evento) {
  const meta = evento.meta || {};
  if (evento.type === 'gol') return PESO_PRESSAO.gol;
  if (evento.type === 'finalizacao') return PESO_PRESSAO.finalizacao[meta.desfecho] ?? PESO_PRESSAO.finalizacao.fora;
  if (evento.type === 'escanteio') return PESO_PRESSAO.escanteio;
  return 0;
}

/**
 * Percorre a lista de eventos uma única vez e devolve TODAS as estatísticas.
 * Nada aqui sabe se o evento veio do painel manual ou de um detector de vídeo.
 */
function derivar(eventos, esporte, wallAgora = Date.now()) {
  const relogio = clock.novoRelogio();
  const total = { casa: novoAcumulador(), fora: novoAcumulador() };
  const porPeriodo = {};
  const bins = [];
  const anotados = [];
  const chutes = [];
  const linhaDoTempo = [];

  let posseAtual = null;   // 'casa' | 'fora' | null (bola parada)
  let posseDesde = 0;      // tTotal do último toggle de posse
  let posseMsParada = 0;

  const accPeriodo = (id) => {
    if (!porPeriodo[id]) porPeriodo[id] = { casa: novoAcumulador(), fora: novoAcumulador() };
    return porPeriodo[id];
  };

  const creditarPosse = (ateTotal, periodoId) => {
    const delta = ateTotal - posseDesde;
    if (delta <= 0) { posseDesde = ateTotal; return; }
    if (posseAtual) {
      total[posseAtual].posseMs += delta;
      accPeriodo(periodoId)[posseAtual].posseMs += delta;
      creditarPosseEmBins(bins, posseAtual, posseDesde, ateTotal);
    } else {
      posseMsParada += delta;
    }
    posseDesde = ateTotal;
  };

  for (const evento of eventos) {
    const marca = clock.aplicar(relogio, evento, esporte);
    creditarPosse(marca.tTotal, marca.periodo);

    const anotado = {
      ...evento,
      tPeriodo: marca.tPeriodo,
      tTotal: marca.tTotal,
      periodo: marca.periodo,
      minuto: clock.formatarMinuto(marca.tPeriodo, esporte, marca.periodoIdx)
    };
    anotados.push(anotado);

    if (evento.type === 'posse') {
      posseAtual = EQUIPES.includes(evento.team) ? evento.team : null;
      continue;
    }

    if (!EQUIPES.includes(evento.team)) continue;

    contar(total[evento.team], evento);
    contar(accPeriodo(marca.periodo)[evento.team], evento);

    const peso = pesoDe(evento);
    if (peso > 0) {
      const idx = Math.floor(marca.tTotal / BIN_MS);
      garantirBin(bins, idx);
      bins[idx].acoes[evento.team] += peso;
    }

    if (evento.type === 'gol' || evento.type === 'finalizacao') {
      chutes.push({
        equipe: evento.team,
        x: typeof evento.x === 'number' ? evento.x : null,
        y: typeof evento.y === 'number' ? evento.y : null,
        desfecho: evento.type === 'gol' ? 'gol' : (evento.meta?.desfecho || 'fora'),
        gol: evento.type === 'gol',
        minuto: anotado.minuto,
        periodo: marca.periodo
      });
    }

    if (evento.type === 'gol' || evento.type === 'cartao') {
      linhaDoTempo.push({
        tipo: evento.type,
        equipe: evento.team,
        minuto: anotado.minuto,
        tTotal: marca.tTotal,
        periodo: marca.periodo,
        cor: evento.meta?.cor || null,
        contra: Boolean(evento.meta?.contra)
      });
    }
  }

  // Fecha o trecho de posse aberto até o instante atual.
  const estadoRelogio = clock.agora(relogio, esporte, wallAgora);
  creditarPosse(estadoRelogio.tTotal, estadoRelogio.periodo);

  const posseTotal = total.casa.posseMs + total.fora.posseMs;
  const posse = {
    msCasa: total.casa.posseMs,
    msFora: total.fora.posseMs,
    msParada: posseMsParada,
    casa: posseTotal > 0 ? Math.round((total.casa.posseMs / posseTotal) * 100) : 50,
    fora: posseTotal > 0 ? 100 - Math.round((total.casa.posseMs / posseTotal) * 100) : 50,
    medida: posseTotal > 0
  };

  const momentum = bins.map((bin) => {
    const valor = (equipe) =>
      bin.acoes[equipe] + PESO_POSSE * (bin.posse[equipe] / BIN_MS);
    const casa = valor('casa');
    const fora = valor('fora');
    return {
      minutoInicio: bin.minutoInicio,
      casa: Number(casa.toFixed(2)),
      fora: Number(fora.toFixed(2)),
      saldo: Number((casa - fora).toFixed(2))
    };
  });

  const fechados = { casa: fecharAcumulador(total.casa), fora: fecharAcumulador(total.fora) };
  const periodosFechados = {};
  for (const [id, acc] of Object.entries(porPeriodo)) {
    periodosFechados[id] = { casa: fecharAcumulador(acc.casa), fora: fecharAcumulador(acc.fora) };
  }

  return {
    relogio: estadoRelogio,
    placar: { casa: fechados.casa.gols, fora: fechados.fora.gols },
    posseAtual,
    posse,
    totais: fechados,
    porPeriodo: periodosFechados,
    chutes,
    momentum,
    linhaDoTempo,
    eventos: anotados
  };
}

/** Linhas do painel do intervalo, na ordem em que aparecem no ar. */
function linhasComparativas(stats) {
  const { totais, posse } = stats;
  // `destacar` marca as linhas em que liderar é mérito — só nelas o número do
  // time na frente sai pintado. Liderar em faltas ou cartões não é vantagem.
  const linhas = [
    { rotulo: 'Posse de bola', casa: posse.casa, fora: posse.fora, sufixo: '%', barra: true, destacar: true },
    { rotulo: 'Finalizações', casa: totais.casa.finalizacoes, fora: totais.fora.finalizacoes, barra: true, destacar: true },
    { rotulo: 'No gol', casa: totais.casa.noGol, fora: totais.fora.noGol, barra: true, destacar: true },
    { rotulo: 'Precisão', casa: totais.casa.precisao, fora: totais.fora.precisao, sufixo: '%', barra: true, destacar: true },
    { rotulo: 'Escanteios', casa: totais.casa.escanteios, fora: totais.fora.escanteios, barra: true, destacar: true },
    { rotulo: 'Faltas', casa: totais.casa.faltas, fora: totais.fora.faltas, barra: true, destacar: false },
    { rotulo: 'Impedimentos', casa: totais.casa.impedimentos, fora: totais.fora.impedimentos, barra: true, destacar: false },
    { rotulo: 'Defesas', casa: totais.casa.defesas, fora: totais.fora.defesas, barra: true, destacar: false },
    { rotulo: 'Cartões amarelos', casa: totais.casa.amarelos, fora: totais.fora.amarelos, barra: false, destacar: false },
    { rotulo: 'Cartões vermelhos', casa: totais.casa.vermelhos, fora: totais.fora.vermelhos, barra: false, destacar: false }
  ];
  // Cartões só entram no ar se alguém tomou algum.
  return linhas.filter((l) => l.barra || l.casa > 0 || l.fora > 0);
}

module.exports = { derivar, linhasComparativas, BIN_MS, EQUIPES };
