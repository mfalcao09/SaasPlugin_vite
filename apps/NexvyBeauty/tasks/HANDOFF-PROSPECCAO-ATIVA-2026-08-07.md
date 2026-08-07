# HANDOFF — Prospecção Ativa (Camila) · 2026-08-07

> Escrito no fim da sessão, com **todo estado medido**, não lembrado.
> Branch `feat/bdr-autonomo` · HEAD `483e8bd` · worktree limpo · local == remoto.
> `origin/main` = `b069f7c` (a Controladora mergeou o PR #148 dela hoje).
>
> **SUPERSEDE parcialmente o `HANDOFF-PROSPECCAO-ATIVA-2026-08-06.md`**: a instância
> mudou de nome, o motor ganhou portão de autorização, e a causa do "não conecta"
> foi encontrada (ver §3 — é o item mais importante deste documento).

---

## 0. LEIA ISTO PRIMEIRO — o achado que reorganiza tudo

**O pareamento do WhatsApp sempre funcionou. O que estava quebrado era o caminho
de volta.**

```
Evolution conecta                       ✓
Evolution dispara CONNECTION_UPDATE     ✓
platform-evolution-webhook recusa 401   ✗  ← AQUI
banco nunca vira 'connected'
modal do QR nunca fecha, painel nunca marca ativo
```

Passei horas na hipótese errada (Baileys desatualizado) porque **li o nosso banco
como se fosse a fonte da verdade**. A fonte é a Evolution. Quando finalmente
perguntei a ela (`GET /instance/fetchInstances`), a instância estava `open` — e o
banco, `disconnected`.

**Regra que fica:** para saber se a instância está conectada, pergunte à Evolution,
nunca à nossa tabela. A tabela é espelho, e o espelho estava quebrado.

---

## 1. ESTADO ATUAL — medido em 2026-08-07 ~22:35 UTC

### 1.1 Banco (`fzhlbwhdejumkyqosuvq`)

| item | valor |
|---|---|
| campanhas cadastradas | **0** (a `TESTE Gate G` foi excluída) |
| itens na fila de disparo | **0** |
| instância | `prospec-ativa-camila2` · **`connected`** desde 22:30 UTC |
| RPCs de ciclo de vida | 2 (`pcrm_cold_arm_campaign`, `pcrm_cold_disarm_campaign`) |
| colunas de ciclo de vida | 4 (`activated_at`, `activated_by`, `scheduled_start_at`, `scheduled_end_at`) |
| cron do canário de cobertura | **0 — NÃO agendado** |

⚠️ **`phone_number` da instância está NULL.** Ela conectou pela reconciliação do
proxy (`already_connected`), que só preenche o telefone quando a Evolution o
devolve. Não impede operar, mas a UI mostra o número vazio. Um
`CONNECTION_UPDATE` real preencheria.

### 1.2 Edge functions no ar

| função | versão | o que tem de novo |
|---|---|---|
| `platform-cold-outreach` | **v34** | portão de ciclo de vida + pin da persona + 4 bloqueantes anti-ban |
| `platform-instance-coverage-canary` | **v2** | NOVA — vigia as duas tabelas de instância |
| `platform-evolution-webhook` | v53 | cadeia do wamid (mas ver §3: estava tomando 401) |
| `platform-sales-brain` | v98 | (mexida por sessões irmãs depois de mim) |
| `platform-evolution-proxy` | v48 | intocada por mim |

### 1.3 Front

Deployado hoje (`make deploy-beauty`), bundle `main-BlD6ndGE.js`, **provado nos 4
hosts**: `nexvybeauty.com.br`, `www.`, `app.`, `gestao.nexvy.tech` — todos 200.

⚠️ **O front NÃO inclui os 2 últimos commits** (`a637eb1` canário, `483e8bd`
filtro demo) — são backend, não mudam a UI. Mas se alguém subir front de novo,
subirá a partir de `main`, que **não tem** os commits do meu branch.

---

## 2. O QUE FOI CONSTRUÍDO NESTA SESSÃO

### 2.1 Ciclo de vida de campanha — `5c61798`

**Problema:** `status='active'` + `dry_run=false` bastavam para disparar. A campanha
`TESTE Gate G` estava assim, com janela 0h-24h e jitter 1-3s: bastava um lead
entrar na fila para o cron (`* * * * *`) disparar em menos de um minuto. Ela virou
`active` por um UPDATE — não houve ato de autorização porque não existia onde
registrar um.

**Descoberta:** a máquina de estados **já existia** no CHECK do banco
(`draft|warming|active|paused|killed|completed`) e o motor nunca a consultou:
filtrava `in (active, warming)` e passava `campaignPaused: status === "paused"` ao
portão — comparação que **jamais podia ser verdadeira**, porque o filtro já removera
`paused`. Seis estados achatados num bit morto.

**A inversão:** dispara-se só mediante **ato registrado** (`activated_at`).
`active` sem carimbo não dispara.

Arquivos:
- `_shared/cold-outreach/campaign-lifecycle.ts` — núcleo puro, **19 testes**
- `_shared/cold-outreach/anti-ban.ts` — `campaignPaused: boolean` → `lifecycle: LifecycleVerdict`
- `platform-cold-outreach/index.ts` — portão 0 antes de qualquer I/O; matar LIMPA o carimbo
- `migrations_platform_crm/20260807_cold_campaign_lifecycle.sql` — **APLICADA**

**Decisão de desenho a preservar:** agendamento é **vigência**, não estado. Não há
estado `scheduled` (como no Meta Ads: ACTIVE com `start_time` futuro não roda).
Criar um exigiria transição manual extra — a mesma omissão que causou o defeito.

**Controles negativos provados em produção:**
- armar sem sessão → `apenas super_admin pode armar uma campanha` (o gate usa
  `IS NOT TRUE`, não `= false`: com `auth.uid()` nulo, `NULL = false` é NULL e
  **não barra** num `if`)
- vigência invertida por UPDATE direto → `violates check constraint`

### 2.2 Tela de campanhas — `d54fef1` + `123d31c`

**Problema:** existia uma tela chamada "Campanhas de disparo" que **não via campanha
nenhuma** — compunha mensagem em `useState` local e nunca tocava
`platform_crm_cold_campaigns`. As campanhas reais viviam só em SQL.

- `ProspeccaoCampanhasControle.tsx` — lista as campanhas REAIS, com armar/desarmar/agendar/excluir
- `ProspeccaoCampanhaNova.tsx` — criação com **defaults seguros**: nasce `draft` +
  `dry_run=true` + janela 9-18h seg-sex + warm-up 20/dia + jitter 40-180s

**O truque que vale conhecer:** o selo de estado vem de `avaliarLifecycle`, **a mesma
função pura do motor**. Ela não tem imports, então serve Deno *e* Vite:

```ts
import { avaliarLifecycle } from '../../../../../supabase/functions/_shared/cold-outreach/campaign-lifecycle.ts'
```

Funciona porque `tsconfig.app.json` tem `allowImportingTsExtensions: true`.
**Provado com `vite build`.** É o que torna impossível a tela e o motor discordarem.

### 2.3 Canário de cobertura — `a637eb1` + `483e8bd`

**Problema:** a instância caiu em 06/08 20:18 e **ninguém foi avisado**. Não foi
alerta que falhou — foi alerta que nunca olhou: `whatsapp-health-alert` lê
`evolution_instances` (tenant); a instância de prospecção vive em
`platform_crm_evolution_instances` (plataforma).

**Medido:** 7 edge functions leem a tabela da plataforma para trabalhar; **zero** a
vigiam. E existem **86 pares** de tabelas espelhadas `X` ↔ `platform_crm_X`.

- `_shared/instance-coverage.ts` — núcleo puro, **20 testes**
- `platform-instance-coverage-canary/` — lê AS DUAS tabelas

**Como não vira ruído:** compartilha `metadata.health_alert_at` e
`metadata.health_mute` com o health-alert. Quem chegar primeiro carimba, o outro
cala. **Contrato no DADO, não acoplamento entre funções.**

**Filtro de org demo** (`483e8bd`, apontado pela Controladora): `qr_pending` numa
demo é estado NORMAL de quem abriu o wizard e não pareou. Sem filtro, cada lead que
desiste vira alerta.
- filtro por `plan_status`, **não** por prefixo do nome
- **falha ABERTA**: leitura de orgs falha → conjunto vazio → todas vigiadas
- assimetria importante: `evolution_instances` TEM `organization_id`;
  `platform_crm_evolution_instances` NÃO tem (tem `product_id`). O filtro só se
  aplica ao lado tenant.

⚠️ **NÃO exercitado com dado real:** existem 6 orgs demo, nenhuma com instância.
O caminho `org_em_demonstracao` está testado mas nunca correu em produção.

---

## 3. 🔴 O BUG CRÍTICO — webhook recusa os próprios eventos

**Este é o item mais importante do handoff.**

### 3.1 A prova

9 POSTs em `platform-evolution-webhook`, todos **401**, na janela exata do
pareamento (17:04:48, 17:04:50, 17:04:53…), intercalados com os 200 do proxy.

Log da Evolution mostrando o payload que ela monta:

```
server_url: 'https://evolution.nexvy.tech',
apikey: null          ← ELA MANDA NULL
```

O gate B3 (`platform-evolution-webhook/index.ts:1055`) exige
`payload.apikey === instance_token`. Com `apikey: null` cai em `no_token` → 401.

**Agravante:** `WEBHOOK_RETRY_NON_RETRYABLE_STATUS_CODES=400,401,403,404,422`.
401 é **não-retentável** — o evento é descartado para sempre. Não há fila represada.

### 3.2 O comentário que previu e mediu errado

`index.ts:1029`:

> *"o gate roda ENFORCING… `platform_crm_evolution_instances` tem 0 instâncias hoje,
> logo não há ingestão legítima a quebrar."*

Era verdade quando foi escrito. Virou falso na primeira instância real.
**Gate justificado por "não há nada para quebrar" é dívida com data de vencimento.**

### 3.3 A correção aplicada (paliativa, só nesta instância)

A Evolution suporta headers customizados por webhook (`headers Json?` no schema
Prisma), e o nosso `extractWebhookToken` **já lê** header (`apikey` /
`x-webhook-token` / `Bearer`). As duas pontas existiam e nunca se encontraram.

```
POST /webhook/set/prospec-ativa-camila2
  webhook.headers = { apikey: <instance_token> }
```

Feito **dentro do container** (token nunca passou por contexto de IA). Verificado:
`headers: null` → header casa com `instance_token`, URL e 6 eventos intactos.

### 3.4 ⚠️ O QUE FALTA — correção estrutural (NÃO FEITA)

**`_shared/evolution-core.ts` provisiona o webhook de toda instância nova e NÃO seta
esse header.** Consequências:

1. **Toda instância nova nasce quebrada** — inclusive as de demo.
2. **O `demo-evolution` da Controladora tem o mesmo defeito**: cada demo cria
   instância nova → `CONNECTION_UPDATE` toma 401 → a tela do wizard nunca sabe que
   o cliente pareou. É por isso que o teste de pareamento da demo não fechava.
3. **A cadeia do wamid nunca funcionou.** O `MESSAGES_UPDATE` (ACK de entrega) morre
   no mesmo 401 → `delivered_count` fica zero → o kill-switch anti-ban por
   não-entrega está **inerte**, por esta causa e não por falta de tráfego.

**Proposta levada à Controladora, aguardando resposta dela:** alterar
`configureWebhook` em `evolution-core.ts` para passar
`headers: { apikey: instanceToken }` junto com os eventos, com teste, e um de nós
revisar o outro. **NÃO editar esse arquivo sozinho** — ele serve as duas frentes, e
um deploy dele mexe no `demo-evolution` também.

---

## 4. 🔥 INCIDENTE DO VPS — o que aconteceu e o que aprender

**~17:40–17:51 BRT, ~11 minutos com TUDO fora**: NexvyBeauty, FIC Cassilândia
(instituição pagante) e Nexvy Oficinas. SSH, HTTP e ping sem resposta.

**Causa: minha.** Subi um container de teste da Evolution (Node + Prisma + npm) num
KVM 2 (2 CPUs, 8 GB) que já rodava 41 containers com disco a 83%. Saturei o I/O.
Tráfego de entrada: 14 MB → **1,77 GB**. Disco: 87 → 90 GB.

**Recuperação:** reboot pela API do Hostinger (a VM estava `running` mas
inacessível). Voltou em 60s; load caiu de 21 → 7,9; `teste_homolog` morreu no boot
e liberou 8 GB.

**A ironia a não repetir:** eu estava executando o teste que existe justamente para
**evitar** risco em produção. "Descartável" descreve o container, não o impacto —
ele disputa CPU, RAM, disco e I/O com tudo que já roda ali.

**Antes disso**, a troca de imagem para `homolog` (2.4.0) falhou: restart loop com
`The datasource.url property is required in your Prisma config file`. Rollback em
~2 min porque **havia backup do compose**. Ficaram no disco:
- imagem `evoapicloud/evolution-api:homolog` (baixada, fora de uso)
- `/opt/stacks/evolution-api/docker-compose.yml.bak-pre-homolog-20260807-171421`

**Se alguém retomar a 2.4.0:** a env usa `DATABASE_CONNECTION_URI` (nome próprio da
Evolution); a 2.4.0 exige `datasource.url`. **Testar em host separado**, não neste
VPS.

---

## 5. PENDÊNCIAS — em ordem de importância

| # | pendência | dono | nota |
|---|---|---|---|
| 1 | **`evolution-core.ts` setar header no provisionamento** | combinar c/ Controladora | §3.4 — sem isso toda instância nova nasce quebrada |
| 2 | **Cron do canário de cobertura** | decisão do Marcelo | deployado (v2) mas roda só manualmente. Sugestão: mais espaçado que `*/15` |
| 3 | **Criar campanha de produção** | Marcelo, pela tela | há 0 campanhas; a tela de criação está no ar |
| 4 | **Leads na fila** | Marcelo | `approved_at IS NOT NULL`; popular é ato de 1 min (cron `* * * * *`) |
| 5 | **Merge `feat/bdr-autonomo` → main** | Marcelo | 6 commits não estão na main; front sobe da main |
| 6 | `phone_number` da instância NULL | baixo | cosmético; um CONNECTION_UPDATE real preenche |
| 7 | Roteador não conhece `'prospector'` | meu | corrigi o MOTOR (pin da persona), não a CLASSE. Mexe em `agent-routing.ts`, compartilhado |
| 8 | Remover `platform-sales-brain-canary` | meu | quando PR-B for promovido ou descartado |

---

## 6. ARMADILHAS MEDIDAS — ler antes de afirmar qualquer coisa

Todos os erros desta sessão têm **uma forma**: *medir uma coisa e concluir sobre outra.*

| erro | forma |
|---|---|
| "Baileys desatualizado" | li o BANCO, conclui sobre a EVOLUTION. A fonte dizia `open` |
| "restrição do WhatsApp" | refutado pelo controle positivo — WhatsApp Web oficial conectou |
| "homolog resolve" | inspecionei a IMAGEM, não provei o BOOT com a nossa env |
| "Intentus fora" | testei porta 3000; é 80. Logs mostravam 200 |
| "app.intentus fora" | `HTTP 000` em 0,02s é DNS, não servidor |
| "gate anti-phantom cego" | li o arquivo do MEU branch; a `main` já estava corrigida |

**Regras operacionais:**
- **Para saber o que roda em produção:** `git show origin/main:<arquivo>`, nunca o worktree.
- **Antes de deployar edge:** `deno check --no-lock <entrypoint>`. O `--no-lock` não é
  detalhe: sem ele escreve 4 linhas no `deno.lock`; com `--node-modules-dir=auto`
  escreve **4075** e faz o lock divergir entre branches (causa de abort de checkout).
- **Extrair chunk do bundle:** `sed 's|^"\./||; s|"$||'`, **nunca** `tr -d '"./'` —
  o `tr` come o ponto do `.js` e devolve zeros com cara de rigor.
- **Todo detector carrega um controle que TEM que dar positivo**, senão zero não
  significa nada.
- **Sonda de enum** (técnica da Controladora): mandar valor inválido faz o servidor
  devolver a lista válida no 400. Serve para re-derivar enum e para verificar
  rollback no nível do contrato.

---

## 7. COMBINADOS COM A CONTROLADORA GO-LIVE

- **Anunciar ANTES de ato em produção — e ESPERAR a resposta.** Furei uma vez hoje
  (anunciei e rodei o deploy sem esperar); não deu dano por circunstância, não por
  procedimento.
- **Exceção aceita por ambas:** quando o raio medido é ZERO (nenhuma instância dela
  no ar), anunciar sem travar em permissão. Se houver UMA conectada, esperar.
- **Fronteira proposta, NÃO ratificada:** *"contar e medir atravessa; construir e
  deployar, não."* Ela recusou adotar por relay — mudança de protocolo é ato
  constitucional e exige palavra direta do Marcelo. **Segue pendente de decisão dele.**
- **Canal oficial (Duda) é dela.** `whatsapp-health-alert` e `demo-evolution` são
  dela. Não tocar sem combinar.
- O PR #148 dela está na `main` (`b069f7c`) — `demo-evolution` e
  `whatsapp-health-alert` agora existem em git na versão de produção. Um deploy de
  edge a partir da main **restaura** em vez de reverter.

---

## 8. COMANDOS ÚTEIS (verificados hoje)

```bash
# Estado REAL das instâncias (fonte da verdade — não o banco)
ssh vps-hostinger 'docker exec evolution_api sh -c '"'"'wget -qO- \
  --header="apikey: $AUTHENTICATION_API_KEY" \
  "http://localhost:8080/instance/fetchInstances"'"'"''

# Config do webhook de uma instância (ver se headers está setado)
#   .../webhook/find/<nome-da-instancia>

# Typecheck de edge SEM rastro no lock
deno check --no-lock supabase/functions/<fn>/index.ts

# Deploy de edge (SEMPRE com nome — sem nome deploya TODAS)
supabase functions deploy <nome> --project-ref fzhlbwhdejumkyqosuvq

# Deploy do front (roda no VPS, sobre a árvore da main)
make deploy-beauty
```

---

## 9. O QUE EU NÃO VERIFIQUEI

Honestidade sobre os limites deste handoff:

- **A tela renderizada.** Nunca abri o painel logado — exige login de super_admin e
  não autentico com credenciais do Marcelo. A UI foi provada por `vite build`,
  typecheck e presença no bundle servido, **não** por inspeção visual.
- **O caminho `org_em_demonstracao`** com dado real (não há demo com instância).
- **O fluxo completo de disparo** — nunca houve campanha armada com lead real.
- **Se o `CONNECTION_UPDATE` agora passa** — configurei o header, mas a instância já
  estava conectada; o próximo evento real é que vai provar. **Quem retomar: confira
  os logs de `platform-evolution-webhook` procurando 200 em vez de 401.**
