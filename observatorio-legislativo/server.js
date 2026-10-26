// Observatório Legislativo — servidor mínimo (Node 18+, sem dependências).
// Conectores separados para Câmara e Senado; normaliza e serve ao front preservando fonte e links oficiais.
// Uso: node server.js  →  http://localhost:3100
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3100;
const CAM = 'https://dadosabertos.camara.leg.br/api/v2';
const SEN = 'https://legis.senado.leg.br/dadosabertos';

// ---------- HTTP com cache ----------
const cache = new Map();
async function getJson(url, ttl = 60_000, headers = {}) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < ttl) return c.v;
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ObservatorioLegislativo/0.1', ...headers } });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} em ${new URL(url).host}`), { status: r.status });
  const v = await r.json();
  cache.set(url, { t: Date.now(), v });
  return v;
}
const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();
const isoDay = (d) => d.toISOString().slice(0, 10);
const today = () => isoDay(new Date(Date.now() - 3 * 3600e3)); // data em Brasília (UTC-3)
const validDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null;

// ---------- Câmara ----------
const camEventos = async (de, ate) => (await getJson(`${CAM}/eventos?${q({ dataInicio: de, dataFim: ate, itens: 100, ordem: 'ASC', ordenarPor: 'dataHoraInicio' })}`)).dados
  .map(e => ({ casa: 'C', id: e.id, inicio: e.dataHoraInicio, situacao: e.situacao, tipo: e.descricaoTipo, descricao: e.descricao,
    orgao: e.orgaos?.[0]?.sigla || '', local: e.localCamara?.nome || e.localExterno || '', url: `https://www.camara.leg.br/evento-legislativo/${e.id}` }));

const camVotacoes = async (de, ate) => (await getJson(`${CAM}/votacoes?${q({ dataInicio: de, dataFim: ate, itens: 100, ordem: 'DESC', ordenarPor: 'dataHoraRegistro' })}`)).dados
  .map(v => ({ casa: 'C', id: v.id, data: v.data, registro: v.dataHoraRegistro, orgao: v.siglaOrgao, descricao: v.descricao,
    aprovada: v.aprovacao === 1 ? true : v.aprovacao === 0 ? false : null, nominal: null, url: `https://www.camara.leg.br/presenca-comissoes/votacao-portal?idVotacao=${v.id}` }));

async function camVotacaoDetalhe(id) {
  const votos = (await getJson(`${CAM}/votacoes/${encodeURIComponent(id)}/votos`, 10 * 60_000)).dados;
  return resumoVotos(votos.map(v => ({ voto: v.tipoVoto, partido: v.deputado_?.siglaPartido, uf: v.deputado_?.siglaUf, nome: v.deputado_?.nome })));
}

function resumoVotos(votos) {
  const total = {}, partido = {};
  for (const v of votos) {
    const k = v.voto || 'Sem registro', p = v.partido || '—';
    total[k] = (total[k] || 0) + 1;
    (partido[p] ||= {})[k] = (partido[p][k] || 0) + 1;
  }
  return { total, partido, n: votos.length };
}

// ---------- Senado ----------
async function senVotacoes(de, ate, ttl = 5 * 60_000) {
  const raw = await getJson(`${SEN}/votacao?${q({ dataInicio: de, dataFim: ate })}`, ttl);
  return (Array.isArray(raw) ? raw : []).map(v => ({
    casa: 'S', id: `${v.codigoSessaoVotacao}`, data: v.dataSessao, registro: v.dataSessao, orgao: v.casaSessao === 'CN' ? 'CN' : 'PLEN',
    descricao: `${v.identificacao || ''} — ${v.descricaoVotacao || ''}`.trim(), ementa: v.ementa,
    aprovada: v.resultadoVotacao === 'A' ? true : v.resultadoVotacao === 'R' ? false : null,
    nominal: v.votacaoSecreta !== 'S' && (v.votos || []).length > 0, secreta: v.votacaoSecreta === 'S',
    resumo: resumoVotos((v.votos || []).map(x => ({ voto: x.siglaVotoParlamentar, partido: x.siglaPartidoParlamentar, uf: x.siglaUFParlamentar, nome: x.nomeParlamentar }))),
    votosRaw: (v.votos || []).map(x => ({ cod: x.codigoParlamentar, voto: x.siglaVotoParlamentar })),
    url: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${v.codigoMateria}`,
  }));
}
const semRaw = ({ votosRaw, ...o }) => o;

// ---------- Parlamentares ----------
let parlP = null, parlAt = 0;
async function parlamentares() {
  if (parlP && Date.now() - parlAt < 6 * 3600e3) return parlP;
  parlAt = Date.now();
  parlP = (async () => {
    const out = [];
    for (let p = 1; p <= 8; p++) {
      const r = (await getJson(`${CAM}/deputados?${q({ itens: 100, pagina: p, ordem: 'ASC', ordenarPor: 'nome' })}`, 6 * 3600e3)).dados;
      r.forEach(d => out.push({ casa: 'C', id: d.id, nome: d.nome, partido: d.siglaPartido, uf: d.siglaUf, foto: d.urlFoto, email: d.email }));
      if (r.length < 100) break;
    }
    const s = (await getJson(`${SEN}/senador/lista/atual`, 6 * 3600e3)).ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
    s.forEach(({ IdentificacaoParlamentar: i }) => out.push({ casa: 'S', id: Number(i.CodigoParlamentar), nome: i.NomeParlamentar, nomeCompleto: i.NomeCompletoParlamentar,
      partido: i.SiglaPartidoParlamentar, uf: i.UfParlamentar, foto: i.UrlFotoParlamentar?.replace('http:', 'https:'), email: i.EmailParlamentar, url: i.UrlPaginaParlamentar }));
    return out;
  })().catch(e => { parlP = null; throw e; });
  return parlP;
}
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function deputado(id) {
  const ano = new Date().getFullYear();
  const [det, props, orgaos, disc, desp, propsAno, discAno] = await Promise.allSettled([
    getJson(`${CAM}/deputados/${id}`, 3600e3),
    getJson(`${CAM}/proposicoes?${q({ idDeputadoAutor: id, itens: 10, ordem: 'DESC', ordenarPor: 'id' })}`, 600e3),
    getJson(`${CAM}/deputados/${id}/orgaos?${q({ itens: 50, ordem: 'DESC', ordenarPor: 'dataInicio' })}`, 3600e3),
    getJson(`${CAM}/deputados/${id}/discursos?${q({ itens: 5, ordem: 'DESC', ordenarPor: 'dataHoraInicio' })}`, 3600e3),
    getJson(`${CAM}/deputados/${id}/despesas?${q({ ano: new Date().getFullYear(), itens: 100, ordem: 'DESC', ordenarPor: 'dataDocumento' })}`, 3600e3),
    getJson(`${CAM}/proposicoes?${q({ idDeputadoAutor: id, ano, itens: 100, ordem: 'DESC', ordenarPor: 'id' })}`, 3600e3),
    getJson(`${CAM}/deputados/${id}/discursos?${q({ dataInicio: `${ano}-01-01`, itens: 100 })}`, 3600e3),
  ]);
  const ok = (r) => r.status === 'fulfilled' ? r.value.dados : null;
  const d = ok(det), ds = ok(desp), pa = ok(propsAno), da = ok(discAno);
  const porTipo = pa && pa.reduce((a, x) => (a[x.siglaTipo] = (a[x.siglaTipo] || 0) + 1, a), {});
  const atuacao = { ano, proposicoes: pa == null ? null : { total: pa.length, possivelmenteMaisDe100: pa.length >= 100, porTipo }, discursos: da == null ? null : { total: da.length, possivelmenteMaisDe100: da.length >= 100 } };
  return {
    casa: 'C', id: Number(id), url: `https://www.camara.leg.br/deputados/${id}`, atuacao,
    perfil: d && { nome: d.ultimoStatus.nomeEleitoral, nomeCivil: d.nomeCivil, partido: d.ultimoStatus.siglaPartido, uf: d.ultimoStatus.siglaUf,
      situacao: d.ultimoStatus.situacao, foto: d.ultimoStatus.urlFoto, email: d.ultimoStatus.email, escolaridade: d.escolaridade, nascimento: d.dataNascimento },
    proposicoes: (ok(props) || []).map(propNorm),
    orgaos: (ok(orgaos) || []).filter(o => !o.dataFim).slice(0, 10).map(o => ({ sigla: o.siglaOrgao, nome: o.nomeOrgao, titulo: o.titulo })),
    discursos: (ok(disc) || []).map(x => ({ data: x.dataHoraInicio, tipo: x.tipoDiscurso, resumo: x.sumario, url: x.urlTexto })),
    despesas: ds == null ? { status: 'erro' } : ds.length === 0 ? { status: 'indisponivel' } : {
      status: 'ok', total: ds.reduce((s, x) => s + (x.valorLiquido || 0), 0), n: ds.length,
      porTipo: Object.entries(ds.reduce((a, x) => (a[x.tipoDespesa] = (a[x.tipoDespesa] || 0) + (x.valorLiquido || 0), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
    },
  };
}
const propNorm = (p) => ({ id: p.id, sigla: `${p.siglaTipo} ${p.numero}/${p.ano}`, ementa: p.ementa, apresentacao: p.dataApresentacao,
  url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}` });

async function senador(id) {
  const hoje = new Date(), de = isoDay(new Date(hoje - 120 * 86400e3));
  const vs = await senVotacoes(de, today(), 30 * 60_000);
  const votos = vs.flatMap(v => { const m = v.votosRaw.find(x => String(x.cod) === String(id)); return m ? [{ data: v.data, descricao: v.descricao, voto: m.voto, url: v.url }] : []; });
  const nominais = vs.filter(v => v.nominal && v.votosRaw.length);
  const porCodigo = {};
  nominais.forEach(v => { const m = v.votosRaw.find(x => String(x.cod) === String(id)); const k = m ? m.voto : 'sem registro'; porCodigo[k] = (porCodigo[k] || 0) + 1; });
  const atuacao = { janela: { de, ate: today() }, votacoesNominais: nominais.length, porCodigo };
  return { casa: 'S', id: Number(id), atuacao, votos: votos.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 15), janela: { de, ate: today() },
    url: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${id}` };
}

async function proposicao(id) {
  const [d, t] = await Promise.all([getJson(`${CAM}/proposicoes/${id}`, 600e3), getJson(`${CAM}/proposicoes/${id}/tramitacoes`, 600e3)]); // este endpoint não aceita "itens"
  const p = d.dados, tr = t.dados.slice(-8).reverse();
  return { ...propNorm(p), situacao: p.statusProposicao?.descricaoSituacao, orgao: p.statusProposicao?.siglaOrgao, urlInteiroTeor: p.urlInteiroTeor,
    tramitacoes: tr.map(x => ({ data: x.dataHora, orgao: x.siglaOrgao, despacho: x.despacho, situacao: x.descricaoSituacao })) };
}


const settle = async (p) => { try { return { ok: true, dados: await p }; } catch (e) { return { ok: false, erro: e.message, dados: [] }; } };
// ---------- Últimos movimentos (eventos + votações, por Casa) ----------
const agoraBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19); // "hora de Brasília" sem fuso, comparável com as datas das APIs
async function movimentos(n = 10, dias = 21) {
  const ate = today(), de = isoDay(new Date(Date.now() - 3 * 3600e3 - dias * 86400e3)), agora = agoraBR();
  const [cEv, cVo, sRe, sVo] = await Promise.all([
    settle(getJson(`${CAM}/eventos?${q({ dataInicio: de, dataFim: ate, itens: 100, ordem: 'DESC', ordenarPor: 'dataHoraInicio' })}`, 120_000).then(r => r.dados)),
    settle(camVotacoes(de, ate)),
    settle(getJson(`${SEN}/comissao/agenda/${de.replace(/-/g, '')}/${ate.replace(/-/g, '')}`, 120_000).then(r => r.AgendaReuniao?.reunioes?.reuniao || [])),
    settle(senVotacoes(de, ate)),
  ]);
  const camara = [
    ...cEv.dados.filter(e => e.dataHoraInicio <= agora).map(e => ({ tipo: 'evento', data: e.dataHoraInicio, titulo: e.descricaoTipo, detalhe: e.descricao,
      orgao: e.orgaos?.[0]?.sigla || '', situacao: e.situacao, id: e.id, url: `https://www.camara.leg.br/evento-legislativo/${e.id}` })),
    ...cVo.dados.map(v => ({ tipo: 'votacao', data: v.registro, titulo: `Votação · ${v.orgao}`, detalhe: v.descricao, orgao: v.orgao, aprovada: v.aprovada, url: v.url })),
  ].sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, n);
  const senado = [
    ...sRe.dados.filter(r => r.dataInicio.slice(0, 19) <= agora).map(r => ({ tipo: 'evento', data: r.dataInicio.slice(0, 19), titulo: `${r.titulo || r.descricao} · ${r.colegiadoCriador?.sigla || ''}`,
      detalhe: r.colegiadoCriador?.nome, orgao: r.colegiadoCriador?.sigla, situacao: r.situacao, id: r.codigo, url: r.linkECidadania || r.urlUltimaPautaSimplesPublicada || null })),
    ...sVo.dados.map(v => ({ tipo: 'votacao', data: `${v.data}T23:59:00`, semHora: true, titulo: `Votação · ${v.orgao}`, detalhe: v.descricao, orgao: v.orgao, aprovada: v.aprovada, url: v.url })),
  ].sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, n);
  return { camara: { ok: cEv.ok && cVo.ok, erro: cEv.erro || cVo.erro, dados: camara }, senado: { ok: sRe.ok && sVo.ok, erro: sRe.erro || sVo.erro, dados: senado }, janela: { de, ate } };
}

// ---------- Detalhe de eventos ----------
async function eventoCamara(id) {
  const [d, pauta, deps, votos] = await Promise.all([settle(getJson(`${CAM}/eventos/${id}`, 600e3).then(r => r.dados)), settle(getJson(`${CAM}/eventos/${id}/pauta`, 600e3).then(r => r.dados)),
    settle(getJson(`${CAM}/eventos/${id}/deputados`, 600e3).then(r => r.dados)), settle(getJson(`${CAM}/eventos/${id}/votacoes`, 600e3).then(r => r.dados))]);
  if (!d.ok) throw new Error(d.erro);
  const e = d.dados;
  return { casa: 'C', id: Number(id), url: `https://www.camara.leg.br/evento-legislativo/${id}`, tipo: e.descricaoTipo, situacao: e.situacao, descricao: e.descricao,
    inicio: e.dataHoraInicio, fim: e.dataHoraFim, local: e.localCamara?.nome || e.localExterno || null, orgaos: (e.orgaos || []).map(o => ({ sigla: o.sigla, nome: o.nome })),
    video: e.urlRegistro || null, documentoPauta: e.urlDocumentoPauta || null,
    pauta: pauta.dados.map(i => ({ ordem: i.ordem, topico: i.topico, regime: i.regime, titulo: i.titulo, ementa: i.proposicaoRelacionada_?.ementa || i.proposicao_?.ementa || null,
      relator: i.relator ? `${i.relator.nome}${i.relator.siglaPartido ? ' (' + i.relator.siglaPartido + '/' + i.relator.siglaUf + ')' : ' (' + i.relator.siglaUf + ')'}` : null,
      parecer: i.textoParecer || null, propId: i.proposicaoRelacionada_?.id || i.proposicao_?.id || null })),
    participantes: { total: deps.dados.length, lista: deps.dados.slice(0, 40).map(x => ({ nome: x.nome, partido: x.siglaPartido, uf: x.siglaUf })) },
    votacoes: votos.dados.length,
    pendencias: [pauta, deps, votos].some(x => !x.ok) ? 'Parte dos detalhes não pôde ser consultada.' : null };
}
async function eventoSenado(codigo, data) {
  const dia = (data || today()).replace(/-/g, '');
  const reunioes = (await getJson(`${SEN}/comissao/agenda/${dia}/${dia}`, 300_000)).AgendaReuniao?.reunioes?.reuniao || [];
  const r = reunioes.find(x => String(x.codigo) === String(codigo));
  if (!r) throw new Error('Reunião não encontrada na agenda do Senado para essa data.');
  const arr = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
  return { casa: 'S', id: r.codigo, url: r.linkECidadania || r.urlUltimaPautaSimplesPublicada || null, titulo: r.titulo, descricao: r.descricao, colegiado: r.colegiadoCriador && { sigla: r.colegiadoCriador.sigla, nome: r.colegiadoCriador.nome },
    situacao: r.situacao, inicio: r.dataInicio, local: r.local, tipo: r.tipo?.descricao, presencial: r.tipoPresenca, presidente: r.presidente?.nomeComCargo || null,
    links: { pauta: r.urlUltimaPautaCheiaPublicada || r.urlUltimaPautaSimplesPublicada || null, resultado: r.urlUltimoResultadoPublicado || null, ecidadania: r.linkECidadania || null },
    videos: arr(r.videos).map(v => ({ titulo: v.titulo, url: v.url })),
    partes: arr(r.partes).map(p => ({ nome: p.nome, deliberativa: p.isDeliberativa === 'true', finalidade: p.evento?.finalidade || null, observacoes: p.evento?.observacoes || null, resultado: p.evento?.resultadoTexto || null,
      convidados: arr(p.evento?.convidados).map(c => ({ nome: c.nome, cargo: c.cargo, representa: c.representanteDe, presente: c.isDepoentePresente === 'true' })) })) };
}

// ---------- rotas ----------
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

async function api(url, res) {
  const u = new URL(url, 'http://x'), p = u.pathname, s = u.searchParams;
  const stamp = { atualizadoEm: new Date().toISOString() };
  if (p === '/api/movimentos') return send(res, 200, { ...stamp, ...(await movimentos(Number(s.get('n')) || 10)) });
  if (p.startsWith('/api/evento/camara/')) return send(res, 200, { ...stamp, ...(await eventoCamara(p.split('/').pop())) });
  if (p.startsWith('/api/evento/senado/')) return send(res, 200, { ...stamp, ...(await eventoSenado(p.split('/').pop(), s.get('data'))) });
  if (p === '/api/atividade') {
    const de = validDay(s.get('de')) || today(), ate = validDay(s.get('ate')) || de;
    const [ev, vc, vs] = await Promise.all([
      s.get('eventos') === '0' ? { ok: true, dados: [] } : settle(camEventos(de, ate)), settle(camVotacoes(de, ate)), settle(senVotacoes(de, ate))]);
    return send(res, 200, { ...stamp, de, ate, eventos: ev, votacoesCamara: vc, votacoesSenado: { ...vs, dados: vs.dados.map(semRaw) } });
  }
  if (p.startsWith('/api/votacao/camara/')) return send(res, 200, { ...stamp, ...(await camVotacaoDetalhe(decodeURIComponent(p.split('/').pop()))) });
  if (p === '/api/parlamentares') {
    const t = norm(s.get('q')), casa = s.get('casa'), uf = s.get('uf');
    let r = await parlamentares();
    if (casa) r = r.filter(x => x.casa === casa);
    if (uf) r = r.filter(x => x.uf === uf);
    if (t) r = r.filter(x => norm(x.nome + ' ' + (x.nomeCompleto || '') + ' ' + x.partido).includes(t));
    return send(res, 200, { ...stamp, total: r.length, dados: r.slice(0, Math.min(Number(s.get('limit')) || 60, 200)) });
  }
  if (p.startsWith('/api/deputado/')) return send(res, 200, { ...stamp, ...(await deputado(p.split('/').pop())) });
  if (p.startsWith('/api/senador/')) return send(res, 200, { ...stamp, ...(await senador(p.split('/').pop())) });
  if (p === '/api/proposicoes') {
    const kw = s.get('q') || '';
    const r = (await getJson(`${CAM}/proposicoes?${q({ keywords: kw || undefined, itens: 20, ordem: 'DESC', ordenarPor: 'id' })}`, 120_000)).dados.map(propNorm);
    return send(res, 200, { ...stamp, dados: r });
  }
  if (p.startsWith('/api/proposicao/')) return send(res, 200, { ...stamp, ...(await proposicao(p.split('/').pop())) });
  const ex = p.startsWith('/api/executivo') || p.startsWith('/api/transparencia') ? await executivo(p, s) : p.startsWith('/api/judiciario') ? await judiciario(p, s) : null;
  if (ex) return send(res, 200, { ...stamp, ...ex });
  send(res, 404, { erro: 'rota não encontrada' });
}

const executivo = require('./executivo')({ getJson, q, today, isoDay });
const judiciario = require('./judiciario')({ getJson });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const PUB = path.join(__dirname, 'public');
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return api(req.url, res).catch(e => send(res, 502, { erro: e.message }));
  const pathname = req.url.split('?')[0];
  const file = path.join(PUB, pathname === '/' ? 'index.html' : path.normalize(pathname));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Observatório Legislativo em http://localhost:${PORT}`));
