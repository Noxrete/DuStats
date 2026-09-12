'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { resolverEstatico, TIPOS } = require('../server/http');

const RAIZ = path.resolve('/srv/dustats/public');

/**
 * Estes testes existem por um motivo só: servir arquivo estático à mão é a
 * única parte do DuStats onde um descuido vira leitura de arquivo fora do
 * projeto. Tudo aqui é caso de escape.
 */

test('caminho normal resolve dentro da pasta pública', () => {
  assert.equal(resolverEstatico(RAIZ, '/shared/tema.css'), path.join(RAIZ, 'shared/tema.css'));
  assert.equal(resolverEstatico(RAIZ, '/'), RAIZ);
});

test('".." não escapa da raiz', () => {
  // O normalize prende na raiz, então o resultado fica dentro e o arquivo
  // simplesmente não existe — nunca vira leitura de fora.
  for (const tentativa of ['/../package.json', '/../../etc/passwd', '/shared/../../package.json']) {
    const alvo = resolverEstatico(RAIZ, tentativa);
    assert.ok(alvo === null || alvo.startsWith(RAIZ), `escapou com "${tentativa}": ${alvo}`);
  }
});

test('barra invertida não escapa — é o caso que só apareceria no Windows', () => {
  for (const tentativa of ['/shared\\..\\..\\package.json', '\\..\\package.json', '/..\\..\\config/partida.json']) {
    const alvo = resolverEstatico(RAIZ, tentativa);
    assert.ok(alvo === null || alvo.startsWith(RAIZ), `escapou com "${tentativa}": ${alvo}`);
  }
});

test('escape percentual não esconde o ".."', () => {
  for (const tentativa of ['/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/shared/%2e%2e%2f%2e%2e%2fpackage.json']) {
    const alvo = resolverEstatico(RAIZ, tentativa);
    assert.ok(alvo === null || alvo.startsWith(RAIZ), `escapou com "${tentativa}": ${alvo}`);
  }
});

test('caminho malformado ou com byte nulo é recusado', () => {
  assert.equal(resolverEstatico(RAIZ, '/%E0%A4%A'), null, '%-escape quebrado');
  assert.equal(resolverEstatico(RAIZ, '/shared/tema.css\0.png'), null, 'byte nulo');
});

test('os tipos que os overlays precisam estão mapeados', () => {
  for (const extensao of ['.html', '.js', '.css', '.json', '.png', '.svg']) {
    assert.ok(TIPOS[extensao], `falta o tipo de ${extensao}`);
  }
  assert.match(TIPOS['.html'], /charset=utf-8/, 'sem charset, os acentos quebram no OBS');
  assert.match(TIPOS['.js'], /charset=utf-8/);
});
