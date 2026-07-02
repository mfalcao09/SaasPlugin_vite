# Porte do CRM Vendus → Módulo Vendas (super-admin) — CONCLUÍDO com liveness

> **Data:** 2026-07-02 · **App:** NexvyBeauty (`gestao.nexvybeauty.com.br`) · **Projeto Supabase:** `fzhlbwhdejumkyqosuvq`
> **Escopo desta rodada:** fechar as últimas frentes do porte 1:1 do CRM Vendus como Módulo Vendas da plataforma — **Booking**, **Página pública de agendamento**, **Conexões (3 canais)** e **Evolution v2.3.7** — todas com **prova de liveness em produção** (Chrome logado + curl anti-phantom).

---

## 1. Resultado

O **Módulo Vendas** (réplica 1:1 do CRM Vendus, desacoplado em `platform_crm_*`, host `gestao.*`) está **totalmente portado** e com liveness provada. Critério objetivo **"sem EmBreve"**: `registry.tsx` tem **zero `<EmBreve/>`** (54 itens de menu com `render:` real). As menções "em breve" remanescentes são **toasts inline de micro-features** (builders visuais, filtros avançados, análise-IA) dentro de seções reais — não stubs de seção.

**Único item deixado por design para sessão conjunta:** desacoplamento do `AffiliatesPanel` / **Módulo ERP/Gestão** — o ERP se comunica com o tenant POR DESIGN (gerir empresas/assinaturas), então não é correção autônoma (decisão do Marcelo, 02/07).

---

## 2. O que foi feito nesta rodada

| Frente | Entrega | Tabelas / Edges |
|---|---|---|
| **Booking — fronteira do slug** | Slug do vendedor migrado de `profiles.booking_slug` (tenant) → nova tabela **`platform_crm_seller_booking`**; `ensurePlatformCrmBookingSlug` consulta seller_booking como **fonte de verdade** | `platform_crm_seller_booking` (nova) |
| **Booking — aba Notificações** | Portada 1:1 (estava faltando): template + variáveis + preview WhatsApp + lembretes + recuperação de não-confirmados | `platform_crm_booking_notification_settings` / `_reminders` |
| **Página pública de agendamento** | Rotas públicas `/agendar/:userSlug(/:eventSlug)`, `/confirmar/:token`, `/reagendar/:token`; guard via `PUBLIC_PREFIXES` (mesmo padrão de `/s/`,`/f/`) | edges `platform-booking-availability` / `-submit` / `-token` (públicas) |
| **Conexões — 3 canais** | Painel real "Suas Conexões": Evolution (WhatsApp QR), Meta WhatsApp Cloud, Instagram. Gate de limite-por-plano **removido** (operador ilimitado) | 4 tabelas de canal + 11 edges `platform-*` |
| **Evolution v2.3.7** | Proxy corrigido para a API **clássica v2.3.7** (`fetchInstances`, `connect/{name}`, `logout/{name}`, `webhook/set/{name}`) espelhando o proxy do tenant (known-good) | `platform-evolution-proxy` / `platform-evolution-webhook` |

---

## 3. Defeitos encontrados — o valor da verificação adversarial + liveness

Três defeitos **reais** foram capturados por verificação (não por auto-relato):

1. **🚨 Furo de fronteira (grave):** o porte do booking gravava o slug em `profiles.booking_slug`, e `profiles` **tem `organization_id`** = tabela do **tenant**. Escrever ali viola a máxima. **Corrigido:** slug mora em `platform_crm_seller_booking`; `ensure...` consulta essa tabela primeiro e **nunca** lê/escreve `profiles.booking_slug` (a coluna legada existe, mas é intocável).
2. **Aba "Notificações" = FALTA (drop mal-justificado):** foi dropada alegando "coluna inexistente", mas as tabelas `platform_crm_booking_notification_settings`/`_reminders` **existiam**. **Corrigido:** aba portada 1:1.
3. **Conexões — QR falhava com `400`:** dois agentes (front Conexões × Evolution v2.3.7) trabalharam independentes e divergiram no contrato — o edge esperava `connect_instance`/`disconnect_instance`/etc., mas o front enviava nomes curtos `connect`/`disconnect`. Ação não casava → fallback `400`. **Detectado no eyeball** (QR "não foi possível gerar") → **diagnóstico nos logs do edge** (`POST 400`, não 401 → auth ok) → **corrigido** (5 action names alinhados) → **QR real renderizou**.

> Sem o eyeball em produção, o defeito #3 passaria como "verde" (build ok, tsc ok, edges deployados). Prova = liveness.

---

## 4. Prova de liveness (produção, Chrome logado + curl)

| Item | Prova |
|---|---|
| Bundle servido (anti-phantom) | `PlatformShell` servido contém `platform_crm_seller_booking` (6×), `platform-evolution-proxy`, `platform_crm_evolution_instances`, `platform_crm_whatsapp_meta_connections` (4×) |
| Dashboard / Central de Operação | Renderiza com dados reais (2 conversas, Radar IA "4 leads sem responsável") |
| Agenda | 5 abas (Agenda · Reuniões · Tipos de Evento · Disponibilidade · Links da Equipe) |
| Tipos de Evento + **Notificações** | Editor abre 2 abas (Geral / 🔔 Notificações); template com variáveis + **preview WhatsApp ao vivo** com substituição |
| Escrita real | Criar evento → `platform_crm_booking_event_types` (toast "criado com sucesso", aparece na lista) |
| **Conexões** | Painel "Suas Conexões" 3 canais; instância `nexvy-operacao-vendas` listada (Padrão / Aguardando QR) |
| **QR Evolution** | **QR real escaneável** renderizado no ConnectDialog (após fix do 400) — pronto para parear |
| **Página pública** | `/agendar/vendas-nexvy` (redireciona pro apex público) mostra "Marcelo Falcão" + bio (de `seller_booking`) + evento — cadeia edge→slug→vendedor→eventos |
| Edge availability | curl 200 com 18 slots (fixture, removido) |

Deploy: commits `a122c47` (porte) + `c5498e9` (fix 400) em `main`; container `nexvy-beauty` rebuild `--no-cache` servindo `app.*` + `gestao.*`.

---

## 5. Fronteira tenant ↔ plataforma (a máxima) — respeitada

- **Zero WRITE em `profiles`** no código do CRM (todos os `.from('profiles')` são `.select` display-only de `full_name/avatar_url/email`).
- **Zero `organization_id`** em código (só em comentários explicando o desacoplamento).
- Slug do vendedor em `platform_crm_seller_booking` (não em `profiles`).
- A `evolution_instances` **do tenant** (org-scoped) permanece **intocada** — Conexões usa a nova `platform_crm_evolution_instances`.
- Página pública anon nunca lê `profiles` direto — nome do vendedor vem via edge service-role.

---

## 6. Pendências explícitas (documentadas, não escondidas)

- **Meta WhatsApp Cloud + Instagram:** front + edges portados 1:1, mas **dormentes até credenciais Meta** (o Marcelo decide Evolution × API oficial — "no radar").
- **Booking dispatcher:** envio real de confirmação/lembrete (email/WhatsApp) = `TODO(edge): platform-booking-dispatcher` (UI completa, botões presentes).
- **Micro-features "em breve":** builders visuais (fluxo/form/funil), filtros avançados do inbox, análise-IA por conversa, edição inline de lead — toasts dentro de seções reais.
- **🚫 Módulo ERP/Gestão + `AffiliatesPanel`:** desacoplamento em **sessão conjunta** com o Marcelo (ERP fala com o tenant por design).

---

## 7. Sinal de infra — VERIFICADO ✔ (2026-07-02)

`authenticatePlatformAgent`: caminho **front** (JWT super_admin via `getClaims`) funciona (QR provou). Caminho **interno** (service-role) exige `actorUserId`/`created_by` no body → os `401` dos testes-CLI eram **falta de `actorUserId`**, não mismatch de key. **Verificado no código:** o único invoke edge→edge real (`platform-campaign-dispatcher` → `platform-cadence-enroll`, linha 434) **passa `actorUserId: campaign.created_by`** e pula-com-warn se ausente (linha 422); os `*-on-response` idem para `author_id`. As demais refs a `/functions/v1/platform-*-webhook` são só URLs de webhook (chamador **externo**). **Conclusão: sem bug latente** — os motores foram construídos cientes do requisito. Caveat encerrado.
