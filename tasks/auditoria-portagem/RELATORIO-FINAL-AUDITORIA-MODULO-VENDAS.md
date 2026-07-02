# Auditoria de Portagem — CRM Vendus (Bizon Sales) → Módulo Vendas (super-admin `gestao.*`)

> **Data:** 2026-07-02 · **Método:** 9 dossiês read-only (comparação componente-a-componente vs `.vendus-src-reference/` = fonte do Bizon Sales) + comparação de liveness vs o app-modelo rodando no lovable (`0cbaf443`).
> **Escopo:** responder, com cada vírgula, **o que foi adaptado e por quê o resultado não é 100% 1:1** — e concluir se o CRM foi *inteiro* instalado no módulo. Auditoria de fidelidade, **não** certo-vs-errado.

---

## 1. Sumário executivo

**O CRM foi instalado no módulo com alta fidelidade onde porta (~75–98% por área), desacoplamento rigoroso e zero quebra no tenant.** Todos os "gaps" numéricos de cabeçalho que assustavam (edges 140→30, captação 72→10, integrations 30→8, agents 20→2) eram **ruído de contagem** — código herdado tenant-side ou subcomponentes de poucas features.

**O "não-1:1" tem uma causa-raiz única e coerente:** foi deferida, de propósito e com `TODO(edge)` declarado, toda a **cauda outbound / dispatch / canal / builder-visual / ação-autônoma**. O port reproduz fielmente o CRM que você **opera, lê e configura**; ele stuba sistematicamente o CRM que **age sozinho, constrói assets visualmente e orquestra agentes**.

---

## 2. Scorecard por área (9 dossiês)

| # | Área | Fidelidade | `[FALTA]` | `[ADICIONADO]` | Dossiê |
|---|---|---|---|---|---|
| A | Booking / Agenda | **~98%** núcleo | 0 | 2 (melhorias) | `A-booking.md` |
| F | Pipeline / Kanban / Leads | **~90%** | 5 | 2 | `F-pipeline-leads.md` |
| H | Config / Shell / Menu | **~87%** menu | 4 | 1 | `H-config-shell-menu.md` |
| D | Edges backend | **~92–95%** | 4 | 22 net-new | `D-edges.md` |
| C | Conexões (3 canais) | **~92%** | 2+1 | 0 | `C-conexoes.md` |
| G | Cadências / Campanhas | **~80%** | 4 | 1 | `G-cadencias-campanhas.md` |
| E | Inbox / Atendimento | **~75%** | 11 | 4 | `E-inbox.md` |
| B | Captação (camada platform) | **~65%** sup. / ~40% func. | 6 builders | camada nova | `B-captacao.md` |

> **Captação (nota):** o motor original de captação está **preservado 1:1 tenant-side (~99%)** em `cockpit/CaptacaoHub`; a camada platform (`superadmin/crm/capture/`) é nova e rasa de propósito. Os dois números medem camadas diferentes.

---

## 3. Veredito — "o CRM foi *inteiro* instalado?"

- **Como CRM que você OPERA / LÊ / CONFIGURA:** ✅ **SIM (~90%)** — com desacoplamento tenant↔plataforma correto e até *melhorias* sobre o original.
- **Como CRM que AGE SOZINHO / CONSTRÓI VISUALMENTE / ORQUESTRA AGENTES:** ⚠️ **adiado por design** — tudo `TODO(edge)` / stub / v2, **não perda acidental**.

**Fronteira respeitada com rigor em 9/9 áreas.** Zero `organization_id` vazando pro CRM de plataforma; slug migrou p/ `platform_crm_seller_booking`; `useEvolutionInstances` (tenant-bound) deliberadamente não importado. A "regressão" candidata do `FormBlockEditor` (dossiê B) era **falso alarme** — verificado: os arquivos ausentes não são importados pelo app real. Checagem extra no fecho: nenhuma escrita de evento-teste vazou pra tabela de tenant.

---

## 4. A causa-raiz única do "não-1:1"

Tudo que ficou de fora pertence à mesma família — **a cauda que efetivamente alcança o cliente ou constrói o asset**:

| Camada deferida | Evidência |
|---|---|
| Envio/dispatch real | Booking não notifica (sem `platform-booking-dispatcher`); campanha/cadência entregam **só no webchat** (`skipped_no_channel` sem conversa aberta) |
| Canal | Meta/IG **connect-only** (sem webhook inbound, sem send); **web push 100% ausente** (VAPID confirmado no modelo) |
| Builder visual | Captação **não desenha** funil/form/quiz (6 builders = `TODO(edge)`) |
| Orquestração de agente | Agentes: 20 arq. de orquestração → CRUD de 3 campos; **Mia virou read-only** |
| Recorrência/agendamento | Campanha "Recorrente" grava mas **não re-enfileira** (`recurring-snapshot` não portado) |

Isto **não é desleixo** — é uma escolha arquitetural consistente de adiar o que depende de decisões de canal + edges de dispatch conscientemente postergados.

---

## 5. Catálogo de gaps priorizado (o acionável)

### 🔴 Parece que funciona, mas não entrega (constrange em demo/venda)
1. **Campanha "Recorrente"** → envia 1× e nunca recorre (edge `recurring-snapshot` não portado). — *G*
2. **Campanhas da plataforma não disparam** — sem `pg_cron` para `platform-campaign-dispatcher` (o que roda é o cron do **tenant**). — *cron*
3. **`platform-auto-notifications` sem cron** — notificações automáticas da plataforma não saem. — *cron*
4. **Conexão Meta/IG conecta e fica muda** — sem `platform-meta-whatsapp-webhook` / `platform-instagram-webhook` (inbound). — *C*
5. **Booking**: notificações configuráveis mas **nunca enviadas** (sem dispatcher). — *A*
6. **Mia** parece assistente mas é **read-only** (perdeu enviar/atribuir/encerrar/remarcar). — *E*
7. **LeadDetail**: inscrever/remover cadência + transferir carteira = stubs "em breve" (mas o bulk-transfer da LISTA é real → assimetria confusa). — *F*
8. **Cooldown** de canal dropado mas hooks referenciam `cooldown_until` → falha de envio silenciosa sem UI de reset. — *C*

### 🟠 Rasez deliberada (decisão de produto sua)
9. **Captação não desenha** funil/form/quiz — orquestra, não constrói (6 builders `TODO`). — *B*
10. **Agentes**: 20 arquivos de orquestração viraram CRUD de 3 campos (sem editor completo/supervisor/roteamento multi-agente). — *E*
11. **Webhooks** (faltam painéis Actions/Requests) e **Financeiro** (falta dashboard de aprovação/pagamento) pela metade. — *H*

### 🟡 Menor / cosmético
- Booking conversacional = código morto (coluna `booking_experience` inexistente; precisa migration). — *A*
- `cadence-api` (`cdn_`) portada como shell; `campaign-ai-insights` dropado (era canal-agnóstico, barato reviver). — *G*
- Mídia de header de template Meta não sobe (`TemplateMediaConfig` dropado). — *C*
- Label "Inteligentes" removido de Campanhas/Cadências (branding). — *H*
- **Higiene:** `PlatformCrmDealsManager.tsx` = dead-code órfão; **2 entrypoints coexistindo** (`SuperAdmin.tsx` legado ↔ `PlatformShell` novo) — confirmar o vivo e limpar o outro. — *H*
- 4 edges menores sem port: `manual-outreach-batch` (disparo em lote — único operacional), `followup-ai-draft` (provável coberto por `platform-sales-copilot`), `booking-reply-ai`, `docs-scan-and-propose`. — *D*

---

## 6. Decisão transversal (raiz de tudo): **CANAL**

O port aposta **100% em Evolution/Baileys** (`evolution-send`/`evolution-webhook` presentes e v2.3.7 corrigido). **Meta WhatsApp Cloud** existe só como connect/test/template — **sem send nem inbound**. **Web push** foi 100% removido (o original tinha, via VAPID). → **Precisa ser explícita:** ou pluga Meta/push, ou marca "**Evolution-only by design**" num TODO no repo. Hoje, se o Módulo Vendas *promete* "WhatsApp oficial Meta" ou push, não entrega.

---

## 7. Infra — o cron (verificado em produção)

`pg_cron` tem 19 jobs ativos. **Dos motores da plataforma, só `platform-cadence-tick` está agendado** (`*/5`). Faltam: cron para `platform-campaign-dispatcher` e `platform-auto-notifications` (existem como edge, mas ninguém dispara). → Mesmo o código de campanha/notificação portado fielmente **não roda sozinho** hoje — é **config (2 crons) + 2 edges faltantes**, não re-portagem. Motores do tenant/salão rodam normal (não confundir).

---

## 8. Comparação de liveness — página a página (COMPLETA)

**48 telas do modelo** (40 seções `/admin` via `?tab=` + 8 `/super-admin`) × **32 telas do port** examinadas visualmente, ambas autenticadas. Tabela integral no **[Dossiê I](I-liveness-paginas.md)**. Síntese:

- **✅ 19 telas 1:1 pixel-perfeito** (estrutura): Dashboard, Agenda+booking, Chat, Painel, Radar IA, Follow-Up, Relatórios, Webhooks, Form Vendedores, WhatsApp, Analytics, Conexões, Respostas, Campos, Etiquetas, Notificações, Horários, Central de Operação, Equipes.
- **⚠️ 7 deltas confirmados no olho:** Mia (2/5 abas, sem Pendências/Comunicações/Memória/ação) · Pipeline (único × por-produto) · Leads (sem visão gerencial "Por Squad") · Agentes (Supervisor/Importar PRESENTES, mas sem Hierarquia/Lista nem vínculo por-produto) · Campanhas (sem aba **Throughput**) · Cadências (sem aba **Biblioteca de Contextos**) · Financeiro (sem Dashboard de vendas/aprovação de comissões).
- **🐞 1 bug pequeno:** menu "Formulários" (Captação) cai na aba Funis do manager.
- **🔁 By design:** products→Planos (decisão Marcelo); payments/integrations/company/plan/support→ERP.
- **➕ Port melhor em:** Setores (renderiza; modelo em branco), banner honesto de canal no WhatsApp, dados reais em toda parte.
- **Único delta puramente visual:** tema **verde-escuro institucional** (modelo) × **rosa** (port, herdado do tenant beauty) → referência concreta pro re-skin.
- **Bônus ERP:** o `/super-admin` do modelo tem **IA da Plataforma** (chaves+roteador), **Consumo de IA** (custo por empresa) e ação **Implantação** por empresa — insumo pra sessão conjunta do Módulo ERP.

---

## 9. Onde o port SUPERA o original

- `normalizePhoneBR` agora roda ao criar lead (era código morto no original — **bugfix**). — *A*
- Picker de reagendamento **funcional** em `/reagendar/:token` (o original só re-renderizava a confirmação). — *A*
- Seções `FormTemplatesSection` + `WhatsAppTemplatesSection` + `AnalyticsTab` (recharts) adicionadas. — *B*
- Edge `platform-mia` unificada (2 modos) vs 4 edges no original. — *E*

---

## 10. Recomendações priorizadas

1. **Antes de qualquer demo/venda que toque automação:** resolver os 🔴 #1–#5 (recorrência, 2 crons, webhook Meta/IG, booking-dispatcher). São baratos e são os que "mentem" pro usuário.
2. **Decisão de produto (você):** plataforma *desenha* (Captação builders + Agentes completos + Mia-ação) ou só *orquestra*? Isso define ~60% do "gap funcional".
3. **Decisão de canal (você):** Evolution-only assumido, ou plugar Meta Cloud/push? Marcar no repo de qualquer forma.
4. **Validar agora (reverter depois = reescrita):** "pipeline único sem `product_id`" é definitivo? (dossiê F)
5. **Higiene barata:** remover `PlatformCrmDealsManager` órfão + consolidar os 2 entrypoints.

---

## Anexos — dossiês completos
`tasks/auditoria-portagem/`: [A-booking](A-booking.md) · [B-captacao](B-captacao.md) · [C-conexoes](C-conexoes.md) · [D-edges](D-edges.md) · [E-inbox](E-inbox.md) · [F-pipeline-leads](F-pipeline-leads.md) · [G-cadencias-campanhas](G-cadencias-campanhas.md) · [H-config-shell-menu](H-config-shell-menu.md)
