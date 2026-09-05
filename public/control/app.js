'use strict';

/**
 * Painel do apontador.
 *
 * A regra que decide o desenho de tudo aqui: quem opera está olhando o jogo,
 * não a tela. Todo lance tem que caber em UM toque, e nenhum toque pode abrir
 * um formulário que segure o dedo enquanto a jogada continua. Onde faz falta
 * um detalhe (onde saiu o chute, cor do cartão), ele vem DEPOIS do lance já
 * estar gravado, e é sempre opcional.
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LANCES = [
  { type: 'gol', rotulo: 'Gol', classe: 'gol' },
  { type: 'finalizacao', rotulo: 'Finalização', classe: 'destaque' },
  { type: 'escanteio', rotulo: 'Escanteio' },
  { type: 'falta', rotulo: 'Falta' },
  { type: 'cartao', rotulo: 'Cartão' },
  { type: 'defesa', rotulo: 'Defesa' },
  { type: 'impedimento', rotulo: 'Impedimento' },
  { type: 'substituicao', rotulo: 'Substituição' }
];

const NOME_SLIDE = ['Comparativo', 'Mapa de chutes', 'Pressão', 'Gols e cartões'];

let ultimoEstado = null;

/** Vibração curta como confirmação: dá para apontar sem tirar o olho do campo. */
function confirmarComVibracao() {
  if (navigator.vibrate) navigator.vibrate(25);
}

// ------------------------------------------------------------ botões de lance

function montarBotoesDeLance() {
  for (const container of $$('.lances')) {
    const equipe = container.dataset.equipe;
    container.innerHTML = '';
    for (const lance of LANCES) {
      const botao = document.createElement('button');
      botao.className = lance.classe || '';
      botao.textContent = lance.rotulo;
      botao.addEventListener('click', () => acionarLance(lance.type, equipe));
      container.appendChild(botao);
    }
  }
}

function acionarLance(type, equipe) {
  confirmarComVibracao();

  if (type === 'finalizacao') return abrirFinalizacao(equipe);
  if (type === 'cartao') return abrirCartao(equipe);

  const registrado = DuStats.registrar({ type, team: equipe });
  if (type === 'gol') abrirDetalheDoGol(equipe, registrado.cid);
}

// ----------------------------------------------------------------- modais

const modal = $('#modal');
let campoSvg = null;
let marcaAtual = null; // { x, y } normalizado, ou null

function prepararCampo(visivel) {
  const caixa = $('#modalCampo');
  caixa.hidden = !visivel;
  marcaAtual = null;
  if (!visivel) return;

  if (!campoSvg) {
    campoSvg = DuStats.campo.criar({ traco: 'rgba(255,255,255,.5)', espessura: 0.4 });
    caixa.prepend(campoSvg);
    campoSvg.addEventListener('click', (evento) => {
      marcaAtual = DuStats.campo.coordenadaDoPonteiro(campoSvg, evento);
      desenharMarca();
      confirmarComVibracao();
    });
  }
  desenharMarca();
}

function desenharMarca() {
  campoSvg.querySelectorAll('.marca').forEach((n) => n.remove());
  if (!marcaAtual) return;
  const ponto = DuStats.campo.el('circle', {
    cx: DuStats.campo.paraSvgX(marcaAtual.y),
    cy: DuStats.campo.paraSvgY(marcaAtual.x),
    r: 2.2,
    class: 'marca'
  });
  campoSvg.appendChild(ponto);
}

function abrirModal({ titulo, texto, comCampo, acoes }) {
  $('#modalTitulo').textContent = titulo;
  $('#modalTexto').textContent = texto || '';
  prepararCampo(Boolean(comCampo));

  const container = $('#modalAcoes');
  container.innerHTML = '';
  for (const acao of acoes) {
    const botao = document.createElement('button');
    botao.textContent = acao.rotulo;
    if (acao.largo) botao.classList.add('largo');
    if (acao.fantasma) botao.classList.add('b-fantasma');
    if (acao.cor) botao.style.background = acao.cor;
    if (acao.corTexto) botao.style.color = acao.corTexto;
    botao.addEventListener('click', () => {
      confirmarComVibracao();
      acao.acao(marcaAtual);
      modal.close();
    });
    container.appendChild(botao);
  }
  modal.showModal();
}

function abrirFinalizacao(equipe) {
  const desfechos = ultimoEstado?.esporte?.desfechosFinalizacao || {};
  abrirModal({
    titulo: `Finalização — ${nomeDoTime(equipe)}`,
    texto: 'Escolha o desfecho. O local no campo é opcional.',
    comCampo: true,
    acoes: [
      ...Object.entries(desfechos).map(([chave, def]) => ({
        rotulo: def.rotulo,
        acao: (local) => DuStats.registrar({
          type: 'finalizacao', team: equipe, meta: { desfecho: chave }, ...(local || {})
        })
      })),
      { rotulo: 'Cancelar', largo: true, fantasma: true, acao: () => {} }
    ]
  });
}

function abrirDetalheDoGol(equipe, cid) {
  abrirModal({
    titulo: `⚽ Gol do ${nomeDoTime(equipe)}`,
    texto: 'Já está no placar. Marque onde saiu, se der tempo.',
    comCampo: true,
    acoes: [
      { rotulo: 'Pronto', acao: (local) => { if (local) DuStats.ajustarPorCid(cid, local); } },
      { rotulo: 'Foi gol contra', fantasma: true, acao: (local) => DuStats.ajustarPorCid(cid, { ...(local || {}), meta: { contra: true } }) }
    ]
  });
}

function abrirCartao(equipe) {
  abrirModal({
    titulo: `Cartão — ${nomeDoTime(equipe)}`,
    acoes: [
      { rotulo: 'Amarelo', cor: '#f2c94c', corTexto: '#241d00', acao: () => DuStats.registrar({ type: 'cartao', team: equipe, meta: { cor: 'amarelo' } }) },
      { rotulo: 'Vermelho', cor: '#eb5757', acao: () => DuStats.registrar({ type: 'cartao', team: equipe, meta: { cor: 'vermelho' } }) },
      { rotulo: 'Cancelar', largo: true, fantasma: true, acao: () => {} }
    ]
  });
}

function nomeDoTime(equipe) {
  return ultimoEstado?.config?.[equipe]?.nome || (equipe === 'casa' ? 'Casa' : 'Visitante');
}

// -------------------------------------------------------- relógio e posse

$('#btRelogio').addEventListener('click', () => {
  const rodando = ultimoEstado?.relogio?.rodando;
  DuStats.registrar({ type: 'relogio', meta: { acao: rodando ? 'pausar' : 'iniciar' } });
  confirmarComVibracao();
});

$('#btPeriodo').addEventListener('click', () => {
  const atual = ultimoEstado?.relogio;
  const periodos = ultimoEstado?.esporte?.periodos || [];
  const proximo = periodos[(atual?.periodoIdx ?? 0) + 1];
  if (!proximo) return;
  if (!confirm(`Passar para "${proximo.nome}"? O relógio para e o tempo do período zera.`)) return;
  DuStats.registrar({ type: 'periodo', meta: {} });
});

for (const botao of $$('.posse button')) {
  botao.addEventListener('click', () => {
    DuStats.registrar({ type: 'posse', team: botao.dataset.posse || null });
    confirmarComVibracao();
  });
}

$('#btDesfazer').addEventListener('click', async () => {
  const alvo = ultimoEstado?.paraDesfazer;
  if (!alvo) return;
  if (!confirm(`Apagar "${rotuloDoEvento(alvo)}"?`)) return;
  confirmarComVibracao();
  await DuStats.desfazer();
});

// ----------------------------------------------------------------- abas

for (const botao of $$('nav button')) {
  botao.addEventListener('click', () => {
    for (const outro of $$('nav button')) outro.setAttribute('aria-selected', String(outro === botao));
    for (const secao of $$('.aba')) secao.hidden = secao.id !== `aba-${botao.dataset.aba}`;
    $('#btDesfazer').hidden = botao.dataset.aba !== 'lances' || !ultimoEstado?.paraDesfazer;
  });
}

// ------------------------------------------------------------------- ar

for (const botao of $$('.ar .modos button')) {
  botao.addEventListener('click', () => DuStats.transmissao({ modo: botao.dataset.modo, slide: 0 }));
}
$('#btAnterior').addEventListener('click', () => mudarSlide(-1));
$('#btProximo').addEventListener('click', () => mudarSlide(1));

function mudarSlide(passo) {
  const atual = ultimoEstado?.transmissao?.slide || 0;
  const total = NOME_SLIDE.length;
  DuStats.transmissao({ slide: (atual + passo + total) % total });
  proximaTroca = Date.now() + INTERVALO_SLIDE;
}

/**
 * Quem avança o carrossel é o painel, não o overlay.
 *
 * O overlay é uma Fonte de Navegador que pode ser recarregada, duplicada numa
 * cena de prévia ou ficar oculta — se o timer morasse nele, duas cópias
 * brigariam pelo controle e o painel do apontador mostraria um slide diferente
 * do que está no ar. Com um único dono do tempo, todo mundo vê o mesmo.
 */
const INTERVALO_SLIDE = 12000;
let avancoAutomatico = true;
let proximaTroca = 0;

$('#btAuto').addEventListener('click', () => {
  avancoAutomatico = !avancoAutomatico;
  $('#btAuto').setAttribute('aria-pressed', String(avancoAutomatico));
  $('#btAuto').textContent = `Avanço automático: ${avancoAutomatico ? 'ligado' : 'desligado'}`;
  proximaTroca = Date.now() + INTERVALO_SLIDE;
});

setInterval(() => {
  const modo = ultimoEstado?.transmissao?.modo;
  if (!avancoAutomatico || !['intervalo', 'resumo'].includes(modo)) {
    proximaTroca = Date.now() + INTERVALO_SLIDE;
    return;
  }
  if (Date.now() < proximaTroca) return;
  mudarSlide(1);
}, 1000);

for (const botao of $$('[data-acrescimo]')) {
  botao.addEventListener('click', () => {
    DuStats.registrar({ type: 'acrescimo', meta: { min: Number(botao.dataset.acrescimo) } });
    confirmarComVibracao();
  });
}

// -------------------------------------------------------------- ajustes

function montarAjustes(estado) {
  if ($('#cartaoTimes').dataset.montado === 'sim') return;
  $('#cartaoTimes').dataset.montado = 'sim';

  $('#cfgCompeticao').value = estado.config.competicao || '';
  $('#cfgLocal').value = estado.config.local || '';
  for (const campo of ['cfgCompeticao', 'cfgLocal']) {
    $(`#${campo}`).addEventListener('change', () => {
      DuStats.salvarConfig({
        competicao: $('#cfgCompeticao').value,
        local: $('#cfgLocal').value
      });
    });
  }

  const html = ['casa', 'fora'].map((lado) => `
    <h3>${lado === 'casa' ? 'Time da casa' : 'Time visitante'}</h3>
    <label for="nome-${lado}">Nome</label>
    <input type="text" id="nome-${lado}" value="${escapar(estado.config[lado]?.nome || '')}">
    <div class="dupla">
      <div>
        <label for="sigla-${lado}">Sigla (3 letras)</label>
        <input type="text" id="sigla-${lado}" maxlength="4" value="${escapar(estado.config[lado]?.sigla || '')}">
      </div>
      <div>
        <label for="cor-${lado}">Cor</label>
        <input type="color" id="cor-${lado}" value="${estado.config[lado]?.cor || '#1f6feb'}">
      </div>
    </div>
    <label for="escudo-${lado}">Escudo (PNG com fundo transparente fica melhor)</label>
    <input type="file" id="escudo-${lado}" accept="image/*">
  `).join('<hr style="border:0;border-top:1px solid var(--linha);margin:18px 0">');

  $('#cartaoTimes').innerHTML = html;

  for (const lado of ['casa', 'fora']) {
    for (const campo of ['nome', 'sigla', 'cor']) {
      $(`#${campo}-${lado}`).addEventListener('change', () => {
        DuStats.salvarConfig({
          [lado]: {
            nome: $(`#nome-${lado}`).value,
            sigla: $(`#sigla-${lado}`).value.toUpperCase(),
            cor: $(`#cor-${lado}`).value
          }
        });
      });
    }
    $(`#escudo-${lado}`).addEventListener('change', async (evento) => {
      const arquivo = evento.target.files?.[0];
      if (!arquivo) return;
      const leitor = new FileReader();
      leitor.onload = () => DuStats.enviarEscudo(lado, leitor.result).catch((e) => alert(`Não deu para enviar: ${e.message}`));
      leitor.readAsDataURL(arquivo);
    });
  }

  $('#linksOverlay').innerHTML = ['placar', 'evento', 'intervalo', 'resumo']
    .map((p) => `<div><strong>${p}</strong><code>${location.origin}/overlay/${p}.html</code></div>`)
    .join('');

  $('#btNova').addEventListener('click', () => {
    if (!confirm('Começar uma partida nova? O jogo atual fica salvo, mas sai do ar.')) return;
    DuStats.novaPartida();
  });
}

function escapar(texto) {
  return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ------------------------------------------------------------- renderização

/** Descrição do lance sem o minuto — quem mostra o minuto é quem chama. */
function descricaoDoEvento(evento) {
  const nomes = {
    gol: 'Gol', finalizacao: 'Finalização', escanteio: 'Escanteio', falta: 'Falta',
    cartao: 'Cartão', impedimento: 'Impedimento', defesa: 'Defesa', substituicao: 'Substituição',
    posse: 'Posse', relogio: 'Relógio', periodo: 'Período', acrescimo: 'Acréscimos'
  };
  const base = nomes[evento.type] || evento.type;
  const detalhe = evento.meta?.desfecho
    ? ` (${ultimoEstado?.esporte?.desfechosFinalizacao?.[evento.meta.desfecho]?.rotulo || evento.meta.desfecho})`
    : evento.meta?.cor ? ` ${evento.meta.cor}` : '';
  const time = evento.team ? ` — ${ultimoEstado?.config?.[evento.team]?.sigla || evento.team}` : '';
  return `${base}${detalhe}${time}`;
}

function rotuloDoEvento(evento) {
  return `${descricaoDoEvento(evento)} ${evento.minuto}'`;
}

function renderizar(estado) {
  ultimoEstado = estado;

  $('#nomeCasa').textContent = estado.config.casa?.nome || 'Casa';
  $('#nomeFora').textContent = estado.config.fora?.nome || 'Visitante';
  $('#tituloCasa').textContent = estado.config.casa?.nome || 'Casa';
  $('#tituloFora').textContent = estado.config.fora?.nome || 'Visitante';
  $('#golsCasa').textContent = estado.placar.casa;
  $('#golsFora').textContent = estado.placar.fora;
  $('#periodo').textContent = estado.relogio.periodoNome
    + (estado.relogio.acrescimoMin ? ` · +${estado.relogio.acrescimoMin}` : '');

  const rodando = estado.relogio.rodando;
  const bt = $('#btRelogio');
  bt.textContent = rodando ? '⏸' : '▶';
  bt.classList.toggle('rodando', rodando);
  bt.classList.toggle('parado', !rodando);

  for (const botao of $$('.posse button')) {
    botao.setAttribute('aria-pressed', String((botao.dataset.posse || null) === estado.posseAtual));
  }
  $('#barraCasa').style.width = `${estado.posse.casa}%`;
  $('#barraFora').style.width = `${estado.posse.fora}%`;

  const desfazer = $('#btDesfazer');
  const naAbaLances = !$('#aba-lances').hidden;
  desfazer.hidden = !estado.paraDesfazer || !naAbaLances;
  if (estado.paraDesfazer) $('#alvoDesfazer').textContent = rotuloDoEvento(estado.paraDesfazer);

  const lista = $('#listaUltimos');
  lista.innerHTML = '';
  for (const evento of estado.ultimos.filter((e) => !['posse', 'relogio', 'periodo', 'acrescimo'].includes(e.type)).slice(0, 12)) {
    const item = document.createElement('li');
    item.style.setProperty('--cor', evento.team ? `var(--cor-${evento.team})` : '#333');
    item.innerHTML = `<span class="min num">${evento.minuto}'</span><span>${escapar(descricaoDoEvento(evento))}</span>`;
    const apagar = document.createElement('button');
    apagar.className = 'apagar';
    apagar.textContent = '✕';
    apagar.title = 'Apagar este lance';
    apagar.addEventListener('click', async () => {
      if (!confirm(`Apagar "${rotuloDoEvento(evento)}"?`)) return;
      await DuStats.apagar(evento.id);
    });
    item.appendChild(apagar);
    lista.appendChild(item);
  }

  for (const botao of $$('.ar .modos button')) {
    botao.setAttribute('aria-pressed', String(botao.dataset.modo === estado.transmissao.modo));
  }
  $('#slideAtual').textContent = NOME_SLIDE[estado.transmissao.slide] || '—';

  montarAjustes(estado);
}

DuStats.aoEstado(renderizar);

DuStats.relogio.aoTique((texto) => { $('#relogio').textContent = texto; });

DuStats.aoConectar((conectado, pendentes) => {
  const aviso = $('#aviso');
  if (conectado && pendentes === 0) {
    aviso.hidden = true;
    return;
  }
  aviso.hidden = false;
  aviso.textContent = conectado
    ? `Enviando ${pendentes} lance(s) guardado(s)…`
    : `Sem conexão com o servidor${pendentes ? ` — ${pendentes} lance(s) na fila` : ''}`;
  aviso.style.background = conectado ? 'var(--amarelo)' : 'var(--vermelho)';
  aviso.style.color = conectado ? '#241d00' : '#fff';
});

// ----------------------------------------------------- conforto de operação

/** Um jogo dura 90 minutos; a tela do celular não pode apagar no meio. */
let travaDeTela = null;
async function manterTelaAcesa() {
  try {
    travaDeTela = await navigator.wakeLock.request('screen');
  } catch {
    /* navegador sem suporte ou sem permissão: segue o jogo */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') manterTelaAcesa();
});
document.addEventListener('click', manterTelaAcesa, { once: true });

/** Atalhos para quem aponta no mesmo PC do OBS, sem tirar a mão do teclado. */
document.addEventListener('keydown', (evento) => {
  if (evento.target.matches('input, textarea') || modal.open) return;
  const atalhos = {
    ' ': () => $('#btRelogio').click(),
    z: () => $('#btDesfazer').click(),
    ArrowLeft: () => DuStats.registrar({ type: 'posse', team: 'casa' }),
    ArrowRight: () => DuStats.registrar({ type: 'posse', team: 'fora' }),
    ArrowDown: () => DuStats.registrar({ type: 'posse', team: null }),
    q: () => acionarLance('gol', 'casa'),
    p: () => acionarLance('gol', 'fora'),
    w: () => acionarLance('finalizacao', 'casa'),
    o: () => acionarLance('finalizacao', 'fora'),
    e: () => DuStats.registrar({ type: 'escanteio', team: 'casa' }),
    i: () => DuStats.registrar({ type: 'escanteio', team: 'fora' }),
    r: () => DuStats.registrar({ type: 'falta', team: 'casa' }),
    u: () => DuStats.registrar({ type: 'falta', team: 'fora' })
  };
  const acao = atalhos[evento.key] || atalhos[evento.key.toLowerCase()];
  if (!acao) return;
  evento.preventDefault();
  acao();
});

montarBotoesDeLance();
