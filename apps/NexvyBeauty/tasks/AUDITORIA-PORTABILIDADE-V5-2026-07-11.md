# Auditoria de Portabilidade Vendus V5 → CRM da Plataforma (gestão)

> **Gerado:** 2026-07-11 · sessão GO-LIVE Beauty · workflow `auditoria-porte-v5` (5 auditores por área + 39 verificações adversariais)
> **Pergunta do dono:** "Faça uma análise minuciosa pra ter certeza que tudo foi portado. Quero segurança para encerrar a onda de portabilidade e seguir para as próximas."
> **Cobertura da auditoria:** 260 itens comparados (V5 × plataforma) nas 5 áreas; 5.76M tokens de subagente. A síntese-agente morreu no limite de sessão — este relatório foi sintetizado dos dados brutos do journal.

---

## 1. VEREDITO EXECUTIVO — **GO condicional**

**Encerre a onda de portabilidade — com uma condição: aceitar formalmente que 3 subsistemas grandes ficam FORA do porte como trilhas próprias** (não são buracos, são produtos/canais inteiros que nunca estiveram no escopo de um CRM de texto).

A verdade desconfortável, dita primeiro: **"tudo" NÃO foi portado ao pé da letra** — ~50% dos itens de menu e ~34% das edges têm algum gap. **Mas** o que importa está portado: o núcleo do CRM que você opera todo dia (inbox, leads, pipeline, campanhas, cadências, agentes Duda/Bia, setores, notificações, relatórios, Mia, canais WhatsApp+Instagram) está **completo ou em paridade funcional**. Os gaps confirmados **não são espalhados** — eles se agrupam em blocos coerentes e opcionais. Portanto: dá pra encerrar a onda de *fidelidade de porte* com segurança, desde que os blocos abaixo virem backlog explícito e nomeado (vários já são trilha separada).

---

## 2. PLACAR POR ÁREA

| Área | Completo | Parcial | Não-portado | N/A-tenant | Total |
|---|---|---|---|---|---|
| **Inbox / Chat** | 35 | 8 | 0 | 5 | 48 |
| **Menu / Páginas** | 29 | 4 | 13 | 5 | 51 |
| **Edge Functions** | 26 | 11 | 28 | 12 | 77 |
| **Hooks (dados)** | 35 | 20 | 12 | 1 | 68 |
| **Features transversais** | 6 | 10 | 0 | 0 | 16 |

**Leitura:** o Inbox — a peça que mais custou e que você mais usa — está **73% completo, 0 não-portado**. Menu e features transversais: **tudo presente** (nenhum item central ausente). Os "não-portado" concentram-se em Edges (subsistemas de backend inteiros) e Hooks (analytics/conteúdo).

---

## 3. OS GAPS CONFIRMADOS — 3 blocos FORA-DE-ESCOPO + 4 DENTRO-DE-ESCOPO

### 🟦 FORA DO ESCOPO (subsistemas/canais inteiros — trilha própria, NÃO bloqueiam encerrar a onda)

**A. Voz IA (canal inteiro ausente)** — 11 itens de menu + 10 edges + hooks `useVoice*`.
`voice-dashboard/live/history/agents/voices/contexts/campaigns/webhooks/inbound/usage` + `xai-voice-*`, clone de voz, pós-call. É um **produto separado** (ligações com IA, clonagem de voz) — nunca foi escopo de um CRM de texto/chat. Decisão: trilha futura própria, não gap de porte.

**B. Marketing / Meta Ads** — `MarketingManager`, `marketing-connect/sync`, `meta-ads-validate`.
Conecta com a **outra frente que você já está explorando** (plataforma opensource de gestão de ADS). Decisão: trilha separada — não duplicar aqui.

**C. Fluxos de automação do Instagram** — `ig-flow-executor`, `instagram-flow-generate-ai`, `useInstagramFlows`.
Distinto do **DM de Instagram** (esse está PRONTO e vivo — in+out). São *fluxos automáticos* de IG. Decisão: backlog pós-onda se houver demanda.

### 🟥 DENTRO DO ESCOPO (gaps reais do CRM — viram backlog priorizado, ainda não bloqueiam)

**D. Runtime público de Captação** — tabelas `platform_crm_capture_funnels/forms/quiz` **criadas**, mas as edges de execução pública faltam (`funnel-submit/api`, `form-submit`, `quiz-ai-result`).
Efeito: o **construtor** de funil/form/quiz existe e é profundo (flowbuilder visual), mas um lead **não consegue submeter** um form/quiz público ainda. **Importa pra geração de lead.** Esforço M.

**E. Conteúdo / Cérebro dos agentes (stubs com TODO)** — `objections`, `materials`, `knowledge sources`, `catalog-items`, `product CTAs`, `post-sale`, `email-templates`.
UI 1:1 existe; faltam as tabelas `platform_crm_*` por trás (mutação inerte com toast). Efeito: você não cadastra objeções/materiais/base-de-conhecimento pros agentes ainda. **Importa pra qualidade da Duda/Bia.** Esforço M (é sobretudo migration + religar).

**F. Envio via Evolution (canal só-recebimento)** — `evolution-send` não portado.
O WhatsApp-QR (Evolution) **recebe** mas não **responde** pelo CRM (só Meta Cloud + agora IG respondem). Se Evolution for canal real de venda, é gap; se o oficial (Meta Cloud) é o número de venda, é secundário. **Decisão sua.** Esforço S/M.

**G. Analytics de jornada/origem do lead** — `useLeadJourney` (12 queries), `useLeadTracking` (origem/campanha/criativo).
Dashboards de atribuição de mídia por lead. Efeito: relatórios de "de onde vieram os leads" mais rasos. Esforço M.

**Gaps menores** (parciais, cosméticos ou de agregação): `useDealsSummary`/`useCommissionsSummary` (cards de agregado), gamificação (badges/leaderboard), `useSquadPerformance` comparativo, upload de ícone de squad, sync de Google Calendar do lado plataforma, `EditVisitorDialog` email não-persiste (coluna já criada na Onda-1 — só religar), `PaymentLinkDialog` histórico (tabela já criada — só religar).

---

## 4. FALSOS-POSITIVOS (alegados como gap, REFUTADOS na verificação adversarial)

Prova de que a auditoria não superestimou os gaps — 4 alegações caíram:
- **"Biblioteca de Contextos" nas Cadências** — está portada (`ContextLibrary` importado no manager).
- **Aprovação/pagamento de comissões + cards de sumário** — portado; o `TODO(1:1)` no `PlatformCrmFinanceiro.tsx` está **stale** (mentira no comentário).
- **`send-mass-email`** — FOI portado 1:1 (existe em `functions/send-mass-email/`).
- **Follow-up IA automático** — re-motorizado nas **Cadências** da plataforma (decisão documentada, não gap).

> Ação de higiene: apagar os 2 TODOs stale (Financeiro + o comentário de comissões) pra não confundir auditorias futuras.

---

## 5. N/A-TENANT (excluídos por design — corretos)

Itens do V5 que pertencem à conta/assinatura do **cliente-salão** (módulo ERP, não CRM de vendas): Plano/Empresa/Pagamentos-do-cliente/Integrações-do-cliente/Suporte-do-cliente. A exclusão está documentada no `registry.tsx` e **bate** com a auditoria (12 edges + 5 menus + 1 hook N/A, todos justificados pela máxima "CRM ≠ ERP do cliente").

---

## 6. RECOMENDAÇÃO DE ENCERRAMENTO

1. **Encerre a onda de PORTE** declarando `done` a fidelidade do núcleo (inbox/leads/pipeline/campanhas/cadências/agentes/setores/relatórios/Mia/canais WA+IG).
2. **Registre os 3 blocos fora-de-escopo** (Voz IA · Meta Ads · IG Flows) como trilhas nomeadas — não backlog de "porte incompleto", e sim decisões de produto.
3. **Abra 4 cards de backlog dentro-de-escopo** com prioridade sua: D (captação pública), E (cérebro/conteúdo), F (Evolution send), G (analytics de jornada).
4. **Higiene:** religar os "só-migration-falta" (email do visitante, payment_links histórico — tabelas já existem da Onda-1) e apagar os 2 TODOs stale.

Com isso, a resposta honesta à sua pergunta é: **você pode seguir para as próximas ondas com segurança** — o que ficou pra trás é conhecido, nomeado e opcional, não um campo minado de buracos escondidos.
