'use strict';

const crypto = require('crypto');
const stats = require('./stats');
const storage = require('./storage');

/**
 * Eventos de controle da transmissão. Ficam na mesma lista (o log é a verdade
 * única e serve de auditoria), mas o DESFAZER pula todos eles: o apontador
 * troca a posse dezenas de vezes por tempo, e se o undo removesse a última
 * troca de posse ele nunca conseguiria apagar um gol errado.
 */
const CONTROLE = new Set(['posse', 'relogio', 'periodo', 'acrescimo']);

const EQUIPES = new Set(['casa', 'fora']);

class Partida {
  constructor({ id, esporte, config, eventos = [], transmissao, criadaEm } = {}) {
    this.id = id || storage.novoId();
    this.esporteId = esporte.id;
    this.esporte = esporte;
    this.config = config || storage.carregarConfigPadrao();
    this.eventos = eventos;
    this.transmissao = transmissao || { modo: 'jogo', slide: 0, atualizadoEm: Date.now() };
    this.criadaEm = criadaEm || Date.now();
  }

  static carregar(esporte) {
    const salva = storage.carregarAtual();
    if (!salva) return new Partida({ esporte });
    return new Partida({
      id: salva.id,
      esporte,
      config: salva.config,
      eventos: Array.isArray(salva.eventos) ? salva.eventos : [],
      transmissao: salva.transmissao,
      criadaEm: salva.criadaEm
    });
  }

  /**
   * Horário de gravação do evento. O cliente pode informar um `wall` próprio —
   * usado pelo simulador e por quem registra um lance com atraso —, mas ele é
   * preso entre o último evento e agora: a derivação do relógio depende da
   * lista estar em ordem cronológica, e um horário fora de ordem viraria tempo
   * negativo no meio do jogo.
   */
  carimbar(pedido) {
    const agora = Date.now();
    const wall = Number(pedido);
    if (!Number.isFinite(wall)) return agora;
    const ultimo = this.eventos.length ? this.eventos[this.eventos.length - 1].wall : 0;
    return Math.round(Math.min(agora, Math.max(wall, ultimo)));
  }

  /** Valida e normaliza um evento vindo do painel ou de um processo externo. */
  normalizar(bruto) {
    const type = String(bruto?.type || '').trim();
    if (!this.esporte.eventos[type]) {
      throw new Error(`Tipo de evento desconhecido: "${type}"`);
    }

    const definicao = this.esporte.eventos[type];
    const evento = {
      id: crypto.randomUUID(),
      wall: this.carimbar(bruto?.wall),
      type,
      team: null,
      meta: bruto?.meta && typeof bruto.meta === 'object' ? { ...bruto.meta } : {},
      source: bruto?.source === 'cv' ? 'cv' : 'manual'
    };

    if (bruto?.cid) evento.cid = String(bruto.cid).slice(0, 64);

    if (definicao.equipe && EQUIPES.has(bruto?.team)) {
      evento.team = bruto.team;
    } else if (definicao.equipe && type !== 'posse') {
      throw new Error(`O evento "${type}" precisa de uma equipe (casa ou fora)`);
    }

    if (definicao.local) {
      const x = Number(bruto?.x);
      const y = Number(bruto?.y);
      // Coordenadas normalizadas no meio-campo de ataque: x=0 no meio-campo,
      // x=1 na linha de fundo; y=0..1 de uma lateral à outra.
      if (Number.isFinite(x) && Number.isFinite(y)) {
        evento.x = Math.min(1, Math.max(0, x));
        evento.y = Math.min(1, Math.max(0, y));
      }
    }

    if (type === 'finalizacao' && !this.esporte.desfechosFinalizacao[evento.meta.desfecho]) {
      evento.meta.desfecho = 'fora';
    }
    if (type === 'cartao' && evento.meta.cor !== 'vermelho') {
      evento.meta.cor = 'amarelo';
    }

    return evento;
  }

  /**
   * O painel manda um `cid` próprio em cada lance. Se o Wi-Fi cair depois do
   * servidor gravar mas antes da resposta chegar, o celular reenvia o mesmo
   * lance — e é este de-duplicador que impede o gol de ser contado duas vezes.
   */
  adicionar(bruto) {
    if (bruto?.cid) {
      const jaGravado = this.eventos.find((e) => e.cid === bruto.cid);
      if (jaGravado) return jaGravado;
    }
    const evento = this.normalizar(bruto);
    this.eventos.push(evento);
    return evento;
  }

  /** Remove o último evento estatístico (ignorando os de controle). */
  desfazer() {
    for (let i = this.eventos.length - 1; i >= 0; i -= 1) {
      if (!CONTROLE.has(this.eventos[i].type)) {
        return this.eventos.splice(i, 1)[0];
      }
    }
    return null;
  }

  /** O evento que o botão DESFAZER vai remover, para rotular o botão. */
  proximoParaDesfazer() {
    for (let i = this.eventos.length - 1; i >= 0; i -= 1) {
      if (!CONTROLE.has(this.eventos[i].type)) return this.eventos[i];
    }
    return null;
  }

  /**
   * Completa um lance já gravado. O gol é registrado com um toque só — perder
   * um gol por causa de um formulário seria imperdoável — e o local no campo,
   * que é opcional, chega depois por aqui.
   */
  ajustar(id, { x, y, meta } = {}) {
    const evento = this.eventos.find((e) => e.id === id);
    if (!evento) return null;
    if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
      evento.x = Math.min(1, Math.max(0, Number(x)));
      evento.y = Math.min(1, Math.max(0, Number(y)));
    }
    if (meta && typeof meta === 'object') evento.meta = { ...evento.meta, ...meta };
    return evento;
  }

  remover(id) {
    const idx = this.eventos.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    return this.eventos.splice(idx, 1)[0];
  }

  definirTransmissao(parcial) {
    this.transmissao = {
      ...this.transmissao,
      ...parcial,
      atualizadoEm: Date.now()
    };
  }

  derivar(agora = Date.now()) {
    return stats.derivar(this.eventos, this.esporte, agora);
  }

  /**
   * Snapshot enviado a todos os clientes a cada mudança. Carrega estatísticas
   * completas mas só os últimos lances — a lista inteira de eventos iria a
   * milhares num jogo e travaria o celular do apontador. Quem precisa dela
   * (exportação) busca em /api/eventos.
   */
  snapshot(agora = Date.now(), limiteUltimos = 24) {
    const d = this.derivar(agora);
    const paraDesfazer = this.proximoParaDesfazer();
    const anotadoParaDesfazer = paraDesfazer
      ? d.eventos.find((e) => e.id === paraDesfazer.id) || null
      : null;

    return {
      id: this.id,
      criadaEm: this.criadaEm,
      config: this.config,
      esporte: {
        id: this.esporte.id,
        nome: this.esporte.nome,
        periodos: this.esporte.periodos,
        desfechosFinalizacao: this.esporte.desfechosFinalizacao
      },
      transmissao: this.transmissao,
      relogio: d.relogio,
      placar: d.placar,
      posseAtual: d.posseAtual,
      posse: d.posse,
      totais: d.totais,
      porPeriodo: d.porPeriodo,
      chutes: d.chutes,
      momentum: d.momentum,
      linhaDoTempo: d.linhaDoTempo,
      comparativo: stats.linhasComparativas(d),
      ultimos: d.eventos.slice(-limiteUltimos).reverse(),
      totalEventos: this.eventos.length,
      paraDesfazer: anotadoParaDesfazer,
      servidorAgora: agora
    };
  }

  paraDisco() {
    return {
      id: this.id,
      esporteId: this.esporteId,
      criadaEm: this.criadaEm,
      config: this.config,
      transmissao: this.transmissao,
      eventos: this.eventos
    };
  }
}

module.exports = { Partida, CONTROLE };
