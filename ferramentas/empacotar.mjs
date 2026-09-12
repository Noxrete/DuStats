/**
 * Junta o DuStats num arquivo .js só, com os arquivos do site embutidos.
 *
 * É o passo anterior ao executável único: o Node SEA aceita UM script, e não
 * segue `require`. Como todos os módulos do servidor moram na mesma pasta e a
 * árvore de dependências é rasa, não faz falta um empacotador de verdade —
 * bastam um registro de módulos e um `require` que olha nele antes de cair no
 * `require` real dos módulos nativos.
 *
 * Os arquivos de `public/` e `config/` entram como base64. São ~150 KB de
 * texto; embutir é mais simples do que usar a API de recursos do SEA, e evita
 * espalhar `getAsset()` pelo código que hoje só conhece disco.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = 'index.js';

/** Percorre uma pasta e devolve { caminhoRelativo: base64 }. */
function coletar(pasta, filtro = () => true) {
  const arquivos = {};
  if (!fs.existsSync(pasta)) return arquivos;

  for (const item of fs.readdirSync(pasta, { withFileTypes: true, recursive: true })) {
    if (!item.isFile()) continue;
    const completo = path.join(item.parentPath ?? item.path, item.name);
    const relativo = path.relative(pasta, completo).split(path.sep).join('/');
    if (!filtro(relativo)) continue;
    arquivos[relativo] = fs.readFileSync(completo).toString('base64');
  }
  return arquivos;
}

/**
 * Segue os `require('./x')` a partir da entrada e devolve os módulos na ordem
 * em que foram encontrados. Só resolve caminhos relativos: qualquer outra coisa
 * é módulo nativo do Node e continua sendo carregada normalmente.
 */
function coletarModulos(dirServidor) {
  const encontrados = new Map();
  const fila = [ENTRADA];

  while (fila.length > 0) {
    const nome = fila.shift();
    if (encontrados.has(nome)) continue;

    const arquivo = path.join(dirServidor, nome);
    const codigo = fs.readFileSync(arquivo, 'utf8');
    encontrados.set(nome, codigo);

    for (const casa of codigo.matchAll(/require\(['"]\.\/([\w.-]+)['"]\)/g)) {
      const alvo = casa[1].endsWith('.js') ? casa[1] : `${casa[1]}.js`;
      if (!encontrados.has(alvo)) fila.push(alvo);
    }
  }
  return encontrados;
}

function empacotar() {
  const dirServidor = path.join(RAIZ, 'server');
  const modulos = coletarModulos(dirServidor);

  const arquivos = {
    public: coletar(path.join(RAIZ, 'public'), (rel) => !rel.startsWith('logos/')),
    config: coletar(path.join(RAIZ, 'config'), (rel) => rel.endsWith('.json'))
  };

  const partes = [];
  partes.push("'use strict';");
  partes.push('// Gerado por ferramentas/empacotar.mjs — não edite à mão.');
  partes.push('');
  // O mapa é definido ANTES dos módulos: o recursos.js o lê no topo do arquivo.
  partes.push(`globalThis.__DUSTATS_ARQUIVOS__ = ${JSON.stringify(arquivos)};`);
  partes.push('');
  partes.push('const __modulos__ = {};');
  partes.push('const __cache__ = {};');
  partes.push(`
function __require__(nome) {
  if (!nome.startsWith('./')) return require(nome);
  const chave = nome.slice(2).endsWith('.js') ? nome.slice(2) : nome.slice(2) + '.js';
  if (__cache__[chave]) return __cache__[chave].exports;
  const modulo = { exports: {} };
  __cache__[chave] = modulo;
  __modulos__[chave](modulo, modulo.exports, __require__);
  return modulo.exports;
}
`);

  for (const [nome, codigo] of modulos) {
    partes.push(`__modulos__[${JSON.stringify(nome)}] = function (module, exports, require) {`);
    partes.push(codigo);
    partes.push('};');
    partes.push('');
  }

  partes.push(`__require__('./${ENTRADA}');`);

  const saida = path.join(RAIZ, 'build', 'dustats.bundle.js');
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, partes.join('\n'));

  return {
    saida,
    modulos: [...modulos.keys()],
    arquivosEmbutidos: Object.keys(arquivos.public).length + Object.keys(arquivos.config).length,
    tamanho: fs.statSync(saida).size
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = empacotar();
  console.log(`\n  ${r.saida}`);
  console.log(`  ${r.modulos.length} módulos: ${r.modulos.join(', ')}`);
  console.log(`  ${r.arquivosEmbutidos} arquivos embutidos`);
  console.log(`  ${(r.tamanho / 1024).toFixed(0)} KB\n`);
}

export { empacotar };
