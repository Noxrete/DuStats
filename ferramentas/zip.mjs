/**
 * Leitor de ZIP mínimo, usado para tirar o node.exe do pacote oficial do Node.
 *
 * Chamar `unzip`, `tar` ou PowerShell funcionaria, mas cada um existe num
 * sistema diferente — e seria estranho a ferramenta de empacotar um projeto sem
 * dependências ter três. O `zlib` já vem no Node e resolve.
 */

import zlib from 'node:zlib';

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

export { extrairDoZip };
