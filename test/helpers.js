'use strict';

const storage = require('../server/storage');

const esporte = storage.carregarEsporte('futebol');

let seq = 0;
/** Evento cru com `wall` controlado, do jeito que ele fica em disco. */
function ev(wall, type, team = null, meta = {}, extra = {}) {
  seq += 1;
  return { id: `e${seq}`, wall, type, team, meta, source: 'manual', ...extra };
}

module.exports = { esporte, ev };
