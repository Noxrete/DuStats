'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { quadroDeTexto, opcodesRecebidos } = require('../server/ws');

/** Monta um quadro do jeito que o navegador manda: sempre mascarado. */
function quadroDoCliente(opcode, carga = Buffer.alloc(0)) {
  const mascara = Buffer.from([0x1a, 0x2b, 0x3c, 0x4d]);
  const mascarada = Buffer.from(carga);
  for (let i = 0; i < mascarada.length; i += 1) mascarada[i] ^= mascara[i % 4];
  return Buffer.concat([
    Buffer.from([0x80 | opcode, 0x80 | mascarada.length]),
    mascara,
    mascarada
  ]);
}

test('quadro curto usa o cabeçalho de 2 bytes', () => {
  const quadro = quadroDeTexto('oi');
  assert.equal(quadro[0], 0x81, 'FIN + opcode de texto');
  assert.equal(quadro[1], 2, 'tamanho cabe no próprio byte');
  assert.equal(quadro.subarray(2).toString('utf8'), 'oi');
});

test('quadro médio usa o cabeçalho de 16 bits', () => {
  const texto = 'a'.repeat(500);
  const quadro = quadroDeTexto(texto);
  assert.equal(quadro[1], 126, 'marcador de tamanho estendido');
  assert.equal(quadro.readUInt16BE(2), 500);
  assert.equal(quadro.subarray(4).toString('utf8'), texto);
});

test('quadro grande usa o cabeçalho de 64 bits', () => {
  // O snapshot de um jogo cheio passa de 64 KB, então este caminho é real.
  const texto = 'b'.repeat(70000);
  const quadro = quadroDeTexto(texto);
  assert.equal(quadro[1], 127);
  assert.equal(Number(quadro.readBigUInt64BE(2)), 70000);
  assert.equal(quadro.subarray(10).toString('utf8'), texto);
});

test('o tamanho é contado em bytes, não em letras', () => {
  // "Grêmio · Atlético" tem acento: em UTF-8 ocupa mais bytes que caracteres.
  // Contar errado desalinharia o quadro e o navegador fecharia a conexão.
  const texto = 'Grêmio · Atlético';
  const quadro = quadroDeTexto(texto);
  assert.equal(quadro[1], Buffer.byteLength(texto, 'utf8'));
  assert.notEqual(quadro[1], texto.length, 'o teste perde o sentido se não houver multibyte');
  assert.equal(quadro.subarray(2).toString('utf8'), texto);
});

test('fechamento e ping vindos do navegador são reconhecidos', () => {
  assert.deepEqual(opcodesRecebidos(quadroDoCliente(0x8)), [0x8], 'close');
  assert.deepEqual(opcodesRecebidos(quadroDoCliente(0x9)), [0x9], 'ping');
  assert.deepEqual(opcodesRecebidos(quadroDoCliente(0xa)), [0xa], 'pong');
});

test('vários quadros que chegam grudados são lidos todos', () => {
  // TCP entrega o que quiser junto; ler só o primeiro perderia o fechamento.
  const grudados = Buffer.concat([
    quadroDoCliente(0xa),
    quadroDoCliente(0x9, Buffer.from('ping')),
    quadroDoCliente(0x8)
  ]);
  assert.deepEqual(opcodesRecebidos(grudados), [0xa, 0x9, 0x8]);
});

test('pedaço truncado não trava nem lança', () => {
  assert.deepEqual(opcodesRecebidos(Buffer.from([0x88])), []);
  assert.deepEqual(opcodesRecebidos(Buffer.alloc(0)), []);
});
