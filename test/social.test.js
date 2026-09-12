'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * O Match Pack desenha em canvas, e canvas só se confere olhando — foi assim
 * que os quatro formatos foram julgados. O que dá para guardar aqui, sem
 * navegador, é o CONTRATO: as medidas exatas que o Instagram usa, e a ligação
 * entre os quatro formatos oferecidos e os quatro pintores que existem.
 *
 * Medida errada é o defeito mais caro deste arquivo: o Instagram recorta o que
 * não bate, e o recorte come justamente a borda — placar, escudo, patrocínio.
 */

const raiz = path.join(__dirname, '..');
/**
 * Os fontes são lidos com as quebras de linha NORMALIZADAS.
 *
 * O Windows faz checkout com CRLF, e um teste que casa `\{\n` contra `{\r\n`
 * falha lá e passa aqui — foi exatamente assim que este arquivo quebrou na CI
 * do Windows na primeira vez. Pior: só UM dos padrões quebrou, porque o `$` do
 * JavaScript em modo multilinha aceita `\r` como fim de linha, mas um `\n`
 * literal não. O teste é sobre a estrutura do código; a quebra de linha do
 * checkout não faz parte dela.
 */
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

const social = ler('public/shared/social.js');
const app = ler('public/control/app.js');
const cartao = ler('public/shared/cartao.js');

/** A tabela FORMATOS, lida da fonte. */
const formatos = Object.fromEntries(
  [...social.matchAll(/^\s{4}(\w+):\s*\{\s*largura:\s*(\d+),\s*altura:\s*(\d+)/gm)]
    .map((m) => [m[1], [Number(m[2]), Number(m[3])]])
);

test('os quatro formatos têm as medidas que o Instagram usa', () => {
  assert.deepEqual(formatos, {
    feed:     [1080, 1350],   // 4:5, o retrato máximo do feed
    quadrado: [1080, 1080],   // 1:1
    story:    [1080, 1920],   // 9:16
    resumo:   [1080, 1080]    // 1:1, para carrossel
  });
});

test('as proporções batem, e não só os números', () => {
  const razao = ([l, a]) => +(l / a).toFixed(4);
  assert.equal(razao(formatos.feed), +(4 / 5).toFixed(4));
  assert.equal(razao(formatos.quadrado), 1);
  assert.equal(razao(formatos.story), +(9 / 16).toFixed(4));
  assert.equal(razao(formatos.resumo), 1);
});

test('todo formato oferecido tem pintor', () => {
  const pintores = /const PINTORES = \{([^}]+)\}/.exec(social);
  assert.ok(pintores, 'não achei a tabela PINTORES');
  const nomes = [...pintores[1].matchAll(/(\w+)/g)].map((m) => m[1]);
  for (const formato of Object.keys(formatos)) {
    assert.ok(nomes.includes(formato), `${formato} não tem pintor`);
  }
  assert.deepEqual(nomes.slice().sort(), Object.keys(formatos).sort(),
    'a tabela de pintores e a de formatos precisam ter exatamente os mesmos nomes');
});

test('cada formato diz onde a marca d\'água mora', () => {
  // Sem `agua` o escudo cai no meio da peça, atrás do texto principal — o
  // defeito que o primeiro desenho do story tinha.
  for (const formato of Object.keys(formatos)) {
    assert.match(social, new RegExp(`${formato}:\\s*\\{[^}]*agua:`),
      `${formato} não define agua`);
  }
});

test('os dois formatos que pedem escolha são os que a aba pergunta', () => {
  // Quadrado pergunta qual estatística; story, qual gol. Se um formato passar a
  // pedir escolha e a aba não perguntar, o operador exporta sempre o mesmo.
  const comEscolha = ['quadrado', 'story'];
  for (const formato of comEscolha) {
    assert.match(app, new RegExp(`formatoAtual === '${formato}'`),
      `a aba Social não trata a escolha do formato ${formato}`);
  }
  for (const formato of Object.keys(formatos).filter((f) => !comEscolha.includes(f))) {
    assert.doesNotMatch(app, new RegExp(`formatoAtual === '${formato}'`),
      `${formato} não pede escolha nenhuma e não devia ser tratado`);
  }
});

test('toda pele do card diz a sua cor de fundo opaca', () => {
  /*
   * `palco` existe porque `fundo()` pinta um quadrado 1080 × 1080: num story de
   * 1080 × 1920 a metade de baixo ficaria sem tinta e apareceria uma emenda
   * horizontal reta atravessando a peça. Skin sem `palco` é skin que desenha
   * essa emenda.
   */
  const peles = [...cartao.matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1]);
  assert.ok(peles.length >= 10, `esperava dez peles, achei ${peles.length}`);
  for (const pele of peles) {
    assert.match(cartao, new RegExp(`^ {6}${pele}: \\{\\n {8}palco:`, 'm'),
      `a pele ${pele} não define palco`);
  }
});
