# Observatório Legislativo

Plataforma de inteligência legislativa baseada em dados oficiais da Câmara dos Deputados e do Senado Federal: o que parlamentares votam, quanto gastam, quais projetos apresentam e o que acontece com cada proposta.

> Status: **planejamento** — nenhuma linha de código ainda. Projeto independente do app de eleições (pasta pai).

## Fontes oficiais

- Câmara — API de Dados Abertos: https://dadosabertos.camara.leg.br/swagger/api.html (deputados, proposições, votações, eventos, órgãos, despesas)
- Senado — API de Dados Abertos: https://legis.senado.leg.br/dadosabertos/api-docs/swagger-ui/index.html (limite de requisições; usar apenas endpoints atuais, pois alguns antigos estão sendo descontinuados)
- Portal de transparência da Câmara (cota parlamentar, verba de gabinete, viagens)

Decisão de arquitetura: **conectores separados** para Câmara e Senado, normalizando em um modelo comum, mas preservando fonte, identificadores oficiais e links para os documentos originais.

## Módulos

1. **O que aconteceu hoje** — sessões, reuniões, audiências, votações, discursos; eventos previstos/realizados/cancelados.
2. **Como cada parlamentar votou** — voto individual, orientação partidária, ausência × obstrução × abstenção.
3. **O que estão legislando** — projetos, autoria, relatoria, tramitação, prazos.
4. **Quanto custa a atividade parlamentar** — despesas por categoria, fornecedor, data e parlamentar.
5. **Quem participa das decisões** — comissões, lideranças, autores, vínculos formalmente registrados (sem presumir irregularidades).
6. **Alertas e monitoramento** — votação, mudança de relator, nova despesa, pauta de comissão.

## Arquitetura prevista

Fontes oficiais → conectores de ingestão (incremental, paginação, retentativas, limites) → PostgreSQL → busca textual → camada de análise → app React.

| Camada | Tecnologia |
| --- | --- |
| Interface | React + TypeScript + Vite |
| Backend | Node.js + TypeScript + Fastify (monolito modular; workers de coleta separados) |
| Persistência | PostgreSQL |
| Cache e tarefas | Redis + BullMQ |
| Pesquisa | PostgreSQL Full Text Search |
| Atualização ao vivo | Server-Sent Events |
| Gráficos | Apache ECharts ou Recharts |

Sem microserviços no início. Sempre informar a data efetiva de atualização de cada fonte; não prometer tempo real quando a origem não garante.

## Regra de rigor: classificação de cada informação

- **Fato oficial** — consta em registro da Câmara ou do Senado.
- **Análise** — cálculo da aplicação a partir de dados identificados.
- **Contexto** — informação complementar, com fonte.
- **Alegação** — afirmação atribuída a alguém, não necessariamente comprovada.
- **Pendência de verificação** — dado incompleto, divergente ou indisponível.

A IA é assistente de pesquisa documental (respostas com links, datas e trechos comprobatórios), nunca juíza: não infere corrupção de despesas altas nem trata voto não registrado como prova de ausência física.

## Plano do MVP

| Etapa | Entrega |
| --- | --- |
| 1 | Integração com as APIs oficiais e catálogo de fontes |
| 2 | Agenda diária e linha do tempo de atividades |
| 3 | Busca de parlamentares, projetos e votações |
| 4 | Perfis individuais com histórico legislativo |
| 5 | Despesas e indicadores com filtros por período |
| 6 | Alertas personalizados e pesquisa com IA |

## Ampliação de escopo: Observatório dos Três Poderes

O projeto passa a visar **Executivo, Legislativo e Judiciário** (esfera federal na 1ª versão; estados e municípios depois), com linha do tempo integrada de decisões. Regra de ouro: relações entre registros só existem com evidência documental ou marcadas explicitamente como hipótese; proximidade no tempo não é causalidade.

| Poder | Fontes previstas | Acesso | Status |
| --- | --- | --- | --- |
| Legislativo | API Câmara, Dados Abertos Senado | aberto | **protótipo funcionando** (parcial) |
| Executivo | Compras.gov.br (contratos e contratações PNCP), medidas provisórias (via API da Câmara), Portal da Transparência, Portal da Legislação | Compras e MPVs: aberto · Transparência: **chave de API** · Legislação: sem API, bloqueia acesso automatizado (só links) | **Compras e MPVs funcionando**; Transparência pronto, aguardando chave (`.env`, veja `.env.example`; conector não testado com chave real) |
| Judiciário | DataJud (CNJ), portais de STF/STJ/TSE/tribunais | DataJud exige **chave pública/autenticação do CNJ** | não iniciado |

Cobertura sugerida para o primeiro ciclo: Executivo federal, Câmara, Senado, STF e CNJ. Ordem de desenvolvimento: (1) fundação — catálogo de fontes, modelo comum, proveniência; (2) painel diário dos três Poderes e busca por órgão/pessoa/assunto/data; (3) transparência financeira; (4) tramitações, pautas e decisões; (5) correlação, IA e alertas com citações verificáveis.

Pendências para avançar: obter a chave do Portal da Transparência e o acesso ao DataJud; decidir se o Executivo (atos/MPs, compras) ou o Judiciário entra primeiro.

### Judiciário (implementado)

- **DataJud/CNJ:** conector pronto em `judiciario.js` (consulta por número único; o tribunal é identificado pelo próprio número e o dígito verificador é validado). Exige chave: defina `DATAJUD_API_KEY` no `.env` (a chave pública é divulgada pelo CNJ na documentação da API). Sem a chave, a tela já valida o número, mas não consulta o processo. Não testado contra a API real.
- **STF e demais tribunais:** sem API aberta; os portais bloqueiam acesso automatizado. A aba só oferece links oficiais.

### Módulo "Desempenho e Atuação Pública" (primeira entrega)

Princípios: indicadores independentes, **sem nota única e sem ranking**; fonte e limitações visíveis; dado não integrado nunca vira "desempenho zero"; comparar só parlamentares com mesmo cargo, período e atribuições.

Dimensões previstas: produção legislativa, fiscalização, orçamento e recursos, participação, resultados/impacto, transparência documental.

| Dimensão | Já no perfil | Falta |
| --- | --- | --- |
| Produção | proposições de autoria no ano, por tipo (deputados) | conversão em lei, tempo de tramitação, autoria × coautoria × relatoria |
| Participação | votações nominais e códigos de voto na janela (senadores) | presença em sessões e votações dos deputados; contexto de licenças |
| Fiscalização | — | requerimentos, respostas, providências |
| Orçamento | despesas da cota (depende da API) | emendas empenhadas/pagas |
| Impacto / Transparência | — | metodologia de atribuição (TCU), categorias separadas para investigações e condenações |

Próximas entregas: perfil histórico, comparações contextualizadas, relatórios com IA citando os documentos originais, e extensão da metodologia a ministros e órgãos.

## Decisão tomada

Experiência principal do MVP: **ferramenta de consulta para qualquer cidadão** (investigação avançada, cruzamentos e alertas ficam para depois).

## Como rodar (protótipo atual)

```
node server.js     # http://localhost:3100 — Node 18+, sem dependências
```

Implementado: agenda e votações do dia (Câmara + Senado), votações dos últimos 14 dias com resumo por partido, busca de parlamentares com perfil (deputado: projetos, órgãos, discursos, despesas; senador: votos nominais recentes) e busca de projetos da Câmara com tramitação.

Limitações conhecidas: a API de despesas da Câmara retornou vazio nos testes (a tela mostra "pendência de verificação"); agenda, projetos e despesas do Senado ainda não integrados; sem banco de dados (cache em memória); sem alertas nem IA.
