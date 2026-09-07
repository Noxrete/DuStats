'use strict';

const fs = require('fs');
const path = require('path');
const recursos = require('./recursos');

const DIR_DADOS = path.join(recursos.raizDeDados(), 'data');
const DIR_PARTIDAS = path.join(DIR_DADOS, 'matches');
const PONTEIRO = path.join(DIR_DADOS, 'atual.txt');

function garantirPastas() {
  fs.mkdirSync(DIR_PARTIDAS, { recursive: true });
}

function lerJson(arquivo, padrao = null) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return padrao;
  }
}

/**
 * Grava trocando o arquivo por um temporário já completo. Se a energia cair no
 * meio da escrita, o arquivo antigo continua íntegro em vez de virar um JSON
 * truncado — o que, num jogo ao vivo, custaria a partida inteira.
 */
function gravarJson(arquivo, dados) {
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, arquivo);
}

function caminhoPartida(id) {
  return path.join(DIR_PARTIDAS, `${id}.json`);
}

function novoId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function salvar(partida) {
  garantirPastas();
  gravarJson(caminhoPartida(partida.id), partida);
  fs.writeFileSync(PONTEIRO, partida.id);
}

function carregar(id) {
  return lerJson(caminhoPartida(id));
}

function carregarAtual() {
  garantirPastas();
  try {
    const id = fs.readFileSync(PONTEIRO, 'utf8').trim();
    return id ? carregar(id) : null;
  } catch {
    return null;
  }
}

function listarPartidas() {
  garantirPastas();
  return fs.readdirSync(DIR_PARTIDAS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
    .reverse();
}

function carregarEsporte(id = 'futebol') {
  const esporte = recursos.config(id);
  if (!esporte) throw new Error(`Configuração do esporte "${id}" não encontrada em config/`);
  return esporte;
}

/**
 * Valores de fábrica da configuração de partida.
 *
 * Ficam em código, e não só no JSON, porque uma partida salva antes de um campo
 * existir traz a configuração antiga inteira. Sem esta base, cada campo novo
 * desapareceria silenciosamente ao reabrir um jogo antigo — foi assim que a
 * cor da transmissão sumiu na primeira vez.
 */
const CONFIG_FABRICA = {
  competicao: 'Campeonato Amador',
  rodada: '',
  local: '',
  acento: '#17b64a',
  // Aparência das peças que entram no ar. Vive na config da partida, e não numa
  // preferência global, porque a roupa certa depende do jogo: sol na grama pede
  // contraste, jogo à noite pede outra coisa.
  skin: 'placar',
  casa: { nome: 'Time da Casa', sigla: 'CAS', cor: '#1f6feb', corTexto: '#ffffff', escudo: '' },
  fora: { nome: 'Time Visitante', sigla: 'VIS', cor: '#d92d20', corTexto: '#ffffff', escudo: '' }
};

/** Completa o que faltar na configuração com os valores de fábrica. */
function comPadroes(config) {
  const base = { ...CONFIG_FABRICA, ...(config || {}) };
  for (const lado of ['casa', 'fora']) {
    base[lado] = { ...CONFIG_FABRICA[lado], ...(config?.[lado] || {}) };
  }
  return base;
}

function carregarConfigPadrao() {
  return comPadroes(recursos.config('partida') || {});
}

function salvarConfigPadrao(config) {
  const destino = recursos.caminhoDeConfig('partida');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  gravarJson(destino, config);
}

module.exports = {
  DIR_PARTIDAS,
  garantirPastas,
  salvar,
  carregar,
  carregarAtual,
  listarPartidas,
  carregarEsporte,
  carregarConfigPadrao,
  salvarConfigPadrao,
  comPadroes,
  CONFIG_FABRICA,
  novoId
};
