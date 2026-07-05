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

### F0 — Número de vendas + instância (HOJE; humano: 1 scan de QR — inevitável e único)
| # | Item | Check |
|---|---|---|
| 0.1 | Obter número BR (triagem Salvy abaixo — recomendação: chip pré-pago hoje; migração p/ API oficial na fase de tráfego pago) | número ativo recebendo SMS/ligação |
| 0.2 | Criar `evolution_instances` de VENDAS (escopo plataforma) + conectar via QR | status "Conectado" na gestão |
| 0.3 | **Warm-up do número** (2-3 dias de conversa orgânica leve antes de tráfego): número novo disparando frio = ban Baileys | ≥20 conversas orgânicas antes de escala |

### F1 — Motor inbound (o ouvido da máquina) — CÓDIGO
| # | Item | Check |
|---|---|---|
| 1.1 | Implementar `MESSAGES_UPSERT` no `platform-evolution-webhook`: mensagem → upsert lead da plataforma (por telefone) + conversa + mensagem persistidas | lead novo aparece no CRM da plataforma ao mandar "oi" |
| 1.2 | Distinguir instância de VENDAS (plataforma) vs instâncias de tenant no webhook (roteamento por instance) | msg pro nº de vendas NUNCA vira lead de tenant |

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
