/**
 * Relógio do lado do cliente.
 *
 * O servidor manda o tempo acumulado e o instante de referência; quem conta os
 * segundos entre uma mensagem e outra é o navegador. Sem isso o número do
 * placar pularia a cada pacote (ou congelaria numa oscilação de rede) — e um
 * relógio que trava no ar é a primeira coisa que o espectador nota.
 */
(function (global) {
  'use strict';

  function tempoAgora() {
    const estado = global.DuStats?.estado();
    if (!estado) return { tPeriodo: 0, tTotal: 0, rodando: false };

    const r = estado.relogio;
    const decorrido = r.rodando ? Math.max(0, global.DuStats.agoraServidor() - r.refWall) : 0;
    return {
      tPeriodo: r.tPeriodo + decorrido,
      tTotal: r.tTotal + decorrido,
      rodando: r.rodando
    };
  }

  /** mm:ss, com dois dígitos sempre — números que não dançam de largura. */
  function formatar(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function aoTique(fn) {
    let ultimoTexto = null;
    const laco = () => {
      const t = tempoAgora();
      const texto = formatar(t.tPeriodo);
      if (texto !== ultimoTexto) {
        ultimoTexto = texto;
        fn(texto, t);
      }
      requestAnimationFrame(laco);
    };
    requestAnimationFrame(laco);
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.relogio = { tempoAgora, formatar, aoTique };
})(window);
