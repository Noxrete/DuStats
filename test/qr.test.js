'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../public/shared/qr');
const { codificar, svg } = globalThis.DuStats.qr;

/*
 * Não dá para conferir um QR a olho: um símbolo com o bloco de formato
 * espelhado bit a bit — que foi o primeiro erro aqui — desenha finders,
 * separadores e linhas de tempo impecáveis e não é lido por leitor nenhum.
 *
 * Então a conferência de verdade foi feita fora, decodificando com dois
 * leitores independentes (OpenCV e zxing-cpp, o motor por trás dos leitores de
 * celular): 720 leituras do formato de URL que o painel usa, em três escalas,
 * quatro rotações, com borrão e com ruído. O zxing leu todas.
 *
 * O que fica aqui é o resultado congelado daquela conferência. Estes vetores
 * decodificaram; se algum módulo mudar, alguém mexeu no codificador e precisa
 * repetir a verificação externa antes de seguir.
 */
const GOLDEN = require('./qr.golden.json');

/** A matriz volta de hexadecimal, 4 módulos por dígito. */
function deHexa(linhas, lado) {
  return linhas.map((hexa) => {
    let bits = '';
    for (const digito of hexa) bits += parseInt(digito, 16).toString(2).padStart(4, '0');
    return bits.slice(0, lado).split('').map(Number);
  });
}

for (const [texto, esperado] of Object.entries(GOLDEN)) {
  test(`o QR de ${JSON.stringify(texto)} continua o que foi decodificado`, () => {
    const qr = codificar(texto);
    assert.equal(qr.versao, esperado.versao);
    assert.equal(qr.lado, esperado.lado);
    assert.deepEqual(qr.modulos, deHexa(esperado.linhas, esperado.lado));
  });
}

test('a estrutura fixa está onde o leitor procura', () => {
  const { modulos: m, lado } = codificar('http://192.168.0.10:4590/control/');

  for (const [linha, coluna] of [[0, 0], [0, lado - 7], [lado - 7, 0]]) {
    assert.equal(m[linha][coluna], 1, 'canto do finder');
    assert.equal(m[linha + 1][coluna + 1], 0, 'anel claro do finder');
    assert.equal(m[linha + 3][coluna + 3], 1, 'miolo do finder');
  }

  // Linhas de tempo: alternância exata, é a régua que o leitor usa para saber
  // onde cada módulo começa.
  for (let i = 8; i < lado - 8; i += 1) {
    assert.equal(m[6][i], i % 2 === 0 ? 1 : 0, `tempo horizontal em ${i}`);
    assert.equal(m[i][6], i % 2 === 0 ? 1 : 0, `tempo vertical em ${i}`);
  }

  assert.equal(m[lado - 8][8], 1, 'o módulo sempre escuro');
});

test('a versão cresce com o texto e o limite é honesto', () => {
  // Cada versão perde 2 codewords para o cabeçalho (4 bits de modo + 8 de
  // contagem, arredondados para cima), então a capacidade útil no nível Q é
  // 11, 20, 32 e 46 bytes.
  assert.equal(codificar('A').versao, 1);
  assert.equal(codificar('x'.repeat(11)).versao, 1);
  assert.equal(codificar('x'.repeat(12)).versao, 2);
  assert.equal(codificar('x'.repeat(20)).versao, 2);
  assert.equal(codificar('x'.repeat(21)).versao, 3);
  assert.equal(codificar('x'.repeat(32)).versao, 3);
  assert.equal(codificar('x'.repeat(33)).versao, 4);
  assert.equal(codificar('x'.repeat(46)).versao, 4);

  // Acima de 46 bytes não cabe, e isso é dito devolvendo null em vez de um
  // símbolo truncado. A URL mais longa que o painel pode montar,
  // http://255.255.255.255:65535/control/, tem 37 bytes.
  assert.equal('http://255.255.255.255:65535/control/'.length, 37);
  assert.equal(codificar('x'.repeat(47)), null);
  assert.equal(svg('x'.repeat(47)), null);
});

test('acento conta como dois bytes, não como um caractere', () => {
  // "ç" ocupa 2 bytes em UTF-8. Medir em caracteres escolheria uma versão
  // pequena demais e o símbolo sairia com os dados cortados.
  assert.equal(codificar('ç'.repeat(23)).versao, 4, '46 bytes ainda cabem');
  assert.equal(codificar('ç'.repeat(24)), null, '48 bytes não cabem');
  assert.equal(codificar('ç'.repeat(6)).versao, 2, '12 bytes, não 6');
});

test('o SVG sai com zona silenciosa e um caminho só', () => {
  const desenho = svg('http://192.168.0.10:4590/control/', { tamanho: 200 });
  const qr = codificar('http://192.168.0.10:4590/control/');

  assert.match(desenho, /^<svg /);
  assert.match(desenho, new RegExp(`viewBox="0 0 ${qr.lado + 8} ${qr.lado + 8}"`),
    'a zona silenciosa de 4 módulos de cada lado precisa estar no viewBox');
  assert.equal((desenho.match(/<path /g) || []).length, 1, 'um caminho só, não um retângulo por módulo');
  assert.match(desenho, /width="200" height="200"/);
});
