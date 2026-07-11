# LEVANTAMENTO — Pendências REAIS do NexvyBeauty
> ⚰️ **SUPERSEDED por [PLANO-MESTRE-GO-LIVE-2026-07-11](PLANO-MESTRE-GO-LIVE-2026-07-11.md)** (07-11) — backlog re-priorizado lá (Fases 1/2 + P0-P5). Este doc = censo/histórico.
> **2026-07-08 · sessão 2c9bdcd8/6cf2fc02 · research profundo em 3 frentes + verificação de código**
> Pedido do Marcelo (verbatim): *"Você precisa levantar o que falta de verdade, de tudo que eu já pedi em todas sessões que já tivemos sobre isso, não apenas o que você esbarra."*
>
> **Método:** (A) censo exaustivo de 34 docs de plano (~378 promessas extraídas) · (B) mineração de 203 mensagens do Marcelo nos JSONLs de sessão + RAG (10.235 docs) + workstreams (05/05→08/07) · (C) rastreamento do caso "UI do atendimento" ponta-a-ponta · cruzado com verificação direta no código/banco/deploy feita em 07-08.
> **Níveis de evidência:** 🅲 = verificado no CÓDIGO/banco/prod nesta sessão · 🅳 = atestado por doc mais recente (conflito resolvido por data) · ❔ = não verificado (precisa grep antes de executar).

---

## 0. Sumário executivo

| Métrica | Valor |
|---|---|
| Docs de plano censados | 34 (31 em `tasks/` + 3 em `_indice-planos/`) |
| Promessas/itens extraídos | ~378 |
| Marcados ✅ no próprio doc | ~82 |
| Sem marca nenhuma nos docs | ~265 |
| Clusters de CONFLITO entre docs | 17 (cobrindo ~35 itens) |
| Pedidos seus que MORRERAM e você repetiu | ≥3 (carteira 180d 2×, botões CRM 3×, gestão por host 2×) |

**As 3 conclusões que importam:**

1. **O sistema está mais pronto do que os docs dizem** — 16 dos 17 conflitos são "doc velho marca FALTA para coisa entregue depois". A dívida nº1 não é código: é **errata**.
2. **O que morre, morre por processo, não por engenharia**: (a) sessão morre e ninguém herda (Lux L4, IG/Messenger); (b) frente nova engole a fila sem fechar a anterior (LOTE L1-L13 → Lux → E1 → E4); (c) executor "simplifica" sem plano aprovado e ninguém registra (inbox 43→9 arquivos).
3. **O backlog real, deduplicado, cabe em 9 frentes e ~41 itens** (§3) — não nos ~265 "sem marca" dos docs. A maioria dos 265 ou já foi entregue por tabela, ou é spec/doc (não código), ou foi supersedida.

---

## 1. O que está PRONTO E PROVADO (errata contra os docs que mentem)

| Item | Docs dizem | Realidade | Evidência |
|---|---|---|---|
| B2 slug + página pública | "FALTA/BLOQUEIA → 404" | ✅ prod, provado ao vivo | 🅲 `/s/<slug>` HTTP 200; E2E 07-08 |
| B5/B6/B7 seeds (serviços/automações/Radar) | "FALTA/PARCIAL" | ✅ prod, provado E2E | 🅲 org-teste nasceu 10 serv + 4 regras + 1 radar; teardown limpo |
| Deploy `cakto-webhook`/`cakto-reprocess-order` | "pós-merge pendente" | ✅ v19/v17 ACTIVE | 🅲 fonte deployado contém os seeds verbatim |
| F4.1 slugs Cakto dos 3 planos | "sem marca" | ✅ mapeados (217 `wej72ha` · 387 `qngyuri` · 687 `hriw6aj`) + checkout_url | 🅲 query no banco |
| F4.3 alerta Telegram (código) | "sem marca" | ✅ código em 5 cenários — **falta só secret** | 🅲 `platform-alerts.ts` + 5 call-sites |
| F4.4 boas-vindas (email idempotente + WhatsApp gated) | "sem marca" | ✅ completo | 🅲 `cakto-plan-provisioning.ts` |
| 2.4 trava fundadora (WRITE `founder_status`) | "sem marca" | ✅ no provisionamento (org-teste nasceu `is_founder`) | 🅲 E2E 07-08 |
| Service Worker "usuário não vê deploy" | gotcha listado | ✅ NÃO se aplica (`skipWaiting`+`clients.claim`, fetch vazio) | 🅲 `public/sw.js` |
| `cakto-recovery-trigger` filtro inerte | "bug latente pendente" | ✅ fix final em main `cab7c7d` + testes | 🅲 grep + git log |
| Revival 6/8: resend, set-product, activate-bot/ai-reactivate, notify_whatsapp, ai_agent_outreach | "religar (sem marca)" | ✅ LIVE na plataforma | 🅲 `platform-webchat-inbox`/`webhook-receiver` |
| Booking dispatcher (WhatsApp) | "TODO" | ✅ envia via Cloud API, idempotente por wamid | 🅲 `platform-booking-dispatcher/index.ts:81` |
| U1/U2/U3 do atendimento (layout 3 painéis, abas c/ contadores, fallback identidade) | RETOMADA marca FALTA | ✅ entregues 07-05 | 🅲 componentes citados file:line (frente C) |
| A2 AnalysisPanel / A4 heartbeat / A6 dispatcher | RETOMADA marca FALTA | ✅ entregues | 🅲 idem |
| Lux L1-L3 + Rosé 1-5 + preço fonte-única + evals 12/12 | PLANO-LUX/PRECO sem marca | ✅ no ar | 🅳 HANDOFFs 07-06 (deploy verificado) |
| F0-META/F1/F2 autopilot (Cloud API, inbound, cérebro Duda) | AUDITORIA-DIA0 marca FALTA | ✅ PROVADO E2E | 🅳 PLANO-AUTOPILOT (mesmo dia, posterior) |

> **Ação já despachada:** errata datada nesses docs delegada à sessão `local_ef8ba55e` (em fila, com lastro confirmado no git).

---

## 2. Decisões registradas HOJE (07-08) que mudam o backlog

1. **Confirmação de agendamento → WhatsApp do próprio salão (Evolution ou API oficial), NUNCA e-mail.** Mata o bloqueio `RESEND_API_KEY` para booking; o "TODO email" do dispatcher vira **won't-do**.
2. **B4 origem da carteira = histórico WhatsApp do salão (scan QR → ingestão 180 dias)** — decisão sua já dita 2×; agora gravada. B3+B4 são UMA parede (o mesmo scan destrava ambos).
3. **`transfer_sector`** — você não sabe o que é ⇒ **candidata a DROP** (herança Vendus; schema nem tem `sector_id`). Aguarda seu "pode dropar".
4. **`beauty-sdr` squad na Fábrica** — no radar desta sessão, **não é prioridade agora** (sua ordem).

---

## 3. O QUE FALTA DE VERDADE — backlog único, deduplicado, por frente

### FRENTE 1 — Paridade do Atendimento (sua reclamação nº1 — 3 broncas: 01/07, 05/07 ×2)
A régua: inbox original Vendus = **35 componentes**; porte da plataforma = **11**.

| # | Item | Evidência | Esforço |
|---|---|---|---|
| 1.1 | **A1 composer completo**: portar de `seller/inbox/` → `superadmin/crm/inbox/`: QuickRepliesPopover (via `/`), InternalNotes (botão existe `disabled`), JourneyTimeline, ScheduleMessageDialog, ForwardMessageDialog, AudioRecorder+MediaAttachment, QuickActionBar. **GUARDA:** `~/.claude/hooks/parity_check.py` (porte `seller/inbox→superadmin/crm/inbox`; razão 0.31→**≥0.6** arquivos E linhas, senão merge BARRADO; denominador só destino declarado). Branch `feat/beauty-inbox-a1-reporte` → parity verde → PR → deploy app.nexvybeauty.com.br → verificação visual. ⚠️ NÃO confundir com `inbox-sections/` (Radar/Follow-Up/Relatórios, já entregue `47dd906`). **STATUS: ⏳ HITL — aguarda GO explícito do Marcelo.** Herdado 07-09 da sessão oráculo-da-dor (`local_cdefd684ef41`); herdeiro = esta frente GO-LIVE (`local_6b58a27a9398`). | 🅲 originais existem prontos — é PORTE com tema, não construção | M-G |
| 1.2 | A7 `followup-ai-draft` (L13) da plataforma | 🅲 não existe em functions/ | M |
| 1.3 | `trigger_flow`: enviar a 1ª msg via Cloud API (hoje persist-only; replicar padrão do `notify_whatsapp`) | 🅲 gap em `platform-webhook-receiver:1567-1606` | P |
| 1.4 | LOTE adiados: L1 (campanha recorrente mente), L4 (lembrete booking — agora via WhatsApp por decisão de hoje), L5, L10 | 🅳 CONSOLIDADO 75% (8/13) | M |
| 1.5 | D5(b) Mia com botões inline Confirmar/Cancelar — você aprovou verbatim 03/07 17:32 | 🅳 sem evidência de entrega | M |
| 1.6 | D7 webhooks de saída · D9 push — "resto adiado" (`f8b6145`) | 🅳 | M |
| 1.7 | D6b suíte profunda Agentes IA (editor 13 abas → hoje 3 campos; UI do supervisor) | 🅳 F2 nota explícita | G |
| 1.8 | A3 `transfer_sector` → **decisão: DROP** (aguarda seu ok) | 🅲 stub neutralizado | zero |

### FRENTE 2 — Autopilot de venda (fechar o funil de verdade)
| # | Item | Evidência | Esforço |
|---|---|---|---|
| 2.1 | **F5 prova de fogo do FUNIL COMPLETO**: LP → WhatsApp → Duda qualifica → Bia oferta → link Cakto → pagamento-teste → org. O *provisionamento* foi provado 07-08; o funil *conversacional* ponta-a-ponta, não | 🅲 parcial | M (teste) |
| 2.2 | F4.3 **secrets** `TELEGRAM_ALERT_BOT_TOKEN`/`CHAT_ID` (código pronto) | 🅲 | P (ops, você) |
| 2.3 | Atribuição Cakto: reconciliar slug `duda-sdr`×`duda` + **1 pagamento-teste** (sem isso tudo cai em `sem_atribuicao`) + deploy do workflow | 🅳 ATRIBUICAO 07-06: "não é opcional" | P-M |
| 2.4 | Onda 5.1 scoring determinístico `computeQcrScore()` em código (QCR PR÷217) | 🅳 sem marca | M |
| 2.5 | Onda 5.3 transição-upgrade `[PASSAR_BIA]` · 5.7 calibração do 35% com dado real | 🅳 | M |
| 2.6 | 2.5 humanização (agrupamento/digitação) nas respostas | 🅳 | P-M |
| 2.7 | `founder_status` **LEITURA** no runtime (bifurcar concierge×autopilot; write já provado) | 🅲 write ✅ / read ❔ | P |
| 2.8 | F3 CTA LP→`wa.me` com UTM + tracking 1st-party | ❔ verificar antes | P |
| 2.9 | **Copy da LP**: "15 vagas, 5/semana" contradiz o 30/30/1 que você ratificou | 🅳 conflito interno nunca corrigido | P |
| 2.10 | Sync Cakto automático ao salvar plano (seu pedido 30/06, botão como fallback) | 🅳 sem evidência de entrega | P |

### FRENTE 3 — Operação da dona (valor no dia-1) — o teto físico
| # | Item | Evidência | Esforço |
|---|---|---|---|
| 3.1 | B3 semi-auto: pós-compra criar `evolution_instances` + e-mail com deep-link do QR (o scan é humano; o resto não) | 🅳 | M |
| 3.2 | **F6 pipeline de ingestão**: pós-scan, consumir `MESSAGES_SET`, gravar com `wa_timestamp`, dedupe → derivar `clientes` | 🅲 hoje ZERO backfill (46 msgs, tudo canal Meta ~7 dias) | G |
| 3.3 | **PoC profundidade real do history-sync** (investigação 07-08: 180d NÃO garantido; config `syncFullHistory:true`+browser Desktop; medir `min(wa_timestamp)` em 3-5 números reais) — *bloqueado no seu número de salão-teste + local da instância Evolution* | 🅲 pesquisa feita | P (medição) |
| 3.4 | B8/Radar com matéria-prima (consequência do F6) | 🅳 | herda 3.2 |
| 3.5 | C4 watcher de queda de sessão WhatsApp (dona nem percebe que caiu) | 🅳 FALTA | M |
| 3.6 | C2/C3 painéis de ativação/recuperado (parciais) | 🅳 | P-M |
| 3.7 | LGPD do F6: dona=controladora; base legal/consentimento no onboarding + DPA | pesquisa 07-08 | P (jurídico) |

### FRENTE 4 — Canais: IG Direct + Messenger (pedido 24/06, plano de 6 blocos, ZERO código)
| # | Item | Evidência |
|---|---|---|
| 4.1 | 23 itens do `todo-ig-messenger-inbox.md` — só a migration foi autorada (nem aplicada). Gargalo raiz: **App Review Meta nunca submetido** (exige embed + vídeo seu). Você mandou "desligar" em 30/06. **Decisão: retomar ou enterrar formalmente?** | 🅳 |

### FRENTE 5 — UI/Design
| # | Item | Evidência | Esforço |
|---|---|---|---|
| 5.1 | **Lux L4**: 47 telas (P2=18 + P3=29) + limpeza rosa (16 arquivos) + TEMPLATE_v2 + **rubric v2** (a atual ainda ancora no AZUL supersedido) | 🅳 pendente em todos os docs; sessão executora morreu por limite | G |
| 5.2 | Revisão adversarial Fable tela-a-tela (nunca rodou — "sem crédito") | 🅳 | M |
| 5.3 | Eyeball U4 (seu átomo — re-skin do gestao) | 🅳 | você |

### FRENTE 6 — CRM do grupo / multiproduto (E1/D3 — P4 do MEMORY)
| # | Item | Evidência |
|---|---|---|
| 6.1 | E1 pivot completo: LOTE L1-L13 **product-aware**, seed ~9 produtos, lead manual gravando `product_id NULL`, F2 sem prova runtime, **religar 10 stubs pós-Lux** | 🅳 "decidido, não executado" + branches não mergeadas |
| 6.2 | D1(b) Meta Cloud por produto · Utmify (sem credenciais) | 🅳 |
| 6.3 | Migração domínio `gestao.nexvy.tech` + reskin neutro | 🅳 |

### FRENTE 7 — GTM (humano — seu)
| # | Item |
|---|---|
| 7.1 | Coortes piloto: warm intros (4.1), ≥3 pagamentos reais (4.2), coortes 2-3 (4.3), medição semanal (4.4), veredito métrica-mãe semana 12 (4.5) |
| 7.2 | V5 "demo que se vende sozinho" (tour público) — nunca iniciado |
| 7.3 | Gaps CBA sem entrega: Landings, NBA IA, Workflows, Squad, Materiais, Scoring standalone, tela Playbook (2/9 entregues). **Decisão: quais ainda valem?** |

### FRENTE 8 — Arsenal / malha de agentes (specs prontas, implementação aberta)
| # | Item | Evidência |
|---|---|---|
| 8.1 | Checklist §12 do playbook-mestre: **33 itens todos `[ ]`** — estado-do-contato injetado, abandono de checkout→resgate, transições/handoffs, **10 testes de aceitação** (trava-fundadora, anti-desconto, anti-alucinação…), dashboard de métricas | 🅳 maior bloco 100% aberto |
| 8.2 | Deduplicar com o que F2 já entregou (parte do §12 pode já estar coberta pelo brain — exige verificação item a item antes de executar) | ❔ |

### FRENTE 9 — Débitos técnicos e decisões pendentes
| # | Item | Evidência |
|---|---|---|
| 9.1 | Migration versionada de `opportunity_scan_schedules` (tabela só no banco+types; `db reset` quebraria) — **fire-now** | 🅲 |
| 9.2 | Afiliados fases 2-5 (reconciliador/antifraude/payout/portal) presas em branch **224 commits stale**. Decisão: reimplementar sobre main ou descartar | 🅳 |
| 9.3 | Telefonia Salvy: código pronto em branch, não mergeado, sem secret, sem deploy (80%) | 🅳 |
| 9.4 | PRECO: editar migrations `20260705_*` na fonte (re-provisionamento pode reintroduzir preço em texto nas personas) | 🅳 |
| 9.5 | WIP `stash@{0}` (scenario-match do telefonia-salvy) — provavelmente superseded por `cab7c7d`; confirmar e dropar | 🅲 |
| 9.6 | `feat/beauty-lux-l4` sem branch remoto (risco de perda) + merge `feat/afiliados-proprios` aguardando decisão | 🅳 |

---

## 4. Padrões de morte (por que as coisas somem) + antídotos

| Padrão | Casos | Antídoto |
|---|---|---|
| Sessão morre (limite/contexto) e ninguém herda | Lux L4 ("não andou nada"), IG/Messenger (morreu na exploração) | Handoff obrigatório + herdeiro nomeado no ato da morte |
| Frente nova engole a fila sem fechar a anterior | LOTE L1-L13 → Lux → E1 → E4 | 1 frente só fecha com Review preenchido; WIP-limit |
| Executor "simplifica" sem plano aprovado | inbox 43→9 arquivos, composer 30KB→texto | Sua regra já existe ("porte = cópia, nunca simplificação") — falta gate de diff-contagem no review |
| Doc sem checkbox/Review → parada invisível | RETOMADA (sem checkboxes), PLANO-LUX (Review "preencher") | Todo plano nasce com checks binários + seção Review (sua regra §8.3 — cumprir) |
| Doc não recebe errata ao ser superado | 17 clusters de conflito | Errata datada obrigatória (despachada p/ `ef8ba55e`) |

**Contraste que prova o ponto:** pedidos pontuais em sessão única fecham com prova (9 casos: inbox na janela, catálogo no inbox, relatórios, msg apagada, linguagem multi-nicho, gating de módulos, SDR nunca-rejeita, quiz podologia, multi-host). O sistema morre nas frentes **longas e órfãs**.

---

## 5. Decisões que SÓ VOCÊ pode tomar (destravam o resto)

1. `transfer_sector`: **dropar?** (recomendo sim)
2. IG/Messenger: retomar (submeter App Review Meta — exige vídeo seu) ou enterrar formalmente?
3. Gaps CBA (7 abertos): quais ainda valem?
4. Afiliados fases 2-5: reimplementar sobre main ou descartar branch stale?
5. Telefonia Salvy: mergear + secret + deploy agora?
6. Salão de teste (número + onde roda a Evolution) → destrava PoC do F6 (3.3)
7. Secrets Telegram (bot/chat) → acende C1/F4.3 em 5 minutos
8. Coortes piloto (venda humana): quando você inicia?

## 6. Top-8 execução recomendada (sem depender de você)

| Ordem | Item | Por quê |
|---|---|---|
| 1 | 9.1 migration B7 | fire-now, 30min, fecha débito de schema |
| 2 | 1.1 A1 composer (porte 8 componentes) | sua reclamação nº1, originais prontos, alto impacto visível |
| 3 | 1.3 trigger_flow 1ª msg | pequeno, padrão já existe |
| 4 | 2.9 copy LP 15→30/30/1 | incoerência pública com decisão ratificada |
| 5 | 2.7 founder_status READ | fecha o ciclo da trava fundadora |
| 6 | 2.4 scoring QCR em código | tira a qualificação do "feeling" do LLM |
| 7 | 1.2 followup-ai-draft | completa o LOTE órfão |
| 8 | 5.1 Lux L4 (em ondas, com herdeiro) | maior bloco visual pendente |

---

*Fontes primárias: 34 docs em `apps/NexvyBeauty/tasks/` + `_indice-planos/`; JSONLs-tronco `986d864f`, `b39039b0`, `22085aba`, `2c9bdcd8`; auditoria-portagem (`E-inbox.md`, `CONSOLIDADO-CORRECOES-E-DECISOES.md`); verificação de código em `SaasPlugin_vite@main cab7c7d` + Supabase `fzhlbwhdejumkyqosuvq` (functions v19/v17) em 2026-07-08.*
