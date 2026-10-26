# Eleição Voto a Voto · SerBrasil

Dois aplicativos simples em Node.js (18+), sem dependências, baseados em dados abertos oficiais.

| App | Pasta | Porta | O que faz |
| --- | --- | --- | --- |
| **Apuração para TikTok** | raiz (`server.js` + `public/`) | 3000 | Tela vertical 9:16 com a apuração do 2º turno para Presidente (dados do TSE): placar, comparação 1º × 2º turno por região e estado, mapa de blocos e progresso da apuração por UF. |
| **Observatório dos Três Poderes** | [`observatorio-legislativo/`](observatorio-legislativo/) | 3100 | Consulta cidadã a Legislativo, Executivo e Judiciário: agenda e votações, parlamentares, projetos, contratos e compras públicas, medidas provisórias, processos (DataJud). Veja o [README próprio](observatorio-legislativo/README.md). |

## Como rodar

```bash
# Apuração (TikTok)
node server.js                          # http://localhost:3000

# Observatório
cd observatorio-legislativo
node server.js                          # http://localhost:3100
```

Chaves de API opcionais do Observatório (Portal da Transparência e DataJud) ficam em `observatorio-legislativo/.env` — copie de `.env.example`. **Nunca versione o `.env`.**

## App de apuração (TSE)

- Fonte: `resultados.tse.jus.br/oficial/ele2026/{6257 = 1º turno | 6258 = 2º turno}/dados/{uf}/{uf}-c0001-e00{cod}-u.json` (Brasil, 27 UFs e exterior).
- O servidor busca e normaliza os arquivos (2º turno a cada 30 s, 1º turno a cada hora), respeita bloqueios do TSE (pausa de 10 min em 403/429) e a tela avisa quando os dados estão desatualizados.
- Slides: placar nacional · Brasil 1º × 2º turno · regiões · estados (3 telas) · mapa de blocos. Mostra também quais regiões e estados já concluíram a apuração.
- Parâmetros da URL: `?auto=0` (sem rotação), `?slide=N`, `?s=12` (segundos por slide). Setas do teclado trocam de slide.
- Os valores exibidos vêm dos arquivos oficiais; nada é estimado ou inventado. Apuração parcial é identificada como tal.

## Observatório dos Três Poderes

Resumo do estado atual (detalhes no [README do Observatório](observatorio-legislativo/README.md)):

- **Legislativo:** últimos 10 movimentos da Câmara e do Senado (com detalhes de pauta, participantes e documentos), votações com resumo por partido, perfis de deputados e senadores com indicadores de atuação (sem nota única nem ranking), busca de projetos e tramitação.
- **Executivo:** contratos e contratações (Compras.gov.br / PNCP), medidas provisórias e conector do Portal da Transparência (ativa com chave).
- **Judiciário:** consulta por número de processo via DataJud (ativa com chave); STF e demais tribunais por links oficiais.
- Cada informação mostra sua origem e o link para o registro oficial; dados indisponíveis aparecem como "pendência de verificação", nunca como zero.

## Aviso

Projeto independente, sem vínculo com órgãos públicos. Os dados dependem da publicação de cada fonte e não são garantidamente em tempo real. Os painéis não fazem juízo sobre pessoas ou instituições.
