/** Gera a vitrine para abrir como arquivo local, sem servidor ou partida. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, 'build', 'previa-faixas.html');
const html = fs.readFileSync(path.join(raiz, 'public/overlay/skins.html'), 'utf8')
  .replaceAll('"/shared/', '"../public/shared/')
  .replaceAll("'/demo/", "'../public/demo/");
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, html);
console.log(destino);
