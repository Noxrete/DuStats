/**
 * Utilidades comuns aos overlays do OBS.
 *
 * O ponto central: cada overlay decide sozinho se está no ar, olhando
 * `transmissao.modo`. Assim o operador adiciona as quatro páginas UMA vez como
 * Fonte de Navegador na mesma cena e nunca mais toca no OBS durante o jogo —
 * o celular manda tudo. Sem isso, trocar do placar para o painel do intervalo
 * exigiria alternar fontes no OBS bem no momento mais corrido da transmissão.
 */
(function (global) {
  'use strict';

  const parametros = new URLSearchParams(location.search);

  /** Mostra/esconde o elemento conforme o modo pedido pelo painel. */
  function aoModo(modos, elemento, { aoEntrar, aoSair } = {}) {
    const aceitos = Array.isArray(modos) ? modos : [modos];
    let visivelAntes = null;

    DuStats.aoEstado((estado) => {
      const visivel = aceitos.includes(estado.transmissao.modo);
      if (visivel === visivelAntes) return;
      visivelAntes = visivel;

      elemento.classList.toggle('no-ar', visivel);
      if (visivel) aoEntrar?.(estado);
      else aoSair?.(estado);
    });
  }

  /**
   * Dispara para cada lance NOVO dos tipos pedidos. Os lances que já estavam
   * gravados quando a página abriu são marcados como vistos sem disparar nada:
   * recarregar o overlay no meio do jogo não pode fazer todos os gols do
   * primeiro tempo entrarem no ar de novo.
   */
  function aoNovoLance(tipos, callback, { janelaMs = 25000 } = {}) {
    const vistos = new Set();
    let primeiraCarga = true;

    DuStats.aoEstado((estado) => {
      const candidatos = (estado.ultimos || []).filter((e) => tipos.includes(e.type));

      for (const evento of candidatos.slice().reverse()) {
        if (vistos.has(evento.id)) continue;
        vistos.add(evento.id);
        if (primeiraCarga) continue;
        // Lance antigo que só apareceu agora (ex.: correção manual) não anima.
        if (DuStats.agoraServidor() - evento.wall > janelaMs) continue;
        callback(evento, estado);
      }
      primeiraCarga = false;
    });
  }

  /**
   * `substituto: false` para onde a sigla já aparece escrita ao lado (o
   * placar), senão sai "GRV" duas vezes seguidas quando não há escudo enviado.
   */
  function escudo(config, lado, { substituto = true } = {}) {
    const url = config?.[lado]?.escudo;
    if (url) return `<img class="escudo" src="${url}" alt="">`;
    if (!substituto) return '';
    return `<span class="escudo escudo-vazio" style="background: var(--cor-${lado})">${(config?.[lado]?.sigla || '').slice(0, 3)}</span>`;
  }

  function nome(config, lado) {
    return config?.[lado]?.nome || (lado === 'casa' ? 'Casa' : 'Visitante');
  }

  function sigla(config, lado) {
    return (config?.[lado]?.sigla || nome(config, lado).slice(0, 3)).toUpperCase();
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.overlay = { aoModo, aoNovoLance, escudo, nome, sigla, parametros };
})(window);
