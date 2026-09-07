#!/usr/bin/env sh
# DuStats — inicialização no Linux e no macOS.
# O equivalente do DuStats.bat: acha o Node, sobe o servidor e abre o painel.

set -e
cd "$(dirname "$0")"

if [ -x "node/bin/node" ]; then
  NODE="node/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE="node"
else
  echo
  echo "  O Node.js não foi encontrado."
  echo "  Instale em https://nodejs.org (versão LTS) e rode de novo."
  echo
  exit 1
fi

DUSTATS_ABRIR=1 "$NODE" server/index.js
