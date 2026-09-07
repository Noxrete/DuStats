'use strict';

/**
 * WebSocket mínimo, escrito em cima do `http` do Node.
 *
 * O canal do DuStats é SÓ DE DESCIDA: o servidor manda o estado, e nenhum
 * cliente — painel ou overlay — jamais envia nada por aqui (o painel grava
 * lances por HTTP, com fila e reenvio). Isso reduz o protocolo ao que cabe
 * neste arquivo, e é o que permite dispensar a biblioteca `ws` e, com ela, o
 * `npm install` inteiro.
 *
 * O que está implementado: aperto de mão, quadro de texto do servidor para o
 * cliente, ping periódico e fechamento. O que chega do cliente é lido só o
 * bastante para responder a ping e detectar o fechamento.
 */

const crypto = require('crypto');

// Constante do RFC 6455: entra no aperto de mão e não tem nada de secreto.
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const INTERVALO_PING = 30000;

/** Monta um quadro de texto do servidor (nunca mascarado, como manda o RFC). */
function quadroDeTexto(texto) {
  const dados = Buffer.from(texto, 'utf8');
  const tamanho = dados.length;

  let cabecalho;
  if (tamanho < 126) {
    cabecalho = Buffer.alloc(2);
    cabecalho[1] = tamanho;
  } else if (tamanho < 65536) {
    cabecalho = Buffer.alloc(4);
    cabecalho[1] = 126;
    cabecalho.writeUInt16BE(tamanho, 2);
  } else {
    cabecalho = Buffer.alloc(10);
    cabecalho[1] = 127;
    cabecalho.writeBigUInt64BE(BigInt(tamanho), 2);
  }
  cabecalho[0] = 0x81; // FIN + opcode 1 (texto)

  return Buffer.concat([cabecalho, dados]);
}

function quadroDeControle(opcode) {
  return Buffer.from([0x80 | opcode, 0x00]);
}

/**
 * Lê os opcodes que chegam do cliente. Não remonta a carga: o cliente não manda
 * dados, e o que interessa é distinguir fechamento de ping para responder.
 */
function opcodesRecebidos(pedaco) {
  const opcodes = [];
  let i = 0;
  while (i + 2 <= pedaco.length) {
    const opcode = pedaco[i] & 0x0f;
    const mascarado = (pedaco[i + 1] & 0x80) !== 0;
    let tamanho = pedaco[i + 1] & 0x7f;
    let cursor = i + 2;

    if (tamanho === 126) { tamanho = pedaco.readUInt16BE(cursor); cursor += 2; }
    else if (tamanho === 127) { tamanho = Number(pedaco.readBigUInt64BE(cursor)); cursor += 8; }
    if (mascarado) cursor += 4;

    opcodes.push(opcode);
    i = cursor + tamanho;
  }
  return opcodes;
}

/**
 * Liga o WebSocket a um servidor HTTP já criado.
 * Devolve { transmitir, aoConectar, quantidade }.
 */
/**
 * Quem pode aparecer pendurado no WebSocket. A lista é fechada de propósito: o
 * nome chega por query string, portanto vem de qualquer um na mesma rede, e vai
 * parar no snapshot que o painel desenha. Nome fora da lista vira "outra".
 */
const FONTES = new Set(['painel', 'posse', 'faixa', 'intervalo', 'resumo']);

function fonteDoPedido(url) {
  const busca = String(url || '').split('?')[1] || '';
  const nome = new URLSearchParams(busca).get('fonte');
  return FONTES.has(nome) ? nome : 'outra';
}

function ligar(servidor) {
  // Map, não Set: além do socket, guarda QUEM ele é e desde quando está ligado.
  // É o que deixa o painel responder, antes do apito, se a fonte do OBS está
  // mesmo recebendo — em vez de o operador descobrir no intervalo, no ar.
  const clientes = new Map();
  const ouvintesDeConexao = [];
  const ouvintesDeMudanca = [];

  // O aviso sai adiado e coalescido, nunca no meio da operação que o causou.
  // Sem isso há reentrância: transmitir() acha um socket morto, remove, avisa,
  // e o ouvinte chama transmitir() de novo por dentro do laço que ainda está
  // rodando. De quebra, três fontes do OBS subindo juntas viram uma publicação
  // só em vez de três.
  let mudancaAgendada = false;
  function avisarMudanca() {
    if (mudancaAgendada) return;
    mudancaAgendada = true;
    setImmediate(() => {
      mudancaAgendada = false;
      for (const fn of ouvintesDeMudanca) fn();
    });
  }

  /** Único lugar que tira cliente da lista, para nenhuma saída passar batida. */
  function remover(socket) {
    if (!clientes.delete(socket)) return false;
    avisarMudanca();
    return true;
  }

  servidor.on('upgrade', (req, socket) => {
    const chave = req.headers['sec-websocket-key'];
    if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !chave) {
      socket.destroy();
      return;
    }

    const aceite = crypto.createHash('sha1').update(chave + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${aceite}\r\n\r\n`
    );

    // Nagle atrasaria pacotes pequenos — e aqui todo pacote é pequeno e urgente.
    socket.setNoDelay(true);
    clientes.set(socket, { fonte: fonteDoPedido(req.url), desde: Date.now() });

    const encerrar = () => {
      if (!remover(socket)) return;
      socket.destroy();
    };

    socket.on('data', (pedaco) => {
      for (const opcode of opcodesRecebidos(pedaco)) {
        if (opcode === 0x8) return encerrar();      // close
        if (opcode === 0x9) socket.write(quadroDeControle(0xa)); // ping -> pong
      }
      return undefined;
    });

    socket.on('error', encerrar);
    socket.on('close', encerrar);

    for (const fn of ouvintesDeConexao) fn({ enviar: (texto) => enviarPara(socket, texto) });
    avisarMudanca();
  });

  function enviarPara(socket, texto) {
    if (socket.destroyed || !socket.writable) {
      remover(socket);
      return;
    }
    try {
      socket.write(quadroDeTexto(texto));
    } catch {
      remover(socket);
      socket.destroy();
    }
  }

  /**
   * Ping periódico. Uma Fonte de Navegador do OBS que morreu sem fechar direito
   * fica de pé na lista e o servidor escreve para o vazio a cada 2 s; o ping
   * força o socket a falhar e sair da lista.
   */
  const pulso = setInterval(() => {
    for (const socket of [...clientes.keys()]) {
      if (socket.destroyed || !socket.writable) { remover(socket); continue; }
      try {
        socket.write(quadroDeControle(0x9));
      } catch {
        remover(socket);
        socket.destroy();
      }
    }
  }, INTERVALO_PING);
  pulso.unref();

  return {
    aoConectar: (fn) => ouvintesDeConexao.push(fn),
    transmitir(texto) {
      const quadro = quadroDeTexto(texto);
      for (const socket of [...clientes.keys()]) {
        if (socket.destroyed || !socket.writable) { remover(socket); continue; }
        try {
          socket.write(quadro);
        } catch {
          remover(socket);
          socket.destroy();
        }
      }
    },
    aoMudarFontes: (fn) => ouvintesDeMudanca.push(fn),
    /** Quem está ligado agora, na ordem em que chegou. */
    fontes() {
      return [...clientes.values()]
        .map(({ fonte, desde }) => ({ fonte, desde }))
        .sort((a, b) => a.desde - b.desde);
    },
    get quantidade() { return clientes.size; }
  };
}

module.exports = { ligar, quadroDeTexto, opcodesRecebidos, fonteDoPedido };
