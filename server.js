// Servidor mínimo: busca os JSON do TSE (1º e 2º turno, Brasil + UFs), normaliza e serve ao front.
// Uso: node server.js   (Node 18+, sem dependências)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE = 'https://resultados.tse.jus.br/oficial/ele2026';
const ROUNDS = { r1: '6257', r2: '6258' };
const TTL = { r1: 60 * 60 * 1000, r2: 30 * 1000 }; // 1º turno quase estático; 2º turno a cada 30s
const SCOPES = ['br', 'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb',
  'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to', 'zz'];

const store = { r1: {}, r2: {} };
const meta = { r1: { at: 0, errors: 0 }, r2: { at: 0, errors: 0 } };
let blockedUntil = 0;

const num = (s) => Number(String(s || 0).replace(',', '.')); // TSE usa vírgula decimal

function normalize(d) {
  const c = (d.carg || [])[0];
  if (!c) return null;
  const v = [];
  for (const a of c.agr || []) for (const p of a.par || []) for (const k of p.cand || [])
    v.push([k.n, k.nmu || k.nm, num(k.vap), k.st || '']);
  const s = d.s || {}, vv = d.v || {};
  return {
    pst: num(s.pstn), secTotal: num(s.ts), secApuradas: num(s.st), tf: d.tf, dg: d.dg, hg: d.hg,
    validos: num(vv.vvc), brancos: num(vv.vb), nulos: num(vv.tvn), comp: num(d.e && d.e.pcn),
    v,
  };
}

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'EleicaoVotoAVoto/1.0', Accept: 'application/json' } });
  if (r.status === 403 || r.status === 429) blockedUntil = Date.now() + 10 * 60 * 1000; // respeita bloqueio do TSE
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function refresh(round) {
  if (Date.now() < blockedUntil || Date.now() - meta[round].at < TTL[round]) return;
  meta[round].at = Date.now();
  const cod = ROUNDS[round];
  const queue = [...SCOPES];
  let errors = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const uf = queue.shift();
      try {
        const n = normalize(await getJson(`${BASE}/${cod}/dados/${uf}/${uf}-c0001-e00${cod}-u.json`));
        if (n) store[round][uf.toUpperCase()] = n;
      } catch (e) { errors++; }
    }
  }));
  meta[round].errors = errors;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/data')) {
    await Promise.all([refresh('r1'), refresh('r2')]);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({
      fetchedAt: new Date(Math.max(meta.r1.at, meta.r2.at)).toISOString(),
      blocked: Date.now() < blockedUntil, errors: meta.r2.errors, r1: store.r1, r2: store.r2,
    }));
  }
  const pathname = req.url.split('?')[0];
  const file = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : path.normalize(pathname));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
