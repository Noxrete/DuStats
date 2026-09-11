'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { setTimeout: esperar } = require('node:timers/promises');

test('servidor local continua funcionando se o sistema falhar ao listar interfaces de rede', { timeout: 15000 }, async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dustats-sem-interfaces-'));
  const preload = path.join(pasta, 'falha-rede.cjs');
  fs.writeFileSync(preload, "require('node:os').networkInterfaces = () => { throw new Error('falha simulada de rede'); };\n");
  const reserva = net.createServer().listen(0, '127.0.0.1');
  await once(reserva, 'listening');
  const porta = reserva.address().port;
  await new Promise((resolve) => reserva.close(resolve));

  const processo = spawn(process.execPath, ['--require', preload, path.join(__dirname, '../server/index.js')], {
    env: { ...process.env, PORT: String(porta), DUSTATS_ABRIR: '0', DUSTATS_DADOS: pasta },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const morreu = once(processo, 'exit');
  let saida = '';
  processo.stdout.on('data', (d) => { saida += d; });
  processo.stderr.on('data', (d) => { saida += d; });
  try {
    const prazo = Date.now() + 10000;
    while (!saida.includes('DuStats no ar') && processo.exitCode === null && Date.now() < prazo) await esperar(25);
    assert.ok(saida.includes('DuStats no ar'), saida || 'servidor não iniciou');
    const resposta = await fetch(`http://127.0.0.1:${porta}/api/estado`, { signal: AbortSignal.timeout(3000) });
    assert.equal(resposta.status, 200);
    const estado = await resposta.json();
    assert.equal(estado.rede.url, null);
    assert.deepEqual(estado.rede.alternativos, []);
    assert.deepEqual(estado.placar, { casa: 0, fora: 0 });
  } finally {
    processo.kill();
    await morreu;
    fs.rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
