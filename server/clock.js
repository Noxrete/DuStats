'use strict';

/**
 * Relógio da partida derivado dos eventos.
 *
 * Nada de cronômetro paralelo: o tempo é reconstruído percorrendo a lista de
 * eventos em ordem e somando os intervalos em que o relógio esteve rodando.
 * Como só o `wall` (Date.now da gravação) é persistido, reiniciar o servidor no
 * meio do jogo devolve exatamente o mesmo tempo, e desfazer um evento de
 * relógio corrige o tempo de todos os eventos seguintes automaticamente.
 */

function novoRelogio() {
  return {
    periodoIdx: 0,
    rodando: false,
    ultimoInicio: null, // wall em que o relógio começou a correr
    tPeriodo: 0,        // ms corridos dentro do período atual
    tTotal: 0,          // ms corridos desde o apito inicial (atravessa períodos)
    acrescimoMin: 0
  };
}

/** Avança o relógio até `wall`, se estiver rodando. */
function avancar(relogio, wall) {
  if (!relogio.rodando) return;
  const delta = Math.max(0, wall - relogio.ultimoInicio);
  relogio.tPeriodo += delta;
  relogio.tTotal += delta;
  relogio.ultimoInicio = wall;
}

/**
 * Aplica um evento ao relógio e devolve a marca de tempo do próprio evento
 * (o tempo ANTES do efeito dele, que é o instante em que ele aconteceu).
 */
function aplicar(relogio, evento, esporte) {
  avancar(relogio, evento.wall);

  const marca = {
    tPeriodo: relogio.tPeriodo,
    tTotal: relogio.tTotal,
    periodoIdx: relogio.periodoIdx,
    periodo: esporte.periodos[relogio.periodoIdx].id
  };

  const meta = evento.meta || {};

  if (evento.type === 'relogio') {
    if (meta.acao === 'iniciar' && !relogio.rodando) {
      relogio.rodando = true;
      relogio.ultimoInicio = evento.wall;
    } else if (meta.acao === 'pausar' && relogio.rodando) {
      relogio.rodando = false;
      relogio.ultimoInicio = null;
    }
  } else if (evento.type === 'periodo') {
    const alvo = Number.isInteger(meta.idx) ? meta.idx : relogio.periodoIdx + 1;
    relogio.periodoIdx = Math.max(0, Math.min(alvo, esporte.periodos.length - 1));
    relogio.rodando = false;
    relogio.ultimoInicio = null;
    relogio.tPeriodo = 0;
    relogio.acrescimoMin = 0;
  } else if (evento.type === 'acrescimo') {
    relogio.acrescimoMin = Math.max(0, Number(meta.min) || 0);
  }

  return marca;
}

/** Estado do relógio no instante `agora`, pronto para ser enviado ao cliente. */
function agora(relogio, esporte, wallAgora) {
  const copia = { ...relogio };
  avancar(copia, wallAgora);
  const periodo = esporte.periodos[copia.periodoIdx];
  return {
    periodoIdx: copia.periodoIdx,
    periodo: periodo.id,
    periodoNome: periodo.nome,
    periodoCurto: periodo.curto,
    periodoDuracaoMin: periodo.duracaoMin,
    emJogo: periodo.jogo,
    rodando: copia.rodando,
    tPeriodo: copia.tPeriodo,
    tTotal: copia.tTotal,
    acrescimoMin: copia.acrescimoMin,
    refWall: wallAgora
  };
}

/**
 * Minuto como a transmissão fala.
 *
 * Duas convenções do futebol que um contador simples erraria: o relógio do 2º
 * tempo continua de 45 (um gol aos 3 do segundo tempo é "48'", não "3'"), e o
 * tempo além do regulamentar vira "45+2" em vez de "47".
 */
function formatarMinuto(tPeriodoMs, esporte, periodoIdx) {
  const periodo = esporte.periodos[periodoIdx];
  const base = periodo && periodo.jogo
    ? esporte.periodos.slice(0, periodoIdx)
        .filter((p) => p.jogo)
        .reduce((soma, p) => soma + (p.duracaoMin || 0), 0)
    : 0;

  const min = base + Math.floor(tPeriodoMs / 60000);
  const limite = base + (periodo?.duracaoMin || 0);
  if (periodo?.duracaoMin && min >= limite) return `${limite}+${min - limite + 1}`;
  return String(min + 1);
}

module.exports = { novoRelogio, avancar, aplicar, agora, formatarMinuto };
