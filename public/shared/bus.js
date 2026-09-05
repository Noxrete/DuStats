/**
 * Ligação única com o servidor: recebe o estado por WebSocket e envia lances
 * por HTTP com fila local.
 *
 * Tudo aqui existe por causa do campo: o celular do apontador vai perder o
 * Wi-Fi, e um gol não pode se perder junto. Por isso todo lance vai para uma
 * fila em localStorage antes de sair, carrega um `cid` próprio (o servidor
 * ignora reenvios do mesmo cid) e só sai da fila quando o servidor confirma.
 */
(function (global) {
  'use strict';

  const CHAVE_FILA = 'dustats.fila.v1';

  const ouvintes = { estado: [], conexao: [] };
  let estado = null;
  let ws = null;
  let tentativas = 0;
  let conectado = false;
  let skew = 0; // servidorAgora - Date.now(), para o relógio não depender do celular
  let enviando = false;
  // O WebSocket demora a perceber que caiu; quem sabe primeiro é o POST que
  // falhou. É esse sinal que decide o aviso vermelho no painel.
  let ultimoEnvioFalhou = false;

  // ------------------------------------------------------------------ fila

  function lerFila() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_FILA)) || [];
    } catch {
      return [];
    }
  }

  function gravarFila(fila) {
    try {
      localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
    } catch {
      /* modo anônimo ou disco cheio: seguimos só com a memória */
    }
  }

  function novoCid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function escoarFila() {
    if (enviando) return;
    const fila = lerFila();
    if (fila.length === 0) return;

    enviando = true;
    try {
      const lote = fila.slice(0, 50);
      const resposta = await fetch('/api/eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lote)
      });
      if (!resposta.ok) throw new Error(await resposta.text());
      gravarFila(lerFila().slice(lote.length));
      ultimoEnvioFalhou = false;
      avisarConexao();
    } catch {
      // Sem rede: a fila fica intacta e tentamos de novo no próximo ciclo.
      ultimoEnvioFalhou = true;
      avisarConexao();
    } finally {
      enviando = false;
    }
    if (lerFila().length > 0) setTimeout(escoarFila, 400);
  }

  setInterval(escoarFila, 2000);

  // ------------------------------------------------------------- websocket

  function conectar() {
    const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocolo}://${location.host}`);

    ws.onopen = () => {
      conectado = true;
      ultimoEnvioFalhou = false;
      tentativas = 0;
      avisarConexao();
      escoarFila();
    };

    ws.onmessage = (mensagem) => {
      let pacote;
      try {
        pacote = JSON.parse(mensagem.data);
      } catch {
        return;
      }
      if (pacote.tipo !== 'estado') return;
      estado = pacote.estado;
      skew = estado.servidorAgora - Date.now();
      aplicarCores(estado);
      for (const fn of ouvintes.estado) fn(estado);
    };

    ws.onclose = () => {
      conectado = false;
      avisarConexao();
      // Backoff curto: no campo, reconectar rápido importa mais que poupar rede.
      tentativas += 1;
      setTimeout(conectar, Math.min(500 * tentativas, 5000));
    };

    ws.onerror = () => ws.close();
  }

  function avisarConexao() {
    const saudavel = conectado && !ultimoEnvioFalhou;
    for (const fn of ouvintes.conexao) fn(saudavel, lerFila().length);
  }

  /** Cores dos times viram variáveis CSS, para o resto do sistema só usar var(). */
  function aplicarCores(e) {
    const raiz = document.documentElement.style;
    raiz.setProperty('--cor-casa', e.config?.casa?.cor || '#1f6feb');
    raiz.setProperty('--cor-fora', e.config?.fora?.cor || '#d92d20');
    raiz.setProperty('--texto-casa', e.config?.casa?.corTexto || '#ffffff');
    raiz.setProperty('--texto-fora', e.config?.fora?.corTexto || '#ffffff');
  }

  // ------------------------------------------------------------------- api

  async function post(rota, corpo) {
    const resposta = await fetch(rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    });
    if (!resposta.ok) throw new Error(await resposta.text());
    return resposta.json();
  }

  const DuStats = {
    aoEstado(fn) {
      ouvintes.estado.push(fn);
      if (estado) fn(estado);
    },
    aoConectar(fn) {
      ouvintes.conexao.push(fn);
      fn(conectado, lerFila().length);
    },
    estado: () => estado,
    conectado: () => conectado && !ultimoEnvioFalhou,
    pendentes: () => lerFila().length,
    agoraServidor: () => Date.now() + skew,

    /** Enfileira um lance. Devolve na hora — o envio é assíncrono e resiliente. */
    registrar(evento) {
      const comCid = { ...evento, cid: novoCid(), wall: Date.now() + skew };
      gravarFila([...lerFila(), comCid]);
      avisarConexao();
      escoarFila();
      return comCid;
    },

    /**
     * Completa o local de um lance que já foi enviado. O `cid` é o único
     * identificador que o painel conhece na hora de registrar; o id do
     * servidor só aparece no snapshot seguinte, e é ele que buscamos aqui.
     */
    async ajustarPorCid(cid, dados) {
      for (let tentativa = 0; tentativa < 20; tentativa += 1) {
        const alvo = estado?.ultimos?.find((e) => e.cid === cid);
        if (alvo) {
          return fetch(`/api/eventos/${alvo.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
          });
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      return null;
    },

    apagar: (id) => fetch(`/api/eventos/${id}`, { method: 'DELETE' }),
    desfazer: () => post('/api/desfazer', {}),
    transmissao: (parcial) => post('/api/transmissao', parcial),
    salvarConfig: (parcial) => post('/api/config', parcial),
    enviarEscudo: (equipe, dataUrl) => post('/api/escudo', { equipe, dataUrl }),
    novaPartida: (config) => post('/api/partida/nova', { config })
  };

  global.DuStats = DuStats;
  conectar();
})(window);
