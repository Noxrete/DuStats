/**
 * Codificador de QR code, do tamanho exato do problema: pôr o endereço do
 * painel na tela para o apontador apontar a câmera, em vez de digitar
 * "http://192.168.0.10:4590/control/" num celular, no campo, com a mão fria.
 *
 * Escopo deliberadamente estreito:
 *
 *   - só modo byte, que é o que serve para uma URL;
 *   - só nível de correção Q (~25%);
 *   - só versões 1 a 4 (até 33 × 33 módulos, 48 bytes de dados).
 *
 * O nível Q, e não o M, porque a escolha de máscara aqui é uma heurística: a
 * especificação manda pontuar as 8 e ficar com a menor nota, mas as
 * implementações consagradas discordam entre si sobre a nota (segno e qrcode
 * escolheram máscaras diferentes em 8 de 8 casos que medi). Uma máscara
 * infeliz gera um símbolo válido que alguns leitores custam a pegar. Margem de
 * correção é o que absorve isso, e num QR desenhado numa tela ela é de graça:
 * custa alguns módulos a mais, não papel nem tinta.
 *
 * O corte na versão 4 vem de duas coisas. Da 7 em diante o símbolo carrega um
 * bloco de informação de versão, com outro BCH e outra tabela. E no nível Q a
 * versão 5 é a primeira com blocos de tamanhos diferentes, o que pediria uma
 * intercalação irregular. Nenhum dos dois pedaços seria exercitado por uma URL
 * de rede local — e código que nunca roda é código que ninguém percebe estar
 * errado.
 *
 * Referência: ISO/IEC 18004. O resultado é conferido decodificando com um
 * leitor de verdade, não a olho — ver ferramentas/ nas notas do commit.
 */
(function (global) {
  'use strict';

  // ------------------------------------------------------------ tabelas

  /**
   * Por versão: [dados por bloco, blocos, corretores por bloco]. Total de
   * codewords = blocos × (dados + corretores).
   */
  const CAPACIDADE_Q = {
    1: { dados: 13, blocos: 1, ecc: 13 },
    2: { dados: 22, blocos: 1, ecc: 22 },
    3: { dados: 17, blocos: 2, ecc: 18 },
    4: { dados: 24, blocos: 2, ecc: 26 }
  };

  /** Centro do padrão de alinhamento. A versão 1 não tem nenhum. */
  const ALINHAMENTO = { 1: null, 2: 18, 3: 22, 4: 26 };

  const VERSAO_MAX = 4;

  // ------------------------------------------------- corpo finito GF(256)

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function montarTabelas() {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d; // polinômio primitivo do QR
    }
    for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
  }());

  const multiplicar = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  /** Polinômio gerador de grau `grau`, para Reed-Solomon. */
  function gerador(grau) {
    let poli = [1];
    for (let i = 0; i < grau; i += 1) {
      const proximo = new Array(poli.length + 1).fill(0);
      for (let j = 0; j < poli.length; j += 1) {
        proximo[j] ^= poli[j];
        proximo[j + 1] ^= multiplicar(poli[j], EXP[i]);
      }
      poli = proximo;
    }
    return poli;
  }

  /** Resto da divisão dos dados pelo gerador: são os codewords de correção. */
  function corretores(dados, quantos) {
    const g = gerador(quantos);
    const resto = new Array(quantos).fill(0);
    for (const byte of dados) {
      const fator = byte ^ resto[0];
      resto.shift();
      resto.push(0);
      if (fator !== 0) {
        for (let i = 0; i < quantos; i += 1) resto[i] ^= multiplicar(g[i + 1], fator);
      }
    }
    return resto;
  }

  // ---------------------------------------------------------- bits e dados

  function bytesUtf8(texto) {
    // O painel só passa URL ASCII, mas um nome de host com acento não pode
    // virar um QR que aponta para outro lugar — melhor codificar certo.
    return Array.from(new TextEncoder().encode(texto));
  }

  function menorVersao(quantosBytes) {
    for (let v = 1; v <= VERSAO_MAX; v += 1) {
      const { dados, blocos } = CAPACIDADE_Q[v];
      // 4 bits de modo + 8 bits de contagem (versões 1-9) = 12 bits de cabeçalho.
      if (dados * blocos - 2 >= quantosBytes) return v;
    }
    return null;
  }

  /** Fluxo de bits do conteúdo, já com terminador e enchimento. */
  function bitsDeDados(bytes, versao) {
    const { dados, blocos } = CAPACIDADE_Q[versao];
    const capacidadeBits = dados * blocos * 8;
    const bits = [];
    const empurrar = (valor, quantos) => {
      for (let i = quantos - 1; i >= 0; i -= 1) bits.push((valor >> i) & 1);
    };

    empurrar(0b0100, 4);          // modo byte
    empurrar(bytes.length, 8);    // contagem: 8 bits nas versões 1 a 9
    for (const b of bytes) empurrar(b, 8);

    // Terminador de até 4 zeros, e o resto do byte completado com zeros.
    for (let i = 0; i < 4 && bits.length < capacidadeBits; i += 1) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    // Enchimento alternado, fixado pela especificação.
    const enchimento = [0xec, 0x11];
    for (let i = 0; bits.length < capacidadeBits; i += 1) empurrar(enchimento[i % 2], 8);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }
    return codewords;
  }

  /**
   * Divide em blocos, calcula a correção de cada um e intercala. A intercalação
   * é o que faz um borrão na etiqueta estragar um pedaço de cada bloco em vez
   * de destruir um bloco inteiro — é dela que vem a tolerância a dano.
   */
  function sequenciaFinal(codewords, versao) {
    const { dados, blocos, ecc } = CAPACIDADE_Q[versao];
    const blocosDados = [];
    const blocosEcc = [];
    for (let i = 0; i < blocos; i += 1) {
      const pedaco = codewords.slice(i * dados, (i + 1) * dados);
      blocosDados.push(pedaco);
      blocosEcc.push(corretores(pedaco, ecc));
    }

    const saida = [];
    for (let i = 0; i < dados; i += 1) for (const b of blocosDados) saida.push(b[i]);
    for (let i = 0; i < ecc; i += 1) for (const b of blocosEcc) saida.push(b[i]);
    return saida;
  }

  // ------------------------------------------------------------- matriz

  function matrizVazia(lado) {
    return Array.from({ length: lado }, () => new Array(lado).fill(null));
  }

  function porFinder(m, linha, coluna) {
    for (let i = -1; i <= 7; i += 1) {
      for (let j = -1; j <= 7; j += 1) {
        const y = linha + i;
        const x = coluna + j;
        if (y < 0 || x < 0 || y >= m.length || x >= m.length) continue;
        const naBorda = i === 0 || i === 6 || j === 0 || j === 6;
        const noMiolo = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        const dentro = i >= 0 && i <= 6 && j >= 0 && j <= 6;
        m[y][x] = dentro && (naBorda || noMiolo) ? 1 : 0;
      }
    }
  }

  function porAlinhamento(m, centro) {
    if (centro === null) return;
    for (let i = -2; i <= 2; i += 1) {
      for (let j = -2; j <= 2; j += 1) {
        const borda = Math.max(Math.abs(i), Math.abs(j));
        m[centro + i][centro + j] = borda === 1 ? 0 : 1;
      }
    }
  }

  function porEstrutura(m, versao) {
    const lado = m.length;
    porFinder(m, 0, 0);
    porFinder(m, 0, lado - 7);
    porFinder(m, lado - 7, 0);
    porAlinhamento(m, ALINHAMENTO[versao]);

    // Linhas de tempo: alternância que dá a régua para o leitor.
    for (let i = 8; i < lado - 8; i += 1) {
      const valor = i % 2 === 0 ? 1 : 0;
      m[6][i] = valor;
      m[i][6] = valor;
    }

    m[lado - 8][8] = 1; // módulo sempre escuro

    // Reserva das áreas de formato, para o passeio dos dados não invadi-las.
    for (let i = 0; i < 9; i += 1) {
      if (m[8][i] === null) m[8][i] = 0;
      if (m[i][8] === null) m[i][8] = 0;
    }
    for (let i = 0; i < 8; i += 1) {
      if (m[8][lado - 1 - i] === null) m[8][lado - 1 - i] = 0;
      if (m[lado - 1 - i][8] === null) m[lado - 1 - i][8] = 0;
    }
  }

  /** Quais posições são de dados: tudo que a estrutura não ocupou. */
  function passeio(m) {
    const lado = m.length;
    const posicoes = [];
    let subindo = true;
    for (let colunaDireita = lado - 1; colunaDireita > 0; colunaDireita -= 2) {
      // A coluna 6 é toda linha de tempo; o passeio pula por cima dela.
      const base = colunaDireita <= 6 ? colunaDireita - 1 : colunaDireita;
      for (let passo = 0; passo < lado; passo += 1) {
        const linha = subindo ? lado - 1 - passo : passo;
        for (const coluna of [base, base - 1]) {
          if (m[linha][coluna] === null) posicoes.push([linha, coluna]);
        }
      }
      subindo = !subindo;
    }
    return posicoes;
  }

  const MASCARAS = [
    (i, j) => (i + j) % 2 === 0,
    (i) => i % 2 === 0,
    (i, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
    (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0
  ];

  /** BCH(15,5) do formato, já com o XOR fixo da especificação. */
  function bitsDeFormato(mascara) {
    const dados = (0b11 << 3) | mascara; // 11 = nível Q
    let resto = dados << 10;
    for (let i = 14; i >= 10; i -= 1) {
      if ((resto >> i) & 1) resto ^= 0b10100110111 << (i - 10);
    }
    return ((dados << 10) | resto) ^ 0b101010000010010;
  }

  function porFormato(m, mascara) {
    const lado = m.length;
    const bits = bitsDeFormato(mascara);
    // Do mais significativo para o menos: o primeiro módulo do percurso,
    // (8, 0), carrega o bit 14. Lendo ao contrário o símbolo fica com o
    // formato espelhado — bit a bit — e nenhum leitor o reconhece, embora a
    // estrutura toda pareça perfeita a olho nu.
    const bit = (i) => (bits >> (14 - i)) & 1;

    for (let i = 0; i <= 5; i += 1) m[8][i] = bit(i);
    m[8][7] = bit(6);
    m[8][8] = bit(7);
    m[7][8] = bit(8);
    for (let i = 9; i <= 14; i += 1) m[14 - i][8] = bit(i);

    // A cópia de baixo leva os bits 0 a 6 na coluna 8 e os bits 7 a 14 na
    // linha 8. O corte é em 6, não em 7: (lado-8, 8) é o módulo sempre escuro,
    // não pertence ao formato, e escrever um bit ali corrompe as duas coisas.
    for (let i = 0; i <= 6; i += 1) m[lado - 1 - i][8] = bit(i);
    for (let i = 7; i <= 14; i += 1) m[8][lado - 15 + i] = bit(i);
  }

  /** Penalidades da especificação: quanto menor, mais fácil de ler. */
  function penalidade(m) {
    const lado = m.length;
    let total = 0;

    // Regra 1: sequências de 5 ou mais módulos iguais, em linha e em coluna.
    const linhaOuColuna = (pegar) => {
      for (let a = 0; a < lado; a += 1) {
        let corrida = 1;
        for (let b = 1; b < lado; b += 1) {
          if (pegar(a, b) === pegar(a, b - 1)) {
            corrida += 1;
            if (corrida === 5) total += 3;
            else if (corrida > 5) total += 1;
          } else corrida = 1;
        }
      }
    };
    linhaOuColuna((a, b) => m[a][b]);
    linhaOuColuna((a, b) => m[b][a]);

    // Regra 2: blocos 2 × 2 de uma cor só.
    for (let i = 0; i < lado - 1; i += 1) {
      for (let j = 0; j < lado - 1; j += 1) {
        const v = m[i][j];
        if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) total += 3;
      }
    }

    // Regra 3: o desenho 1:1:3:1:1 do finder aparecendo no meio dos dados.
    const ALVO = [1, 0, 1, 1, 1, 0, 1];
    const CLARO = [0, 0, 0, 0];
    // Fora do símbolo conta como claro: o QR é sempre impresso com uma zona
    // silenciosa de 4 módulos em volta, então um 1:1:3:1:1 encostado na borda
    // ESTÁ cercado de claro e é tão confundível com um finder quanto um no
    // meio. Exigir os 4 módulos dentro da matriz subestimava justo as máscaras
    // de listras, e a escolhida saía uma que alguns leitores não pegam.
    const dentro = (b) => b >= 0 && b < lado;
    const casa = (pegar, a, b, padrao) =>
      padrao.every((v, k) => (dentro(b + k) ? pegar(a, b + k) : 0) === v);
    for (const pegar of [(a, b) => m[a][b], (a, b) => m[b][a]]) {
      for (let a = 0; a < lado; a += 1) {
        for (let b = 0; b <= lado - 7; b += 1) {
          if (!casa(pegar, a, b, ALVO)) continue;
          // Os dois lados contam separado: claro dos dois lados é o caso mais
          // confundível que existe e não pode valer o mesmo que claro de um só.
          if (casa(pegar, a, b - 4, CLARO)) total += 40;
          if (casa(pegar, a, b + 7, CLARO)) total += 40;
        }
      }
    }

    // Regra 4: desequilíbrio entre escuro e claro.
    let escuros = 0;
    for (const linha of m) for (const v of linha) escuros += v;
    const proporcao = (escuros * 100) / (lado * lado);
    total += Math.floor(Math.abs(proporcao - 50) / 5) * 10;

    return total;
  }

  // -------------------------------------------------------------- público

  /**
   * Devolve { versao, lado, modulos } para o texto dado — `modulos` é uma
   * matriz de 0 e 1, sem a zona silenciosa. Devolve null se o texto não couber
   * na versão 6, o que para uma URL de rede local não acontece.
   */
  function codificar(texto, { mascaraFixa = null } = {}) {
    const bytes = bytesUtf8(texto);
    const versao = menorVersao(bytes.length);
    if (versao === null) return null;

    const lado = 17 + 4 * versao;
    const molde = matrizVazia(lado);
    porEstrutura(molde, versao);

    const posicoes = passeio(molde);
    const sequencia = sequenciaFinal(bitsDeDados(bytes, versao), versao);

    // `mascaraFixa` existe para a conferência contra um codificador de
    // referência: com a máscara livre, os dois escolhem máscaras diferentes e
    // metade dos módulos difere sem que haja erro nenhum.
    const candidatas = mascaraFixa === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mascaraFixa];
    let melhor = null;
    for (const mascara of candidatas) {
      const m = molde.map((linha) => linha.slice());
      let indice = 0;
      for (const [linha, coluna] of posicoes) {
        const byte = sequencia[indice >> 3];
        // Posição além dos dados vira 0: as versões com bits sobrando ("remainder
        // bits") preenchem o fim do passeio com claro.
        const bit = byte === undefined ? 0 : (byte >> (7 - (indice % 8))) & 1;
        m[linha][coluna] = MASCARAS[mascara](linha, coluna) ? bit ^ 1 : bit;
        indice += 1;
      }
      porFormato(m, mascara);
      const nota = penalidade(m);
      if (melhor === null || nota < melhor.nota) melhor = { nota, m };
    }

    return { versao, lado, modulos: melhor.m };
  }

  /**
   * O mesmo QR como SVG, com a zona silenciosa de 4 módulos que o leitor
   * precisa. Um caminho só, em vez de um retângulo por módulo: são até 1.681
   * módulos, e mil elementos no DOM do painel custam mais que a string.
   */
  function svg(texto, { tamanho = 240, claro = '#ffffff', escuro = '#0b1020' } = {}) {
    const qr = codificar(texto);
    if (!qr) return null;
    const borda = 4;
    const total = qr.lado + borda * 2;

    let caminho = '';
    for (let i = 0; i < qr.lado; i += 1) {
      for (let j = 0; j < qr.lado; j += 1) {
        if (qr.modulos[i][j]) caminho += `M${j + borda} ${i + borda}h1v1h-1z`;
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" ` +
      `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" ` +
      `aria-label="QR code do endereço do painel">` +
      `<rect width="${total}" height="${total}" fill="${claro}"/>` +
      `<path d="${caminho}" fill="${escuro}"/></svg>`;
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.qr = { codificar, svg , __penalidade: penalidade };
}(typeof globalThis !== 'undefined' ? globalThis : this));
