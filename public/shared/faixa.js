/** A faixa usada no OBS e na vitrine. O DOM dos escudos permanece entre disparos. */
(function (global) {
  'use strict';

  const montadas = new WeakMap();

  function time(lado) {
    return `<span class="time-faixa ${lado} sem-escudo" data-equipe="${lado}" style="--cor:var(--cor-${lado});--tinta:var(--texto-${lado})">
      <span class="moldura-escudo-faixa" aria-hidden="true">
        <span class="recorte-escudo-faixa"></span>
        <span class="selo-escudo-faixa"><span class="sigla-escudo-faixa"></span></span>
      </span>
      <span class="sigla-time-faixa"></span>
    </span>`;
  }

  function montar(elemento) {
    if (montadas.has(elemento)) return montadas.get(elemento);
    elemento.innerHTML = `<div class="conteudo-faixa">
      <div class="rotulo-faixa"><span data-rotulo></span></div>
      <div class="linha-faixa">
        ${time('casa')}
        <span class="valor-faixa esq num" data-valor="casa"></span>
        <div class="trilho"><span class="casa" data-barra="casa"></span><span class="fora" data-barra="fora"></span></div>
        <span class="valor-faixa dir num" data-valor="fora"></span>
        ${time('fora')}
      </div>
    </div>`;
    const dados = { times: {} };
    for (const lado of ['casa', 'fora']) {
      const el = elemento.querySelector(`[data-equipe="${lado}"]`);
      dados.times[lado] = { el, selo: el.querySelector('.selo-escudo-faixa'), url: null, imagem: null };
    }
    montadas.set(elemento, dados);
    return dados;
  }

  function atualizarTimes(elemento, estado) {
    const dados = montar(elemento);
    const { overlay } = global.DuStats;
    for (const lado of ['casa', 'fora']) {
      const t = dados.times[lado];
      const sigla = overlay.sigla(estado.config, lado).slice(0, 4);
      t.el.setAttribute('aria-label', overlay.nome(estado.config, lado));
      t.el.querySelector('.sigla-time-faixa').textContent = sigla;
      t.el.querySelector('.sigla-escudo-faixa').textContent = sigla;
      const url = String(estado.config?.[lado]?.escudo || '');
      if (url === t.url) continue;
      t.url = url;
      t.el.classList.add('sem-escudo');
      t.el.style.removeProperty('--logo-faixa');
      t.imagem?.remove();
      t.imagem = null;
      if (!url) continue;

      // Sem HTML vindo da configuração. Uma imagem quebrada conserva a sigla;
      // eventos tardios de um escudo anterior não apagam o novo.
      const img = document.createElement('img');
      img.className = 'imagem-escudo-faixa';
      img.alt = '';
      img.hidden = true;
      img.decoding = 'async';
      img.addEventListener('load', () => {
        if (t.imagem !== img) return;
        img.hidden = false;
        t.el.classList.remove('sem-escudo');
        t.el.style.setProperty('--logo-faixa', `url(${JSON.stringify(url)})`);
      });
      img.addEventListener('error', () => {
        if (t.imagem !== img) return;
        img.hidden = true;
        t.el.classList.add('sem-escudo');
        t.el.style.removeProperty('--logo-faixa');
      });
      t.imagem = img;
      t.selo.appendChild(img);
      img.src = url;
    }
  }

  function preencher(elemento, linha, estado) {
    atualizarTimes(elemento, estado);
    elemento.querySelector('[data-rotulo]').textContent = linha.rotulo;
    const total = linha.casa + linha.fora;
    const fatia = total > 0 ? linha.casa / total * 100 : 50;
    const lider = !linha.destacar || linha.casa === linha.fora ? '' : (linha.casa > linha.fora ? 'casa' : 'fora');
    for (const lado of ['casa', 'fora']) {
      const valor = elemento.querySelector(`[data-valor="${lado}"]`);
      valor.textContent = `${linha[lado]}${linha.sufixo || ''}`;
      valor.classList.toggle(`lider-${lado}`, lider === lado);
      elemento.querySelector(`[data-barra="${lado}"]`).style.width = `${lado === 'casa' ? fatia : 100 - fatia}%`;
    }
  }

  global.DuStats = global.DuStats || {};
  global.DuStats.faixa = { preencher, atualizarTimes };
})(window);
