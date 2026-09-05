'use strict';

const BOM = '﻿';
const SEP = ';'; // ponto e vírgula: é o que o Excel em pt-BR espera

function celula(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function paraCsv(linhas) {
  return BOM + linhas.map((linha) => linha.map(celula).join(SEP)).join('\r\n') + '\r\n';
}

function nomeEquipe(config, equipe) {
  if (!equipe) return '';
  return config[equipe]?.nome || equipe;
}

function eventosCsv(partida, derivado) {
  const linhas = [[
    'Nº', 'Período', 'Minuto', 'Tempo do período (mm:ss)', 'Evento',
    'Equipe', 'Detalhe', 'X', 'Y', 'Origem', 'Horário real'
  ]];

  derivado.eventos.forEach((e, i) => {
    const meta = e.meta || {};
    const detalhe = meta.desfecho || meta.cor || meta.acao || (meta.min !== undefined ? `${meta.min} min` : '');
    linhas.push([
      i + 1,
      e.periodo,
      e.minuto,
      formatarMmSs(e.tPeriodo),
      partida.esporte.eventos[e.type]?.rotulo || e.type,
      nomeEquipe(partida.config, e.team),
      detalhe,
      e.x !== undefined ? e.x.toFixed(3) : '',
      e.y !== undefined ? e.y.toFixed(3) : '',
      e.source,
      new Date(e.wall).toLocaleString('pt-BR')
    ]);
  });

  return paraCsv(linhas);
}

function resumoCsv(partida, derivado, comparativo) {
  const casa = partida.config.casa?.nome || 'Casa';
  const fora = partida.config.fora?.nome || 'Fora';

  const linhas = [
    ['DuStats — resumo da partida'],
    ['Competição', partida.config.competicao || ''],
    ['Data', new Date(partida.criadaEm).toLocaleString('pt-BR')],
    ['Local', partida.config.local || ''],
    [],
    ['Placar final', `${casa} ${derivado.placar.casa} x ${derivado.placar.fora} ${fora}`],
    [],
    ['Estatística', casa, fora]
  ];

  for (const linha of comparativo) {
    const sufixo = linha.sufixo || '';
    linhas.push([linha.rotulo, `${linha.casa}${sufixo}`, `${linha.fora}${sufixo}`]);
  }

  linhas.push([], ['Gols e cartões']);
  for (const item of derivado.linhaDoTempo) {
    const tipo = item.tipo === 'gol'
      ? (item.contra ? 'Gol contra' : 'Gol')
      : `Cartão ${item.cor}`;
    linhas.push([`${item.minuto}'`, tipo, nomeEquipe(partida.config, item.equipe)]);
  }

  return paraCsv(linhas);
}

function formatarMmSs(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

module.exports = { eventosCsv, resumoCsv, formatarMmSs };
