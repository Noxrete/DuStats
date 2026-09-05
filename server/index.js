'use strict';

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const storage = require('./storage');
const { Partida } = require('./state');
const exportar = require('./export');

const PORTA = Number(process.env.PORT) || 4400;
const TOKEN = process.env.DUSTATS_TOKEN || '';
const RAIZ = path.join(__dirname, '..');
const DIR_LOGOS = path.join(RAIZ, 'public', 'logos');

const esporte = storage.carregarEsporte(process.env.DUSTATS_ESPORTE || 'futebol');
let partida = Partida.carregar(esporte);
storage.salvar(partida.paraDisco());

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(RAIZ, 'public')));
app.get('/', (_req, res) => res.redirect('/control/'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

const servidor = http.createServer(app);
const wss = new WebSocketServer({ server: servidor });

// ---------------------------------------------------------------- transmissão

function publicar() {
  const pacote = JSON.stringify({ tipo: 'estado', estado: partida.snapshot() });
  for (const cliente of wss.clients) {
    if (cliente.readyState === cliente.OPEN) cliente.send(pacote);
  }
}

function persistirEPublicar() {
  storage.salvar(partida.paraDisco());
  publicar();
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ tipo: 'estado', estado: partida.snapshot() }));
});

/**
 * Com o relógio correndo, a posse de bola muda a cada segundo mesmo sem
 * ninguém apertar nada. Um pulso curto mantém painel e overlay em dia; com o
 * relógio parado nada muda sozinho e o pulso é desligado.
 */
setInterval(() => {
  if (wss.clients.size === 0) return;
  if (!partida.derivar().relogio.rodando) return;
  publicar();
}, 2000);

// -------------------------------------------------------------------- rotas

function exigirToken(req, res, next) {
  if (!TOKEN) return next();
  const enviado = req.get('x-dustats-token') || req.query.token;
  if (enviado === TOKEN) return next();
  return res.status(401).json({ erro: 'token inválido' });
}

app.get('/api/estado', (_req, res) => res.json(partida.snapshot()));

app.get('/api/eventos', (_req, res) => res.json(partida.derivar().eventos));

app.post('/api/eventos', exigirToken, (req, res) => {
  const brutos = Array.isArray(req.body) ? req.body : [req.body];
  const criados = [];
  try {
    for (const bruto of brutos) criados.push(partida.adicionar(bruto));
  } catch (erro) {
    return res.status(400).json({ erro: erro.message });
  }
  persistirEPublicar();
  res.json({ ok: true, eventos: criados });
});

app.post('/api/desfazer', exigirToken, (_req, res) => {
  const removido = partida.desfazer();
  persistirEPublicar();
  res.json({ ok: true, removido });
});

app.patch('/api/eventos/:id', exigirToken, (req, res) => {
  const ajustado = partida.ajustar(req.params.id, req.body || {});
  if (!ajustado) return res.status(404).json({ erro: 'evento não encontrado' });
  persistirEPublicar();
  res.json({ ok: true, evento: ajustado });
});

app.delete('/api/eventos/:id', exigirToken, (req, res) => {
  const removido = partida.remover(req.params.id);
  if (!removido) return res.status(404).json({ erro: 'evento não encontrado' });
  persistirEPublicar();
  res.json({ ok: true, removido });
});

app.post('/api/transmissao', exigirToken, (req, res) => {
  const { modo, slide, faixa } = req.body || {};
  const parcial = {};
  if (typeof modo === 'string') parcial.modo = modo;
  if (Number.isInteger(slide)) parcial.slide = slide;

  // A faixa é um disparo, não um estado: o painel manda o rótulo e o instante,
  // e o overlay usa a mudança de `em` como gatilho da animação. `null` esconde.
  if (faixa === null) {
    parcial.faixa = null;
  } else if (faixa && typeof faixa.rotulo === 'string') {
    parcial.faixa = { rotulo: faixa.rotulo, em: Date.now() };
  }

  partida.definirTransmissao(parcial);
  persistirEPublicar();
  res.json({ ok: true, transmissao: partida.transmissao });
});

app.post('/api/config', exigirToken, (req, res) => {
  const config = { ...partida.config, ...(req.body || {}) };
  for (const lado of ['casa', 'fora']) {
    if (req.body?.[lado]) config[lado] = { ...partida.config[lado], ...req.body[lado] };
  }
  partida.config = config;
  storage.salvarConfigPadrao(config); // vira o padrão da próxima partida
  persistirEPublicar();
  res.json({ ok: true, config });
});

app.post('/api/escudo', exigirToken, (req, res) => {
  const { equipe, dataUrl } = req.body || {};
  if (!['casa', 'fora'].includes(equipe)) {
    return res.status(400).json({ erro: 'equipe inválida' });
  }
  const casa = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!casa) return res.status(400).json({ erro: 'imagem inválida' });

  const extensao = casa[1] === 'jpeg' ? 'jpg' : casa[1];
  fs.mkdirSync(DIR_LOGOS, { recursive: true });
  for (const antiga of fs.readdirSync(DIR_LOGOS)) {
    if (antiga.startsWith(`${equipe}.`)) fs.unlinkSync(path.join(DIR_LOGOS, antiga));
  }
  fs.writeFileSync(path.join(DIR_LOGOS, `${equipe}.${extensao}`), Buffer.from(casa[2], 'base64'));

  // A querystring força os navegadores (e o OBS) a largarem o escudo anterior.
  const url = `/logos/${equipe}.${extensao}?v=${Date.now()}`;
  partida.config[equipe] = { ...partida.config[equipe], escudo: url };
  storage.salvarConfigPadrao(partida.config);
  persistirEPublicar();
  res.json({ ok: true, escudo: url });
});

app.post('/api/partida/nova', exigirToken, (req, res) => {
  partida = new Partida({ esporte, config: { ...partida.config, ...(req.body?.config || {}) } });
  persistirEPublicar();
  res.json({ ok: true, id: partida.id });
});

app.get('/api/partidas', (_req, res) => res.json(storage.listarPartidas()));

app.post('/api/partida/abrir', exigirToken, (req, res) => {
  const salva = storage.carregar(req.body?.id);
  if (!salva) return res.status(404).json({ erro: 'partida não encontrada' });
  partida = new Partida({ ...salva, esporte });
  persistirEPublicar();
  res.json({ ok: true, id: partida.id });
});

function enviarCsv(res, nome, conteudo) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(conteudo);
}

app.get('/api/export/eventos.csv', (_req, res) => {
  enviarCsv(res, `dustats-${partida.id}-eventos.csv`, exportar.eventosCsv(partida, partida.derivar()));
});

app.get('/api/export/resumo.csv', (_req, res) => {
  const derivado = partida.derivar();
  const snapshot = partida.snapshot();
  enviarCsv(res, `dustats-${partida.id}-resumo.csv`, exportar.resumoCsv(partida, derivado, snapshot.comparativo));
});

app.get('/api/export/partida.json', (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="dustats-${partida.id}.json"`);
  res.json(partida.paraDisco());
});

// ------------------------------------------------------------------ subida

function enderecosLan() {
  const enderecos = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) enderecos.push(iface.address);
    }
  }
  return enderecos;
}

servidor.listen(PORTA, () => {
  const hosts = ['localhost', ...enderecosLan()];
  const principal = enderecosLan()[0] || 'localhost';
  console.log('');
  console.log('  ⚽  DuStats no ar');
  console.log('  ─────────────────────────────────────────────────────');
  console.log(`  Partida: ${partida.id}   (${partida.eventos.length} eventos carregados)`);
  console.log('');
  console.log('  PAINEL DO APONTADOR (abra no celular, na mesma rede):');
  for (const host of hosts) console.log(`     http://${host}:${PORTA}/control/`);
  console.log('');
  console.log('  OVERLAYS — adicione como Fonte de Navegador no OBS, 1920x1080:');
  for (const [pagina, papel] of [['faixa', 'rodapé, sob demanda'], ['intervalo', 'tela cheia']]) {
    console.log(`     ${pagina.padEnd(9)} http://${principal}:${PORTA}/overlay/${pagina}.html   (${papel})`);
  }
  console.log('');
  console.log('  RESUMO PÓS-JOGO (abra no navegador, não no OBS):');
  console.log(`     http://${principal}:${PORTA}/overlay/resumo.html?exportar=1`);
  console.log('');
  console.log('  Placar, cronômetro e replay são do Placar PRO — o DuStats só faz estatística.');
  console.log('');
  if (TOKEN) console.log('  Token de escrita ATIVO (DUSTATS_TOKEN).\n');
});
