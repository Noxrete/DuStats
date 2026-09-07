'use strict';

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const { criarApp } = require('./http');
const ws = require('./ws');
const recursos = require('./recursos');
const storage = require('./storage');
const { Partida } = require('./state');
const exportar = require('./export');

const PORTA = Number(process.env.PORT) || 4400;
const TOKEN = process.env.DUSTATS_TOKEN || '';
const RAIZ = path.join(__dirname, '..');
// Os escudos são gravados, então vão para a pasta de dados. Rodando solto do
// projeto isso é a própria public/logos; dentro do executável, ao lado do .exe.
const DIR_LOGOS = path.join(recursos.raizDeDados(), 'public', 'logos');

// Renomeia a janela do Windows de "node.exe" ou do caminho completo para algo
// que o operador reconheça na barra de tarefas no meio da transmissão.
process.title = 'DuStats';

/**
 * Encerra deixando a mensagem na tela.
 *
 * Num .exe aberto com duplo clique no Windows, `process.exit` fecha a janela no
 * mesmo instante: o operador veria um piscar e nada mais, justo quando algo deu
 * errado. Então esperamos uma tecla antes de sair.
 */
function encerrarComAviso(linhas, codigo = 1) {
  for (const linha of linhas) console.error(linha);

  if (!process.stdin.isTTY) process.exit(codigo);

  console.error('\n  Pressione qualquer tecla para fechar.');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(codigo));
}

// Uma falha inesperada também não pode sumir com a janela sem deixar rastro:
// sem isto, o operador só saberia dizer "abri e fechou sozinho".
process.on('uncaughtException', (erro) => {
  encerrarComAviso([
    '',
    '  O DuStats parou por um erro inesperado.',
    `  ${erro && erro.stack ? erro.stack : erro}`,
    '',
    '  Anote a mensagem acima antes de fechar.'
  ]);
});

/**
 * A pasta de dados precisa ser gravável, e isso tem que falhar ALTO agora.
 *
 * Se o .exe for parar em Arquivos de Programas, ou num pendrive protegido, o
 * jogo rodaria a partida inteira sem salvar nada — e o erro só apareceria
 * quando não houvesse mais o que fazer.
 */
function conferirEscrita() {
  const dir = path.join(recursos.raizDeDados(), 'data');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const teste = path.join(dir, '.escrita');
    fs.writeFileSync(teste, 'ok');
    fs.unlinkSync(teste);
  } catch (erro) {
    encerrarComAviso([
      '',
      `  ATENCAO: nao consigo gravar em ${dir}`,
      `  Motivo: ${erro.message}`,
      '',
      '  A partida NAO seria salva. Mova o DuStats para uma pasta sua',
      '  (Documentos ou Area de Trabalho) e abra de novo.'
    ]);
  }
}
conferirEscrita();

const esporte = storage.carregarEsporte(process.env.DUSTATS_ESPORTE || 'futebol');
let partida = Partida.carregar(esporte);
storage.salvar(partida.paraDisco());

const app = criarApp({
  estaticos: [path.join(recursos.raizDeDados(), 'public'), path.join(RAIZ, 'public')]
});
app.get('/', (_req, res) => res.redirect('/control/'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

const servidor = http.createServer(app.manipular);
const wss = ws.ligar(servidor);

// ---------------------------------------------------------------- transmissão

/**
 * O estado que vai para a tela. As fontes ligadas entram aqui, e não em
 * `partida.snapshot()`, porque quem está pendurado no WebSocket é assunto do
 * transporte — a partida não precisa saber que existe rede.
 */
function snapshot() {
  return { ...partida.snapshot(), fontes: wss.fontes() };
}

function publicar() {
  wss.transmitir(JSON.stringify({ tipo: 'estado', estado: snapshot() }));
}

function persistirEPublicar() {
  storage.salvar(partida.paraDisco());
  publicar();
}

wss.aoConectar((cliente) => {
  cliente.enviar(JSON.stringify({ tipo: 'estado', estado: snapshot() }));
});

// Fonte que entra ou cai muda o estado que o painel desenha, e nada mais vai
// disparar uma publicação: o placar não mudou. Sem isto, a conferência
// pré-jogo só sairia do lugar no próximo lance registrado.
wss.aoMudarFontes(() => publicar());

/**
 * Com o relógio correndo, a posse de bola muda a cada segundo mesmo sem
 * ninguém apertar nada. Um pulso curto mantém painel e overlay em dia; com o
 * relógio parado nada muda sozinho e o pulso é desligado.
 */
setInterval(() => {
  if (wss.quantidade === 0) return;
  if (!partida.derivar().relogio.rodando) return;
  publicar();
}, 2000);

// -------------------------------------------------------------------- rotas

function exigirToken(req, res, next) {
  if (!TOKEN) return next();
  const enviado = req.headers['x-dustats-token'] || req.query.token;
  if (enviado === TOKEN) return next();
  return res.status(401).json({ erro: 'token inválido' });
}

app.get('/api/estado', (_req, res) => res.json(snapshot()));

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

/**
 * Abre o painel no navegador padrão. Chamado pelos atalhos de duplo clique,
 * para quem inicia o DuStats não precisar copiar URL nenhuma.
 */
function abrirNoNavegador(url) {
  const { spawn } = require('child_process');
  const comandos = {
    win32: ['cmd', ['/c', 'start', '', url]],
    darwin: ['open', [url]]
  };
  const [comando, args] = comandos[process.platform] || ['xdg-open', [url]];
  try {
    const filho = spawn(comando, args, { detached: true, stdio: 'ignore' });
    // O spawn avisa de comando inexistente por EVENTO, não por exceção: sem
    // este ouvinte o ENOENT sobe até o tratador global e derruba o servidor
    // inteiro. Não conseguir abrir o navegador é um detalhe — as URLs estão
    // logo acima, no console — e nunca pode custar a transmissão.
    filho.on('error', () => {});
    filho.unref();
  } catch {
    /* sem permissão para criar processo: as URLs ficam no console mesmo */
  }
}

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

  // No executável, abrir o painel é o comportamento esperado de um duplo
  // clique — ninguém vai copiar URL do console. Rodando pelo código, não: o
  // desenvolvedor reinicia o servidor o tempo todo e não quer uma aba nova a
  // cada vez. Nos dois casos o DUSTATS_ABRIR decide, se estiver definido.
  const abrirPorPadrao = recursos.dentroDoExecutavel();
  const abrir = process.env.DUSTATS_ABRIR === undefined || process.env.DUSTATS_ABRIR === ''
    ? abrirPorPadrao
    : process.env.DUSTATS_ABRIR === '1';
  if (abrir) abrirNoNavegador(`http://localhost:${PORTA}/control/`);
});

// Porta ocupada é o erro mais comum na segunda vez que se clica no atalho.
servidor.on('error', (erro) => {
  if (erro.code !== 'EADDRINUSE') throw erro;
  encerrarComAviso([
    '',
    `  A porta ${PORTA} ja esta em uso.`,
    '  O DuStats provavelmente ja esta aberto numa outra janela.',
    '',
    `  Se nao estiver, abra com outra porta:  set PORT=4401 && DuStats.exe`
  ]);
});
