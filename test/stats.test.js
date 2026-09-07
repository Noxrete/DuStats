'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const stats = require('../server/stats');
const { esporte, ev } = require('./helpers');

/**
 * Jogo de referência conferido na mão:
 * 1T começa em 0. Posse casa 0-60s, fora 60-180s, casa 180-300s.
 * Relógio pausa aos 300s e só volta aos 900s (tempo parado não conta).
 * Escanteio da casa aos 960s -> mais 60s de posse da casa.
 */
const JOGO = [
  ev(0, 'periodo', null, {}),                                  // PRE -> 1T
  ev(0, 'relogio', null, { acao: 'iniciar' }),
  ev(0, 'posse', 'casa'),
  ev(60_000, 'posse', 'fora'),
  ev(90_000, 'gol', 'fora'),
  ev(180_000, 'posse', 'casa'),
  ev(240_000, 'finalizacao', 'casa', { desfecho: 'no_gol' }, { x: 0.7, y: 0.5 }),
  ev(300_000, 'relogio', null, { acao: 'pausar' }),
  ev(900_000, 'relogio', null, { acao: 'iniciar' }),
  ev(960_000, 'escanteio', 'casa')
];

const AGORA = 960_000;

test('posse de bola soma só o tempo com o relógio correndo', () => {
  const d = stats.derivar(JOGO, esporte, AGORA);

  assert.equal(d.posse.msCasa, 240_000, 'casa: 60s + 120s + 60s');
  assert.equal(d.posse.msFora, 120_000, 'fora: 60s a 180s');
  assert.equal(d.posse.casa, 67);
  assert.equal(d.posse.fora, 33);
  assert.equal(d.posse.casa + d.posse.fora, 100, 'as duas barras têm que fechar 100%');
});

test('os 10 minutos de relógio parado não entram na posse', () => {
  const d = stats.derivar(JOGO, esporte, AGORA);
  assert.equal(d.relogio.tTotal, 360_000, '6 minutos de bola rolando');
  assert.equal(d.posse.msCasa + d.posse.msFora + d.posse.msParada, d.relogio.tTotal);
});

test('gol conta como finalização no gol sem o apontador registrar duas vezes', () => {
  const d = stats.derivar(JOGO, esporte, AGORA);

  assert.equal(d.placar.fora, 1);
  assert.equal(d.totais.fora.finalizacoes, 1);
  assert.equal(d.totais.fora.noGol, 1);
  assert.equal(d.totais.fora.precisao, 100);

  assert.equal(d.totais.casa.finalizacoes, 1);
  assert.equal(d.totais.casa.noGol, 1);
  assert.equal(d.totais.casa.escanteios, 1);
});

test('precisão de finalização é zero quando ninguém finalizou', () => {
  const d = stats.derivar([ev(0, 'periodo', null, {})], esporte, 1000);
  assert.equal(d.totais.casa.precisao, 0);
  assert.equal(d.posse.medida, false, 'sem bola rolando a posse fica marcada como não medida');
  assert.equal(d.posse.casa, 50);
});

test('índice de pressão pondera ações e posse em janelas de 5 minutos', () => {
  const d = stats.derivar(JOGO, esporte, AGORA);

  assert.equal(d.momentum.length, 2);
  // Janela 0-5min: casa 1 finalização no gol (3) + 3min de posse (2 * 180/300)
  assert.equal(d.momentum[0].casa, 4.2);
  // fora: 1 gol (4) + 2min de posse (2 * 120/300)
  assert.equal(d.momentum[0].fora, 4.8);
  assert.equal(d.momentum[0].saldo, -0.6);
  // Janela 5-10min: só o escanteio da casa (1) + 1min de posse (2 * 60/300)
  assert.equal(d.momentum[1].casa, 1.4);
  assert.equal(d.momentum[1].fora, 0);
});

test('mapa de chutes guarda coordenada e desfecho, e gol entra como chute', () => {
  const comGolLocalizado = [...JOGO, ev(990_000, 'gol', 'casa', {}, { x: 0.9, y: 0.45 })];
  const d = stats.derivar(comGolLocalizado, esporte, 1_000_000);

  assert.equal(d.chutes.length, 3);
  const finalizacao = d.chutes.find((c) => c.desfecho === 'no_gol');
  assert.deepEqual([finalizacao.equipe, finalizacao.x, finalizacao.y], ['casa', 0.7, 0.5]);
  const gol = d.chutes.find((c) => c.equipe === 'casa' && c.gol);
  assert.equal(gol.x, 0.9);
});

test('cada evento recebe o minuto certo do período em que caiu', () => {
  const d = stats.derivar(JOGO, esporte, AGORA);
  const gol = d.eventos.find((e) => e.type === 'gol');

  assert.equal(gol.periodo, '1T');
  assert.equal(gol.minuto, '2', 'gol aos 90s cai no 2º minuto');
  assert.equal(d.linhaDoTempo[0].minuto, '2');
});

test('estatísticas ficam separadas por período', () => {
  const doisTempos = [
    ...JOGO,
    ev(1_000_000, 'periodo', null, {}), // 1T -> INTERVALO
    ev(1_100_000, 'periodo', null, {}), // INTERVALO -> 2T
    ev(1_100_000, 'relogio', null, { acao: 'iniciar' }),
    ev(1_200_000, 'gol', 'casa')
  ];
  const d = stats.derivar(doisTempos, esporte, 1_200_000);

  assert.equal(d.porPeriodo['1T'].casa.escanteios, 1);
  assert.equal(d.porPeriodo['1T'].casa.gols, 0);
  assert.equal(d.porPeriodo['2T'].casa.gols, 1);
  assert.equal(d.placar.casa, 1, 'o placar continua acumulado no jogo todo');

  const golDo2T = d.eventos.filter((e) => e.type === 'gol' && e.periodo === '2T')[0];
  assert.equal(golDo2T.minuto, '47', 'gol aos 100s do 2º tempo é o 47º minuto de jogo');
});

test('a lista comparativa esconde cartões quando não houve nenhum', () => {
  const d = stats.derivar(JOGO, esporte, AGORA);
  const rotulos = stats.linhasComparativas(d).map((l) => l.rotulo);

  assert.ok(rotulos.includes('Posse de bola'));
  assert.ok(!rotulos.includes('Cartões amarelos'));

  const comCartao = stats.derivar([...JOGO, ev(970_000, 'cartao', 'fora', { cor: 'vermelho' })], esporte, 970_000);
  const comCartaoRotulos = stats.linhasComparativas(comCartao).map((l) => l.rotulo);
  assert.ok(comCartaoRotulos.includes('Cartões vermelhos'));
});

test('sincronizar o relógio com o Placar PRO não mexe na posse de bola', () => {
  const semAjuste = stats.derivar(JOGO, esporte, AGORA);

  // O mesmo jogo, com um realinhamento de relógio no meio do 1º tempo.
  const comAjuste = stats.derivar([
    ...JOGO.slice(0, 6),
    ev(200_000, 'relogio', null, { acao: 'ajustar', paraMs: 30 * 60_000 }),
    ...JOGO.slice(6)
  ], esporte, AGORA);

  assert.equal(comAjuste.posse.msCasa, semAjuste.posse.msCasa);
  assert.equal(comAjuste.posse.msFora, semAjuste.posse.msFora);
  assert.equal(comAjuste.relogio.tTotal, semAjuste.relogio.tTotal);
  assert.deepEqual(comAjuste.momentum, semAjuste.momentum, 'as janelas de pressão não podem deslizar');

  const golDepois = comAjuste.eventos.find((e) => e.type === 'escanteio');
  assert.notEqual(golDepois.minuto, semAjuste.eventos.find((e) => e.type === 'escanteio').minuto,
    'mas o rótulo de minuto tem que acompanhar o ajuste');
});

/*
 * A posse é a única linha do comparativo que tem número mesmo sem ninguém
 * marcar nada: sem posse medida a conta cai no padrão 50/50. Estes testes
 * existem porque esse padrão já vazou para o ar uma vez — `posse.medida` era
 * calculado e nenhum lugar lia.
 */

const rotulos = (eventos, agora) =>
  stats.linhasComparativas(stats.derivar(eventos, esporte, agora)).map((l) => l.rotulo);

test('sem nenhuma marcação de posse, a linha de posse não vai ao ar', () => {
  const semPosse = [
    ev(0, 'periodo', null, {}),
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    ev(120_000, 'finalizacao', 'casa', { desfecho: 'no_gol' }),
    ev(300_000, 'escanteio', 'fora')
  ];

  const d = stats.derivar(semPosse, esporte, 600_000);
  assert.equal(d.posse.medida, false);
  assert.equal(d.posse.casa, 50, 'o 50/50 continua existindo no estado…');
  assert.ok(!rotulos(semPosse, 600_000).includes('Posse de bola'), '…mas não pode chegar na tela');
});

test('uma marcação solta no fim do tempo não vira 100% no ar', () => {
  // Uma única batida aos 44' credita todo o resto a um time. A conta fica
  // 100% × 0% — indistinguível de um jogo inteiramente dominado.
  const umaBatida = [
    ev(0, 'periodo', null, {}),
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    ev(2_640_000, 'posse', 'casa')   // 44'
  ];
  const agora = 2_700_000;           // 45'

  const d = stats.derivar(umaBatida, esporte, agora);
  assert.equal(d.posse.casa, 100, 'a conta crua realmente dá 100%');
  assert.ok(d.posse.cobertura < 0.05, 'mas só 1 minuto dos 45 foi observado');
  assert.equal(d.posse.medida, false);
  assert.ok(!rotulos(umaBatida, agora).includes('Posse de bola'));
});

test('jogo acompanhado de verdade mantém a posse no ar', () => {
  const d = stats.derivar(JOGO, esporte, AGORA);
  assert.ok(d.posse.cobertura > 0.25, `cobertura ficou ${d.posse.cobertura}`);
  assert.equal(d.posse.medida, true);
  assert.equal(rotulos(JOGO, AGORA)[0], 'Posse de bola', 'e continua sendo a primeira linha');
});
