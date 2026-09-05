'use strict';

/**
 * Gera um jogo fictício para desenhar e conferir os overlays sem esperar uma
 * partida de verdade.
 *
 *   node server/simulate.js              1º tempo completo, congelado no INTERVALO
 *   node server/simulate.js --completo   90 minutos + resumo final
 *   node server/simulate.js --vivo       jogo correndo agora, em tempo real
 *
 * Nos dois primeiros modos os eventos são gravados com horário retroativo, de
 * forma que o relógio da partida mostre 45' de cara — é assim que dá para
 * ajustar o painel do intervalo em segundos em vez de em 45 minutos.
 */

const MIN = 60_000;
const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const achado = args.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=').slice(1).join('=') : padrao;
};
const tem = (nome) => args.includes(`--${nome}`);

const URL_BASE = opcao('url', `http://localhost:${process.env.PORT || 4400}`);
const TOKEN = process.env.DUSTATS_TOKEN || '';
const SEMENTE = Number(opcao('semente', 20260905));

// PRNG com semente: o mesmo comando gera sempre o mesmo jogo, o que torna
// possível comparar o layout antes e depois de mexer no CSS.
function prng(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(SEMENTE);
const entre = (min, max) => min + rand() * (max - min);
const sorteio = (lista) => lista[Math.floor(rand() * lista.length)];

async function api(rota, corpo, metodo = 'POST') {
  const resposta = await fetch(`${URL_BASE}${rota}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'x-dustats-token': TOKEN } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  if (!resposta.ok) throw new Error(`${metodo} ${rota} → ${resposta.status} ${await resposta.text()}`);
  return resposta.json();
}

/** Um chute amador sai muito mais de fora da área do que de dentro. */
function localDoChute() {
  const perto = rand() < 0.35;
  return {
    x: perto ? entre(0.72, 0.97) : entre(0.45, 0.75),
    y: entre(0.5 - (perto ? 0.16 : 0.3), 0.5 + (perto ? 0.16 : 0.3))
  };
}

/** Constrói um tempo de jogo como lista de {offset, evento}. */
function gerarTempo(inicioOffset, duracaoMs, indicePeriodo) {
  const roteiro = [];
  const add = (offset, evento) => roteiro.push({ offset: inicioOffset + offset, evento });

  add(0, { type: 'periodo', meta: { idx: indicePeriodo } });
  add(10, { type: 'relogio', meta: { acao: 'iniciar' } });

  let t = 0;
  let posse = sorteio(['casa', 'fora']);
  add(20, { type: 'posse', team: posse });

  while (t < duracaoMs) {
    const trecho = entre(6_000, 35_000);
    t = Math.min(t + trecho, duracaoMs);

    const dado = rand();
    const adversario = posse === 'casa' ? 'fora' : 'casa';

    if (dado < 0.012) {
      const { x, y } = localDoChute();
      add(t, { type: 'gol', team: posse, x, y });
      posse = adversario;
      add(t + 1, { type: 'posse', team: posse });
      continue;
    }
    if (dado < 0.10) {
      const desfecho = sorteio(['no_gol', 'no_gol', 'fora', 'fora', 'bloqueada', 'trave']);
      const { x, y } = localDoChute();
      add(t, { type: 'finalizacao', team: posse, x, y, meta: { desfecho } });
      if (desfecho === 'no_gol') add(t + 1, { type: 'defesa', team: adversario });
      posse = adversario;
      add(t + 2, { type: 'posse', team: posse });
      continue;
    }
    if (dado < 0.145) {
      add(t, { type: 'escanteio', team: posse });
      continue;
    }
    if (dado < 0.235) {
      add(t, { type: 'falta', team: adversario });
      if (rand() < 0.14) add(t + 1, { type: 'cartao', team: adversario, meta: { cor: rand() < 0.09 ? 'vermelho' : 'amarelo' } });
      posse = posse === 'casa' ? 'casa' : 'fora';
      continue;
    }
    if (dado < 0.26) {
      add(t, { type: 'impedimento', team: posse });
      posse = adversario;
      add(t + 1, { type: 'posse', team: posse });
      continue;
    }
    if (dado < 0.285 && t > 20 * MIN) {
      add(t, { type: 'substituicao', team: sorteio(['casa', 'fora']) });
      continue;
    }

    posse = rand() < 0.5 ? adversario : posse;
    add(t, { type: 'posse', team: posse });
  }

  add(duracaoMs + 5, { type: 'acrescimo', meta: { min: Math.floor(entre(1, 5)) } });
  const acrescimos = Math.floor(entre(1, 4)) * MIN;
  add(duracaoMs + acrescimos, { type: 'relogio', meta: { acao: 'pausar' } });

  return { roteiro, fim: inicioOffset + duracaoMs + acrescimos };
}

async function novaPartida() {
  await api('/api/partida/nova', {
    config: {
      competicao: 'Copa Amadora — Simulação',
      local: 'Campo do Bairro',
      casa: { nome: 'Grêmio da Vila', sigla: 'GRV', cor: '#1f6feb', corTexto: '#ffffff' },
      fora: { nome: 'Atlético Serrano', sigla: 'ATS', cor: '#d92d20', corTexto: '#ffffff' }
    }
  });
}

async function modoRetroativo({ completo }) {
  const PRIMEIRO = gerarTempo(0, 45 * MIN, 1);
  let roteiro = [...PRIMEIRO.roteiro];
  let fim = PRIMEIRO.fim;

  roteiro.push({ offset: fim + 1_000, evento: { type: 'periodo', meta: { idx: 2 } } }); // INTERVALO
  fim += 1_000;

  if (completo) {
    const intervalo = 12 * MIN;
    const SEGUNDO = gerarTempo(fim + intervalo, 45 * MIN, 3);
    roteiro = [...roteiro, ...SEGUNDO.roteiro];
    fim = SEGUNDO.fim;
    roteiro.push({ offset: fim + 1_000, evento: { type: 'periodo', meta: { idx: 4 } } }); // FIM
    fim += 1_000;
  }

  const agora = Date.now();
  const eventos = roteiro
    .sort((a, b) => a.offset - b.offset)
    .map(({ offset, evento }) => ({ ...evento, wall: agora - fim + offset }));

  await novaPartida();
  // Em lotes: a lista inteira num POST só é grande demais para o corpo padrão.
  for (let i = 0; i < eventos.length; i += 100) {
    await api('/api/eventos', eventos.slice(i, i + 100));
  }
  await api('/api/transmissao', { modo: completo ? 'resumo' : 'intervalo', slide: 0 });

  const estado = await api('/api/estado', undefined, 'GET');
  console.log(`\n  ${eventos.length} eventos gravados.`);
  console.log(`  Placar: ${estado.config.casa.sigla} ${estado.placar.casa} x ${estado.placar.fora} ${estado.config.fora.sigla}`);
  console.log(`  Posse: ${estado.posse.casa}% x ${estado.posse.fora}%   Finalizações: ${estado.totais.casa.finalizacoes} x ${estado.totais.fora.finalizacoes}`);
  console.log(`  Transmissão em modo "${estado.transmissao.modo}" — abra ${URL_BASE}/overlay/${completo ? 'resumo' : 'intervalo'}.html\n`);
}

async function modoVivo() {
  const minutos = Number(opcao('minutos', 3));
  const { roteiro } = gerarTempo(0, minutos * MIN, 1);

  await novaPartida();
  await api('/api/transmissao', { modo: 'jogo', slide: 0 });
  console.log(`\n  Jogo ao vivo por ~${minutos} min. Abra ${URL_BASE}/overlay/placar.html e ${URL_BASE}/control/`);
  console.log('  Ctrl+C para parar.\n');

  const inicio = Date.now();
  for (const { offset, evento } of roteiro.sort((a, b) => a.offset - b.offset)) {
    const espera = inicio + offset - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    await api('/api/eventos', evento);
    if (['gol', 'cartao', 'finalizacao', 'escanteio'].includes(evento.type)) {
      console.log(`  ${new Date().toLocaleTimeString('pt-BR')}  ${evento.type.padEnd(12)} ${evento.team || ''}`);
    }
  }
  await api('/api/transmissao', { modo: 'intervalo', slide: 0 });
  console.log(`\n  Fim do tempo. Painel do intervalo no ar: ${URL_BASE}/overlay/intervalo.html\n`);
}

(async () => {
  try {
    await api('/api/estado', undefined, 'GET');
  } catch {
    console.error(`\n  Não consegui falar com o DuStats em ${URL_BASE}.`);
    console.error('  Rode "npm start" numa outra aba antes de simular.\n');
    process.exit(1);
  }

  if (tem('vivo')) await modoVivo();
  else await modoRetroativo({ completo: tem('completo') });
})().catch((erro) => {
  console.error(`\n  Falhou: ${erro.message}\n`);
  process.exit(1);
});
