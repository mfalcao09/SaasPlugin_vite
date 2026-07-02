# Consolidado para Decisão — Módulo Vendas (pós-entrega + pós-auditoria)

> **2026-07-02.** Funde: relatório de entrega (`docs/porte-modulo-vendas-DONE-2026-07-02.md`) + auditoria de código (dossiês A–H) + liveness página-a-página (dossiê I, 48×32 telas). Organizado por **tipo de decisão sua**: o que é correção objetiva (aprovar em lote), o que é decisão de produto (escolher opção), o que já estava registrado.
> Esforço: **P** = horas (1 agente) · **M** = meio dia–1 dia · **G** = dias.

---

## 1. Estado em 5 linhas

1. O CRM está **instalado e operável (~90%)**: 19 telas 1:1 pixel-perfeito, fronteira tenant↔plataforma intacta em 9/9 áreas, zero quebra no tenant, motores de atendimento com liveness E2E provada.
2. Em alguns pontos o port **supera o original** (bugfix normalizePhone, reagendamento funcional, Setores renderiza, banner honesto de canal).
3. O "não-1:1" tem **uma causa-raiz**: a cauda **outbound/dispatch/canal/builder/ação** foi deferida com `TODO` declarado.
4. **8 itens "parecem funcionar mas não entregam"** — são os que constrangem em demo/venda; todos baratos (LOTE ÚNICO abaixo).
5. **10 decisões de produto** genuinamente suas (D1–D10) — nenhuma bloqueia o uso operacional de hoje.

---

## 2. 🔴 LOTE ÚNICO de correções objetivas — aprovar em bloco

*Não envolvem decisão de produto: hoje mentem pro usuário ou são bugs/lixo. Se você aprovar "LOTE", executo todos.*

| # | Item | O que acontece HOJE | Correção | Esforço |
|---|---|---|---|---|
| L1 | Campanha "Recorrente" | UI grava recorrência; envia 1× e **nunca re-enfileira** | portar `campaign-recurring-snapshot` → `platform-*` + cron 15min | P/M |
| L2 | Cron do dispatcher de campanhas | edge existe e **ninguém dispara** | criar `pg_cron` p/ `platform-campaign-dispatcher` (1 SQL) | P |
| L3 | Cron de auto-notificações | idem | `pg_cron` p/ `platform-auto-notifications` (1 SQL) | P |
| L4 | Notificações de booking | UI configura templates/lembretes; **nada é enviado** | portar `platform-booking-dispatcher` (+confirmação) + cron | M |
| L5 | Cooldown de canal | hooks referenciam `cooldown_until` sem UI → **falha de envio silenciosa** | re-adicionar `ProviderCooldownBadge` (67 linhas, self-contained) | P |
| L6 | 🐞 Menu "Formulários" | cai na aba **Funis** do manager | passar `initialTab` correto | P |
| L7 | LeadDetail → Cadência | "inscrever/remover" = toast "em breve" — **mas os edges já existem** (`platform-cadence-enroll/stop`) | só wiring front | P |
| L8 | LeadDetail → Transferência de carteira | botão stub + sem histórico (o bulk da LISTA funciona → assimetria confusa) | tabela `platform_crm_lead_transfers` + modal + histórico | M |
| L9 | Leads: visão gerencial "Por Squad" | só existe "Meu Squad" (pessoal) | portar aba `by-squad` do original | M |
| L10 | Disparo em lote | vendedor só dispara 1-a-1 | portar `manual-outreach-batch` (single já existe de base) | P/M |
| L11 | Cadências sem "Biblioteca de Contextos" | modelo tem 4 abas; port 3 — **a Biblioteca já existe em Campanhas** | reusar componente na aba de Cadências | P |
| L12 | Higiene | `PlatformCrmDealsManager` órfão + **2 entrypoints coexistindo** (`SuperAdmin.tsx` legado ↔ `PlatformShell`) | remover dead-code + consolidar entrypoint | P |
| L13 | `followup-ai-draft` | provavelmente já coberto por `platform-sales-copilot` | 1 diff de confirmação; portar só se faltar | P |

**Total do lote: ~2 dias de agentes em paralelo + verificação.** Fecha TODOS os 🔴 do relatório de auditoria exceto o que depende de D1 (canal Meta).

---

## 3. 🟠 Decisões de produto (D1–D10) — escolha por item

### D1 · CANAL — a decisão-raiz (afeta L4, Meta/IG, push)
**Hoje:** port é 100% Evolution/Baileys (QR pronto, instância `nexvy-operacao-vendas` aguardando você escanear). Meta/IG = wizard salva credencial mas **conecta e fica muda** (sem webhook inbound, sem send). Web push = 0%.
- **(a) Evolution-only por agora** — marcar Meta/IG "em breve" (badge nos wizards), registrar decisão no repo. Custo: P. *(recomendo: destrava tudo, coerente com "API oficial no radar")*
- **(b) Plugar Meta Cloud agora** — portar send+inbound+webhooks (`platform-meta-whatsapp-webhook`, `-send`, idem IG). Custo: G. Exige app Meta aprovado/credenciais.
- **(c) Deixar como está** — wizard funcional que resulta em canal mudo. *(não recomendo: é o pior dos mundos — parece que funciona)*

### D2 · Plataforma DESENHA ou ORQUESTRA? (Captação)
**Hoje:** super-admin cria/lista/analisa funis-forms-quiz, mas **não desenha** (6 builders visuais = TODO; ~60% das linhas da Captação original).
- **(a) Orquestra-only** — esconder CTAs de builder, badge "construa no app". Custo: P.
- **(b) Portar builders completos** (FlowCanvas, Form-builder, Quiz-builder+IA, Widget-embed). Custo: G/GG.
- **(c) Meio-termo dirigido pela LP** — portar SÓ o builder que a LP nova vai usar (ex.: quiz de captação). Custo: M/G. *(recomendo (c) quando a LP definir a mecânica de captação; até lá (a))*

### D3 · Pipeline único global (sem `product_id`) — validar AGORA
Reverter depois = reescrita. Modelo é pipeline-por-produto; port é único.
- **(a) Manter único** — vendemos 1 SaaS (NexvyBeauty); 1 funil. *(recomendo)*
- **(b) Reintroduzir dimensão produto** — se a operação vai vender múltiplos SaaS (Oficinas, LAW…) pelo MESMO CRM. Custo: G.

### D4 · Financeiro — dashboard de aprovação/pagamento de comissões
**Hoje:** port tem Regras+Comissões+Metas; modelo tem **Dashboard Financeiro** (KPIs de vendas + fila Pendentes/Aprovadas → "aprovar para liberar pagamento").
- **(a) Adiar** até existir comissão real sendo paga a squad/afiliado. *(recomendo por ora)*
- **(b) Portar agora.** Custo: M/G.

### D5 · Mia — v2 com AÇÃO e MEMÓRIA
**Hoje:** read-only (briefing+chat+contexto). Modelo: 5 abas, **executa ações com confirmação** (`mia_actions`) + memória (`mia_user_memory`) + wake-word.
- **(a) Manter read-only** V1. *(ok para operar)*
- **(b) Portar Mia-ação+memória** — o valor executivo mora na ação. Custo: G. *(recomendo como 1º upgrade pós-LP)*

### D6 · Agentes IA — profundidade de orquestração
**Hoje:** superfície ok (Supervisor/Importar presentes), mas editor = 3 campos; modelo tem editor 13-abas, hierarquia por-produto, humanização, chat de teste.
- **(a) Manter raso** até a operação usar agente-vendedor de verdade.
- **(b) Portar editor completo + supervisor.** Custo: G. *(depende de quanto da venda será IA-first; sugiro decidir junto com D5)*

### D7 · Webhooks (painéis Actions/Requests) + API de cadência (`cdn_`)
**Hoje:** recebe e loga; sem painéis de ações/requisições; aba API é shell.
- **(a) Adiar** até integração externa real. *(recomendo)*
- **(b) Portar.** Custo: M.

### D8 · Booking conversacional
Código 1:1 presente mas morto (falta coluna `booking_experience` + UI). **(a) adiar** *(recomendo)* / **(b) ativar** (migration + flag). Custo: M.

### D9 · Web push (VAPID)
Modelo notifica vendedor via push (o original tem toda a stack `push-*`). **(a) adiar** *(recomendo — notificação in-app existe)* / **(b) portar stack push.** Custo: G.

### D10 · `campaign-ai-insights` ("Analisar campanha" com LLM)
Canal-agnóstico, barato, já era funcional no original. **(a) reviver** — Custo: P/M *(recomendo)* / **(b) deixar dropado.**

---

## 4. Pendências que JÁ estavam registradas (não são achados novos)

| Item | Status | Dono |
|---|---|---|
| **QR do WhatsApp** — instância `nexvy-operacao-vendas` conectável, QR renderizando no painel | aguardando **você escanear** | Marcelo |
| **Widget do webchat na LP apex** | aprovado por você; embutir no fim do ciclo | eu |
| **Módulo ERP/Gestão + AffiliatesPanel** | sessão **conjunta** (ERP fala com tenant by design). Bônus da auditoria: modelo tem `IA da Plataforma`, `Consumo de IA` e `Implantação` por empresa como referência | nós |
| **Re-skin institucional do gestao.\*** (item 2 seu) | plano a produzir; referência visual = Bizon verde-escuro ou marca Nexvy | eu |
| **LP nova** (item 3 seu — "plano ousado") | minha recomendação registrada: LP antes do ERP | você define o plano |

---

## 5. Pacote recomendado (se você só quiser dizer "vai")

1. **LOTE ÚNICO completo** (L1–L13) — fecha tudo que "mente".
2. **D1(a)** Evolution-only assumido + badges "em breve" em Meta/IG (decisão reversível e registrada).
3. **D3(a)** pipeline único confirmado (registrar no repo).
4. **D10(a)** reviver ai-insights (barato).
5. Demais decisões (D2/D4–D9): **adiar conscientemente** — reavaliar após a LP nova, quando a mecânica de captação e o peso de IA-na-venda estiverem definidos.

**Efeito:** zero "parece-mas-não-faz" no módulo; tudo que ficar de fora fica **explicitamente marcado** na UI e no repo, não silencioso.
