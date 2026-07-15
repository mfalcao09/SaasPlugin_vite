# P9 — Automação Real + Agente de Gestão de Carteira (Auditor de Cadastro)

**Blueprint pareado (.md + .html)** · NexvyBeauty · 2026-07-15
**Escopo:** READ-ONLY + design. Nada de código/banco editado. Banco `fzhlbwhdejumkyqosuvq` (só leitura).
**Autor da sessão:** research automação-lacunas / P9-CART
**Voz:** conselheiro — a resposta desconfortável primeiro.

---

## A resposta desconfortável, primeiro

A venda promete "piloto automático". Hoje o piloto automático **roda 0%**, e não é por falta de motor — o motor existe, está deployado, o cron dispara todo dia às 8h. Ele envia **zero** porque **nenhum salão ligou uma receita**, e ninguém liga porque a decisão de ligar foi empurrada 100% pro dono, num toggle que ele nunca visita. Provado no banco: `salon_automation_rules` tem 2 linhas, **0 com `enabled=true`**; `salon_automation_log` tem **0 linhas** — o motor nunca disparou de verdade uma única vez em produção.

E o Agente de Carteira que você descreveu (varre → detecta buraco → anota pendência → pergunta na próxima abordagem → grava a resposta) **não existe em nenhuma das duas metades**. Existe a metade que *mede* (agregado) e a metade que *dispara sem escutar* (mão-única). O elo que fecha o ciclo — **ler a resposta do cliente e gravar no cadastro** — é código que ainda não foi escrito. É a peça que transforma "automação que fala sozinha" em "produto que se completa sozinho".

A boa notícia: **~75% da infraestrutura pra isso já está no repo**, em pontos que só precisam ser costurados, não reinventados.

---

## [Fact-Forcing Gate] — os 4 fatos, reexecutados NA HORA (prova de DB/código)

| # | Fato assumido (contexto) | Reexecução agora | Veredito |
|---|---|---|---|
| **1** | Motor `salon-automation-run` tem 4 receitas + cron 11h UTC, mas está DESLIGADO (0 rules enabled, 0 log rows). | DB: `rules_total=2`, `rules_enabled=0`, `log_total=0`. Cron `salon-automation-daily` `jobid=18`, `schedule='0 11 * * *'`, **`active=true`**. Nasce `enabled=false` (`foundation.sql:9`). | ✅ **Confirmado.** O cron RODA diário; envia 0 porque 0 receitas ligadas. |
| **2** | Mão-única: dispara e NÃO lê a resposta (sem `on-response` no lado salão). | `salon-automation-run/index.ts:188` só chama `evolution-send`. Não existe nenhuma edge `salon-*-on-response`. O webhook faz fan-out de resposta só pra `cadence-on-response`/`campaign-on-response` (CRM leads), não pro salão. | ✅ **Confirmado.** Nada escuta o cliente do salão. |
| **3** | `clientHygiene.ts` = agregado; `clientActions.ts` = fila por-cliente (envio MANUAL); `evolution-webhook` grava inbound mas ninguém interpreta como campo estruturado. | `clientHygiene.ts:43` `buildHealthMetrics` devolve % por campo (agregado). `clientActions.ts:41` `buildClientActions` = fila por-cliente, mensagem manual, sem persistência. `evolution-webhook` grava inbound em `webchat_messages` (34 msgs reais no DB) e faz fan-out — **nenhum consumidor extrai campo do cliente**. | ✅ **Confirmado.** |
| **4** | `Clientes.tsx` = único write de nascimento (form manual); só ~10% têm `data_nascimento`. | DB: `clientes_total=10`, `com_nascimento=1` (**10%**), `com_endereco=0` (**0%**), `com_email=2` (20%), `com_telefone=10` (100%). | ✅ **Confirmado.** Nascimento 10%, endereço 0%. |

**Fatos extras descobertos que reforçam o desenho (não estavam no briefing):**

- **Ponto de carona JÁ EXISTE e está costurado.** `evolution-webhook/index.ts:2180-2193` dispara *fire-and-forget* pra `campaign-on-response` E `cadence-on-response` sempre que chega mensagem inbound, passando `{conversation_id, organization_id}`. Adicionar `salon-collect-inbound` ali é **replicar 4 linhas de um padrão idêntico** — o gatilho está pronto.
- **Consentimento LGPD já tem fundação.** `20260619_lgpd_consents.sql` cria `lgpd_consents` — tabela de auditoria **imutável** (identidade, IP, `consent_text`, `scope`, `lead_id`), hoje escopo `lead_capture`. Reusar com novo escopo `salon_client_field_collection`, não criar do zero.
- **Endereço é estruturado.** `clientes` tem `cep, logradouro, numero, complemento, bairro, cidade, uf` (todos 0% preenchidos) + `endereco` legado. Captura pode ser granular (CEP → auto-completa via BrasilAPI).
- **Há matéria-prima real de resposta.** 8 conversas WhatsApp, **34 mensagens inbound** já gravadas. O tráfego de retorno existe; falta só interpretá-lo.
- **`Duda` = IA de VENDAS da plataforma** (leads/CRM, `bot_active`) — domínio errado pro cliente-do-salão (ver Decisão 3).

---

## 1. Estado real — o que roda vs. os 0%

### O que já roda (verde)
- **Motor de receitas** (`salon-automation-run/index.ts`, 211 linhas): 4 receitas implementadas e seguras.
  - `aniversario` (:119-125) — casa MM-DD de `data_nascimento`.
  - `pacote_vencendo` (:127-136) — `pacote_clientes` entre hoje e hoje+antecedência.
  - `agendamento_24h` (:138-148) — `agendamentos` de amanhã, não-cancelados.
  - `retorno_inativo` (:150-166) — última visita concluída = hoje − N dias.
  - Idempotência real (`ref` + unique index `uq_salon_auto_log_sent_ref`), guarda de ambiguidade de homônimo (:106-108), throttle anti-spam 1,5s (:196), dry-run por padrão (:76).
- **UI de Automações** (`Automacoes.tsx`, 242 linhas): 4 cards liga/desliga + editor de mensagem + botão "Ver prévia (não envia)".
- **Cron** `salon-automation-daily` (jobid 18, `0 11 * * *`, active) chamando a edge em modo-envio com `x-cron-secret`.
- **Higiene agregada** (`clientHygiene.ts`): % de preenchimento por campo, score médio, duplicatas.
- **Fila por-cliente** (`clientActions.ts`): quem precisa de atenção agora, com mensagem pronta (envio manual).
- **Inbound gravado** (`evolution-webhook`): toda resposta cai em `webchat_messages`, com fan-out pronto.

### O que roda 0% (o buraco)
| Buraco | Prova | Consequência |
|---|---|---|
| Nenhuma receita ligada | `rules_enabled=0` | Cron dispara → 0 envios |
| Motor nunca executou envio real | `log_total=0` | "Piloto automático" = teoria |
| Sem escuta da resposta do salão | Não existe `salon-*-on-response` | Dado que o cliente responde é descartado |
| Sem tabela de pendências | Não existe `salon_client_field_requests` | Auditor não tem onde anotar buraco |
| Sem captura conversacional | `salon-collect-inbound` não existe | Nascimento fica em 10% pra sempre |
| Dado faltante descartado em silêncio | `index.ts:122` (`continue` se sem nascimento) | Aniversário nunca cobre 90% da base |

### Aniversário com 10% de nascimento: degrada gracioso?
**Sim, e é seguro — mas é inútil sem o Auditor.** `index.ts:122` faz `if (!c.data_nascimento) continue` — quem não tem nascimento é pulado sem erro. Ligar a receita de aniversário hoje contata **1 de 10 clientes**. A receita não quebra; ela simplesmente **não tem o que disparar**. É exatamente por isso que o Agente de Carteira é o pré-requisito da automação valer a pena: ele é a **usina de matéria-prima** que enche `data_nascimento`/`endereco` pra que as receitas cubram a base inteira, não 10% dela.

---

## 2. Arquitetura — reuso vs. criar (com arquivo:linha e % pronto)

### Princípio
Costurar, não reinventar. Cada peça nova pendura num gatilho ou molde que já existe. Regra da casa: **cliente-do-salão (`clientes`) ≠ lead-do-CRM (`leads`)** — nunca misturar as duas malhas (ver memória "Booking CRM ≠ agenda salão").

| Componente | Ação | Onde/Molde | % pronto |
|---|---|---|---|
| Motor cron de receitas | **REUSAR** | `salon-automation-run` + cron jobid 18 | 100% |
| UI liga/desliga | **REUSAR + 1 ajuste** | `Automacoes.tsx` (default no onboarding) | 90% |
| Varredura por-cliente (detecta buraco) | **ESTENDER** | `clientActions.ts:41` (mesma agregação por-cliente) | 60% |
| Higiene agregada | **REUSAR** (fonte do dashboard do Auditor) | `clientHygiene.ts:43` | 100% |
| Tabela de pendências | **CRIAR** | `salon_client_field_requests` (§3) | 0% |
| Escrita da pendência | **CRIAR** (edge `salon-audit-run` OU estender o motor) | molde: `salon-automation-run` loop por-org | 0% |
| Gatilho de captura (inbound) | **REUSAR** | `evolution-webhook:2180-2193` fan-out | 100% (só +1 fetch) |
| Captura conversacional | **CRIAR** `salon-collect-inbound` | molde: `cadence-on-response` (resolve conv→estado→grava) | 0% (molde 80%) |
| Extração de valor (regex + LLM) | **REUSAR padrão** | `suggest-reply` / `analyze-conversation` (gateway `_shared/ai.ts`, structured output) | 70% |
| Carona da pergunta | **ESTENDER** | anexar 1 pergunta à mensagem outbound da receita (`compose()` `index.ts:51`) | 50% |
| Consentimento LGPD | **REUSAR/ESTENDER** | `lgpd_consents` (novo scope) | 80% |
| CEP → endereço | **REUSAR** | BrasilAPI (skill `brasilapi` já no ecossistema) | n/a |

**Contagem honesta:** dos ~12 componentes do ciclo fechado, **6 estão 100% prontos**, 3 são extensões de molde existente (50-70%), e só **3 são código novo de verdade** (tabela + `salon-audit-run` + `salon-collect-inbound`). O elo que falta é pequeno; o que faltava era o desenho de como pendurar.

### Reuso vs. novo — o mapa de 1 olhada
```
JÁ PRONTO (reusar)            ESTENDER (molde existe)        CRIAR (novo)
─────────────────            ──────────────────────         ────────────
salon-automation-run  ✓      clientActions (varredura)      salon_client_field_requests
cron jobid 18         ✓      compose() +pergunta carona     salon-audit-run
evolution-webhook fan ✓      onboarding liga default        salon-collect-inbound
lgpd_consents         ✓      suggest-reply→extração
clientHygiene         ✓
Automacoes UI         ✓
```

---

## 3. Modelo de dados — a tabela de pendências

Uma linha = "falta o campo X do cliente Y, e é isto que já fizemos a respeito". É o **caderninho do Auditor** e o **estado do follow-up** na mesma tabela (segue o princípio "um registro só").

```sql
-- PROPOSTA (não aplicada). Mecanismo dedicado, isolado do fluxo de dinheiro.
create table public.salon_client_field_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  campo           text not null check (campo in
                    ('data_nascimento','endereco','email','cpf_cnpj')),
  status          text not null default 'pending' check (status in
                    ('pending',     -- Auditor detectou o buraco
                     'asked',       -- follow-up perguntou (carona saiu)
                     'answered',    -- cliente respondeu, valor extraído e GRAVADO
                     'declined',    -- cliente recusou / opt-out → não pergunta mais
                     'unreachable', -- sem telefone válido / ambíguo
                     'skipped')),   -- resolvido por outra via (form manual)
  valor_pendente  text,            -- valor bruto extraído, aguardando gravação/confirmação
  asked_at        timestamptz,
  answered_at     timestamptz,
  ask_count       int not null default 0,   -- nº de vezes que perguntamos (cap p/ não insistir)
  last_channel    text,            -- 'whatsapp' etc.
  source_message_id uuid,          -- webchat_messages.id que trouxe a resposta (trilha)
  extraction_confidence numeric,   -- 0..1 (regex=1.0; LLM=score) → gate de confirmação
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- IDEMPOTÊNCIA: 1 pendência viva por (cliente, campo). Não pergunta o mesmo 2×.
  unique (organization_id, cliente_id, campo)
);
create index idx_scfr_org_status on public.salon_client_field_requests(organization_id, status);
create index idx_scfr_cliente     on public.salon_client_field_requests(cliente_id);

alter table public.salon_client_field_requests enable row level security;
-- Dono LÊ as próprias pendências; escrita é do cron/edge (service role).
create policy "org reads scfr" on public.salon_client_field_requests
  for select using (organization_id = get_user_organization(auth.uid()));
```

**Decisões de modelagem embutidas:**
- **`unique(org, cliente, campo)`** é a idempotência: o Auditor faz `upsert` — nunca cria pendência duplicada, nunca reabre o que já foi `answered`/`declined`.
- **`ask_count` + cap** (ex.: máx 2 perguntas por campo) evita virar chateação.
- **`extraction_confidence`** decide o gate: regex casou formato de data (confiança 1.0) → grava direto; LLM inferiu com 0.6 → pede confirmação ("Anotei 12/03, é isso? 👍").
- **`source_message_id`** = trilha de auditoria: sempre dá pra provar de qual mensagem veio o dado (LGPD, §4).
- **Grava no cadastro real** (`clientes.data_nascimento` etc.) só quando `status→answered`; a pendência é o *diário*, `clientes` é a *verdade*.

---

## 4. Fluxo E2E — varredura → pendência → carona → captura → grava

```
┌────────────────────────────────────────────────────────────────────────────┐
│  (A) AUDITOR  —  cron diário (reusa jobid 18 OU novo, 1×/dia)                │
│                                                                             │
│   clientes (por org) ──varre──►  campo faltando?                            │
│      │  (estende clientActions.ts: mesma agregação por-cliente)             │
│      ▼                                                                       │
│   GUARDA: telefone válido? homônimo? (reusa normPhone + guarda ambiguidade) │
│      │  não ► status='unreachable'  (não vira alvo de pergunta)             │
│      ▼ sim                                                                   │
│   upsert salon_client_field_requests (org,cliente,campo) status='pending'   │
│      └── idempotente: não duplica, não reabre answered/declined             │
└────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼  1 campo por vez, prioridade nascimento>endereço
┌────────────────────────────────────────────────────────────────────────────┐
│  (B1) CARONA  —  NÃO manda conversa fria só pra pedir dado                   │
│                                                                             │
│   Uma receita JÁ IA sair? (lembrete 24h / pós-atendimento / aniversário)    │
│      │  sim ► compose() anexa 1 pergunta gentil ao fim da msg               │
│      │        "...te espero amanhã! 💕 Ah, e qual sua data de nascimento?   │
│      │         Quero te preparar um mimo 🎂"                                 │
│      ▼                                                                       │
│   evolution-send (reusa)  →  pendência status='asked', ask_count++          │
│   registra em lgpd_consents (scope='salon_client_field_collection')         │
│      │  nenhuma receita sairá hoje ► NÃO pergunta (espera a próxima carona) │
└────────────────────────────────────────────────────────────────────────────┘
                                   │
                        cliente responde no WhatsApp ("minha data é 12/03")
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  (B2) CAPTURA  —  salon-collect-inbound  (NOVO, molde cadence-on-response)   │
│                                                                             │
│   evolution-webhook:2180-2193 ──fan-out──► salon-collect-inbound            │
│      │  (mesmo padrão do cadence-on-response; +1 fetch de 4 linhas)         │
│      ▼                                                                       │
│   conversation_id → telefone → cliente_id → pendência 'asked' aberta?       │
│      │  não ► sai (skip: nada perguntado a este cliente)                    │
│      ▼ sim                                                                   │
│   EXTRAI valor:  regex primeiro (data/CEP/email — confiança 1.0)            │
│                  falhou? ► LLM fallback (reusa gateway _shared/ai.ts,        │
│                  structured output tipo analyze-conversation) → confiança    │
│      ▼                                                                       │
│   confiança alta ► GRAVA clientes.<campo> + pendência 'answered' + trilha   │
│   confiança média ► pergunta confirmação ("Anotei 12/03, confirma? 👍")     │
│      │                                    (loop volta pro B2 no "sim")       │
│      ▼                                                                       │
│   clientes.data_nascimento preenchido  →  próximo aniversário JÁ dispara     │
└────────────────────────────────────────────────────────────────────────────┘

  RESULTADO: o buraco de 90% vira matéria-prima. A automação que só cobria 10%
  passa a cobrir a base inteira — sozinha, uma pergunta de cada vez, pegando carona.
```

**Políticas gravadas no fluxo (verbatim do briefing):**
- **1 campo por vez** — nunca despeja um formulário no WhatsApp.
- **Sempre carona** — só pergunta pendurado num toque que já ia sair. Zero conversa fria só pra coletar.
- **Idempotência** — `unique(org,cliente,campo)` + `status`/`ask_count` garantem que o mesmo dado nunca é perguntado 2× nem regravado.
- **Confirmação sob dúvida** — regex grava direto; LLM inferido confirma antes.

---

## 5. Decisões pro Marcelo (com recomendação)

### Decisão 1 — Receitas: default ligado vs. opt-in
**A verdade:** enquanto ligar depender do dono, fica 0% (é o que o DB prova hoje). O toggle não é "empoderamento", é o ralo por onde o valor vaza.

| Opção | Implicação | LGPD |
|---|---|---|
| (a) Opt-in puro (hoje) | 0% de adoção comprovado | Conservador |
| (b) **Ligado por default no onboarding**, com prévia + kill-switch | Automação de verdade desde o dia 1 | OK: base = legítimo interesse + relacionamento existente; dono vê e pode desligar |
| (c) Default só as "seguras" (lembrete 24h, pós-atendimento) | Meio-termo; aniversário/inativo ficam opt-in | Mais conservador |

**Recomendação: (b) com salvaguardas** — ligar as 4 receitas por default no `apply-onboarding`, com a tela de Automações mostrando "3 receitas ligadas, ver prévia" e um kill-switch visível. O dono nunca precisa *ligar*; ele pode *desligar*. Isto sozinho move o produto de 0% pra funcional. Se você quiser ser conservador no lançamento, comece em (c) e promova pra (b) após a 1ª semana sem reclamação. **O risco de (b):** um salão com base suja manda mensagem torta — mitigado porque o Auditor limpa a base e o dry-run/prévia continua disponível.

### Decisão 2 — Campos prioritários
**Recomendação de ordem:** `data_nascimento` **>** `telefone` (já 100%, ignora) **>** `endereco` **>** `email` **>** `cpf_cnpj`.
- **Nascimento primeiro** — destrava a receita de maior carinho/ROI (aniversário), hoje em 10%. É o campo com maior alavanca.
- **Endereço depois** — hoje 0%; só vira prioridade se o salão faz entrega/atende em casa. Capturar via **CEP** (1 pergunta) e auto-completar `logradouro/bairro/cidade/uf` via BrasilAPI — minimiza o que se pede ao titular.
- **CPF por último** — dado sensível, alto atrito, baixo uso no relacionamento. Só se o salão emite nota. Não perseguir por carona.

### Decisão 3 — O agente de follow-up: Duda / Nina / novo?
**Recomendação: nenhum agente-persona novo. O follow-up = motor de receitas (carona) + `salon-collect-inbound` (captura). NÃO é a Duda.**

- **Por que não a Duda:** a Duda é a IA de **vendas da plataforma** — atende **leads** (`bot_active`, CRM, "recomenda o plano, nunca desqualifica"). Domínio errado: cliente-do-salão vive em `clientes`, não em `leads`. Plugar a Duda aqui repetiria exatamente o erro "Booking CRM ≠ agenda salão" da memória do projeto.
- **Por que não a "Nina" (P2):** P2 é outra frente; herdar uma persona conversacional inteira pra perguntar uma data de nascimento é canhão pra mosquito, e cria acoplamento entre frentes.
- **Por que "sem persona nova" é o certo:** o menor loop fechado **não precisa** de um bot conversacional. Precisa de (1) o motor determinístico já pronto anexar 1 pergunta, e (2) uma edge que leia a resposta. Isso é captura estruturada, não diálogo. **Fase 2 opcional:** se o salão-tenant tiver um bot recepcionista ativo (`webchat-bot`/`bot_active`), ele pode fazer a pergunta de forma conversacional — mas isso é enfeite, não o MVP.

---

## 6. Fases + check binário (MVP = menor loop fechado)

**Definição de MVP (o menor loop que fecha):** 1 campo (`data_nascimento`) perguntado por carona num lembrete que já ia sair, respondido pelo cliente, extraído por regex, e **gravado em `clientes.data_nascimento`** — provado por 1 linha `answered` na tabela de pendências e o campo preenchido no cadastro.

| Fase | Entrega | Check binário (passou/falhou) |
|---|---|---|
| **F0** | Ligar o que já existe | `update salon_automation_rules set enabled=true` p/ 1 org de teste → `salon_automation_log` ganha ≥1 linha `sent` no próximo cron. **Prova de que o motor envia de verdade.** |
| **F1 — Auditor (A)** | Tabela `salon_client_field_requests` + `salon-audit-run` (estende `clientActions`) | Rodar audit numa org → nº de linhas `pending` = nº de clientes sem `data_nascimento` (hoje 9 de 10). Homônimo/sem-telefone → `unreachable`, não `pending`. |
| **F2 — Carona (B1)** | `compose()` anexa 1 pergunta quando há receita saindo + registra `asked` | Cliente com pendência que recebe lembrete 24h → mensagem contém a pergunta; pendência vira `asked`, `ask_count=1`; `lgpd_consents` ganha 1 linha scope novo. Sem receita saindo → 0 perguntas. |
| **F3 — Captura (B2) [MVP fecha aqui]** | `salon-collect-inbound` (fan-out no webhook) + extração regex | Cliente responde "12/03/1990" → `clientes.data_nascimento` gravado, pendência `answered`, `source_message_id` preenchido. **Loop fechado.** Reperguntar o mesmo campo = 0 (idempotência). |
| **F4 — LLM fallback + confirmação** | Extração LLM p/ resposta torta ("nasci em março, dia 12") + gate de confirmação | Resposta ambígua → confiança <1.0 → bot pede confirmação; só grava no "sim". |
| **F5 — Default no onboarding + endereço** | Receitas ligadas por default (Decisão 1) + campo `endereco` via CEP/BrasilAPI | Novo tenant nasce com receitas `enabled=true`; auditor cobre `endereco`; CEP auto-completa. |
| **F6 — Dashboard do Auditor** | Tela: "9 pendências, 3 perguntadas, 2 respondidas esta semana" (reusa `clientHygiene`) | Dono vê a base subindo de 10%→X% sem mexer numa planilha. |

**Ordem de ataque recomendada:** F0 (prova o motor hoje, 1 dia) → F1+F3 (o loop mínimo, pula F2 usando um disparo manual de teste pra validar a captura isolada) → F2 (a carona) → F4/F5/F6. F0 é barato e mata a dúvida "será que envia?" antes de investir no resto.

---

## LGPD — a base jurídica do Agente de Carteira (§4 detalhado)

**Papéis:** o **salão é o controlador** (decide coletar nascimento/endereço do seu cliente); **NexvyBeauty é o operador** (processa em nome do salão). Dado de nascimento + endereço do cliente-do-salão = **dado pessoal de terceiro** — a NexvyBeauty nunca é dona, só processa sob instrução do salão.

- **Base legal (Art. 7, LGPD):**
  - `data_nascimento` para relacionamento/marketing de aniversário → **legítimo interesse** (VII) apoiado em relacionamento comercial pré-existente (o cliente já frequenta o salão). Requer teste de proporcionalidade + opt-out fácil.
  - `endereco` → **execução de contrato** (V) *se* houver entrega/atendimento domiciliar; caso contrário, legítimo interesse fraco → melhor **consentimento**.
  - `cpf_cnpj` → normalmente **obrigação legal/fiscal** (II) quando emite nota. Fora disso, não coletar.
- **Minimização (Art. 6, III):** 1 campo por vez, só o necessário, endereço via CEP (pede menos, deduz o resto). Nunca "manda todos os teus dados".
- **Consentimento/aviso na 1ª interação:** a primeira pergunta-carona vai acompanhada do porquê ("quero te preparar um mimo de aniversário"), e o evento é registrado em `lgpd_consents` (scope `salon_client_field_collection`, com `consent_text` exato e `source_message_id`). Recusa (`declined`) é honrada e nunca reperguntada.
- **Trilha (Art. 37, accountability):** cada gravação carrega `source_message_id` → dá pra provar de qual mensagem, quando, e com que texto de aviso o dado veio.
- **Gap a sinalizar:** hoje **não há coluna de opt-out por-cliente** em `clientes`. O `status='declined'` na tabela de pendências cobre o campo específico, mas um **"não perturbe" global do cliente** (Art. 18 — oposição) precisa de um lugar próprio antes do F5. Recomendo um flag `clientes.marketing_opt_out boolean` no mesmo PR do F5.

---

## Anexo — evidências (queries read-only executadas)

```
salon_automation_rules:  total=2   enabled=0
salon_automation_log:    total=0
cron.job:                salon-automation-daily  jobid=18  '0 11 * * *'  active=true
clientes:                total=10  nascimento=1 (10%)  endereco=0 (0%)  email=2  telefone=10 (100%)
agendamentos=39  pacote_clientes=2  webchat_conversations(wa)=8  webchat_messages(inbound)=34
lgpd_consents:           existe (20260619_lgpd_consents.sql, scope atual 'lead_capture')
clientes cols endereço:  cep, logradouro, numero, complemento, bairro, cidade, uf (+ endereco legado)
```

**Arquivos-âncora:**
- `supabase/functions/salon-automation-run/index.ts` (motor, :51 compose, :122 descarte silencioso, :188 evolution-send)
- `supabase/functions/evolution-webhook/index.ts:2180-2193` (fan-out inbound — ponto de carona)
- `supabase/functions/cadence-on-response/index.ts` (molde do `salon-collect-inbound`)
- `supabase/functions/suggest-reply/index.ts` + `analyze-conversation/index.ts` (padrão extração LLM)
- `src/cockpit/clientActions.ts:41` (molde da varredura por-cliente)
- `src/cockpit/clientHygiene.ts:43` (agregado — fonte do dashboard do Auditor)
- `src/cockpit/Automacoes.tsx` (UI liga/desliga)
- `supabase/migrations_salao/20260626_salon_automation_foundation.sql` + `_cron.sql`
- `supabase/migrations_salao/20260619_lgpd_consents.sql` (consentimento a estender)

---

*Blueprint pareado — versão .html self-contained dark em `P9-CART-AUTOMACAO-E-CARTEIRA-2026-07-15.html`.*

---

## Execução — 2026-07-15 (código 100% pronto, deploy com dedo no gatilho)

Branch `feat/p9-cart-automacao-carteira` (de `origin/main`). **Nada aplicado no banco live, nada deployado.** `deno check` verde em cada edge, 20/20 deno tests, `Automacoes.tsx` type-clean.

### O que foi construído (o elo que faltava)

| Peça | Arquivo | Estado |
|---|---|---|
| **Tabela de pendências + opt-out** | `supabase/migrations_salao/20260715_salon_client_field_requests.sql` | NOVO — cria `salon_client_field_requests` (ledger) + `clientes.marketing_opt_out` (LGPD Art.18). NÃO aplicada. |
| **Auditor** (metade A) | `supabase/functions/salon-audit-run/` (`index.ts` + `detect.ts` + `detect.test.ts`) | NOVO — varre clientes/org, detecta buraco, upsert `pending`. Guarda de ambiguidade (telefone ausente/compartilhado → `unreachable`). Self-heal (campo já preenchido → `skipped`). Idempotente. |
| **Captura** (metade B) | `supabase/functions/salon-collect-inbound/` (`index.ts` + `extract.ts` + `extract.test.ts`) | NOVO — fecha o loop: telefone→cliente→pendência `asked`→extrai (regex, LLM fallback)→grava `clientes.<campo>` + `answered` + `source_message_id`. Confirmação sob dúvida. Opt-out (LGPD). Endereço via CEP→BrasilAPI. |
| **Carona** (F2, no motor) | `supabase/functions/salon-automation-run/index.ts` | ESTENDIDO — anexa 1 pergunta ao toque que já ia sair, marca `asked`, grava prova em `lgpd_consents` (scope `salon_client_field_collection`). **Guardado em try/catch: sem a tabela, o motor roda exatamente como hoje.** |
| **Fan-out** | `supabase/functions/evolution-webhook/index.ts` | ESTENDIDO — +4 linhas ao lado de `cadence-on-response` chamando `salon-collect-inbound`. |
| **Default ligado** | `supabase/functions/_shared/cakto-plan-provisioning.ts` | ESTENDIDO — as 4 receitas nascem `enabled=true` (Decisão 1). |
| **Kill-switch + prévia** | `src/cockpit/Automacoes.tsx` | ESTENDIDO — banner "já vêm ligadas" + botão "Pausar todas" (kill-switch mestre). |

### Provas (o loop fechado, sem tocar o live)

- **`deno check --node-modules-dir=none`** verde: `salon-automation-run`, `salon-audit-run`, `salon-collect-inbound`, `evolution-webhook`, `_shared/cakto-plan-provisioning.ts`.
- **`deno test` 20/20** (dados semeados): extração `12/03/1990`→`1990-03-12`, ano de 2 dígitos, "12 de março", CEP, e-mail, CPF; prioridade nascimento>endereço>email; intenção sim/não/opt-out; guarda de ambiguidade (telefone compartilhado→unreachable), opt-out, self-heal.
- **Smoke read-only do Auditor no banco LIVE** (reproduz `classifyCliente` em SQL): org com 10 clientes → **7 reachable (pending) + 3 unreachable** (telefone ausente/ambíguo); `pending_nascimento=7`. A guarda de ambiguidade funciona sobre dado real (não vira 9 "pending" cegos — 2 dos sem-nascimento são inalcançáveis).

### Comandos de deploy — AGUARDANDO GO (não executar sem palavra do Marcelo)

**Ordem importa** (o motor/collect precisam da tabela; senão o collect responde `requests_unavailable` e o motor pula a carona — sem quebrar):

```
# 1) Migration (MCP apply_migration, dollar-quoting já no arquivo)
#    name: salon_client_field_requests
#    query: conteúdo de supabase/migrations_salao/20260715_salon_client_field_requests.sql

# 2) Edges novas + estendidas (verify_jwt=true; recebem service-role/JWT)
supabase functions deploy salon-audit-run       --project-ref fzhlbwhdejumkyqosuvq
supabase functions deploy salon-collect-inbound --project-ref fzhlbwhdejumkyqosuvq
supabase functions deploy salon-automation-run  --project-ref fzhlbwhdejumkyqosuvq

# 3) Webhook público (mantém --no-verify-jwt) — passa a chamar o collect
supabase functions deploy evolution-webhook     --project-ref fzhlbwhdejumkyqosuvq --no-verify-jwt

# 4) Default ON: redeploy dos importadores de _shared/cakto-plan-provisioning.ts
supabase functions deploy apply-onboarding      --project-ref fzhlbwhdejumkyqosuvq
supabase functions deploy cakto-webhook         --project-ref fzhlbwhdejumkyqosuvq --no-verify-jwt
supabase functions deploy cakto-reprocess-order --project-ref fzhlbwhdejumkyqosuvq

# 5) Front (kill-switch/banner) — pipeline manual VPS (deploy-vps.sh, gestao.nexvy.tech)

# 6) Backfill da base viva: roda o Auditor 1× (semeia as pendências)
curl -X POST https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/salon-audit-run \
  -H "Authorization: Bearer <SERVICE_ROLE>" -H "content-type: application/json" \
  -d '{"dry_run": false}'
```

**Opcional (recomendado):** cron diário do Auditor — `pg_cron` chamando `salon-audit-run` com `x-cron-secret` (mesmo molde do `salon-automation-daily` jobid 18). Fica como migration separada pós-GO.

### Notas de risco / honestidade

- **Não fiz E2E no live** (exige aplicar migration + deployar edges = GO). A prova do loop é: deno tests sobre fixtures + smoke read-only do Auditor no live. O 1º passo pós-GO é rodar o backfill e mandar "12/03/1990" de um WhatsApp de teste → conferir `clientes.data_nascimento` gravado + linha `answered`.
- **`clientes.marketing_opt_out` no motor:** o opt-out é honrado nas peças NOVAS (auditor não cria pendência; carona não pergunta; collect desliga tudo no "não quero"). Ligar o filtro no SELECT do motor de envio é follow-up de 1 linha — deixado fora pra não acoplar o motor (dinheiro-adjacente) a uma coluna ainda não-live.
- **Dívida pré-existente:** `tsc -b` acusa 37 erros em arquivos NÃO tocados (Pacotes/SellerInbox/PlatformCrm…) — é a P-state-04 (tipos gerados desatualizados). `Automacoes.tsx` está limpo; `vite build` (transpile-only) não é afetado.
- **Independência da F6:** `20260714_f6_carteira_whatsapp.sql` (sibling, não aplicada) adiciona `clientes.telefone_normalizado`. P9 **não depende** dela — casa telefone via `phoneVariantsBR`/`normalize_phone_br` em app.
