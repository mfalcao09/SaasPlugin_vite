# E5 / run 001 — preparação pré-gate Meta Ads CTWA

```yaml
stage: E5
run: "001"
subject:
  branch: "ops/meta-ads-ctwa-draft"
  base:
    branch: "origin/main"
    sha: "4870ac669ce5800118a10f89122b9f41f3af936a"
  head:
    sha: "PENDING_PR_HEAD"
    binding: "O verifier registra o SHA real da PR depois do commit; este arquivo nao pode auto-referenciar o commit que o contem."
  environment: "local + production-read-only"
collected_at: "2026-08-08T08:52:27Z"
actor: "operations-agent"
verdict: "FAIL"
```

> `FAIL` é deliberado e honesto: esta execução cobre **somente a pré-gate**. Os critérios externos `spend-cap` e `destination`, a definição dos parâmetros e a criação do draft continuam pendentes. Nenhuma escrita na Meta, alteração de spend limit, definição de teto na conta, criação/publicação de campanha ou mudança de secret foi realizada.

## Limites desta execução

> As marcações abaixo são atestações do executor sobre as ferramentas invocadas nesta run; não constituem audit log externo da Meta ou do meio de pagamento. O verifier deve confirmar independentemente o histórico da conta antes de emitir `PASS`. Por isso o veredito desta preparação permanece `FAIL`.

- [x] Somente leitura local e leitura de **nomes** de configuração autenticada.
- [x] Nenhum valor de secret foi solicitado, impresso ou registrado.
- [x] Nenhuma chamada de escrita à Meta/Graph.
- [x] Nenhuma alteração de spend limit ou teto.
- [x] Nenhuma campanha, ad set ou anúncio criado, editado, pausado ou publicado.
- [x] Nenhum delivery ou gasto provocado.
- [x] Nenhuma configuração de produção alterada.

## Checklist redigido de ativos

Identificadores ficam redigidos neste artefato. A conferência pós-gate deve comparar os objetos na UI/API read-only, sem colar IDs integrais no Git.

| Objeto | Identificador | Estado pré-gate | Critério para confirmar |
|---|---|---|---|
| Business Manager | `[REDACTED / PENDENTE]` | Pendente externo | Business correto controla App, Página, conta e WABAs esperados |
| Meta App | `[REDACTED / PENDENTE]` | Pendente externo | App correto vinculado ao Business e aos ativos necessários |
| Facebook Page | `[SLOT: FACEBOOK_PAGE_ID]` | Pendente externo | Página escolhida e vinculada ao destino de vendas |
| Ad account | `[SLOT: AD_ACCOUNT_ID]` | Pendente externo | Conta correta, sem bloqueio operacional; moeda/fuso conferidos |
| Pixel/dataset | `[SLOT: DATASET_ID_CONFIRMADO]` | **Nome da config presente; identidade não confirmada** | ID da config coincide com o dataset selecionado na conta |
| WABA demo | `[REDACTED / PENDENTE]` | Pendente externo | Identificado como demo; não pode ser destino por engano |
| Número demo | `[REDACTED / PENDENTE]` | Pendente externo | Preview não abre este número se o destino aprovado for vendas |
| WABA vendas | `[REDACTED / PENDENTE]` | Pendente externo | WABA oficial de vendas vinculada à Página/destino escolhido |
| Número vendas | `[SLOT: DESTINO_OFICIAL_REDACTED]` | Pendente externo | Preview CTWA abre exatamente o número oficial aprovado |

## Parâmetros que Marcelo precisa aprovar

Nenhum slot abaixo está aprovado por inferência ou silêncio.

| Parâmetro | Slot explícito | Estado |
|---|---|---|
| Facebook Page ID | `[SLOT: FACEBOOK_PAGE_ID]` | Pendente |
| Conta de anúncio | `[SLOT: AD_ACCOUNT_ID]` | Pendente |
| Dataset confirmado | `[SLOT: DATASET_ID_CONFIRMADO]` | Pendente de correspondência; presença da config não basta |
| Teto máximo de gasto | `[SLOT: TETO_TOTAL_BRL]` | Pendente |
| Budget diário/total do canário | `[SLOT: BUDGET_DIARIO_BRL]` / `[SLOT: BUDGET_TOTAL_BRL]` | Pendente |
| Duração | `[SLOT: INICIO_ISO]` → `[SLOT: FIM_ISO]` (`[SLOT: DURACAO_DIAS]`) | Pendente |
| Criativo e copy | `[SLOT: CREATIVE_ASSET_REF]` / `[SLOT: COPY_FINAL]` | Pendente |
| Destino CTWA | `[SLOT: WABA_VENDAS_REDACTED]` / `[SLOT: NUMERO_OFICIAL_REDACTED]` | Pendente |

## Gates

### Gate técnico pré-APROVO

- [x] Branch/base/head conferidos; head inicial coincide com `origin/main` em `4870ac6`.
- [x] Manifesto do go-live válido.
- [x] Testes locais CTWA, CAPI e ads optimize verdes.
- [x] `ADS_MUTATIONS_ENABLED` não está presente na listagem autenticada; no código, ausência mantém o default `false`.
- [ ] Business/App/Página/ad account/WABAs conferidos em fonte Meta read-only.
- [ ] Spend limit atual, bloqueio e teto proposto documentados por evidência datada.
- [ ] Página → WABA/número de vendas conferida.
- [ ] Todos os slots de parâmetros preenchidos.
- [ ] Verifier distinto emite `PASS`.
- [ ] Reviewer distinto emite `SAFE`.

### Gate humano

Somente um `APROVO` explícito de Marcelo, associado ao conjunto preenchido de Página, conta, dataset, teto, budget, duração, criativo/copy e destino, permite iniciar a ação operacional limitada de E5. A aprovação também deve declarar o estado atual do spend limit, a ação exata autorizada e o teto final resultante. Aprovação genérica, silêncio ou aprovação parcial não autorizam nada.

Até esse `APROVO`, permanecem proibidos:

- alterar/remover spend limit ou definir teto na conta;
- criar, editar ou publicar campanha, ad set ou anúncio;
- executar qualquer mutação Meta/Graph;
- ativar ou mudar `ADS_MUTATIONS_ENABLED`, `ADS_OPTIMIZE_ENABLED`, `CAPI_ENABLED` ou outros secrets;
- enviar eventos CAPI, dados de leads ou qualquer tráfego de produção;
- usar WABA/número demo ou vendas em teste real.

Mesmo após o `APROVO` de E5:

- a campanha canário deve permanecer **draft/paused**, sem delivery;
- o teto, budget e duração aprovados não podem ser ampliados;
- `ADS_MUTATIONS_ENABLED` deve permanecer efetivamente `false`;
- publicação, primeiro gasto e clique real continuam proibidos até o gate humano separado de E6.

## Evidências coletadas

### 1. Manifesto do go-live

```text
$ npm run validate:golive-plan
exit_code: 0
PASS: 10 stages, 30 binary criteria, 7 human gates, acyclic DAG, all paths reach E9
```

### 2. Testes locais sem rede

```text
$ deno test supabase/functions/_shared/ctwa-attribution.test.ts supabase/functions/_shared/capi-payload.test.ts supabase/functions/_shared/ads-optimize-rules.test.ts
exit_code: 0
CTWA: 5 passed
CAPI: 5 passed
ads optimize: 13 passed
TOTAL: 23 passed, 0 failed
```

Esses testes provam apenas os contratos puros locais. Não provam vínculo de ativos, estado da conta, destino do preview, delivery ou integração Meta em produção.

### 3. Presença/ausência de configurações

Leitura autenticada no projeto de produção, com `pipefail` e filtro local que descartou valores/digests e imprimiu apenas nomes-alvo:

```text
$ set -o pipefail; supabase secrets list --project-ref "$SUPABASE_PROJECT_REF" -o json | node <filtro-de-nomes>
exit_code: 0
ADS_MUTATIONS_ENABLED: ABSENT
ADS_OPTIMIZE_ENABLED: ABSENT
CAPI_ENABLED: PRESENT
META_CAPI_DATASET_ID: PRESENT
META_CAPI_WABA_ID: PRESENT
```

Interpretação limitada:

- `ADS_MUTATIONS_ENABLED: ABSENT` + default seguro no código ⇒ mutações reais permanecem desativadas;
- `ADS_OPTIMIZE_ENABLED: ABSENT` implica o default local documentado do gerador de recomendações, mas não autoriza aplicação;
- `PRESENT` não revela nem prova valor, identidade ou estado habilitado;
- especialmente, `CAPI_ENABLED: PRESENT` **não** permite afirmar `true` ou `false`;
- dataset e WABA ainda exigem correspondência read-only com os ativos aprovados.

### 4. Git

```text
$ git status --short --branch
exit_code: 0
## ops/meta-ads-ctwa-draft...origin/main

$ git rev-parse HEAD
exit_code: 0
4870ac669ce5800118a10f89122b9f41f3af936a

$ git rev-parse origin/main
exit_code: 0
4870ac669ce5800118a10f89122b9f41f3af936a
```

## Roteiro do verifier

Todos os comandos devem ser executados a partir de `apps/NexvyBeauty`, exceto os comandos Git, que podem rodar na raiz do worktree.

### Reproduzir evidência local

```bash
npm run validate:golive-plan
deno test \
  supabase/functions/_shared/ctwa-attribution.test.ts \
  supabase/functions/_shared/capi-payload.test.ts \
  supabase/functions/_shared/ads-optimize-rules.test.ts
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

### Conferir somente nomes de configurações

O verifier deve usar um comando que projete **somente o campo `name`** e compare apenas os nomes esperados. Nunca imprimir JSON bruto, valor, digest ou token. Exemplo:

```bash
set -o pipefail
supabase secrets list --project-ref "$SUPABASE_PROJECT_REF" -o json |
  node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const rows=JSON.parse(s);const names=new Set((Array.isArray(rows)?rows:Object.values(rows)).map(x=>typeof x==="string"?x:x?.name).filter(Boolean));for(const n of ["ADS_MUTATIONS_ENABLED","ADS_OPTIMIZE_ENABLED","CAPI_ENABLED","META_CAPI_DATASET_ID","META_CAPI_WABA_ID"])console.log(`${n}: ${names.has(n)?"PRESENT":"ABSENT"}`)})'
```

### Conferência externa read-only

1. Abrir Business Settings/Ads Manager sem editar nenhum objeto.
2. Registrar screenshot datado e redigido da conta, status de spend limit e teto atual/proposto.
3. Conferir Business, App, Página, conta, dataset, WABA demo e WABA vendas.
4. Conferir que a Página selecionada aponta ao número oficial de vendas.
5. Após o gate humano de E5 e criação autorizada do draft, conferir em read-only que campanha/ad set/anúncio estão `DRAFT` ou `PAUSED`, com budget/duração idênticos aos aprovados e zero delivery.
6. Não clicar em publicar e não disparar preview para conversa real.

## Critérios PASS/FAIL do verifier

| Critério | PASS | FAIL / parada |
|---|---|---|
| Base/head | Base correta, diff limitado à evidência E5 e SHA registrado | Base divergente ou diff fora do escopo |
| Testes | Manifesto `PASS`; 23/23 testes locais passam | Qualquer exit code não zero ou teste falho |
| `mutations-off` | Nome ausente ou valor verificado por canal seguro como não-`true`, com default do código `false`; nenhum write | Flag efetivamente `true`, estado indeterminado sem default seguro ou qualquer mutação |
| Ativos | Business/App/Página/conta/dataset/WABA demo/vendas conferidos e IDs redigidos | Ativo ambíguo, sem vínculo ou dataset divergente |
| `spend-cap` | Conta sem bloqueio impeditivo; teto aprovado e documentado; zero delivery | Teto ausente/ampliado, bloqueio, gasto/delivery ou spend limit alterado sem gate |
| `destination` | Preview read-only aponta exatamente ao número oficial aprovado | Número demo, número divergente ou destino não comprovado |
| Draft pós-gate | Objeto autorizado está draft/paused, parâmetros idênticos e zero delivery | Publicado/ativo, parâmetros divergentes ou criação antes de `APROVO` |
| Segredos/PII | Evidência contém somente presença/ausência e IDs redigidos | Valor, token, digest, telefone integral ou PII exposto |

## Pendências externas

- Identificar e conferir Business Manager, Meta App, Página, ad account, WABA demo e WABA vendas.
- Confirmar a identidade do dataset; a mera presença do nome da config não satisfaz o gate.
- Obter estado read-only do spend limit e documentar teto proposto.
- Preencher budget, duração, criativo/copy e destino.
- Obter aprovação técnica (`PASS` + `SAFE`) por papéis distintos.
- Obter `APROVO` explícito de Marcelo para o pacote exato.
- Só então executar a parte operacional limitada de E5; E6 continua separado.

## Menor input necessário de Marcelo para pós-gate

Uma única resposta contendo:

```text
APROVO E5:
Facebook Page ID=<...>
Ad account=<...>
Dataset confirmado=<...>
Spend limit atual=<estado + referencia da evidencia>
Acao exata autorizada no spend limit=<nenhuma | definir valor especifico; remover exige autorizacao literal>
Teto final resultante BRL=<...>
Budget diário/total BRL=<...>
Duração/início/fim=<...>
Criativo + copy aprovados=<referência inequívoca>
Destino=<WABA/número oficial de vendas, por referência segura>
```

Não incluir tokens ou secrets. Se os identificadores não puderem aparecer no chat, Marcelo pode preencher/confirmar os slots por referência redigida inequívoca em canal seguro.
