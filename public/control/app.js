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

function abrirModal({ titulo, texto, comCampo, comAutor, acoes }) {
  $('#modalTitulo').textContent = titulo;
  $('#modalTexto').textContent = texto || '';
  prepararCampo(Boolean(comCampo));

  // O campo de autor é limpo a cada abertura: o nome do gol anterior aparecendo
  // pré-preenchido no gol seguinte credita o gol à pessoa errada.
  $('#modalAutor').hidden = !comAutor;
  $('#autorDoGol').value = '';

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
      acao.acao(marcaAtual, $('#autorDoGol').value.trim());
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
  /* Um PATCH só com o que o operador de fato preencheu: mandar `meta` vazio
     apagaria o que já estivesse gravado no evento. */
  const ajuste = (local, autor, extra = {}) => {
    const meta = { ...extra };
    if (autor) meta.autor = autor;
    const dados = { ...(local || {}) };
    if (Object.keys(meta).length > 0) dados.meta = meta;
    if (Object.keys(dados).length > 0) DuStats.ajustarPorCid(cid, dados);
  };

  abrirModal({
    titulo: `⚽ Gol do ${nomeDoTime(equipe)}`,
    texto: 'Já está no placar. O resto é opcional, se der tempo.',
    comCampo: true,
    comAutor: true,
    acoes: [
      { rotulo: 'Pronto', acao: (local, autor) => ajuste(local, autor) },
      { rotulo: 'Foi gol contra', fantasma: true, acao: (local, autor) => ajuste(local, autor, { contra: true }) }
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
    // A prévia do post custa quatro desenhos em canvas de até 1080 × 1920.
    // Desenhar isso a cada pacote de estado, com a aba fechada, seria queimar
    // CPU do PC que está codificando o vídeo.
    if (botao.dataset.aba === 'social') desenharPrevia();
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

// ------------------------------------------------------- faixa do rodapé

/**
 * Os rótulos aqui são exatamente os de `linhasComparativas()` no servidor.
 * A faixa procura a linha pelo rótulo em vez de recalcular a estatística, então
 * o número do rodapé e o número do painel do intervalo não têm como divergir.
 */
const FAIXAS = [
  { rotulo: 'Posse de bola', botao: 'Posse de bola' },
  { rotulo: 'Finalizações', botao: 'Finalizações' },
  { rotulo: 'No gol', botao: 'Chutes no gol' },
  { rotulo: 'Escanteios', botao: 'Escanteios' },
  { rotulo: 'Faltas', botao: 'Faltas' },
  { rotulo: 'Cartões amarelos', botao: 'Cartões' }
];

const SEQUENCIA = ['Posse de bola', 'Finalizações', 'Escanteios'];
const PASSO_SEQUENCIA = 8000;
let temporizadoresDaSequencia = [];

function montarBotoesDeFaixa() {
  const container = $('#botoesFaixa');
  container.innerHTML = '';
  for (const faixa of FAIXAS) {
    const botao = document.createElement('button');
    botao.textContent = faixa.botao;
    botao.dataset.rotulo = faixa.rotulo;
    botao.addEventListener('click', () => {
      pararSequencia();
      chamarFaixa(faixa.rotulo);
    });
    container.appendChild(botao);
  }
}

function chamarFaixa(rotulo) {
  confirmarComVibracao();
  DuStats.transmissao({ faixa: { rotulo } });
}

function pararSequencia() {
  for (const id of temporizadoresDaSequencia) clearTimeout(id);
  temporizadoresDaSequencia = [];
}

$('#btEsconderFaixa').addEventListener('click', () => {
  pararSequencia();
  confirmarComVibracao();
  DuStats.transmissao({ faixa: null });
});

$('#btSequencia').addEventListener('click', () => {
  pararSequencia();
  // Só entram na sequência as estatísticas que já existem no jogo: chamar
  // "escanteios" quando ninguém bateu nenhum põe uma faixa vazia no ar.
  const disponiveis = SEQUENCIA.filter((rotulo) => temFaixa(rotulo));
  disponiveis.forEach((rotulo, i) => {
    if (i === 0) return chamarFaixa(rotulo);
    temporizadoresDaSequencia.push(setTimeout(() => chamarFaixa(rotulo), i * PASSO_SEQUENCIA));
  });
});

function temFaixa(rotulo) {
  return (ultimoEstado?.comparativo || []).some((l) => l.rotulo === rotulo);
}

// --------------------------------------------- sincronizar com o Placar PRO

$('#btSincronizar').addEventListener('click', () => {
  const min = Number($('#sincMin').value);
  const seg = Number($('#sincSeg').value || 0);
  if (!Number.isFinite(min) || min < 0) return alert('Digite o minuto que está no Placar PRO.');

  DuStats.registrar({
    type: 'relogio',
    meta: { acao: 'ajustar', paraMs: min * 60000 + seg * 1000 }
  });
  confirmarComVibracao();
  $('#sincMin').value = '';
  $('#sincSeg').value = '';
});

// -------------------------------------------------------------- ajustes

/**
 * Reflete a configuração atual nos campos.
 *
 * Roda a cada estado, e não só uma vez, porque a config muda por fora: outro
 * aparelho editando, ou uma partida nova. Sem isto os campos ficavam velhos —
 * e, pior, editar UM campo reenviava TODOS, sobrescrevendo a config nova com a
 * antiga que estava na tela.
 *
 * O campo em foco é pulado: quem está digitando não pode ter o texto trocado
 * debaixo do dedo.
 */
function preencherAjustes(estado) {
  const definir = (seletor, valor) => {
    const campo = $(seletor);
    if (!campo || campo === document.activeElement) return;
    if (campo.value !== valor) campo.value = valor;
  };

  definir('#cfgCompeticao', estado.config.competicao || '');
  definir('#cfgLocal', estado.config.local || '');
  definir('#cfgAcento', estado.config.acento || '#17b64a');
  definir('#cfgSkin', estado.config.skin || 'placar');
  definir('#cfgPatrocinador', estado.config.patrocinador || '');

  for (const lado of ['casa', 'fora']) {
    definir(`#nome-${lado}`, estado.config[lado]?.nome || '');
    definir(`#sigla-${lado}`, estado.config[lado]?.sigla || '');
    definir(`#cor-${lado}`, estado.config[lado]?.cor || '#1f6feb');
  }
}

function montarAjustes(estado) {
  if ($('#cartaoTimes').dataset.montado === 'sim') return;
  $('#cartaoTimes').dataset.montado = 'sim';

  for (const campo of ['cfgCompeticao', 'cfgLocal', 'cfgAcento', 'cfgSkin']) {
    $(`#${campo}`).addEventListener('change', () => {
      DuStats.salvarConfig({
        competicao: $('#cfgCompeticao').value,
        local: $('#cfgLocal').value,
        acento: $('#cfgAcento').value,
        skin: $('#cfgSkin').value,
        patrocinador: $('#cfgPatrocinador').value.trim()
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

  const OVERLAYS = [
    ['faixa', 'Rodapé, sob demanda — não colide com o Placar PRO no topo'],
    ['intervalo', 'Tela cheia. Ponha ACIMA do Placar PRO na ordem das fontes']
  ];
  $('#linksOverlay').innerHTML = OVERLAYS
    .map(([p, nota]) => `<div><strong>${p}</strong><code>${location.origin}/overlay/${p}.html</code><small>${nota}</small></div>`)
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

/**
 * Lista dos últimos lances.
 *
 * Fica separada porque tem uma saída antecipada: quando nada mudou, ela não
 * redesenha. Dentro da `renderizar` esse `return` cortava tudo o que vinha
 * depois — inclusive o preenchimento dos Ajustes.
 */
function desenharUltimos(estado) {
  const visiveis = estado.ultimos
    .filter((e) => !['posse', 'relogio', 'periodo', 'acrescimo'].includes(e.type))
    .slice(0, 12);

  // O servidor pulsa a cada 2 s com o relógio correndo. Refazer a lista a cada
  // pulso a fazia piscar e jogava o rolamento para o topo enquanto o apontador
  // procurava um lance para apagar.
  const assinatura = visiveis.map((e) => e.id).join(',');
  const lista = $('#listaUltimos');
  if (lista.dataset.assinatura === assinatura) return;

  const primeiroDesenho = lista.dataset.assinatura === undefined;
  const conhecidos = new Set((lista.dataset.assinatura || '').split(','));
  lista.dataset.assinatura = assinatura;

  lista.innerHTML = '';
  for (const evento of visiveis) {
    const item = document.createElement('li');
    // Só o lance NOVO entra animado: é a confirmação visual de que o toque
    // pegou, para quem está de olho no campo e não na tela.
    if (!primeiroDesenho && !conhecidos.has(evento.id)) item.classList.add('novo');
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
}

// ------------------------------------------------------------ Match Pack
//
// A prévia é a IMAGEM DE VERDADE, reduzida por CSS — não uma maquete em HTML.
// Maquete mente na primeira vez que alguém mexe no desenho do canvas, e aí o
// operador aprova uma coisa e posta outra.

let formatoAtual = 'feed';
let previaEmCurso = false;      // um desenho por vez; o canvas é grande
let previaPendente = false;
let urlDaPrevia = null;

function montarFormatos() {
  const alvo = $('#formatos');
  if (!alvo || alvo.dataset.montado === 'sim') return;
  alvo.dataset.montado = 'sim';

  alvo.innerHTML = Object.entries(DuStats.social.FORMATOS).map(([chave, f]) => `
    <button data-formato="${chave}" aria-pressed="${chave === formatoAtual}">
      <span class="fmt-nome">${f.nome}</span>
      <span class="fmt-nota">${escapar(f.nota)}</span>
    </button>`).join('');

  for (const botao of alvo.querySelectorAll('button')) {
    botao.addEventListener('click', () => {
      formatoAtual = botao.dataset.formato;
      for (const outro of alvo.querySelectorAll('button')) {
        outro.setAttribute('aria-pressed', String(outro === botao));
      }
      montarOpcoes();
      desenharPrevia();
    });
  }
}

/**
 * Dois formatos precisam de uma escolha que o estado não decide sozinho: qual
 * estatística vai no quadrado, e qual gol vai no story. Os outros dois não
 * perguntam nada, e o seletor desaparece em vez de ficar ali desabilitado.
 */
function montarOpcoes() {
  const cartao = $('#cartaoOpcao');
  const select = $('#opcaoPost');
  const estado = ultimoEstado;
  if (!estado) return;

  if (formatoAtual === 'quadrado') {
    const linhas = DuStats.social.linhasDoPost(estado, 20);
    cartao.hidden = linhas.length === 0;
    $('#tituloOpcao').textContent = 'Qual estatística';
    select.innerHTML = linhas.map((l) =>
      `<option value="${escapar(l.rotulo)}">${escapar(l.rotulo)} — ${l.casa}${l.sufixo || ''} × ${l.fora}${l.sufixo || ''}</option>`
    ).join('');
    return;
  }

  if (formatoAtual === 'story') {
    const gols = DuStats.social.golsDoJogo(estado);
    cartao.hidden = gols.length === 0;
    $('#tituloOpcao').textContent = 'Qual gol';
    select.innerHTML = gols.map((g, i) => {
      const time = estado.config[g.equipe]?.nome || g.equipe;
      return `<option value="${i}"${i === gols.length - 1 ? ' selected' : ''}>${g.minuto}' — ${escapar(time)}${g.contra ? ' (contra)' : ''}</option>`;
    }).join('');
    return;
  }

  cartao.hidden = true;
}

function opcoesDoFormato() {
  const valor = $('#opcaoPost')?.value;
  if (formatoAtual === 'quadrado') return { rotulo: valor };
  if (formatoAtual === 'story') return { golIndice: Number(valor) };
  return {};
}

async function desenharPrevia() {
  if ($('#aba-social').hidden || !ultimoEstado) return;
  // Clicar em três formatos seguidos não deve enfileirar três desenhos: o
  // último pedido é o que importa.
  if (previaEmCurso) { previaPendente = true; return; }
  previaEmCurso = true;

  try {
    montarFormatos();
    montarOpcoes();
    const canvas = await DuStats.social.desenhar(ultimoEstado, formatoAtual, opcoesDoFormato());
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (urlDaPrevia) URL.revokeObjectURL(urlDaPrevia);
    urlDaPrevia = URL.createObjectURL(blob);
    const f = DuStats.social.FORMATOS[formatoAtual];
    $('#previa').innerHTML = `<img src="${urlDaPrevia}" alt="Prévia do post ${f.nome}">`;
    $('#notaPost').textContent =
      `${f.largura} × ${f.altura} · aparência da skin "${ultimoEstado.config.skin || 'placar'}"`;
  } catch (erro) {
    $('#previa').innerHTML = '<span class="previa-vazia">não deu para montar a prévia</span>';
    console.error(erro);
  } finally {
    previaEmCurso = false;
    if (previaPendente) { previaPendente = false; desenharPrevia(); }
  }
}

$('#opcaoPost')?.addEventListener('change', desenharPrevia);
$('#btJpeg')?.addEventListener('click', () =>
  DuStats.social.baixar(ultimoEstado, formatoAtual, opcoesDoFormato(), 'image/jpeg'));
$('#btPng')?.addEventListener('click', () =>
  DuStats.social.baixar(ultimoEstado, formatoAtual, opcoesDoFormato(), 'image/png'));

/**
 * A prévia se refaz quando o CONTEÚDO muda — um gol, uma estatística, a skin —
 * e não a cada pacote de estado. Com o relógio correndo o servidor manda estado
 * a cada 2 s, e redesenhar um canvas de 1080 × 1920 nesse ritmo é tirar CPU do
 * encoder do OBS, no mesmo PC, durante a transmissão.
 */
let assinaturaDaPrevia = null;
function talvezRedesenharPrevia(estado) {
  if ($('#aba-social').hidden) return;
  const nova = JSON.stringify([
    estado.placar, estado.comparativo, estado.linhaDoTempo, estado.config, formatoAtual
  ]);
  if (nova === assinaturaDaPrevia) return;
  assinaturaDaPrevia = nova;
  desenharPrevia();
}

// ------------------------------------------------------- conferência pré-jogo
//
// As regras moram em /shared/conferencia.js, sem DOM, para poderem ser testadas.
// Aqui fica só o desenho.

let qrDesenhado = null;   // a URL já desenhada, para não refazer a cada pulso

function desenharConferencia(estado) {
  const itens = DuStats.conferencia.itens(estado, DuStats.agoraServidor());

  // As bolinhas de cor só aparecem onde o aviso É sobre cor: descrever "parecidas
  // demais" com palavras e não mostrar quais são deixa o operador adivinhando.
  // Só hex de seis dígitos entra no style: o valor vem do seletor de cor e já
  // chega assim, mas config editada à mão é config que pode chegar torta.
  const amostras = (cores) => (cores || [])
    .filter((c) => /^#[0-9a-f]{6}$/i.test(String(c)))
    .map((c) => `<i class="amostra" style="background:${c}"></i>`).join('');

  $('#checagens').innerHTML = itens.map((i) => `
    <li class="${i.estado}">
      <span class="marca">${i.marca}</span>
      <span class="nome">${escapar(i.nome)}${amostras(i.cores)}</span>
      <span class="detalhe">${escapar(i.detalhe)}</span>
    </li>`).join('');

  // O endereço vem do servidor, não do location: quem abre o painel no PC do
  // OBS abre em localhost, e um QR de localhost manda o celular para si mesmo.
  const url = estado.rede?.url || null;
  // O endereço da tela de posse acompanha o mesmo raciocínio: quem lê isso vai
  // digitar no OUTRO celular, e localhost não serve para ninguém além deste.
  $('#urlPosse').textContent = url ? `${url}posse.html` : '';
  $('#blocoQr').hidden = !url;

  // O endereço do QR é o da rota padrão, que é o palpite certo na maioria das
  // vezes e não em todas: PC com internet no cabo e celular no Wi-Fi caem em
  // redes diferentes. Mostrar os outros custa três linhas e evita o operador
  // adivinhando na beira do campo.
  const outros = estado.rede?.alternativos || [];
  $('#outrosEnderecos').hidden = outros.length === 0;
  $('#listaEnderecos').innerHTML = outros.map((e) => `<li>${escapar(e)}</li>`).join('');
  if (url && url !== qrDesenhado) {
    const desenho = DuStats.qr?.svg(url, { tamanho: 132, claro: '#ffffff', escuro: '#0b1020' });
    if (desenho) {
      $('#qrDesenho').innerHTML = desenho;
      $('#qrUrl').textContent = url;
      qrDesenhado = url;
    } else {
      $('#blocoQr').hidden = true;
    }
  }
}

function renderizar(estado) {
  ultimoEstado = estado;

  $('#nomeCasa').textContent = estado.config.casa?.nome || 'Casa';
  $('#nomeFora').textContent = estado.config.fora?.nome || 'Visitante';
  $('#tituloCasa').textContent = estado.config.casa?.nome || 'Casa';
  $('#tituloFora').textContent = estado.config.fora?.nome || 'Visitante';
  for (const [lado, valor] of [['Casa', estado.placar.casa], ['Fora', estado.placar.fora]]) {
    const alvo = $(`#gols${lado}`);
    if (alvo.textContent !== String(valor)) {
      alvo.textContent = valor;
      // Reinicia a animação mesmo se ela já estiver rodando.
      alvo.classList.remove('pulou');
      void alvo.offsetWidth;
      alvo.classList.add('pulou');
    }
  }
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
  // O 50/50 (ou o 100/0 de uma batida solta) continua desenhado aqui, porque o
  // apontador precisa ver o que marcou. O que muda é a aparência: apagada, a
  // barrinha diz que este número ainda não é bom o bastante para o ar.
  $('.posse').classList.toggle('crua', !estado.posse.medida);
  $('#posseAviso').hidden = Boolean(estado.posse.medida);

  const desfazer = $('#btDesfazer');
  const naAbaLances = !$('#aba-lances').hidden;
  desfazer.hidden = !estado.paraDesfazer || !naAbaLances;
  if (estado.paraDesfazer) $('#alvoDesfazer').textContent = rotuloDoEvento(estado.paraDesfazer);

  desenharUltimos(estado);

  for (const botao of $$('.ar .modos button')) {
    botao.setAttribute('aria-pressed', String(botao.dataset.modo === estado.transmissao.modo));
  }
  $('#slideAtual').textContent = NOME_SLIDE[estado.transmissao.slide] || '—';

  const noAr = estado.transmissao.faixa;
  const faixaViva = noAr?.em && DuStats.agoraServidor() - noAr.em < 10000;
  for (const botao of $$('#botoesFaixa button')) {
    botao.disabled = !temFaixa(botao.dataset.rotulo);
    botao.classList.toggle('no-ar', Boolean(faixaViva) && noAr.rotulo === botao.dataset.rotulo);
  }

  montarAjustes(estado);
  preencherAjustes(estado);
  desenharConferencia(estado);
  talvezRedesenharPrevia(estado);
}

DuStats.aoEstado(renderizar);

DuStats.relogio.aoTique((texto) => {
  $('#relogio').textContent = texto;
  $('#sincAtual').textContent = `DuStats está marcando ${texto} neste período.`;
});

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
montarBotoesDeFaixa();
