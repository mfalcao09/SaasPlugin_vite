> 🩹 **ERRATA (2026-07-09, controller · triagem 6cf2fc02, evidência verificada)** — L112 `transfer_sector` NÃO é 'schema pendente' — Marcelo DECIDIU 07-09: MANTER no CRM da plataforma e CONSTRUIR (setores product-scoped + sector_id + religar action + UI); backlog F1 do LEVANTAMENTO. · L114 F6 foi absorvido/especificado por DESENHO-ONBOARDING-NEXVYBEAUTY-2026-07-09.md (steps S2/S4, gate G0).
> Texto histórico preservado abaixo.

# PLANO — Autopilot de VENDA 100% (dia-0 da captação)
> 2026-07-05 · Base: AUDITORIA-AUTOPILOT-DIA0.md (bloqueadores A1-A7 verificados no código/banco)
> Funil-alvo: **LP → clicou → WhatsApp → tirou dúvida → comprou → provisionado** — zero toque humano (Marcelo só monitora pelo Telegram).
> No radar (fase 2, não bloqueia): Utmify + tráfego pago gerido no gestao.*.

## Estado verificado (de onde partimos)
- ✅ LP no ar com preços + oferta 30/30/1 + checkout Cakto populado (3 planos)
- ✅ 5 agentes criados em `platform_crm_product_agents` (is_active + active_in_whatsapp = true), com Objetivo/Regras/Tom
- ✅ Provisionamento Cakto→organizations→admin existe (`cakto-webhook` → `provisionPlatformPlan` → `ensureAdminUser`)
- ❌ **A6:** não existe número de WhatsApp de vendas (Salvy travou — ver triagem no fim)
- ❌ **A1:** `platform-evolution-webhook` ignora `MESSAGES_UPSERT` (`// TODO(inbox)`) — mensagem recebida cai no vazio
- ❌ **A2:** o runtime lê `platform_crm_agent_configs` (persona crua), NÃO os 5 agentes ricos — descasamento de tabela
- ❌ **A3/A4:** handoff não executa; Supervisor é stub em memória (some no reload); `agent_specialists`/`agent_routing_rules` = 0
- ❌ **A7:** `cakto-sync-offer` precisa rodar/conferir slugs — senão pagante cai em "plan not found" silencioso
- ❌ **B2:** org nasce sem slug → página pública 404
- ❌ **C1:** falha de provisionamento = console.error invisível — sem alerta

---

## FASES (ordem de execução; cada uma com check binário)

### F0-META — Integração Cloud API PROVISIONADA (2026-07-05, via Chrome_control)
Número de vendas **+55 11 95502-1205** (WABA NEXVY_VENDAS `976904392005535`, app NEXVY `1289456453376034`, phone_number_id `1239336002593934`) 100% no ar na Cloud API oficial:
- ✅ **Webhook repontado** do projeto antigo (`ifdnjieklngcfodmtied/whatsapp-webhook-nexvy`) → NexvyBeauty (`platform-meta-whatsapp-webhook/1f7ca6e3`), **verificado pelo Meta** (GET challenge) + campo `messages` assinado. Decisão do Marcelo: número é EXCLUSIVO do canal de vendas do NexvyBeauty (falar com salões) → repontar era o correto.
- ✅ **System User** `nexvysystemadmin` com a WABA NEXVY_VENDAS atribuída (acesso total) + token permanente (nunca expira, escopos whatsapp_business_management/messaging/business_management).
- ✅ **Conexão `1f7ca6e3` ACTIVE**: app_secret (HMAC) + access_token cifrados, validados no Graph. `subscribed_apps` = NEXVY app (200/success).
- ✅ Segredos transferidos browser→edge→DB (nunca pelo chat); EFs descartáveis removidas.
- ✅ **Entrega determinística por API**: `override_callback_uri` na WABA (`POST /{waba}/subscribed_apps`) → Meta entrega direto na nossa função, sem depender da UI. App subscription confirmada via app token: `callback_url`=nossa função, `active:true`, campo `messages` assinado.
- 🐛 **Bug achado e corrigido (raiz do "não chega"):** a tela Configurações Básicas do Meta tem 2 campos mascarados; o App Secret certo é `js_d7` (não `js_bi`). O errado passava no shape (32-hex) mas o Meta rejeitava (`Error validating client secret`) → HMAC 401 silencioso. Fix: captura do campo certo + **validação contra o Meta (client_credentials) ANTES de salvar**.
- ✅ **F1.1 + F5.1 E2E PROVADO (2026-07-05 17:06Z):** msg real "Oi, quero saber do piloto" de +5518996267790 → **lead + conversa (`bot_active`) + mensagem no pipeline**, wamid real do Meta. Meta → webhook → HMAC OK → CRM. Instrumentação de debug removida; webhook limpo redeployado.

### F0 — Número de vendas ✅ PIVOTADO p/ Cloud API OFICIAL (2026-07-05 — Salvy comprada)
> Marcelo comprou linha Salvy → número de vendas vai na **WhatsApp Cloud API oficial** (não Baileys). Consequências: 0.2 (QR) e 0.3 (warm-up anti-ban) **caem** — API oficial não tem ban de automação nem precisa de aquecimento; risco assumido nº 1 deixa de existir para o funil de venda. Infra descoberta: porte Vendus (`platform-meta-whatsapp-*`, 6 EFs + wizard no gestao.* → CRM Plataforma → Conexões) já cobria connect/send/templates; faltava o RECEPTOR.
| # | Item | Check |
|---|---|---|
| 0.1 ✅ | Número BR (Salvy) | comprado (Marcelo, 2026-07-05) |
| 0.2 | Meta Business + app + WABA + registrar nº Salvy (OTP via painel Salvy) + System User Token — **checklist com Marcelo** | wizard do gestao.* salva conexão `active` |
| 0.3 | Webhook no Meta Console (URL+verify_token que o wizard exibe) + assinar `messages` | GET verification 200 no console |

### F1 — Motor inbound (o ouvido da máquina) ✅ ENTREGUE E PROVADO (2026-07-05, Cloud API)
| # | Item | Check |
|---|---|---|
| 1.1 ✅ | `platform-meta-whatsapp-webhook/{connection_id}` (nova EF, deployada): GET verification + POST HMAC X-Hub-Signature-256 (timing-safe) → lead plataforma (dedupe por telefone) + conversa (`channel='whatsapp'`, `bot_active`) + mensagem + broadcast realtime pro inbox. Idempotência por wamid (índice único `uq_platform_crm_messages_wamid`) | **PROVADO E2E em prod** com payload sintético assinado: 200 + lead/conversa/mensagem criados no pipeline; re-entrega do mesmo wamid NÃO duplicou; token errado 403; POST sem assinatura 401 (rig de teste desmontado) |
| 1.2 ✅ | Vendas vs tenant: resolvido POR CONSTRUÇÃO — vendas = Cloud API (webhook próprio, tabelas `platform_crm_*`); tenants = Evolution (webhook próprio, tabelas de org). Canais fisicamente separados | msg pro nº de vendas não passa pelo caminho de tenant |
| 1.3 ✅ | **Bug de prod achado e corrigido pelo smoke:** `get_or_create_meta_master_key()` estourava 42883 (`gen_random_bytes` fora do search_path — pgcrypto vive em `extensions`) → o wizard quebraria no PRIMEIRO submit de credenciais. Fix: `extensions.gen_random_bytes` (migration `20260705_fix_meta_master_key_pgcrypto.sql`) | RPC retorna chave (len 44) em prod |

### F2 — ✅ ENTREGUE E PROVADO E2E (2026-07-05 18:25Z, ondas 1+2 paralelas)
> **Prova real:** Duda (agente rico, SDR) respondeu SOZINHA no WhatsApp do Marcelo: "Eu sou a Duda, SDR Qualificadora… te explicar tudo sobre o **Piloto Fundadora**… você trabalha como autônoma ou tem salão/equipe? E há quanto tempo atende?" — vocabulário do playbook ✓, qualificação ≥8 meses ✓, entrega Cloud API (wamid) ✓.
> Peças: `platform-sales-brain` (persona rica + playbook de `platform_crm_products` + `slots_left` real + `[HANDOFF_HUMANO]`→waiting_human + dedupe 5s) · gatilho fire-and-forget no webhook (só `bot_active`; humano assumiu = IA cala) · **ABERTO PARA TODOS** (decisão Marcelo 05/07) · copiloto com mesmo knowledge · hub editável (PlaybookTab/ObjectionsTab) · outbound humano na action send · supervisor twins persistidos (specialists/routing_rules) — UI do supervisor + especialistas múltiplos = D6b restante.
> Commits: ae73873 (webhook F1) · 12d51cb · cac095c · 555badc (F2+onda2). Deploy: 9 EFs + DEPLOY-VERDE `index-CZBRjXGg.js` + 3 origens 200.

### F2 — Cérebro que responde (agentes ricos no runtime) — CÓDIGO (o maior)
| # | Item | Check |
|---|---|---|
| 2.1 | Motor de resposta lê `platform_crm_product_agents` (os 5 ricos) — corrigir o descasamento A2 (runtime aponta pra tabela rica, ou compila rico→config no save) | resposta usa as REGRAS da Duda (pedir desconto → reancora na garantia) |
| 2.2 | Persistir Supervisor: twins de `agent_specialists`/`agent_routing_rules` da plataforma + UI salvando neles (matar o stub em memória) | reload mantém especialistas/regras |
| 2.3 | Handoff REAL: Orquestrador troca o agente ativo da conversa (Duda→Bia; →humano nos gatilhos) + grava histórico | conversa qualificada muda de persona comprovadamente |
| 2.4 | Trava fundadora no fluxo: Orquestrador lê `founder_campaign_status.slots_left` (mesmo banco!) e injeta permissão na Bia; `cakto-webhook` passa a ESCREVER `organizations.founder_status` | venda 31 não recebe oferta fundadora |
| 2.5 | Humanização (agrupamento/digitação, config da /empresa) aplicada às respostas de venda | delay/typing visíveis no WhatsApp |

### F3 — Fio LP→WhatsApp — CÓDIGO (pequeno)
| # | Item | Check |
|---|---|---|
| 3.1 | CTA "Quero uma vaga do piloto" → `wa.me/<numero>?text=` com msg pré-pronta + origem/UTM no texto (LeadCaptureModal vira fallback) | clique abre WhatsApp com contexto |
| 3.2 | Tracking 1st-party preservado na passagem LP→zap (código de origem na mensagem) | origem recuperável na conversa |

### F4 — Fecho do caixa (Cakto blindado) — CONFIG+CÓDIGO
| # | Item | Check |
|---|---|---|
| 4.1 | Rodar/conferir `cakto-sync-offer` p/ os 3 planos (slugs mapeados) | webhook de teste não cai em "plan not found" |
| 4.2 | Slug da org no provisionamento (B2) — gerar no INSERT | org nova → `/s/<slug>` responde 200 |
| 4.3 | **Alerta de falha → Telegram** (C1): provisionamento falhou → mensagem no controlador na hora | falha simulada chega no Telegram |
| 4.4 | Pós-pagamento → boas-vindas automática + entrada no fluxo de onboarding (Nexvy) | pagante recebe boas-vindas sem toque |

### F5 — Prova de fogo (gate de GO) — TESTE
| # | Item | Check |
|---|---|---|
| 5.1 | Lead E2E real (+5518996267790): LP → WhatsApp → Duda qualifica → Bia oferta → link Cakto → pagamento teste → org com slug + founder_status + boas-vindas | funil completo sem toque humano, prova por etapa |
| 5.2 | Edge cases: desconto / pedir humano / raiva / fora de escopo | respostas nas regras; handoff humano dispara |
| 5.3 | Monitoramento: cada venda e cada falha chegam no seu Telegram | 2 notificações de teste recebidas |



### ONDA 4/4b — VISUAL P1 NO AR (2026-07-05, gate GAN ≥85)
> 6 telas do gestao.* restyled pelo TEMPLATE-UI-GESTAO + revisão adversarial Fable (rubric 0-100): Pipeline (kanban), **Leads 88**, **Painel 86**, **Radar IA 92**, **Follow-Up 90**, **Dashboard/Central 88**. Estados vazio/skeleton/erro-com-retry em todas; identidade nome→telefone; tokens azuis institucionais (zero verde-lima/dark); fim do 'tudo em ordem' falso em erro; Ctrl+K nos leads; Supervisor CRUD; heartbeat de presença. Handoff Duda→Bia (fix crítico do SELECT role). Deploy: commit aeadcec, DEPLOY-VERDE index-BC0Rhvwp.js, 3 origens 200.

### FILA — ONDA 5 "Duda 95/100 + Bia Master-Closer" (especificada 2026-07-05; dispara quando a onda 4 drenar — teto 10-12 tarefas paralelas, ≤6 braços/onda)
> Diretivas Marcelo: (a) SDR ≥95/100, "é o seu melhor?"; (b) transição Duda→Bia = UPGRADE ("seu negócio é tão bom que merece uma atendente especial"); (c) Bia vende VALOR a cliente crítico — onde o PMF se materializa; qualquer erro perde lead qualificado.

| # | Item | Check |
|---|---|---|
| 5.1 | **Scoring determinístico em CÓDIGO**: extração LLM → `computeQcrScore()` (D1-D4 em TypeScript, nada de aritmética de LLM) → score/rota injetados no prompt como FATO. | mesmo diálogo → mesmo score, sempre |
| 5.2 ✅ | **Checkout na boca das agentes** (ANTECIPADO 05/07): brain busca `public_plans.checkout_url` (3 links) e injeta em `buildCheckoutContext`; **modelo corrigido** (diretiva Marcelo): DECIDIU → Duda manda o link direto (nunca demonstra, nunca passa pra Bia); QUALIFICADO+CÉTICO → Bia (value-selling, modelo caro). Onboarding pós-pagamento = cakto-webhook (já existe). | ✅ deployado + migration `modelo_checkout_bia_valor` aplicada |
| 5.3 | **Transição-upgrade**: reescrever protocolo [PASSAR_BIA] com o feeling "cliente especial" + fala-modelo aprovável. | fala da transição elogia o negócio da lead |
| 5.4 | **Bia master-closer**: braço Fable pesquisa value-selling (Challenger, SPIN, Gap Selling, Sandler, JOLT/indecisão, Hormozi objeções/closing) → playbook de FECHAMENTO POR VALOR (demonstração dirigida, prova social, garantia como transferência de risco, coerência absoluta com LP/preços) → persona+knowledge da Bia. | doc pareado + persona no banco |
| 5.5 | **Modelo por papel no harness**: closer roda em modelo mais forte (env AI_SALES_BRAIN_MODEL_CLOSER; default > flash) — cliente crítico não conversa com modelo econômico. | Bia responde no modelo forte (metadata) |
| 5.6 | **Evals v1**: 8-12 golden conversations (incl. a conversa real de 05/07 como regressão) rodadas contra Duda/Bia antes de qualquer mudança de prompt; gate binário. | script de eval roda e reporta pass/fail |
| 5.7 | **Calibração com dado real**: taxa de sumidas por sub-vertical medida do próprio Radar (quando houver dados) substitui o benchmark 35%. | parâmetro vira consulta, não constante |

### FILA — ONDA 6 "REVIVAL" (lei do Marcelo 05/07: "toda função do CRM remix Vendus deve ser mantida" — cortes de porte por infra-ausente devem ser REVIVIDOS agora que a infra existe)
> Auditoria 05/07: onda 4 NÃO removeu função (Wifi=troca de ícone; onNavigate=refatorado e preservado; dropdowns intactos). Os cortes reais são DE PORTE, documentados nos headers — e a infra que faltava HOJE EXISTE:

| # | Função cortada no porte | Motivo da época | Infra hoje | Revival |
|---|---|---|---|---|
| 6.1 | `resend` (reenviar msg) — webchat-inbox | "sem provedor de canal" | Cloud API sender PRONTO | religar action |
| 6.2 | `set-product` — webchat-inbox | "sem produtos" | D3 + produto seedado | religar action |
| 6.3 | `activate-bot`/`ai-reactivate` — webchat-inbox | "bot = fase futura" | **sales-brain EXISTE** | religar (ativar/desativar IA por conversa na UI) |
| 6.4 | `trigger-flow` — webchat-inbox | "flows = fase futura" | parcial (chat_flows existe) | avaliar+religar |
| 6.5 | `notify_whatsapp` — webhook-receiver (no-op) | sem canal | Cloud API sender | religar |
| 6.6 | `ai_agent_outreach` — webhook-receiver (no-op) | sem motor IA | sales-brain | religar |
| 6.7 | `send_email` — webhook-receiver (no-op) | sem provedor e-mail | conta Resend existe (falta secret) | religar via Resend |
| 6.8 | `transfer_sector` — webhook-receiver (skip A3) | leads sem sector_id | decisão de schema pendente | migration coluna OU vínculo via sector_members → religar |

### F6 — Carteira-do-WhatsApp (decisão do Marcelo; paralelo, não bloqueia a venda)
Ingestão 180d da instância da DONA no onboarding: ao conectar, edge function puxa chats/contatos da Evolution → deriva clientes (nome+telefone+última interação) → Radar nasce com matéria-prima. **Ingestão INCREMENTAL** (history-sync do WhatsApp desce em camadas e varia por aparelho — contatos/chats vêm logo, profundidade chega progressivamente). Vira a espinha do autopilot de OPERAÇÃO — spec própria depois da venda no ar.

## Estimativa honesta
F0 = hoje (depende do número). F1+F3+F4 = 1-2 dias de código. F2 = o grosso, 2-4 dias (motor + supervisor persistido + handoff). F5 = meio dia. **Total realista: ~1 semana até o funil de venda 100% autopilot PROVADO.**

## Riscos assumidos
1. **Baileys (não-oficial) + tráfego pago = risco de ban real.** Mitigação: warm-up (0.3), perfil responder-first (inbound da LP é o mais seguro), e migrar o número de vendas para **WhatsApp Cloud API oficial** quando Utmify/ads entrarem (Evolution v2 suporta Cloud API).
2. Volume dia-0 baixo por design (30 vagas, 1/dia) — escala não é problema nesta fase.

---

## TRIAGEM — Salvy travou; alternativas para o número HOJE

**Por que a Salvy pode estar recusando:** cadastro deles exige CNPJ ativo com validação (e-mail corporativo + dados batendo com a Receita); CNPJs muito novos, MEI de categoria divergente ou validação de e-mail pessoal (gmail) costumam barrar. Vale 1 tentativa com: e-mail @nexvy.tech, CNPJ da operadora do SaaS, dados idênticos ao cartão CNPJ. Se barrar de novo, não insista — o número é commodity.

**Alternativas (da mais rápida à mais robusta):**
1. **Chip físico pré-pago (RECOMENDADA pra hoje):** Vivo/TIM/Claro, ~R$20 + recarga mínima, ativa em qualquer banca/farmácia. Coloca num celular secundário (ou slot eSIM/2º chip do seu), abre WhatsApp Business normal, escaneia o QR da Evolution. Em 1h está no ar. Guardar o chip vivo (recarga a cada ~3 meses) — só é preciso pra re-pareamento.
2. **eSIM pré-pago da operadora (mesma velocidade, sem loja):** Vivo Easy / TIM / Claro eSIM pelo app — compra digital, QR do eSIM no aparelho secundário, mesmo fluxo.
3. **WhatsApp Cloud API oficial (a rota da fase de tráfego):** número virtual (Twilio/Zenvia/360dialog/Gupshup) + Meta Business verificado. Mais setup (verificação Meta, templates), mas elimina risco de ban e escala com ads. **Não é pra hoje; é pra quando o Utmify entrar.** O plano já prevê a migração.
4. **Reusar temporariamente um número existente do grupo** (ex.: um chip Nexvy ocioso) só para o warm-up do funil enquanto o definitivo chega — aceitável por dias, não como identidade permanente da marca.

**Recomendação:** faz o (1) hoje (chip físico), conecta na Evolution, e o funil F0 destrava; a Salvy/Cloud API ficam pra fase de tráfego pago com verificação Meta.
