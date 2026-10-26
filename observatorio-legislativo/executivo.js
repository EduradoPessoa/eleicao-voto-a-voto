// Conectores do Poder Executivo federal.
//  - Compras.gov.br (dados abertos, sem chave): contratos e contratações (PNCP, Lei 14.133)
//  - Câmara: medidas provisórias (atos do Executivo em tramitação no Congresso)
//  - Portal da Transparência: pronto, ativa-se ao definir PORTAL_TRANSPARENCIA_KEY (env ou arquivo .env)
// Portal da Legislação (planalto.gov.br): não tem API aberta e bloqueia acesso automatizado (HTTP 403);
// por isso o app só gera links de busca para o site oficial.
const fs = require('fs');
const path = require('path');

const COMPRAS = 'https://dadosabertos.compras.gov.br';
const CAM = 'https://dadosabertos.camara.leg.br/api/v2';
const PT = 'https://api.portaldatransparencia.gov.br/api-de-dados';

function chaveTransparencia() {
  if (process.env.PORTAL_TRANSPARENCIA_KEY) return process.env.PORTAL_TRANSPARENCIA_KEY.trim();
  try {
    const m = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').match(/^\s*PORTAL_TRANSPARENCIA_KEY\s*=\s*(.+?)\s*$/m);
    return m ? m[1].replace(/^["']|["']$/g, '') : null;
  } catch { return null; }
}
const br = (iso) => iso.split('-').reverse().join('/'); // 2026-10-25 → 25/10/2026

module.exports = ({ getJson, q, today, isoDay }) => {
  const dias = (n) => isoDay(new Date(Date.now() - 3 * 3600e3 - n * 86400e3));

  async function contratos(s) {
    const orgao = s.get('orgao') || '26000', de = s.get('de') || dias(180), ate = s.get('ate') || today();
    const r = await getJson(`${COMPRAS}/modulo-contratos/1_consultarContratos?${q({ pagina: s.get('pagina') || 1, tamanhoPagina: 20,
      codigoOrgao: orgao, dataVigenciaInicialMin: de, dataVigenciaInicialMax: ate })}`, 10 * 60_000);
    return { fonte: 'Compras.gov.br — Dados Abertos (módulo contratos)', de, ate, total: r.totalRegistros, paginas: r.totalPaginas,
      dados: (r.resultado || []).map(c => ({
        orgao: c.nomeOrgao, unidade: c.nomeUnidadeGestora, numero: c.numeroContrato, modalidade: c.nomeModalidadeCompra, categoria: c.nomeCategoria,
        fornecedor: c.nomeRazaoSocialFornecedor, fornecedorId: c.niFornecedor, objeto: c.objeto, processo: c.processo,
        inicio: c.dataVigenciaInicial, fim: c.dataVigenciaFinal, valor: c.valorGlobal })) };
  }

  async function contratacoes(s) {
    const de = s.get('de') || dias(60), ate = s.get('ate') || dias(30), mod = s.get('modalidade') || 6, uf = s.get('uf');
    const federal = s.get('federal') !== '0';
    const r = await getJson(`${COMPRAS}/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?${q({ pagina: s.get('pagina') || 1, tamanhoPagina: 50,
      dataPublicacaoPncpInicial: de, dataPublicacaoPncpFinal: ate, codigoModalidade: mod, unidadeOrgaoUfSigla: uf })}`, 10 * 60_000);
    const todos = r.resultado || [];
    const dados = todos.filter(c => !federal || c.orgaoEntidadeEsferaId === 'F').map(c => ({
      orgao: c.orgaoEntidadeRazaoSocial, unidade: c.unidadeOrgaoNomeUnidade, uf: c.unidadeOrgaoUfSigla, municipio: c.unidadeOrgaoMunicipioNome,
      modalidade: c.modalidadeNome, objeto: c.objetoCompra, situacao: c.situacaoCompraNomePncp, publicadaEm: c.dataPublicacaoPncp,
      estimado: c.valorTotalEstimado, homologado: c.valorTotalHomologado, amparo: c.amparoLegalNome, controle: c.numeroControlePNCP,
      url: `https://pncp.gov.br/app/editais/${c.orgaoEntidadeCnpj}/${c.anoCompraPncp}/${c.sequencialCompraPncp}` }));
    return { fonte: 'Compras.gov.br — Dados Abertos (PNCP, Lei 14.133)', de, ate, totalPeriodo: r.totalRegistros, naPagina: todos.length,
      filtroFederal: federal, dados };
  }

  async function mpvs(s) {
    const ano = s.get('ano') || new Date().getFullYear();
    const r = await getJson(`${CAM}/proposicoes?${q({ siglaTipo: 'MPV', ano, itens: 30, ordem: 'DESC', ordenarPor: 'id' })}`, 10 * 60_000);
    return { fonte: 'Câmara dos Deputados — proposições (MPV)', dados: r.dados.map(p => ({ id: p.id, sigla: `MPV ${p.numero}/${p.ano}`, ementa: p.ementa,
      apresentacao: p.dataApresentacao, url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${p.id}` })) };
  }

  // ----- Portal da Transparência (requer chave) -----
  const PT_ROTAS = {
    despesas: (s) => ({ rota: 'despesas/por-orgao', params: { ano: s.get('ano') || new Date().getFullYear(), orgaoSuperior: s.get('orgaoSuperior'), pagina: s.get('pagina') || 1 } }),
    contratos: (s) => ({ rota: 'contratos', params: { codigoOrgao: s.get('orgao') || '26000', dataInicial: br(s.get('de') || dias(180)), dataFinal: br(s.get('ate') || today()), pagina: s.get('pagina') || 1 } }),
    emendas: (s) => ({ rota: 'emendas', params: { ano: s.get('ano') || new Date().getFullYear(), nomeAutor: s.get('autor'), pagina: s.get('pagina') || 1 } }),
    viagens: (s) => ({ rota: 'viagens', params: { codigoOrgao: s.get('orgao') || '26000', dataIdaDe: br(s.get('de') || dias(60)), dataIdaAte: br(s.get('ate') || today()),
      dataRetornoDe: br(s.get('de') || dias(60)), dataRetornoAte: br(s.get('ate') || today()), pagina: s.get('pagina') || 1 } }),
  };
  async function transparencia(recurso, s) {
    const chave = chaveTransparencia();
    if (!chave) return { configurado: false, mensagem: 'Chave do Portal da Transparência não configurada. Cadastre o e-mail em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email e defina PORTAL_TRANSPARENCIA_KEY (veja .env.example).' };
    const f = PT_ROTAS[recurso];
    if (!f) return { configurado: true, erro: 'recurso desconhecido' };
    const { rota, params } = f(s);
    try {
      const dados = await getJson(`${PT}/${rota}?${q(params)}`, 10 * 60_000, { 'chave-api-dados': chave });
      return { configurado: true, fonte: `Portal da Transparência — ${rota}`, dados: Array.isArray(dados) ? dados : [] };
    } catch (e) {
      return { configurado: true, erro: e.status === 401 || e.status === 403 ? 'Chave recusada pelo Portal da Transparência.' : e.message };
    }
  }

  return async (p, s) => {
    if (p === '/api/executivo/status') return { compras: true, transparencia: !!chaveTransparencia() };
    if (p === '/api/executivo/contratos') return contratos(s);
    if (p === '/api/executivo/contratacoes') return contratacoes(s);
    if (p === '/api/executivo/mpvs') return mpvs(s);
    if (p.startsWith('/api/transparencia/')) return transparencia(p.split('/').pop(), s);
    return null;
  };
};
