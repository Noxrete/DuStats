'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR_DADOS = path.join(RAIZ, 'data');
const DIR_PARTIDAS = path.join(DIR_DADOS, 'matches');
const PONTEIRO = path.join(DIR_DADOS, 'atual.txt');
const DIR_CONFIG = path.join(RAIZ, 'config');

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
  const esporte = lerJson(path.join(DIR_CONFIG, `${id}.json`));
  if (!esporte) throw new Error(`Configuração do esporte "${id}" não encontrada em config/`);
  return esporte;
}

function carregarConfigPadrao() {
  return lerJson(path.join(DIR_CONFIG, 'partida.json'), {});
}

function salvarConfigPadrao(config) {
  gravarJson(path.join(DIR_CONFIG, 'partida.json'), config);
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
  novoId
};
