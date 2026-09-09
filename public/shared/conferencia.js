/**
 * A conferência antes do apito, como dado puro.
 *
 * Recebe o snapshot da partida e devolve a lista de itens; não toca no DOM.
 * Fica separada da tela por dois motivos: as regras têm casos de borda de
 * verdade — virada de dia, cor mal formada, partida recém-criada — e regra com
 * caso de borda que não passa por teste é regra que ninguém confere.
 *
 * A lista responde DUAS perguntas, e a segunda chegou depois:
 *
 *   1. O OBS está recebendo?  — o pior modo de falha do sistema, porque só
 *      aparece no intervalo, no ar, quando não há mais o que fazer.
 *   2. É o jogo certo?        — o DuStats reabre a partida onde parou, que é o
 *      certo quando o servidor cai no meio do jogo e é exatamente o errado no
 *      domingo seguinte.
 */
(function (global) {
  'use strict';

  const NOME_DA_FONTE = {
    faixa: 'Faixa do rodapé (OBS)',
    intervalo: 'Painel do intervalo (OBS)'
  };

  /** Nomes de fábrica: quem não trocou, não configurou o jogo de hoje. */
  const NOMES_DE_FABRICA = new Set(['Time da Casa', 'Time Visitante']);

  /**
   * Abaixo disto as duas cores brigam na barra da faixa, onde elas aparecem
   * encostadas uma na outra. Medido em pares reais, na escala de 0 a 765:
   *
   *   dois azuis quase iguais  34      vermelho x preto  303
   *   dois vermelhos           93      azul x verde      309
   *   verde x verde do acento  83      azul x vermelho   455
   *
   * 130 separa os dois grupos com folga dos dois lados. Vermelho contra preto,
   * que é um par de camisa comum e perfeitamente legível, passa longe.
   */
  const LIMITE_COR = 130;

  function paraRgb(cor) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(cor || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /**
   * Distância entre duas cores pela média ponderada de vermelho — a
   * aproximação barata que pesa o verde mais que o azul, como o olho faz.
   * Não é CIEDE2000 e não precisa ser: aqui a pergunta é "dá para diferenciar
   * essas duas barras a três metros da TV?", não "quanto exatamente diferem?".
   */
  function distanciaDeCor(a, b) {
    const x = paraRgb(a);
    const y = paraRgb(b);
    if (!x || !y) return null;   // cor mal formada não vira alarme falso
    const media = (x[0] + y[0]) / 2;
    const dr = x[0] - y[0];
    const dg = x[1] - y[1];
    const db = x[2] - y[2];
    return Math.sqrt(
      (2 + media / 256) * dr * dr + 4 * dg * dg + (2 + (255 - media) / 256) * db * db
    );
  }

  function mesmoDia(a, b) {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear()
      && x.getMonth() === y.getMonth()
      && x.getDate() === y.getDate();
  }

  function dataCurta(quando) {
    const d = new Date(quando);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Há quanto tempo, em palavras curtas — cabe na coluna da direita. */
  function desde(quando, agora) {
    const seg = Math.max(0, Math.round((agora - quando) / 1000));
    if (seg < 60) return 'agora há pouco';
    const min = Math.round(seg / 60);
    return min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
  }

  /** A fiação: quem está pendurado no servidor, e o que está faltando. */
  function checagensDeFonte(estado, agora) {
    const fontes = estado.fontes || [];
    const itens = [];

    for (const [chave, nome] of Object.entries(NOME_DA_FONTE)) {
      const ligada = fontes.find((f) => f.fonte === chave);
      itens.push({
        estado: ligada ? 'ok' : 'falta',
        marca: ligada ? '●' : '○',
        nome,
        detalhe: ligada ? `recebendo ${desde(ligada.desde, agora)}` : 'não está recebendo'
      });
    }

    // Dois painéis abertos registram o mesmo gol duas vezes, e o placar só
    // denuncia isso depois. Antes de existir a lista de fontes não havia como
    // saber; agora dá para avisar enquanto ainda é fácil fechar um.
    const paineis = fontes.filter((f) => f.fonte === 'painel').length;
    if (paineis > 1) {
      itens.push({
        estado: 'alerta',
        marca: '▲',
        nome: `${paineis} painéis abertos ao mesmo tempo`,
        detalhe: 'o mesmo lance pode entrar duas vezes'
      });
    }

    return itens;
  }

  /** A partida: é este o jogo de hoje, e os times estão prontos para o ar? */
  function checagensDaPartida(estado, agora) {
    const itens = [];
    const config = estado.config || {};
    const casa = config.casa || {};
    const fora = config.fora || {};

    // 1. Jogo velho ainda carregado.
    //
    // Repare que a conta é pelo PERÍODO, não por contar lances: uma partida
    // criada ontem e ainda no pré-jogo não atrapalha ninguém, e uma criada hoje
    // que já chegou ao fim é o caso do jogo duplo, em que o operador sobe o
    // segundo tempo do jogo seguinte em cima das estatísticas do primeiro jogo.
    // O botão "Nova partida" está no fim desta aba desde sempre; ninguém rola
    // até lá sem um motivo, e este é o motivo.
    const periodo = estado.relogio?.periodo;
    const encerrada = periodo === 'FIM';
    const velha = !mesmoDia(estado.criadaEm, agora) && periodo !== 'PRE';
    if (encerrada || velha) {
      const placar = `${estado.placar?.casa ?? 0} × ${estado.placar?.fora ?? 0}`;
      itens.push({
        estado: 'alerta',
        marca: '▲',
        nome: velha
          ? `Partida de ${dataCurta(estado.criadaEm)} ainda carregada`
          : 'Partida já encerrada',
        detalhe: `está no ar o ${placar} deste jogo — comece uma partida nova antes do apito`
      });
    }

    // 2. Time no nome de fábrica. Vai ao ar "Time Visitante" na faixa, com a
    //    sigla VIS no lugar do escudo — e ninguém confere o nome do adversário
    //    antes do apito, porque o nome do próprio time já está certo.
    const semNome = ['casa', 'fora']
      .filter((lado) => NOMES_DE_FABRICA.has((config[lado] || {}).nome));
    if (semNome.length > 0) {
      itens.push({
        estado: 'falta',
        marca: '○',
        nome: semNome.length === 2 ? 'Os dois times sem nome' : 'Um time sem nome',
        detalhe: 'o nome de fábrica vai ao ar na faixa e no painel'
      });
    }

    // 3. Cores brigando. Na faixa as duas barras se encostam, sem nada entre
    //    elas além da divisa: cores próximas viram uma barra só.
    const distancia = distanciaDeCor(casa.cor, fora.cor);
    if (distancia !== null && distancia < LIMITE_COR) {
      itens.push({
        estado: 'alerta',
        marca: '▲',
        nome: 'Cores dos times parecidas demais',
        detalhe: 'a barra da faixa vira um bloco só — mude uma das duas',
        cores: [casa.cor, fora.cor]
      });
    }

    // 4. Só na skin Bandeira, e não por capricho: é a única em que a cor da
    //    transmissão deixa de ser um filete e vira um campo grande atrás do
    //    cabeçalho, bem onde ficam os escudos. Escudo verde sobre campo verde
    //    some. Nas outras skins o acento é aresta, e encostar nele não custa
    //    nada.
    if (config.skin === 'bandeira') {
      const perto = ['casa', 'fora'].filter((lado) => {
        const d = distanciaDeCor((config[lado] || {}).cor, config.acento);
        return d !== null && d < LIMITE_COR;
      });
      if (perto.length > 0) {
        itens.push({
          estado: 'alerta',
          marca: '▲',
          nome: 'Cor de time igual à da transmissão, na skin Bandeira',
          detalhe: 'o escudo some no campo diagonal — troque a skin ou a cor da transmissão',
          cores: perto.map((lado) => (config[lado] || {}).cor).concat(config.acento)
        });
      }
    }

    return itens;
  }

  function itens(estado, agora) {
    return checagensDeFonte(estado, agora).concat(checagensDaPartida(estado, agora));
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.conferencia = {
    itens, checagensDeFonte, checagensDaPartida, distanciaDeCor, LIMITE_COR, NOME_DA_FONTE
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
