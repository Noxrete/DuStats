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
