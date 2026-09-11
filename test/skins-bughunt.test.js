'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ler = (nome) => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const copiar = (d) => JSON.parse(JSON.stringify(d));
const classes = () => { const c = new Set(); return { add: (s) => c.add(s), remove: (s) => c.delete(s), contains: (s) => c.has(s), toggle(s, valor) { if (valor) c.add(s); else c.delete(s); } }; };
function estado() {
  return { id: 'teste', criadaEm: 1, config: { skin: 'capsulas', casa: { nome: 'Casa' }, fora: { nome: 'Fora' } },
    transmissao: { modo: 'intervalo', slide: 0 }, placar: { casa: 2, fora: 1 }, posse: { casa: 50 },
    comparativo: [{ rotulo: 'Finalizações', casa: 2, fora: 1 }], chutes: [{ x: .2, y: .3 }],
    momentum: [{ casa: 2, fora: 1 }], linhaDoTempo: [{ tipo: 'gol', equipe: 'casa', tTotal: 60000, minuto: '1' }] };
}
function carrossel(opcoes = {}) {
  const ouvintes = [], desenhos = [], titulos = [];
  const secoes = Array.from({ length: 4 }, () => ({ classList: classes(), childElementCount: 1 }));
  const subtitulo = { classList: classes(), textContent: '' };
  const cabecalho = { firstElementChild: {}, querySelector: () => subtitulo };
  const painel = { dataset: {}, classList: classes(), querySelector: () => cabecalho, querySelectorAll: (s) => s === '.slide' ? secoes : [] };
  const api = { aoEstado: (fn) => ouvintes.push(fn), paineis: { cabecalho: (e) => { titulos.push(copiar(e)); return ''; } } };
  for (const [i, nome] of ['comparativo', 'mapaDeChutes', 'pressao', 'linhaDoTempo'].entries()) api.paineis[nome] = (_c, e, opcoes) => desenhos.push({ i, e: copiar(e), opcoes });
  const contexto = { window: { DuStats: api }, DuStats: api, URLSearchParams, location: { search: '' }, setTimeout: (f) => f() };
  vm.runInNewContext(ler('public/shared/overlay.js'), contexto);
  vm.runInNewContext(ler('public/shared/carrossel.js'), contexto);
  api.carrossel.iniciar({ modo: 'intervalo', painel, titulo: () => 'Intervalo', ...opcoes });
  return { emitir: (e) => ouvintes.forEach((f) => f(e)), desenhos, titulos, painel };
}

test('comparativo que está no ar acompanha correções sem trocar o slide', () => {
  const c = carrossel(), e = estado(); c.emitir(e);
  e.comparativo[0].casa = 3; c.emitir(e);
  assert.equal(c.desenhos.at(-1).e.comparativo[0].casa, 3);
});

test('alterar a posição de um chute atualiza o mapa com a mesma quantidade de chutes', () => {
  const c = carrossel(), e = estado(); e.transmissao.slide = 1; c.emitir(e);
  e.chutes[0].x = .8; c.emitir(e);
  assert.equal(c.desenhos.at(-1).e.chutes[0].x, .8);
});

test('mudar estatística não recria o cabeçalho nem reinicia a animação dos escudos', () => {
  const c = carrossel(), e = estado(); c.emitir(e);
  e.comparativo[0].casa = 3; c.emitir(e);
  assert.equal(c.titulos.length, 1);
  c.emitir(e);
  assert.equal(c.desenhos.length, 2, 'snapshot idêntico não redesenha');
});

test('página de exportação permanece visível fora do modo resumo', () => {
  const c = carrossel({ sempreVisivel: true }), e = estado(); e.transmissao.modo = 'jogo'; c.emitir(e);
  assert.equal(c.painel.classList.contains('no-ar'), true);
  assert.equal(c.desenhos.length, 1);
});

test('overlay do OBS sai com o modo jogo e anima novamente ao voltar ao intervalo', () => {
  const c = carrossel(), e = estado(); c.emitir(e);
  e.comparativo[0].casa = 3; c.emitir(e);
  assert.equal(c.desenhos.at(-1).opcoes.animar, false);
  e.transmissao.modo = 'jogo'; c.emitir(e);
  assert.equal(c.painel.classList.contains('no-ar'), false);
  assert.equal(c.desenhos.length, 2);
  e.transmissao.modo = 'intervalo'; c.emitir(e);
  assert.equal(c.painel.classList.contains('no-ar'), true);
  assert.equal(c.desenhos.at(-1).opcoes.animar, true);
});

function paginaExportacao(desenhar, baixar) {
  const ouvintes = [], elementos = new Map();
  for (const id of ['painel', 'previa', 'btPng', 'erroExportar']) elementos.set(id, { classList: classes(), addEventListener(tipo, fn) { this[tipo] = fn; } });
  const api = { overlay: { parametros: new URLSearchParams('exportar=1') }, carrossel: { iniciar() {} },
    cartao: { desenhar, baixar }, estado, aoEstado: (fn) => ouvintes.push(fn) };
  const document = { body: { classList: classes() }, getElementById: (s) => elementos.get(s), querySelector: () => ({}) };
  const script = /<script>([\s\S]*?)<\/script>/.exec(ler('public/overlay/resumo.html'))[1];
  vm.runInNewContext(script, { DuStats: api, document });
  return { emitir: (e) => Promise.all(ouvintes.map((fn) => fn(e))), previa: elementos.get('previa'), botao: elementos.get('btPng'), erro: elementos.get('erroExportar') };
}

test('prévia PNG acompanha a troca de skin e o placar atualizado', async () => {
  const p = paginaExportacao(async (e) => ({ toDataURL: () => `${e.config.skin}:${e.placar.casa}` }));
  await p.emitir(estado());
  const novo = estado(); novo.config.skin = 'diurno'; novo.placar.casa = 3;
  await p.emitir(novo);
  assert.equal(p.previa.src, 'diurno:3');
});

test('renderização antiga lenta não sobrescreve a prévia mais recente', async () => {
  const liberar = [];
  const p = paginaExportacao((e) => new Promise((resolve) => liberar.push(() => resolve({ toDataURL: () => e.config.skin }))));
  const primeira = p.emitir(estado());
  const novo = estado(); novo.config.skin = 'diurno'; const segunda = p.emitir(novo);
  assert.equal(liberar.length, 2);
  liberar[1](); await segunda; liberar[0](); await primeira;
  assert.equal(p.previa.src, 'diurno');
});

test('falha na prévia permite tentar novamente com o mesmo estado', async () => {
  let tentativas = 0;
  const p = paginaExportacao(async () => {
    if (++tentativas === 1) throw new Error('falha no canvas');
    return { toDataURL: () => 'png-recuperado' };
  });
  await p.emitir(estado());
  assert.equal(p.erro.hidden, false);
  await p.emitir(estado());
  assert.equal(p.previa.src, 'png-recuperado');
  assert.equal(p.erro.hidden, true);
});

test('atualização de estado durante download não libera um segundo download', async () => {
  let liberar, chamadas = 0;
  const p = paginaExportacao(async () => ({ toDataURL: () => 'png' }), () => {
    chamadas++;
    return new Promise((resolve) => { liberar = resolve; });
  });
  await p.emitir(estado());
  const download = p.botao.click();
  await p.emitir(estado());
  assert.equal(p.botao.disabled, true);
  await p.botao.click();
  assert.equal(chamadas, 1);
  liberar(); await download;
  assert.equal(p.botao.disabled, false);
});

function no(tag, atributos = {}) {
  return { tag, atributos, children: [], style: {}, setAttribute(k, v) { this.atributos[k] = v; }, appendChild(n) { this.children.push(n); } };
}
function renderizador() {
  const api = { campo: { el: no }, overlay: { nome: (c, lado) => c[lado].nome } };
  const contexto = { window: { DuStats: api }, document: { createElementNS: (_ns, tag) => no(tag) } };
  vm.runInNewContext(ler('public/shared/paineis.js'), contexto);
  return api.paineis;
}
function rgb(cor, fundo) {
  if (cor.startsWith('#')) { let h = cor.slice(1); if (h.length === 3) h = [...h].map((s) => s + s).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  const v = cor.match(/[\d.]+/g).map(Number), a = v[3] ?? 1;
  return v.slice(0, 3).map((x, i) => x * a + fundo[i] * (1 - a));
}
function contraste(cor, fundo) {
  const lum = (c) => c.map((x) => x / 255).map((x) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
  const b = rgb(fundo), a = rgb(cor, b), valores = [lum(a), lum(b)].sort((x, y) => x - y);
  return (valores[1] + .05) / (valores[0] + .05);
}
function paleta(skin) {
  const tokens = {};
  for (const css of [ler('public/shared/tema.css').match(/:root\s*\{([^}]+)\}/)[1], ler('public/shared/skins.css').match(new RegExp('\\[data-skin="' + skin + '"\\]\\s*\\{([^}]+)\\}'))?.[1] || ''])
    for (const [, k, v] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[k] = v.trim();
  const resolver = (s) => s.startsWith('var(') ? resolver(tokens[s.slice(4, -1)]) : s;
  return { resolver, fundo: resolver(tokens['--navy-fundo']) };
}
function descendentes(n) { return [n, ...n.children.flatMap(descendentes)]; }
for (const skin of ['capsulas', 'costura', 'diurno']) {
  test(`minutos da linha do tempo e eixos da pressão têm contraste na skin ${skin}`, () => {
    const paineis = renderizador(), p = paleta(skin), e = estado();
    e.momentum = Array.from({ length: 6 }, () => ({ casa: 1, fora: 2 }));
    for (const nome of ['linhaDoTempo', 'pressao']) {
      const container = no('div'); container.insertAdjacentHTML = () => {};
      paineis[nome](container, e);
      for (const t of descendentes(container).filter((x) => x.tag === 'text' && x.atributos.fill))
        assert.ok(contraste(p.resolver(t.atributos.fill), p.fundo) >= 3, `${nome}: ${t.textContent} está apagado sobre ${p.fundo}`);
    }
  });
}
