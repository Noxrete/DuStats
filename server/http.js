'use strict';

/**
 * Servidor HTTP mínimo, escrito em cima do `http` do próprio Node.
 *
 * Existe para o DuStats não ter NENHUMA dependência: sem `npm install`, a pasta
 * do projeto roda em qualquer lugar onde exista um `node`, e é isso que permite
 * carregar tudo num pendrive junto com o Node portátil. O Express traria 68
 * pacotes para usar três coisas — rota, JSON e arquivo estático.
 *
 * Não é um framework: faz só o que estas seis rotas e esta pasta pública pedem.
 */

const fs = require('fs');
const path = require('path');

const LIMITE_CORPO = 8 * 1024 * 1024; // escudos chegam em base64

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

/** Lê o corpo da requisição como JSON, cortando o que passar do limite. */
function lerJson(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let tamanho = 0;

    req.on('data', (pedaco) => {
      tamanho += pedaco.length;
      if (tamanho > LIMITE_CORPO) {
        reject(new Error('corpo grande demais'));
        req.destroy();
        return;
      }
      pedacos.push(pedaco);
    });

    req.on('end', () => {
      if (pedacos.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(pedacos).toString('utf8')));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * Resolve o caminho pedido dentro da pasta pública.
 *
 * Devolve null para qualquer coisa que escape da raiz. É a única parte deste
 * arquivo onde um erro seria grave: sem esta checagem, um pedido a
 * `/../../etc/passwd` leria arquivo de fora do projeto.
 */
function resolverEstatico(raiz, urlCaminho) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(urlCaminho);
  } catch {
    return null; // %-escape malformado
  }
  if (decodificado.includes('\0')) return null;

  // Barra invertida vira barra normal ANTES de normalizar. Sem isto, no Windows
  // (onde "\" também é separador) um pedido a "/shared\..\..\package.json"
  // passaria intacto pelo normalize posix e o resolve sairia da pasta pública.
  // No Linux o mesmo pedido é só um nome de arquivo esquisito, então o furo
  // existiria exatamente na máquina onde o DuStats roda.
  const semBarraInvertida = decodificado.replace(/\\/g, '/');

  const alvo = path.resolve(raiz, `.${path.posix.normalize(semBarraInvertida)}`);
  const dentro = alvo === raiz || alvo.startsWith(raiz + path.sep);
  return dentro ? alvo : null;
}

/** Transforma "/api/eventos/:id" num casador que devolve os parâmetros. */
function compilar(padrao) {
  const partes = padrao.split('/').filter(Boolean);
  return (caminho) => {
    const alvo = caminho.split('/').filter(Boolean);
    if (alvo.length !== partes.length) return null;

    const params = {};
    for (let i = 0; i < partes.length; i += 1) {
      if (partes[i].startsWith(':')) params[partes[i].slice(1)] = decodeURIComponent(alvo[i]);
      else if (partes[i] !== alvo[i]) return null;
    }
    return params;
  };
}

function criarApp({ estatico }) {
  const raizEstatica = path.resolve(estatico);
  const rotas = [];

  const registrar = (metodo) => (padrao, ...manipuladores) => {
    rotas.push({ metodo, padrao, casar: compilar(padrao), manipuladores });
  };

  /** Enriquece a resposta nativa com os poucos atalhos que as rotas usam. */
  function prepararResposta(res) {
    res.status = (codigo) => { res.statusCode = codigo; return res; };
    res.json = (dados) => {
      const corpo = JSON.stringify(dados);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(corpo));
      res.end(corpo);
    };
    res.send = (texto) => {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(texto);
    };
    res.redirect = (destino) => {
      res.statusCode = 302;
      res.setHeader('Location', destino);
      res.end();
    };
    return res;
  }

  function servirArquivo(res, arquivo) {
    const extensao = path.extname(arquivo).toLowerCase();
    res.setHeader('Content-Type', TIPOS[extensao] || 'application/octet-stream');
    // Os overlays são recarregados pelo OBS sem aviso; nada aqui pode ficar
    // preso em cache, ou uma correção de última hora não entra no ar.
    res.setHeader('Cache-Control', 'no-cache');

    const fluxo = fs.createReadStream(arquivo);
    fluxo.on('error', () => { res.statusCode = 500; res.end('erro ao ler arquivo'); });
    fluxo.pipe(res);
  }

  async function manipular(req, res) {
    prepararResposta(res);

    const url = new URL(req.url, 'http://localhost');
    const caminho = url.pathname;
    req.query = Object.fromEntries(url.searchParams);

    for (const rota of rotas) {
      if (rota.metodo !== req.method) continue;
      const params = rota.casar(caminho);
      if (!params) continue;

      req.params = params;
      if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
        try {
          req.body = await lerJson(req);
        } catch (erro) {
          return res.status(400).json({ erro: erro.message });
        }
      }

      // Cadeia de manipuladores: o primeiro que responder encerra. É só o que
      // o guarda de token precisa — não existe `next()` assíncrono aqui.
      for (const manipulador of rota.manipuladores) {
        let seguir = false;
        await manipulador(req, res, () => { seguir = true; });
        if (!seguir) return undefined;
      }
    }

    // Nenhuma rota casou: tenta arquivo estático.
    if (req.method !== 'GET') return res.status(404).json({ erro: 'rota não encontrada' });

    const arquivo = resolverEstatico(raizEstatica, caminho);
    if (!arquivo) return res.status(403).send('caminho inválido');

    fs.stat(arquivo, (erro, info) => {
      if (erro) return res.status(404).send('não encontrado');
      if (info.isDirectory()) {
        const indice = path.join(arquivo, 'index.html');
        return fs.stat(indice, (e) => (e ? res.status(404).send('não encontrado') : servirArquivo(res, indice)));
      }
      return servirArquivo(res, arquivo);
    });
    return undefined;
  }

  return {
    get: registrar('GET'),
    post: registrar('POST'),
    patch: registrar('PATCH'),
    delete: registrar('DELETE'),
    /** Passa direto para `http.createServer`. */
    manipular: (req, res) => {
      manipular(req, res).catch((erro) => {
        if (res.headersSent) return;
        res.statusCode = 500;
        res.end(JSON.stringify({ erro: erro.message }));
      });
    }
  };
}

module.exports = { criarApp, resolverEstatico, TIPOS };
