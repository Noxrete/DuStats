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
