# 🔎 Drift-scan v0 — candidatos a "doc mente sobre o código" (Beauty)
> Gerado pela controller (subproduto da errata B2/B5/B6/B7). CANDIDATOS, não vereditos: cada item exige confirmação no código antes de errata (regra: evidência commit+file:line). Zumbis ⚰️ e docs já erratados excluídos. O reaper F4 vigia esta worklist (checkboxes).
>
> **🔬 TRIAGEM 2026-07-09 (sessão 6cf2fc02 — dono do domínio Beauty, a convite da controller).** Base de evidência: LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08 (research 3 frentes × código) + verificações desta sessão. Legenda: `[x]` = triado e RESOLVIDO (não-drift ou falso-positivo — nada a fazer) · `[ ] 🩹` = **ERRATA CONFIRMADA, aplicar** (evidência anexa) · `[ ] ❔` = precisa grep antes de veredito.
> **Vereditos:** 6 erratas confirmadas · 14 falso-positivos estruturais (o LEVANTAMENTO é doc-errata — excluir da varredura) · 15 não-drift (doc fala a verdade) · 3 a verificar.

## ATRIBUICAO-VENDAS-SELLER-2026-07-06.md
- [x] L141: verificação que FALTA (1 pagamento-teste) — **não-drift**: verdadeiro, pagamento-teste segue pendente (LEVANTAMENTO §2.3)
- [x] L172: "falta é o dado chegar" — **não-drift**: mesmo item acima, doc correto

## EVALS-AGENTES-2026-07-05.md
- [x] L177: gate zero-regressão — **não-drift**: linha de spec do gate, não claim de pendência
- [x] L196: "falha por falta de dado" — **não-drift**: descrição de design do eval

## HANDOFF-REDESIGN-LUX-ROSE-2026-07-06.md
- [x] L13: "no ar e verificadas" — **não-drift**: claim positivo VERDADEIRO (Lux L1-L3 no ar, confirmado)
- [x] L50: header "Planejado → Realizado → Falta" — **falso-positivo** (estrutura)
- [x] L59: L4 varredura pendente — **não-drift**: L4 segue pendente de verdade (P7 no MEMORY)
- [x] L77: header backlog — **falso-positivo** (estrutura)
- [x] L81: Fable sem crédito — **não-drift**: revisão adversarial segue não-rodada
- [x] L187: atribuição não provada E2E — **não-drift**: pagamento-teste segue faltando

## LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08.md
- [x] L23/L33/L34/L35/L37/L41/L44/L45/L47/L62/L99/L111/L153/L183 (14 hits) — **falso-positivo em bloco**: este doc É a errata (cita claims antigos PARA corrigi-los, com evidência 🅲 de código; itens pendentes listados são verificados). **Recomendação à controller: excluir LEVANTAMENTO-* e DESENHO-* do drift-scan** (docs-verdade/meta, mesma classe dos erratados)

## PLANO-AUTOPILOT-VENDA-2026-07-05.md
- [x] L111: `send_email` falta secret — **não-drift**: `RESEND_API_KEY` segue ausente (verificado no código: no-op logado). Nota: e-mail de BOOKING virou won't-do (decisão Marcelo 07-08: booking = WhatsApp do salão, nunca e-mail) — não confundir com esta action de CRM
- [ ] 🩹 L112: `transfer_sector` "decisão de schema pendente" — **ERRATA CONFIRMADA (decisão, não código)**: Marcelo DECIDIU 07-09: **MANTER no CRM da plataforma e construir** (tabela de setores product-scoped + `sector_id` + religar action + UI). Doc deve registrar a decisão e apontar o item pro backlog F1 do LEVANTAMENTO
- [ ] 🩹 L114: header F6 — **ERRATA CONFIRMADA (pointer)**: F6 foi absorvido e especificado pelo `DESENHO-ONBOARDING-NEXVYBEAUTY-2026-07-09.md` (steps S2/S4, gate G0 de profundidade). Adicionar ponteiro para o desenho canônico

## PLAYBOOK-CLOSER-BIA-2026-07-05.md
- [ ] 🩹 L221: "Evals são o gate que falta (5.6)" — **ERRATA CONFIRMADA (código)**: evals RODARAM e passaram — 12/12 verde (commit `b349da4` "Duda/Bia evals 12/12"; HANDOFF-LUX-ROSE registra "evals 12/12 verde ✅"). O gate 5.6 está SATISFEITO; pendente residual é só 5.7 (calibração do 35% com dado real)

## RETOMADA-UI-VENDUS-E-PLAYBOOK-2026-07-05.md
- [ ] 🩹 L30 (bloco §3 inteiro) — **ERRATA CONFIRMADA (código, a maior do lote)**: o doc marca FALTA para itens ENTREGUES em 07-05 — **U1** (layout 3 painéis: `PlatformCrmInbox.tsx:75-76` + `PlatformCrmLeadContextPanel.tsx` 456 linhas) · **U2** (abas c/ contadores: `PlatformCrmConversationList.tsx:266-304`) · **U3** (fallback identidade: `platformCrmIdentity.ts`) · **A2** (AnalysisPanel invoca `platform-analyze-conversation`: `PlatformCrmAnalysisPanel.tsx:20,57-58`, edge existe) · **A4** (heartbeat: `usePlatformPresenceHeartbeat.ts` montado em `PlatformShell.tsx:16`) · **A6** (dispatcher envia via Cloud API: `platform-booking-dispatcher/index.ts:81`). Commits `555badc`+`b349da4`. **Permanecem FALTA de verdade: A1 (composer — 8 comps), A3 (agora DECIDIDO manter/construir), A7 (`followup-ai-draft` não existe), U4 (eyeball Marcelo)** — bloco de errata no topo preservando histórico, padrão 🩹 da controller
- [x] L35: A1 composer — **não-drift**: genuinamente pendente (backlog F1.1 do LEVANTAMENTO)
- [x] L36: A2 — **coberto pela errata do L30 acima** (edge existe; item está FEITO)
- [x] L50: U4 eyeball — **não-drift**: átomo do Marcelo, segue pendente

## ROADMAP-CONSOLIDADO-VITRINE-2026-06-23.md
- [ ] ❔ L44: portar features pra `/salao/Agenda` (Google Calendar connect, multi-view…) — **verificar no código** antes de veredito (não coberto pelo research)
- [x] L78: parking lot — **falso-positivo** (lista de escopo deliberadamente estacionado, não claim)

## TEMPLATE-UI-GESTAO-2026-07-05.md
- [ ] ❔ L261: drill-down de org no-op — **verificar no código** (não coberto)
- [x] L301: guardrails/eyeball pendente — **não-drift**: verdadeiro (e o doc inteiro está marcado como tokens azuis supersedidos pelo Lux — candidato a ⚰️ na próxima revisão do canon, decisão da controller)

## todo-ig-messenger-inbox.md
- [ ] 🩹 L16: "Supabase MCP NÃO conectado nesta sessão" — **ERRATA CONFIRMADA (stale + reativação)**: nota era da sessão morta de 06-24 (MCP conectado nas sessões atuais). E a frente IG/Messenger foi **REATIVADA por decisão do Marcelo 07-09** ("devem voltar") — adicionar header de reativação apontando: gargalo real = App Review Meta (embed + vídeo do Marcelo), caminho no LEVANTAMENTO Frente 4
- [ ] ❔ L31: migration `20260624_meta_messaging_integrations` aplicada? — **verificar** (`list_migrations`/banco) antes de veredito
- [x] L53: enforcement 24h — **não-drift**: spec correta, pendente de verdade
- [x] L54: critério binário — **não-drift**: idem

## todo.md
- [ ] 🩹 L38: "Pendente TODO: platform-booking-dispatcher (envio email/WhatsApp)" — **ERRATA CONFIRMADA (código + decisão)**: (a) o dispatcher EXISTE e ENVIA via WhatsApp Cloud API, idempotente por wamid (`platform-booking-dispatcher/index.ts:81`, 267 linhas, deployado); (b) o canal e-mail virou **won't-do** por decisão do Marcelo 07-08 (confirmação de agendamento = WhatsApp do salão, NUNCA e-mail). O TODO está duplamente superado
