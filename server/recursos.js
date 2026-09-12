'use strict';

/**
 * De onde vêm os arquivos, e onde ficam os dados.
 *
 * O DuStats roda de dois jeitos e este é o único arquivo que sabe disso:
 *
 *   - solto na pasta do projeto, lendo `public/` e `config/` do disco;
 *   - dentro de um executável único, com esses arquivos embutidos.
 *
 * O que NUNCA fica embutido são os dados da partida: eles precisam ser
 * graváveis e sobreviver a uma troca de versão do programa, então moram sempre
 * ao lado do executável, numa pasta `data`.
 */

const fs = require('fs');
const path = require('path');

/**
 * O empacotador injeta este mapa antes de tudo rodar. Fora do executável ele
 * não existe, e aí todo mundo cai no disco.
 */
const EMBUTIDO = globalThis.__DUSTATS_ARQUIVOS__ || null;

const empacotado = () => EMBUTIDO !== null;

/** Verdadeiro só dentro de um executável único de verdade. */
function dentroDoExecutavel() {
  try {
    return require('node:sea').isSea();
  } catch {
    return false; // Node antigo, ou rodando solto
  }
}

const RAIZ_PROJETO = path.join(__dirname, '..');

/**
 * Onde ficam as partidas salvas e a configuração editada.
 *
 * No executável é a pasta que contém o .exe — se fosse a pasta de trabalho,
 * abrir o DuStats por um atalho gravaria o jogo em outro lugar, e o histórico
 * apareceria vazio.
 */
function raizDeDados() {
  // Escape para quem precisa isolar: o teste de fumaça, a CI, ou rodar duas
  // instâncias na mesma máquina sem uma pisar na partida da outra.
  if (process.env.DUSTATS_DADOS) return path.resolve(process.env.DUSTATS_DADOS);
  // No executável, a pasta que contém o .exe. Se fosse a pasta de trabalho,
  // abrir o DuStats por um atalho gravaria o jogo noutro lugar e o histórico
  // apareceria vazio.
  if (dentroDoExecutavel()) return path.dirname(process.execPath);
  // Bundle rodado pelo `node` (o teste do empacotamento): a pasta atual, senão
  // os dados iriam parar ao lado do binário do Node.
  if (empacotado()) return process.cwd();
  return RAIZ_PROJETO;
}

/** Conteúdo de um arquivo de `public/`, ou null se não existir. */
function estatico(caminhoRelativo) {
  if (!empacotado()) return null; // fora do executável, quem serve é o disco
  const arquivo = EMBUTIDO.public[caminhoRelativo.replace(/^\/+/, '')];
  return arquivo === undefined ? null : Buffer.from(arquivo, 'base64');
}

/**
 * Configuração do esporte ou da partida.
 *
 * A da partida é editável pelo painel, então uma cópia gravada em disco, ao
 * lado do executável, tem prioridade sobre a embutida — senão os nomes dos
 * times voltariam ao padrão a cada abertura.
 */
function config(nome) {
  const emDisco = path.join(raizDeDados(), 'config', `${nome}.json`);
  try {
    return JSON.parse(fs.readFileSync(emDisco, 'utf8'));
  } catch {
    /* sem cópia editada: segue para a embutida ou para a do projeto */
  }

  if (empacotado()) {
    const bruto = EMBUTIDO.config[`${nome}.json`];
    return bruto === undefined ? null : JSON.parse(Buffer.from(bruto, 'base64').toString('utf8'));
  }

  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ_PROJETO, 'config', `${nome}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/** Onde gravar a configuração editada pelo painel. */
function caminhoDeConfig(nome) {
  return path.join(raizDeDados(), 'config', `${nome}.json`);
}

module.exports = {
  empacotado, dentroDoExecutavel, raizDeDados,
  estatico, config, caminhoDeConfig, RAIZ_PROJETO
};
