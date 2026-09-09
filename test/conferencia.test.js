'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../public/shared/conferencia');
const { itens, checagensDaPartida, distanciaDeCor, LIMITE_COR } = globalThis.DuStats.conferencia;

const HOJE = new Date(2026, 8, 9, 15, 0, 0).getTime();   // 9 de setembro, 15 h
const ONTEM = new Date(2026, 8, 8, 15, 0, 0).getTime();

/** Partida recém-configurada, no pré-jogo, sem nada para reclamar. */
function partida(mudancas = {}) {
  return {
    criadaEm: HOJE,
    totalEventos: 0,
    placar: { casa: 0, fora: 0 },
    relogio: { periodo: 'PRE' },
    fontes: [{ fonte: 'faixa', desde: HOJE }, { fonte: 'intervalo', desde: HOJE }],
    config: {
      acento: '#17b64a',
      skin: 'placar',
      casa: { nome: 'Charrua', cor: '#c0161f' },
      fora: { nome: 'Guarapuava', cor: '#1f8f3a' }
    },
    ...mudancas
  };
}

/** Junta config parcial sem apagar o resto — quase todo teste mexe num campo. */
function comConfig(extra) {
  const base = partida();
  return { ...base, config: { ...base.config, ...extra } };
}

const nomes = (lista) => lista.map((i) => i.nome);
const alertas = (lista) => lista.filter((i) => i.estado !== 'ok');

test('jogo pronto e OBS recebendo não gera nenhum aviso', () => {
  const lista = itens(partida(), HOJE);
  assert.deepEqual(alertas(lista), []);
  assert.equal(lista.length, 2);
  assert.ok(lista.every((i) => i.estado === 'ok'));
});

test('fonte ausente aparece como falta', () => {
  const lista = itens(partida({ fontes: [{ fonte: 'faixa', desde: HOJE }] }), HOJE);
  const faltando = lista.filter((i) => i.estado === 'falta');
  assert.deepEqual(nomes(faltando), ['Painel do intervalo (OBS)']);
});

test('dois painéis abertos ao mesmo tempo viram alerta', () => {
  const fontes = [
    { fonte: 'faixa', desde: HOJE }, { fonte: 'intervalo', desde: HOJE },
    { fonte: 'painel', desde: HOJE }, { fonte: 'painel', desde: HOJE }
  ];
  const lista = itens(partida({ fontes }), HOJE);
  assert.ok(nomes(lista).some((n) => n.includes('2 painéis')));
});

// -- é o jogo certo? ---------------------------------------------------------

test('partida de ontem já jogada avisa, com o placar dela na descrição', () => {
  const lista = checagensDaPartida(
    partida({ criadaEm: ONTEM, relogio: { periodo: 'FIM' }, placar: { casa: 3, fora: 1 } }),
    HOJE
  );
  const aviso = lista.find((i) => i.nome.includes('08/09'));
  assert.ok(aviso, 'esperava aviso citando a data da partida');
  assert.match(aviso.detalhe, /3 × 1/);
});

test('partida de ontem que nunca saiu do pré-jogo não avisa', () => {
  // Abrir o DuStats na véspera para configurar os times é uso normal, não erro.
  const lista = checagensDaPartida(partida({ criadaEm: ONTEM }), HOJE);
  assert.deepEqual(lista, []);
});

test('partida encerrada hoje avisa — é o caso do jogo duplo', () => {
  const lista = checagensDaPartida(partida({ relogio: { periodo: 'FIM' } }), HOJE);
  assert.deepEqual(nomes(lista), ['Partida já encerrada']);
});

test('jogo em andamento hoje não avisa nada', () => {
  for (const periodo of ['1T', 'INTERVALO', '2T']) {
    const lista = checagensDaPartida(partida({ relogio: { periodo } }), HOJE);
    assert.deepEqual(lista, [], `período ${periodo} não devia avisar`);
  }
});

test('virada de dia é por data no calendário, não por 24 horas', () => {
  // Jogo da noite de sábado conferido na manhã de domingo: são dias diferentes
  // com menos de 24 h de distância, e o aviso precisa aparecer.
  const sabadoNoite = new Date(2026, 8, 8, 21, 0, 0).getTime();
  const domingoManha = new Date(2026, 8, 9, 9, 0, 0).getTime();
  const lista = checagensDaPartida(
    partida({ criadaEm: sabadoNoite, relogio: { periodo: '2T' } }),
    domingoManha
  );
  assert.equal(lista.length, 1);
});

// -- times prontos para o ar -------------------------------------------------

test('nome de fábrica é apontado, um ou os dois', () => {
  const um = checagensDaPartida(comConfig({ fora: { nome: 'Time Visitante', cor: '#1f8f3a' } }), HOJE);
  assert.deepEqual(nomes(um), ['Um time sem nome']);

  const dois = checagensDaPartida(comConfig({
    casa: { nome: 'Time da Casa', cor: '#c0161f' },
    fora: { nome: 'Time Visitante', cor: '#1f8f3a' }
  }), HOJE);
  assert.deepEqual(nomes(dois), ['Os dois times sem nome']);
});

// -- cores -------------------------------------------------------------------

test('a escala de distância separa par que briga de par que funciona', () => {
  // Os números que justificam o limite, congelados: se alguém mexer na conta,
  // é aqui que aparece.
  assert.ok(distanciaDeCor('#1f6feb', '#2b7ae0') < LIMITE_COR, 'dois azuis quase iguais');
  assert.ok(distanciaDeCor('#c0161f', '#e03a2f') < LIMITE_COR, 'dois vermelhos');
  assert.ok(distanciaDeCor('#c0161f', '#000000') > LIMITE_COR, 'vermelho x preto é legível');
  assert.ok(distanciaDeCor('#c0161f', '#1f8f3a') > LIMITE_COR, 'Charrua x Guarapuava');
  assert.equal(distanciaDeCor('#000000', '#000000'), 0);
});

test('cor mal formada não vira alarme falso', () => {
  assert.equal(distanciaDeCor('verde', '#000000'), null);
  assert.equal(distanciaDeCor(undefined, '#000000'), null);
  const lista = checagensDaPartida(comConfig({ casa: { nome: 'Charrua', cor: 'rgb(1,2,3)' } }), HOJE);
  assert.deepEqual(lista, []);
});

test('times de cores parecidas avisam e mostram as duas cores', () => {
  const lista = checagensDaPartida(comConfig({ fora: { nome: 'Serrano', cor: '#e03a2f' } }), HOJE);
  assert.deepEqual(nomes(lista), ['Cores dos times parecidas demais']);
  assert.deepEqual(lista[0].cores, ['#c0161f', '#e03a2f']);
});

test('cor de time igual à da transmissão só é problema na skin Bandeira', () => {
  // O verde do Guarapuava está a 83 do verde do Marrentão.
  const semBandeira = checagensDaPartida(comConfig({ acento: '#17b64a' }), HOJE);
  assert.deepEqual(semBandeira, [], 'nas outras skins o acento é aresta, não campo');

  const comBandeira = checagensDaPartida(comConfig({ acento: '#17b64a', skin: 'bandeira' }), HOJE);
  assert.deepEqual(nomes(comBandeira), ['Cor de time igual à da transmissão, na skin Bandeira']);
  assert.ok(comBandeira[0].cores.includes('#1f8f3a'), 'aponta o time que some');
});

test('snapshot sem config nem relógio não derruba a conferência', () => {
  // O primeiro pacote pode chegar magro; a tela de conferência não pode ser a
  // que quebra antes do jogo começar.
  assert.doesNotThrow(() => itens({ criadaEm: HOJE }, HOJE));
});
