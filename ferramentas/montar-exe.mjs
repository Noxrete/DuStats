/**
 * Gera o DuStats.exe — um arquivo só, que não instala nada.
 *
 *   npm run exe                      -> DuStats.exe (Windows x64)
 *   npm run exe -- --plataforma=aqui -> executável para esta máquina, só para testar
 *
 * Usa o recurso de executável único do próprio Node (SEA): o script empacotado
 * vira um blob que é injetado dentro de uma cópia do binário do Node. O
 * resultado abre com duplo clique, sem janela de terminal preta e sem .bat.
 *
 * A injeção é feita pelo `postject`, a ferramenta oficial para isso. É a única
 * dependência do projeto, ela é só de construção, e nada dela vai para dentro
 * do executável — quem roda o DuStats continua sem instalar coisa nenhuma.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { extrairDoZip } from './zip.mjs';
import { empacotar } from './empacotar.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(RAIZ, 'build');

const argumento = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=').slice(1).join('=') : padrao;
};

const PLATAFORMA = argumento('plataforma', 'win-x64');
const VERSAO = argumento('versao', process.version).replace(/^v?/, 'v');
const PARA_WINDOWS = PLATAFORMA === 'win-x64';

// Sentinela que o Node procura dentro do próprio binário para saber que virou
// executável único. O valor é fixo e público, definido pelo Node.
const FUSIVEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

// ------------------------------------------------------------------ assinatura

/**
 * Remove a assinatura Authenticode de um PE.
 *
 * O node.exe oficial vem assinado pela OpenJS Foundation. Injetar o blob altera
 * o arquivo e a assinatura deixa de conferir — um executável com assinatura
 * QUEBRADA é tratado com mais desconfiança pelo Windows do que um sem
 * assinatura nenhuma. Então é melhor tirá-la por inteiro.
 *
 * Na prática: zerar a entrada 4 do diretório de dados (Certificate Table) e
 * cortar o rabo do arquivo, onde a assinatura fica.
 */
function removerAssinatura(binario) {
  const inicioPE = binario.readUInt32LE(0x3c);
  if (binario.toString('ascii', inicioPE, inicioPE + 4) !== 'PE\0\0') return binario;

  const opcional = inicioPE + 24;
  const magica = binario.readUInt16LE(opcional);
  // 0x20b = PE32+ (64 bits), que é o caso do node.exe x64.
  const baseDiretorios = opcional + (magica === 0x20b ? 112 : 96);
  const entradaCertificado = baseDiretorios + 4 * 8;

  const posicao = binario.readUInt32LE(entradaCertificado);
  const tamanho = binario.readUInt32LE(entradaCertificado + 4);
  if (posicao === 0 || tamanho === 0) return binario; // já vinha sem assinatura

  binario.writeUInt32LE(0, entradaCertificado);
  binario.writeUInt32LE(0, entradaCertificado + 4);
  return binario.subarray(0, posicao);
}

// ---------------------------------------------------------------------- passos

async function baixar(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`${resposta.status} ao baixar ${url}`);
  return Buffer.from(await resposta.arrayBuffer());
}

async function binarioBase() {
  if (!PARA_WINDOWS) {
    // Para testar o empacotamento nesta máquina: usa o Node que está rodando.
    console.log(`  base: o Node desta máquina (${process.execPath})`);
    return { binario: fs.readFileSync(process.execPath), nome: 'dustats' };
  }

  const pasta = `node-${VERSAO}-win-x64`;
  console.log(`  baixando ${pasta}.zip...`);
  const zip = await baixar(`https://nodejs.org/dist/${VERSAO}/${pasta}.zip`);

  console.log('  extraindo node.exe...');
  const bruto = extrairDoZip(zip, `${pasta}/node.exe`);

  const semAssinatura = removerAssinatura(Buffer.from(bruto));
  const cortou = semAssinatura.length < bruto.length;
  console.log(`  assinatura da OpenJS: ${cortou ? 'removida' : 'não havia'}`);

  return { binario: semAssinatura, nome: 'DuStats.exe' };
}

function garantirPostject() {
  const caminho = path.join(RAIZ, 'node_modules', 'postject', 'dist', 'cli.js');
  if (fs.existsSync(caminho)) return caminho;

  console.log('  instalando o postject (só para construir)...');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: RAIZ, stdio: 'inherit' });
  if (!fs.existsSync(caminho)) throw new Error('postject não ficou disponível após o npm install');
  return caminho;
}

async function main() {
  console.log(`\n  Montando o executável único (${PLATAFORMA}, Node ${VERSAO})\n`);

  const pacote = empacotar();
  console.log(`  empacotado: ${pacote.modulos.length} módulos + ${pacote.arquivosEmbutidos} arquivos, ${(pacote.tamanho / 1024).toFixed(0)} KB`);

  const configSea = path.join(BUILD, 'sea-config.json');
  const blob = path.join(BUILD, 'dustats.blob');
  fs.writeFileSync(configSea, JSON.stringify({
    main: pacote.saida,
    output: blob,
    disableExperimentalSEAWarning: true
  }, null, 2));

  execFileSync(process.execPath, ['--experimental-sea-config', configSea], { stdio: 'inherit' });
  console.log(`  blob: ${(fs.statSync(blob).size / 1024).toFixed(0)} KB`);

  const { binario, nome } = await binarioBase();
  const destino = path.join(BUILD, nome);
  fs.writeFileSync(destino, binario);
  fs.chmodSync(destino, 0o755);

  const postject = garantirPostject();
  console.log('  injetando...');
  execFileSync(process.execPath, [
    postject, destino, 'NODE_SEA_BLOB', blob,
    '--sentinel-fuse', FUSIVEL,
    ...(PARA_WINDOWS ? [] : ['--macho-segment-name', 'NODE_SEA'])
  ], { stdio: 'inherit' });

  const mb = (fs.statSync(destino).size / 1024 / 1024).toFixed(0);
  console.log(`\n  Pronto: ${destino}  (${mb} MB)\n`);

  if (PARA_WINDOWS) {
    console.log('  Copie o arquivo para o PC do OBS e dê duplo clique.');
    console.log('  Ele cria uma pasta "data" ao lado, com as partidas.\n');
    console.log('  Na primeira vez o Windows pode mostrar "O Windows protegeu o seu PC",');
    console.log('  porque o arquivo não tem assinatura digital paga. Clique em');
    console.log('  "Mais informações" e depois em "Executar assim mesmo".\n');
  }
}

main().catch((erro) => {
  console.error(`\n  Falhou: ${erro.message}\n`);
  process.exit(1);
});
