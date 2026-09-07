/**
 * Teste de fumaça: sobe o DuStats de verdade e confere que ele responde.
 *
 *   node ferramentas/fumaca.mjs                     # o servidor solto
 *   node ferramentas/fumaca.mjs --alvo=build/dustats.bundle.js
 *
 * Os testes unitários cobrem relógio, estatísticas e quadros de WebSocket, mas
 * nenhum deles abre um socket. Este script pega a classe de erro que passaria
 * batido: rota que deixou de existir, arquivo estático que sumiu do
 * empacotamento, servidor que nem sobe.
 *
 * Não usa navegador de propósito — precisa rodar na CI, em Windows e Linux,
 * sem baixar nada.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argumento = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=').slice(1).join('=') : padrao;
};

const ALVO = path.resolve(RAIZ, argumento('alvo', 'server/index.js'));
const PORTA = Number(argumento('porta', 4600 + Math.floor(Math.random() * 300)));
const BASE = `http://127.0.0.1:${PORTA}`;

const CAMINHOS = [
  '/control/',
  '/control/app.js',
  '/shared/tema.css',
  '/shared/bus.js',
  '/overlay/faixa.html',
  '/overlay/intervalo.html',
  '/overlay/resumo.html',
  '/api/estado'
];

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function subiu(limiteMs = 20000) {
  const prazo = Date.now() + limiteMs;
  while (Date.now() < prazo) {
    try {
      const r = await fetch(`${BASE}/api/estado`);
      if (r.ok) return true;
    } catch {
      /* ainda não abriu a porta */
    }
    await espera(200);
  }
  return false;
}

async function main() {
  // Cada execução usa uma pasta nova: a de fumaça não pode encostar na partida
  // que estiver salva na máquina de quem rodou.
  const trabalho = fs.mkdtempSync(path.join(os.tmpdir(), 'dustats-fumaca-'));

  const processo = spawn(process.execPath, [ALVO], {
    // A pasta de trabalho NÃO é a temporária de propósito: no Windows não se
    // apaga um diretório que é o cwd de um processo, e a limpeza no fim
    // falharia com EBUSY. Quem isola os dados é o DUSTATS_DADOS.
    cwd: RAIZ,
    // Sem isto o servidor carregaria a partida salva na máquina e o gol deste
    // teste somaria ao placar que já estava lá.
    env: { ...process.env, PORT: String(PORTA), DUSTATS_ABRIR: '0', DUSTATS_DADOS: trabalho },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // `kill()` só pede o encerramento; no Windows os arquivos continuam
  // travados até o processo realmente morrer.
  const morreu = new Promise((resolve) => processo.once('exit', resolve));

  let saida = '';
  processo.stdout.on('data', (d) => { saida += d; });
  processo.stderr.on('data', (d) => { saida += d; });

  const falhas = [];
  try {
    if (!await subiu()) {
      throw new Error(`o servidor não respondeu em ${BASE}\n${saida}`);
    }

    for (const caminho of CAMINHOS) {
      const r = await fetch(BASE + caminho);
      const marca = r.ok ? 'ok  ' : 'FALHA';
      console.log(`  ${marca} ${String(r.status).padEnd(4)} ${caminho}`);
      if (!r.ok) falhas.push(`${caminho} devolveu ${r.status}`);
    }

    // Um caminho que sai da pasta pública não pode ser servido nunca.
    for (const escape of ['/../package.json', '/..%2f..%2fpackage.json', '/shared\\..\\..\\package.json']) {
      const r = await fetch(BASE + escape);
      const barrado = r.status === 403 || r.status === 404;
      console.log(`  ${barrado ? 'ok  ' : 'FALHA'} ${String(r.status).padEnd(4)} barra escape ${escape}`);
      if (!barrado) falhas.push(`${escape} não foi barrado (${r.status})`);
    }

    // Gravar um lance e vê-lo no estado prova o caminho inteiro: rota, corpo
    // JSON, derivação das estatísticas e persistência.
    const gravou = await fetch(`${BASE}/api/eventos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { type: 'periodo', meta: {} },
        { type: 'relogio', meta: { acao: 'iniciar' } },
        { type: 'gol', team: 'casa' }
      ])
    });
    if (!gravou.ok) falhas.push(`POST /api/eventos devolveu ${gravou.status}`);

    const estado = await (await fetch(`${BASE}/api/estado`)).json();
    const placarCerto = estado.placar?.casa === 1;
    console.log(`  ${placarCerto ? 'ok  ' : 'FALHA'}      gol gravado aparece no placar`);
    if (!placarCerto) falhas.push(`placar da casa ficou ${estado.placar?.casa}, esperado 1`);

    const salvou = fs.existsSync(path.join(trabalho, 'data', 'matches'));
    console.log(`  ${salvou ? 'ok  ' : 'FALHA'}      partida gravada em disco`);
    if (!salvou) falhas.push('a pasta de partidas não foi criada');
  } finally {
    processo.kill();
    await Promise.race([morreu, espera(5000)]);
    try {
      fs.rmSync(trabalho, { recursive: true, force: true });
    } catch {
      // Sobrar pasta temporária não é motivo para reprovar a fumaça: o sistema
      // limpa sozinho, e reprovar aqui esconderia que TODAS as checagens
      // passaram — foi exatamente o que aconteceu na primeira CI do Windows.
    }
  }

  if (falhas.length > 0) {
    console.error(`\n  ${falhas.length} falha(s):`);
    for (const f of falhas) console.error(`   - ${f}`);
    process.exit(1);
  }
  console.log(`\n  Fumaça ok — ${path.relative(RAIZ, ALVO)} sobe e responde.\n`);
}

main().catch((erro) => {
  console.error(`\n  Fumaça falhou: ${erro.message}\n`);
  process.exit(1);
});
