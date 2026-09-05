'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const clock = require('../server/clock');
const { esporte, ev } = require('./helpers');

function rodar(eventos, agora) {
  const relogio = clock.novoRelogio();
  const marcas = eventos.map((e) => clock.aplicar(relogio, e, esporte));
  return { relogio, marcas, estado: clock.agora(relogio, esporte, agora) };
}

test('pausar e retomar não perde nem duplica tempo', () => {
  const { estado } = rodar([
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    ev(60_000, 'relogio', null, { acao: 'pausar' }),   // 1 min corrido
    ev(600_000, 'relogio', null, { acao: 'iniciar' }), // 9 min parado, não contam
    ev(660_000, 'relogio', null, { acao: 'pausar' })   // + 1 min corrido
  ], 900_000);

  assert.equal(estado.tPeriodo, 120_000);
  assert.equal(estado.tTotal, 120_000);
  assert.equal(estado.rodando, false);
});

test('iniciar duas vezes seguidas não adianta o relógio', () => {
  const { estado } = rodar([
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    ev(30_000, 'relogio', null, { acao: 'iniciar' })
  ], 60_000);

  assert.equal(estado.tPeriodo, 60_000);
});

test('trocar de período zera o tempo do período mas mantém o tempo total', () => {
  const { estado } = rodar([
    ev(0, 'periodo', null, {}),                       // PRE -> 1T
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    ev(300_000, 'periodo', null, {}),                 // 1T -> INTERVALO
    ev(300_000, 'periodo', null, {}),                 // INTERVALO -> 2T
    ev(300_000, 'relogio', null, { acao: 'iniciar' })
  ], 360_000);

  assert.equal(estado.periodo, '2T');
  assert.equal(estado.tPeriodo, 60_000);
  assert.equal(estado.tTotal, 360_000);
});

test('o relógio para sozinho ao virar o período', () => {
  const { estado } = rodar([
    ev(0, 'periodo', null, {}),
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    ev(100_000, 'periodo', null, {})
  ], 500_000);

  assert.equal(estado.rodando, false);
  assert.equal(estado.tTotal, 100_000, 'o tempo não pode continuar correndo no intervalo');
});

const IDX_1T = esporte.periodos.findIndex((p) => p.id === '1T');
const IDX_2T = esporte.periodos.findIndex((p) => p.id === '2T');

test('acréscimos aparecem como 45+2, não como 47', () => {
  const minuto = (ms) => clock.formatarMinuto(ms, esporte, IDX_1T);
  assert.equal(minuto(0), '1');
  assert.equal(minuto(90_000), '2');
  assert.equal(minuto(44 * 60_000), '45');
  assert.equal(minuto(45 * 60_000), '45+1');
  assert.equal(minuto(46.5 * 60_000), '45+2');
});

test('o 2º tempo continua a contagem de 45, como na transmissão', () => {
  const minuto = (ms) => clock.formatarMinuto(ms, esporte, IDX_2T);
  assert.equal(minuto(0), '46', 'o primeiro minuto do 2º tempo é o 46º do jogo');
  assert.equal(minuto(3 * 60_000), '49');
  assert.equal(minuto(44 * 60_000), '90');
  assert.equal(minuto(45 * 60_000), '90+1');
  assert.equal(minuto(47 * 60_000), '90+3');
});

test('fora dos tempos de jogo o minuto não herda a base do 2º tempo', () => {
  const idxIntervalo = esporte.periodos.findIndex((p) => p.id === 'INTERVALO');
  assert.equal(clock.formatarMinuto(0, esporte, idxIntervalo), '1');
});

test('ajustar realinha o minuto exibido sem tocar na base da posse', () => {
  const { estado } = rodar([
    ev(0, 'periodo', null, {}),                                        // PRE -> 1T
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    // Aos 2 min de relógio próprio, o Placar PRO está marcando 5:00.
    ev(120_000, 'relogio', null, { acao: 'ajustar', paraMs: 300_000 })
  ], 180_000);

  assert.equal(estado.tPeriodo, 360_000, 'o minuto exibido segue a partir do valor ajustado');
  assert.equal(estado.tTotal, 180_000, 'o tempo de bola rolando não pode ser reescrito');
  assert.equal(estado.rodando, true, 'ajustar não pausa o jogo');
});

test('ajustar com valor inválido não quebra nem zera o relógio', () => {
  const { estado } = rodar([
    ev(0, 'periodo', null, {}),
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    ev(60_000, 'relogio', null, { acao: 'ajustar', paraMs: -5000 })
  ], 90_000);

  assert.equal(estado.tPeriodo, 30_000, 'valor negativo vira zero e o relógio segue de lá');
});

test('o minuto de transmissão respeita o ajuste, inclusive nos acréscimos', () => {
  const { relogio, marcas } = rodar([
    ev(0, 'periodo', null, {}),
    ev(0, 'relogio', null, { acao: 'iniciar' }),
    ev(60_000, 'relogio', null, { acao: 'ajustar', paraMs: 45 * 60_000 }),
    ev(90_000, 'gol', 'casa')
  ], 90_000);

  const marcaDoGol = marcas[3];
  assert.equal(clock.formatarMinuto(marcaDoGol.tPeriodo, esporte, relogio.periodoIdx), '45+1');
});
