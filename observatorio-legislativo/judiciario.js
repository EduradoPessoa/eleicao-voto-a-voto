// Conectores do Poder Judiciário.
//  - DataJud (CNJ): metadados e movimentações de processos públicos. A API exige chave ("APIKey");
//    o CNJ publica a chave pública na documentação. Defina DATAJUD_API_KEY (env ou .env). Conector pronto, ativa-se com a chave.
//  - STF e demais tribunais: sem API aberta para consulta automatizada (portais com bloqueio a robôs); o app só gera links oficiais.
// Nenhuma informação sigilosa é tratada: o DataJud só expõe processos públicos.
const fs = require('fs');
const path = require('path');

const DATAJUD = 'https://api-publica.datajud.cnj.jus.br';
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SE SP TO'.split(' '); // ordem dos códigos TR 01..27

function chave() {
  if (process.env.DATAJUD_API_KEY) return process.env.DATAJUD_API_KEY.trim();
  try {
    const m = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').match(/^\s*DATAJUD_API_KEY\s*=\s*(.+?)\s*$/m);
    return m ? m[1].replace(/^["']|["']$/g, '') : null;
  } catch { return null; }
}

// Número único CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
function analisaNumero(txt) {
  const n = String(txt || '').replace(/\D/g, '');
  if (n.length !== 20) return { ok: false, erro: 'O número único do processo tem 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO).' };
  const seq = n.slice(0, 7), dv = n.slice(7, 9), ano = n.slice(9, 13), j = n[13], tr = n.slice(14, 16), orig = n.slice(16);
  const calc = 98n - ((BigInt(seq + ano + j + tr + orig + '00')) % 97n);
  const dvOk = String(calc).padStart(2, '0') === dv;
  const t = Number(tr), uf = UFS[t - 1];
  let alias = { 1: 'stf', 3: 'stj', 7: 'stm', 2: null }[j] ?? (j === '4' ? `trf${t}` : j === '5' ? `trt${t}` : j === '6' && uf ? `tre-${uf.toLowerCase()}` : j === '8' && uf ? `tj${uf.toLowerCase()}` : j === '9' && uf ? `tjm${uf.toLowerCase()}` : null);
  if (alias === 'tjdf') alias = 'tjdft'; // alias do DataJud para o TJDFT
  const ramo = { 1: 'Supremo Tribunal Federal', 2: 'Conselho Nacional de Justiça', 3: 'Superior Tribunal de Justiça', 4: 'Justiça Federal', 5: 'Justiça do Trabalho', 6: 'Justiça Eleitoral', 7: 'Justiça Militar da União', 8: 'Justiça Estadual', 9: 'Justiça Militar Estadual' }[j];
  return { ok: true, numero: n, formatado: `${seq}-${dv}.${ano}.${j}.${tr}.${orig}`, dvOk, ano, ramo, alias };
}

module.exports = ({ getJson }) => {
  async function processo(s) {
    const a = analisaNumero(s.get('numero'));
    if (!a.ok) return { erro: a.erro };
    const base = { numero: a.formatado, ramo: a.ramo, tribunal: a.alias, digitoVerificadorValido: a.dvOk };
    if (!a.dvOk) return { ...base, erro: 'Dígito verificador inválido: confira o número digitado.' };
    if (!a.alias) return { ...base, erro: 'Não foi possível identificar o tribunal pelo número.' };
    const k = chave();
    if (!k) return { ...base, configurado: false, mensagem: 'Chave do DataJud não configurada. Veja a aba para instruções.' };
    const res = await fetch(`${DATAJUD}/api_publica_${a.alias}/_search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `APIKey ${k}`, 'User-Agent': 'ObservatorioLegislativo/0.1' },
      body: JSON.stringify({ size: 5, query: { match: { numeroProcesso: a.numero } } }),
    });
    if (res.status === 401 || res.status === 403) return { ...base, configurado: true, erro: 'Chave do DataJud recusada.' };
    if (!res.ok) return { ...base, configurado: true, erro: `DataJud respondeu HTTP ${res.status}.` };
    const hits = (await res.json()).hits?.hits || [];
    return { ...base, configurado: true, fonte: 'DataJud (CNJ) — API Pública', encontrados: hits.length, dados: hits.map(({ _source: p }) => ({
      grau: p.grau, classe: p.classe?.nome, assuntos: (p.assuntos || []).map(x => x.nome), orgaoJulgador: p.orgaoJulgador?.nome, ajuizamento: p.dataAjuizamento,
      atualizacao: p.dataHoraUltimaAtualizacao, nivelSigilo: p.nivelSigilo,
      movimentos: (p.movimentos || []).sort((x, y) => String(y.dataHora).localeCompare(String(x.dataHora))).slice(0, 15).map(m => ({ data: m.dataHora, nome: m.nome, complementos: (m.complementosTabelados || []).map(c => c.nome) })) })) };
  }
  return async (p, s) => {
    if (p === '/api/judiciario/status') return { datajud: !!chave() };
    if (p === '/api/judiciario/processo') return processo(s);
    return null;
  };
};
module.exports.analisaNumero = analisaNumero;
