/**
 * Monta a pasta portátil do DuStats.
 *
 *   npm run portatil
 *
 * O resultado é uma pasta autocontida — com o Node dentro — que roda em
 * qualquer Windows sem instalar nada. Copie para o PC do OBS ou para um
 * pendrive e dê duplo clique no DuStats.bat.
 *
 * O ZIP do Node é lido aqui mesmo, com o `zlib` que já vem no Node. Chamar
 * `unzip`, `tar` ou PowerShell funcionaria, mas cada um existe num sistema
 * diferente — e o projeto inteiro não tem dependência, seria estranho a
 * ferramenta de empacotar ter três.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argumento = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=').slice(1).join('=') : padrao;
};

// Por padrão embrulha a mesma versão que está rodando: é uma versão que existe
// de verdade no nodejs.org e que você já viu funcionar.
const VERSAO = argumento('versao', process.version).replace(/^v?/, 'v');
const PLATAFORMA = argumento('plataforma', 'win-x64');
const DESTINO = path.resolve(argumento('destino', path.join(RAIZ, 'DuStats-portatil')));

const COPIAR = ['server', 'public', 'config', 'DuStats.bat', 'dustats.sh', 'package.json'];

// ------------------------------------------------------------------ leitor de zip

/**
 * Extrai um único arquivo do ZIP, pelo final do nome.
 *
 * Lê o "fim do diretório central" no rabo do arquivo, percorre as entradas e
 * infla só a que interessa. É o mínimo do formato: o ZIP do Node usa deflate
 * ou armazenamento cru, e nada de criptografia ou zip64.
 */
function extrairDoZip(buffer, terminaEm) {
  const FIM_CENTRAL = 0x06054b50;
  const ENTRADA_CENTRAL = 0x02014b50;

  let fim = buffer.length - 22;
  while (fim >= 0 && buffer.readUInt32LE(fim) !== FIM_CENTRAL) fim -= 1;
  if (fim < 0) throw new Error('ZIP sem diretório central — download corrompido?');

  const quantas = buffer.readUInt16LE(fim + 10);
  let cursor = buffer.readUInt32LE(fim + 16);

  for (let i = 0; i < quantas; i += 1) {
    if (buffer.readUInt32LE(cursor) !== ENTRADA_CENTRAL) {
      throw new Error('entrada do diretório central inesperada');
    }
    const metodo = buffer.readUInt16LE(cursor + 10);
    const tamanhoComprimido = buffer.readUInt32LE(cursor + 20);
    const tamanhoNome = buffer.readUInt16LE(cursor + 28);
    const tamanhoExtra = buffer.readUInt16LE(cursor + 30);
    const tamanhoComentario = buffer.readUInt16LE(cursor + 32);
    const inicioLocal = buffer.readUInt32LE(cursor + 42);
    const nome = buffer.subarray(cursor + 46, cursor + 46 + tamanhoNome).toString('utf8');

    if (nome.endsWith(terminaEm)) {
      // O cabeçalho local repete nome e extra, com tamanhos que podem diferir
      // dos do diretório central — por isso são relidos aqui.
      const nomeLocal = buffer.readUInt16LE(inicioLocal + 26);
      const extraLocal = buffer.readUInt16LE(inicioLocal + 28);
      const dados = buffer.subarray(
        inicioLocal + 30 + nomeLocal + extraLocal,
        inicioLocal + 30 + nomeLocal + extraLocal + tamanhoComprimido
      );
      if (metodo === 0) return dados;                 // armazenado
      if (metodo === 8) return zlib.inflateRawSync(dados); // deflate
      throw new Error(`método de compressão ${metodo} não suportado`);
    }

    cursor += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  throw new Error(`"${terminaEm}" não encontrado dentro do ZIP`);
}

// ------------------------------------------------------------------------ passos

async function baixar(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`${resposta.status} ao baixar ${url}`);

  const total = Number(resposta.headers.get('content-length')) || 0;
  const pedacos = [];
  let recebido = 0;

  for await (const pedaco of resposta.body) {
    pedacos.push(pedaco);
    recebido += pedaco.length;
    // O "\r" só faz sentido num terminal de verdade; redirecionado para
    // arquivo ele viraria milhares de linhas de progresso.
    if (total && process.stdout.isTTY) {
      const porcento = Math.round((recebido / total) * 100);
      process.stdout.write(`\r  baixando Node ${VERSAO}... ${porcento}%`);
    }
  }
  process.stdout.write(`${process.stdout.isTTY ? '\r' : '  '}baixando Node ${VERSAO}... pronto        \n`);
  return Buffer.concat(pedacos);
}

function copiar(origem, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.cpSync(origem, destino, { recursive: true });
}

async function main() {
  console.log(`\n  Montando a pasta portátil (Node ${VERSAO}, ${PLATAFORMA})\n`);

  const ehWindows = PLATAFORMA.startsWith('win');
  const pasta = `node-${VERSAO}-${PLATAFORMA}`;
  const url = `https://nodejs.org/dist/${VERSAO}/${pasta}.${ehWindows ? 'zip' : 'tar.gz'}`;

  if (!ehWindows) {
    console.error('  Por enquanto o montador só empacota Windows (--plataforma=win-x64).');
    console.error('  No Linux e no macOS use o dustats.sh com o Node do sistema.\n');
    process.exit(1);
  }

  const zip = await baixar(url);
  const executavel = extrairDoZip(zip, `${pasta}/node.exe`);

  fs.rmSync(DESTINO, { recursive: true, force: true });
  fs.mkdirSync(path.join(DESTINO, 'node'), { recursive: true });
  fs.writeFileSync(path.join(DESTINO, 'node', 'node.exe'), executavel);

  for (const item of COPIAR) {
    const origem = path.join(RAIZ, item);
    if (fs.existsSync(origem)) copiar(origem, path.join(DESTINO, item));
  }
  // A pasta de dados precisa existir; o conteúdo é do jogo, não do pacote.
  fs.mkdirSync(path.join(DESTINO, 'data', 'matches'), { recursive: true });

  fs.writeFileSync(path.join(DESTINO, 'LEIA-ME.txt'), [
    'DuStats — pasta portátil',
    '',
    'Dê duplo clique em DuStats.bat. O painel abre sozinho no navegador.',
    '',
    'Não precisa instalar nada: o Node vai junto, dentro da pasta "node".',
    'Pode copiar esta pasta inteira para um pendrive ou para outro PC.',
    '',
    'As partidas ficam salvas em data\\matches. Ao copiar a pasta, o',
    'histórico vai junto.',
    '',
    `Node embutido: ${VERSAO}`
  ].join('\r\n') + '\r\n');

  const tamanho = (dir) => fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .reduce((soma, e) => soma + fs.statSync(path.join(e.parentPath ?? e.path, e.name)).size, 0);

  console.log(`  Pronto: ${DESTINO}`);
  console.log(`  Tamanho: ${(tamanho(DESTINO) / 1024 / 1024).toFixed(0)} MB`);
  console.log('\n  Copie a pasta para o PC do OBS e dê duplo clique no DuStats.bat.\n');
}

main().catch((erro) => {
  console.error(`\n  Falhou: ${erro.message}\n`);
  process.exit(1);
});
