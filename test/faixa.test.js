'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ler = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// DOM mínimo: interpreta a marcação real. Não simula CSS nem layout de navegador.
class Elemento {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.attrs = {}; this.eventos = {}; this.escritas = 0;
    this.style = { setProperty(n, v) { this[n] = v; }, removeProperty(n) { delete this[n]; } };
    this.classList = {
      contains: (c) => this.className.split(/\s+/).includes(c),
      add: (c) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), c])].join(' '); },
      remove: (c) => { this.className = this.className.split(/\s+/).filter((x) => x !== c).join(' '); },
      toggle: (c, v) => v ? this.classList.add(c) : this.classList.remove(c)
    };
  }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(el) { el.parent = this; this.children.push(el); return el; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((el) => el !== this); }
  addEventListener(tipo, fn) { this.eventos[tipo] = fn; }
  emitir(tipo) { this.eventos[tipo]?.(); }
  set innerHTML(html) {
    this.escritas++; this.children = [];
    const pilha = [this];
    for (const [, fecha, tag, attrs] of html.matchAll(/<(\/)?([\w-]+)([^>]*)>/g)) {
      if (fecha) { pilha.pop(); continue; }
      const el = new Elemento(tag);
      for (const [, k, v] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.setAttribute(k, v ?? '');
      pilha.at(-1).appendChild(el);
      if (!['img', 'input', 'br'].includes(tag)) pilha.push(el);
    }
  }
  querySelectorAll(seletor) {
    const atributo = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(seletor);
    const combina = (el) => seletor.startsWith('.') ? el.classList.contains(seletor.slice(1))
      : atributo ? (atributo[2] === undefined ? atributo[1] in el.attrs : el.attrs[atributo[1]] === atributo[2]) : el.tag === seletor;
    return this.children.flatMap((el) => [...(combina(el) ? [el] : []), ...el.querySelectorAll(seletor)]);
  }
  querySelector(seletor) { return this.querySelectorAll(seletor)[0] || null; }
}

function ambiente() {
  const faixa = new Elemento(); faixa.className = 'faixa';
  const ouvintes = [], timers = new Map();
  let agora = 1000, proximo = 0;
  const api = { aoEstado: (fn) => ouvintes.push(fn), agoraServidor: () => agora };
  const contexto = { window: { DuStats: api }, DuStats: api, document: {
    createElement: (tag) => new Elemento(tag), getElementById: (id) => id === 'faixa' ? faixa : null
  }, location: { search: '' }, URLSearchParams,
  setTimeout: (fn, ms) => { const id = ++proximo; timers.set(id, { fn, em: agora + ms }); return id; },
  clearTimeout: (id) => timers.delete(id) };
  vm.createContext(contexto);
  for (const p of ['public/shared/overlay.js', 'public/shared/faixa.js']) vm.runInContext(ler(p), contexto);
  return { faixa, api, timers,
    iniciar() { vm.runInContext(/<script>([\s\S]*?)<\/script>/.exec(ler('public/overlay/faixa.html'))[1], contexto); },
    emitir(e) { for (const fn of ouvintes) fn(e); },
    avancar(ms) {
      const fim = agora + ms;
      for (;;) {
        const proximo = [...timers].sort((a, b) => a[1].em - b[1].em)[0];
        if (!proximo || proximo[1].em > fim) break;
        timers.delete(proximo[0]); agora = proximo[1].em; proximo[1].fn();
      }
      agora = fim;
    }
  };
}
function estado() {
  return { id: 'partida', config: {
    casa: { nome: 'Time da Casa', sigla: 'CAS', escudo: '/casa.png' },
    fora: { nome: 'Time Visitante', sigla: 'FOR', escudo: '/fora.png' }
  }, comparativo: [{ rotulo: 'Posse de bola', casa: 58, fora: 42, sufixo: '%', destacar: true }],
  transmissao: { modo: 'jogo', faixa: { em: 1000, rotulo: 'Posse de bola' } } };
}
const time = (a, lado) => a.faixa.querySelector(`[data-equipe="${lado}"]`);

test('a faixa usa o escudo de cada equipe e mantém números e proporções', () => {
  const a = ambiente(), e = estado(); a.api.faixa.preencher(a.faixa, e.comparativo[0], e);
  for (const lado of ['casa', 'fora']) {
    const t = time(a, lado), img = t.querySelector('img');
    assert.equal(img.src, e.config[lado].escudo);
    img.emitir('load');
    assert.equal(t.classList.contains('sem-escudo'), false);
    assert.equal(img.hidden, false);
    assert.equal(t.attrs['aria-label'], e.config[lado].nome);
  }
  assert.equal(a.faixa.querySelector('[data-valor="casa"]').textContent, '58%');
  assert.ok(Math.abs(parseFloat(a.faixa.querySelector('[data-barra="fora"]').style.width) - 42) < .001);
});

test('sem escudo e com imagem quebrada a sigla continua identificando o time', () => {
  const a = ambiente(), e = estado(); e.config.casa.escudo = '';
  a.api.faixa.preencher(a.faixa, e.comparativo[0], e);
  assert.equal(time(a, 'casa').querySelector('img'), null);
  time(a, 'fora').querySelector('img').emitir('error');
  for (const lado of ['casa', 'fora']) {
    assert.equal(time(a, lado).classList.contains('sem-escudo'), true);
    assert.equal(time(a, lado).querySelector('.sigla-escudo-faixa').textContent, e.config[lado].sigla);
  }
});

test('troca de estatística preserva os mesmos elementos e imagens dos escudos', () => {
  const a = ambiente(), e = estado(); a.api.faixa.preencher(a.faixa, e.comparativo[0], e);
  const imagens = a.faixa.querySelectorAll('img'); imagens.forEach((i) => i.emitir('load'));
  a.api.faixa.preencher(a.faixa, { rotulo: 'Finalizações', casa: 0, fora: 0 }, e);
  assert.deepEqual(a.faixa.querySelectorAll('img'), imagens);
  assert.equal(a.faixa.escritas, 1);
  assert.equal(a.faixa.querySelector('[data-barra="casa"]').style.width, '50%');
  assert.equal(a.faixa.querySelector('[data-valor="casa"]').classList.contains('lider-casa'), false);
});

test('evento atrasado de um escudo substituído não restaura a imagem antiga', () => {
  const a = ambiente(), e = estado(); a.api.faixa.atualizarTimes(a.faixa, e);
  const anterior = time(a, 'casa').querySelector('img');
  e.config.casa.escudo = '/novo.png'; a.api.faixa.atualizarTimes(a.faixa, e);
  const novo = time(a, 'casa').querySelector('img'); novo.emitir('load');
  anterior.emitir('error'); anterior.emitir('load');
  assert.equal(time(a, 'casa').classList.contains('sem-escudo'), false);
  assert.equal(time(a, 'casa').style['--logo-faixa'], 'url("/novo.png")');
  e.config.casa.escudo = ''; a.api.faixa.atualizarTimes(a.faixa, e); novo.emitir('load');
  assert.equal(time(a, 'casa').querySelector('img'), null);
  assert.equal(time(a, 'casa').style['--logo-faixa'], undefined);
});

test('nomes, siglas e URLs são dados e não marcação HTML', () => {
  const a = ambiente(), e = estado();
  e.config.casa.sigla = '<img'; e.config.casa.nome = '<script>alert(1)</script>';
  e.config.casa.escudo = '/escudo.png?nome=" onerror="alert(1)';
  a.api.faixa.preencher(a.faixa, e.comparativo[0], e);
  const t = time(a, 'casa');
  assert.equal(t.querySelector('.sigla-time-faixa').textContent, '<IMG');
  assert.equal(t.querySelector('img').src, e.config.casa.escudo);
  assert.equal(t.querySelector('script'), null);
  assert.equal(t.querySelector('img').attrs.onerror, undefined);
});

test('alterar o escudo com a faixa no ar não estende o tempo de exibição', () => {
  const a = ambiente(), e = estado(); a.iniciar(); a.emitir(e); a.avancar(5000);
  e.config.casa.escudo = '/novo.png'; a.emitir(e);
  assert.equal(time(a, 'casa').querySelector('img').src, '/novo.png');
  assert.equal(a.faixa.classList.contains('no-ar'), true);
  a.avancar(5000);
  assert.equal(a.faixa.classList.contains('no-ar'), false);
});

test('intervalo cancela uma troca pendente e a faixa não reaparece ao voltar ao jogo', () => {
  const a = ambiente(), e = estado(); a.iniciar(); a.emitir(e); a.avancar(100);
  e.transmissao.faixa.em = 1100; e.comparativo[0].casa = 60; a.emitir(e);
  e.transmissao.modo = 'intervalo'; a.emitir(e); a.avancar(200);
  assert.equal(a.faixa.classList.contains('no-ar'), false);
  assert.equal(a.faixa.querySelector('[data-valor="casa"]').textContent, '58%');
  e.transmissao.modo = 'jogo'; a.emitir(e);
  assert.equal(a.faixa.classList.contains('no-ar'), false);
});

test('snapshot inicial vencido não coloca faixa no ar', () => {
  const a = ambiente(), e = estado(); a.iniciar(); a.avancar(15000); a.emitir(e);
  assert.equal(a.faixa.classList.contains('no-ar'), false);
});
