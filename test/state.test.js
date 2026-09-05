'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Partida } = require('../server/state');
const { esporte } = require('./helpers');

function novaPartida() {
  return new Partida({ esporte, config: { casa: { nome: 'A' }, fora: { nome: 'B' } } });
}

test('desfazer pula os eventos de controle e apaga o último lance', () => {
  const p = novaPartida();
  p.adicionar({ type: 'relogio', meta: { acao: 'iniciar' } });
  p.adicionar({ type: 'gol', team: 'casa' });
  p.adicionar({ type: 'posse', team: 'fora' });
  p.adicionar({ type: 'posse', team: 'casa' });

  assert.equal(p.proximoParaDesfazer().type, 'gol');

  const removido = p.desfazer();
  assert.equal(removido.type, 'gol');
  assert.equal(p.derivar().placar.casa, 0);
  assert.equal(p.eventos.length, 3, 'as trocas de posse continuam no log');
});

test('desfazer devolve o estado exatamente ao anterior', () => {
  const p = novaPartida();
  p.adicionar({ type: 'relogio', meta: { acao: 'iniciar' } });
  p.adicionar({ type: 'escanteio', team: 'casa' });

  const antes = JSON.stringify(p.derivar().totais);
  p.adicionar({ type: 'falta', team: 'fora' });
  p.desfazer();

  assert.equal(JSON.stringify(p.derivar().totais), antes);
});

test('desfazer com o jogo vazio não quebra', () => {
  const p = novaPartida();
  p.adicionar({ type: 'posse', team: 'casa' });
  assert.equal(p.desfazer(), null);
  assert.equal(p.proximoParaDesfazer(), null);
});

test('evento de tipo desconhecido é recusado', () => {
  const p = novaPartida();
  assert.throws(() => p.adicionar({ type: 'penalti_maximo', team: 'casa' }), /desconhecido/);
});

test('lance de equipe sem equipe é recusado, mas posse aceita bola parada', () => {
  const p = novaPartida();
  assert.throws(() => p.adicionar({ type: 'gol' }), /precisa de uma equipe/);

  const parada = p.adicionar({ type: 'posse', team: null });
  assert.equal(parada.team, null);
  assert.equal(p.derivar().posseAtual, null);
});

test('desfecho inválido de finalização vira "fora" em vez de derrubar o servidor', () => {
  const p = novaPartida();
  const e = p.adicionar({ type: 'finalizacao', team: 'casa', meta: { desfecho: 'chutão' } });
  assert.equal(e.meta.desfecho, 'fora');
});

test('coordenada do chute é presa no campo', () => {
  const p = novaPartida();
  const e = p.adicionar({ type: 'finalizacao', team: 'casa', x: 1.4, y: -0.2, meta: { desfecho: 'no_gol' } });
  assert.equal(e.x, 1);
  assert.equal(e.y, 0);
});

test('finalização sem local é aceita (jogo corrido, um toque só)', () => {
  const p = novaPartida();
  const e = p.adicionar({ type: 'finalizacao', team: 'casa', meta: { desfecho: 'no_gol' } });
  assert.equal(e.x, undefined);
  assert.equal(p.derivar().chutes[0].x, null);
});

test('remover por id apaga o evento certo', () => {
  const p = novaPartida();
  p.adicionar({ type: 'gol', team: 'casa' });
  const alvo = p.adicionar({ type: 'gol', team: 'fora' });
  p.adicionar({ type: 'gol', team: 'casa' });

  p.remover(alvo.id);
  assert.deepEqual(p.derivar().placar, { casa: 2, fora: 0 });
  assert.equal(p.remover('nao-existe'), null);
});

test('o snapshot não carrega a lista inteira de eventos', () => {
  const p = novaPartida();
  for (let i = 0; i < 200; i += 1) p.adicionar({ type: 'posse', team: i % 2 ? 'casa' : 'fora' });

  const s = p.snapshot();
  assert.equal(s.totalEventos, 200);
  assert.equal(s.ultimos.length, 24);
  assert.equal(s.ultimos[0].type, 'posse');
});

test('a partida sobrevive a um reinício do servidor', () => {
  const p = novaPartida();
  p.adicionar({ type: 'relogio', meta: { acao: 'iniciar' } });
  p.adicionar({ type: 'gol', team: 'casa' });
  p.adicionar({ type: 'cartao', team: 'fora', meta: { cor: 'vermelho' } });

  const disco = JSON.parse(JSON.stringify(p.paraDisco()));
  const recarregada = new Partida({ ...disco, esporte });

  assert.deepEqual(recarregada.derivar().placar, p.derivar().placar);
  assert.equal(recarregada.derivar().totais.fora.vermelhos, 1);
  assert.equal(recarregada.derivar().relogio.rodando, true, 'o relógio volta correndo');
});

test('reenvio do mesmo lance (cid repetido) não conta o gol duas vezes', () => {
  const p = novaPartida();
  const primeiro = p.adicionar({ type: 'gol', team: 'casa', cid: 'abc-123' });
  const repetido = p.adicionar({ type: 'gol', team: 'casa', cid: 'abc-123' });

  assert.equal(repetido.id, primeiro.id);
  assert.equal(p.eventos.length, 1);
  assert.equal(p.derivar().placar.casa, 1);
});

test('horário informado pelo cliente é preso entre o último evento e agora', () => {
  const p = novaPartida();
  const agora = Date.now();

  const passado = p.adicionar({ type: 'escanteio', team: 'casa', wall: agora - 600_000 });
  assert.ok(passado.wall < agora, 'um lance atrasado pode ser gravado com o horário real');

  const forADeOrdem = p.adicionar({ type: 'escanteio', team: 'fora', wall: agora - 900_000 });
  assert.equal(forADeOrdem.wall, passado.wall, 'não pode voltar no tempo');

  const futuro = p.adicionar({ type: 'escanteio', team: 'casa', wall: agora + 3_600_000 });
  assert.ok(futuro.wall <= Date.now(), 'não pode gravar no futuro');
});

test('desfazer não mexe no ajuste de relógio — ele se corrige sozinho', () => {
  const p = novaPartida();
  p.adicionar({ type: 'relogio', meta: { acao: 'iniciar' } });
  p.adicionar({ type: 'escanteio', team: 'casa' });
  p.adicionar({ type: 'relogio', meta: { acao: 'ajustar', paraMs: 23 * 60_000 } });

  // O apontador aperta DESFAZER querendo apagar o escanteio errado. Se o undo
  // pegasse o ajuste de relógio, ele apertaria duas vezes e apagaria um lance
  // que não queria — por isso controle de relógio nunca entra na fila do undo.
  assert.equal(p.proximoParaDesfazer().type, 'escanteio');
  assert.equal(p.desfazer().type, 'escanteio');
  assert.ok(p.eventos.some((e) => e.meta?.acao === 'ajustar'), 'o ajuste continua lá');

  // Errou o valor? Ajusta de novo: `paraMs` é absoluto, então o segundo ajuste
  // substitui o primeiro por completo.
  p.adicionar({ type: 'relogio', meta: { acao: 'ajustar', paraMs: 32 * 60_000 } });
  assert.ok(p.derivar().relogio.tPeriodo >= 32 * 60_000);
});
