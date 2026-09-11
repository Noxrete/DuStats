'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * Uma skin vive em QUATRO lugares: o seletor do painel, a lista branca do
 * bus.js, as regras do skins.css e o pintor do card do Instagram. Acrescentar
 * uma e esquecer um dos quatro é o erro que este arquivo existe para pegar —
 * e cada esquecimento falha de um jeito diferente e silencioso:
 *
 *   - fora da lista do bus.js: o operador escolhe e nada muda no ar;
 *   - fora do skins.css: a peça entra no ar sem estilo nenhum;
 *   - fora do cartao.js: o post do Instagram sai com a aparência de outra skin.
 */

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const seletor = ler('public/control/index.html');
const bus = ler('public/shared/bus.js');
const css = ler('public/shared/skins.css');
const cartao = ler('public/shared/cartao.js');

/** As skins oferecidas ao operador, na ordem em que ele as vê. */
const oferecidas = [...seletor.matchAll(/<option value="([a-z]+)">/g)]
  .map((m) => m[1])
  .filter((v, i, todos) => todos.indexOf(v) === i);

test('o seletor oferece as nove skins', () => {
  assert.deepEqual(oferecidas, [
    'placar', 'vidro', 'traco', 'bandeira', 'estadio',
    'capsulas', 'costura', 'noturno', 'diurno'
  ]);
});

test('toda skin do seletor está na lista branca do bus.js', () => {
  const lista = /const SKINS = \[([^\]]+)\]/.exec(bus);
  assert.ok(lista, 'não achei a lista SKINS no bus.js');
  const aceitas = [...lista[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  for (const skin of oferecidas) {
    assert.ok(aceitas.includes(skin), `${skin} está no seletor e não na lista do bus.js`);
  }
  assert.deepEqual(aceitas.slice().sort(), oferecidas.slice().sort(),
    'a lista do bus.js e o seletor precisam ter exatamente as mesmas skins');
});

test('toda skin tem regras próprias no skins.css', () => {
  for (const skin of oferecidas) {
    if (skin === 'placar') continue;   // a padrão é a AUSÊNCIA de regras
    assert.ok(css.includes(`[data-skin="${skin}"]`), `${skin} não tem regra no skins.css`);
  }
  assert.ok(!css.includes('[data-skin="placar"]'),
    'a skin padrão precisa continuar sendo a ausência de regras, senão ela deixa de ser o fallback');
});

test('toda skin tem pintor no card do Instagram', () => {
  for (const skin of oferecidas) {
    assert.ok(new RegExp(`^      ${skin}: \\{`, 'm').test(cartao),
      `${skin} não tem pintor em cartao.js — o card sairia com a cara de outra`);
  }
});

test('nenhuma regra recorta o escudo, nem direta nem por herança', () => {
  /*
   * O defeito que originou as quatro últimas skins: o escudo fatiado em cunha
   * por clip-path, metade do brasão do clube indo ao ar.
   *
   * A armadilha é que `clip-path` recorta os DESCENDENTES junto. Não basta
   * então proibi-lo em regras de `.escudo`: proibir num ancestral do escudo
   * (o `.time` do cabeçalho, o `.painel-cheio`) é igualmente necessário, e é
   * onde o erro de verdade aconteceu. Um pseudo-elemento (::before/::after)
   * não é ancestral de nada, então ele continua livre — é justamente para lá
   * que a Costura moveu o corte.
   */
  const ANCESTRAIS_DO_ESCUDO = /\.(escudo|time|confronto|cabecalho|painel-cheio|faixa|linha-faixa)\b/;
  const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.ok(regras.length > 50, 'não consegui separar as regras do skins.css');

  for (const [, seletor, corpo] of regras) {
    if (!/clip-path/.test(corpo)) continue;
    const alvos = seletor.split(',').map((t) => t.trim());
    for (const alvo of alvos) {
      if (/::(before|after)\s*$/.test(alvo)) continue;   // camada de fundo, não ancestral
      assert.ok(!ANCESTRAIS_DO_ESCUDO.test(alvo),
        `clip-path em "${alvo}" recorta o escudo junto — leve o corte para um ::before`);
    }
  }
});
