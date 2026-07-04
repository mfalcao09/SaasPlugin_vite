# Megasessão D9 + D5 + D2 — Plano de Execução em /loop
> **Fonte única de verdade da megasessão.** Preparado em 2026-07-03 pela sessão que shipou o D7.
> Cada fatia tem CHECK BINÁRIO (passou/falhou). Sem check verde, a fatia NÃO é `done` (Karpathy 8.3).
> Marcar checkbox + anotar evidência inline conforme conclui. Este arquivo É o estado do loop.

## Contexto obrigatório (ler antes da 1ª iteração)
- App: `apps/NexvyBeauty` (Vite SPA). Modelo canônico: `apps/NexvyBeauty/.vendus-src-reference/` (byte-idêntico ao Remix Vendus — NUNCA portar de outro lugar).
- **MÁXIMA (inegociável):** CRM de plataforma (`src/components/superadmin/crm/`) é port 1:1 DESACOPLADO → tabelas `platform_crm_*`, ZERO `organization_id` no código, RLS `has_role(auth.uid(),'super_admin'::app_role)`, NUNCA tocar tabela de tenant.
- Supabase projeto `fzhlbwhdejumkyqosuvq` (MCP tools `execute_sql`/`apply_migration`/`deploy_edge_function`/`generate_typescript_types`).
- **GATE oficial:** `bash tasks/d3-multiproduto/verify.sh` (fronteira + org_id + tsc ≤25 + build). `--fast` pula o build.
- **Deploy:** `ssh vps-hostinger 'cd /opt/stacks/saasplugin-vite && git pull --ff-only origin main && bash infra/deploy-vps.sh NexvyBeauty nexvy-beauty app.nexvybeauty.com.br'` + anti-phantom (curl no bundle hash em gestao.nexvy.tech E app.nexvybeauty.com.br).
- **Sino Telegram (PROVADO):** `bash tasks/megasessao-d9-d5-d2/notify-marcelo.sh "msg"` → celular do Marcelo. ONE-WAY: resposta dele vem NA SESSÃO. Notificar em: (a) decisão bloqueante; (b) átomo humano; (c) marco de frente/fase; (d) falha que trava >2 tentativas. Mensagens simples (sem aspas duplas).
- Fundações JÁ APLICADAS em prod + commitadas: `platform_crm_push_subscriptions` (67eaf33) · `platform_crm_mia_actions` + `platform_crm_mia_user_memory` (ca3a745). D7 shipped (1ff9504, bundle index-BiOg-0EY.js no ar).

## Regras de paralelismo (anti-quebra — aprendidas no D7)
**SERIALIZAR no loop principal (NUNCA em subagente, NUNCA 2 ao mesmo tempo):**
1. `apply_migration` (banco é um só).
2. `generate_typescript_types` → regravar `src/integrations/supabase/types.ts` → rodar gate em seguida.
3. `deploy_edge_function` (um por vez).
4. Deploy VPS + anti-phantom.
5. Edições em arquivos compartilhados: `App.tsx`, `nav`, `adminMenu`, `feature-list.json`, `types.ts`.

**PARALELIZAR (subagentes, worktree quando mexem em muitos arquivos):** port de código isolado (arquivos novos em pastas distintas), cada subagente TERMINA com `verify.sh --fast` verde e reporta lista de passos seriais que sobraram pro loop principal.

**Traps conhecidos (D7):** hooks platform_crm variam shape (`{data}` vs `{fields}` — checar antes de destructurar) · sem joins de produto nos hooks crus (`ProductAgent` NÃO tem `.product`) · queryKey padrão `['platform-crm', ...]` · o build do vite passa com erro de tipo — SÓ o tsc pega (não pular o gate) · edge real chama-se `platform-webhook-receiver` (não `platform-crm-*`).

---

## FRENTE D9 — Web Push + Telegram (esforço: ~meio dia)
Estado: fundação ✅ (`platform_crm_push_subscriptions`). Decisões travadas: canais = **web push (desktop/Android) + Telegram (celular do Marcelo)** · VAPID subject = `mailto:contato@nexvy.tech`.

- [x] **D9.1** Portar `_shared/push.ts` → `supabase/functions/_shared/platform-push.ts`: tabela `platform_crm_push_subscriptions`, SEM filtro `user_notification_settings` (v1 = todos os super-admins inscritos; preferência granular é over-engineering p/ time interno). Modelo: `.vendus-src-reference/supabase/functions/_shared/push.ts` (webpush npm:web-push@3.6.7, revoga 404/410).
  **CHECK:** ✅ (2026-07-03) arquivo criado com `sendPlatformPush(supabase, payload, userIds?)` — zero org_id, VAPID subject `mailto:contato@nexvy.tech`, broadcast a todos non-revoked. Validado pelo deploy do dispatch (import `../_shared/platform-push.ts` resolveu no eszip → ACTIVE). Nota v1: subscribe não checa `has_role super_admin` no edge (isolamento é o frontend gestao.* super-admin-only + RLS na leitura); hardening opcional futuro.
- [x] **D9.2** Portar 3 edges: `platform-push-subscribe`, `platform-push-unsubscribe`, `platform-push-dispatch` (modelo: `push-subscribe/-unsubscribe/-dispatch`; auth Bearer+getClaims; upsert onConflict endpoint; dispatch SEM preference_key gate v1). Registrar `verify_jwt` no `supabase/config.toml` espelhando o padrão dos edges existentes. Deploy um a um via MCP.
  **CHECK:** ✅ (2026-07-03) os 3 em `list_edge_functions` + curl POST sem-auth → **HTTP 401** nos 3. `verify_jwt=true` (default) — não precisou entrada no config.toml (só webhook público é `false`). Deploy: subscribe v1, unsubscribe v1, dispatch v1 (com shared) todos ACTIVE.
- [x] **D9.3** VAPID: gerar par (`npx web-push generate-vapid-keys`), `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:contato@nexvy.tech` + `VITE_VAPID_PUBLIC_KEY` no `.env` local E no build do VPS (checar como o deploy injeta env: `infra/deploy-vps.sh`/Dockerfile). NUNCA imprimir a privada.
  **CHECK:** ✅ (2026-07-03) `secrets list` mostra `VAPID_PUBLIC_KEY`+`VAPID_PRIVATE_KEY`+`VAPID_SUBJECT`. Descoberta importante: `Dockerfile.app` NÃO plumba `VITE_*` como build-arg — Vite lê do `.env.production` COMMITADO (que já tem VITE_SUPABASE_*). Adicionei `VITE_VAPID_PUBLIC_KEY` no `.env.production` (committado, vai pro bundle no VPS) + `.env` local. Frontend (D9.5) lerá `import.meta.env.VITE_VAPID_PUBLIC_KEY` (desacoplado do hardcode do modelo Vendus). Privada só como secret no edge.
- [x] **D9.4** Telegram no dispatch: `platform-push-dispatch` também envia Telegram (secrets `TELEGRAM_BOT_TOKEN` — copiar do KVM4 sem imprimir — + `TELEGRAM_CHAT_ID_MARCELO=1118516471`). Envio best-effort (falha de um canal não derruba o outro).
  **CHECK:** ✅ (2026-07-03) dispatch v4 ACTIVE; secrets `TELEGRAM_BOT_TOKEN`(KVM4)+`TELEGRAM_CHAT_ID_MARCELO` setados sem imprimir. Smoke (anon JWT, title=teste) → `{"ok":true,"push":{"sent":0...},"telegram":{"ok":true}}`. Canais via `Promise.all` best-effort. Bot = `@nexvy_orquestra_bot` (mesmo do sino).
- [x] **D9.5** Frontend: portar `lib/push.ts` + `usePushNotifications` + `PushNotificationsCard` (modelo: `src/lib/push.ts`, `src/hooks/usePushNotifications.ts`, `src/components/notifications/PushNotificationsCard.tsx`) → decoupled, edges `platform-push-*`. Montar o Card na área de configurações/notificações da plataforma (descobrir onde o super-admin tem settings; se não houver, aba em notificações).
  **CHECK:** ✅ (2026-07-03) `verify.sh --fast` verde (tsc **24** ≤25, fronteira zero, org_id zero). Criados: `src/lib/platform-push.ts` (VITE_VAPID_PUBLIC_KEY), `src/hooks/usePlatformPushNotifications.ts`, `PlatformPushNotificationsCard.tsx` (sem prefs granulares v1). Montado como aba **"Dispositivos"** em `PlatformCrmNotificationManager` (roteado via platform-shell registry). **Fix serial:** `types.ts` regenerado (só +3 tabelas fundação D9/D5, zero ripple) — resolveu 4 erros TS de tabela não-tipada em platform-push.ts.
- [x] **D9.6** `public/sw.js`: adicionar handlers `push` (showNotification com title/body/url/tag) + `notificationclick` (focus/openWindow na url). NÃO adicionar cache (SW é intencionalmente network-only — não quebrar o anti-spinner).
  **CHECK:** ✅ (2026-07-03) handlers `push`+`notificationclick`+`pushsubscriptionchange` adicionados (icon `/icons/icon-192x192.png`, title default "Nexvy"); ZERO cache adicionado. `grep -c` = 2 + `verify.sh` completo verde (build EXIT=0, tsc 24).
- [x] **D9.7** Deploy VPS + anti-phantom (bundle novo nos 2 hosts).
  **CHECK:** ✅ (2026-07-03) DEPLOY-VERDE via deploy-vps.sh; ambos servem `index-CuVRhOd7.js` (!= antigo `index-BiOg-0EY.js`). anti-phantom OK em app.nexvybeauty.com.br + gestao.nexvy.tech. Push 4-commits em origin/main (3d811f8..20c1eac).
- [ ] **D9.8** 🧍 **ÁTOMO HUMANO — NOTIFICADO 2026-07-03, aguardando Marcelo:** ele abre `gestao.nexvy.tech` no Chrome desktop → Notificações da plataforma → aba **Dispositivos** → Ativar → permitir. Depois: dispatch de teste → notificação aparece + Telegram chega. **BLOQUEADO em humano → loop avançou p/ D5.**
  **CHECK:** linha em `platform_crm_push_subscriptions` (SQL) + confirmação do Marcelo na sessão.
- [ ] **D9.9** `feature-list.json`: `d9b-web-push` → done+verified com evidência. Commit+push.
  **CHECK:** `verify.sh --fast` [4] ok.

## FRENTE D5 — Mia: ações + memória (esforço: ~meio a 1 dia)
Estado: fundação ✅ (2 tabelas). Decisão travada: confirmação = **(B) botões inline no chat**.

- [x] **D5.1** Recon do modelo (READ-ONLY): `mia-prepare-action/index.ts` + `mia-execute-action/index.ts` + `src/hooks/useMiaActions.ts` + `useMiaMemory.ts` + `src/components/mia/MiaPendingActions.tsx` + como o `AdminMia.tsx` integra. Mapear: contrato prepare/execute, os 8 action_types (já no CHECK da tabela), shape do preview.
  **CHECK:** ✅ (2026-07-03) RECON:
  - **prepare** (`POST {action_type, payload}`): valida `ALLOWED_TYPES`, `buildPreview(type,payload)` → texto pt-BR, insere row (NAV `open_*` → `executed` na hora; resto → `waiting_confirmation`), retorna `{ok, action_id, status, preview, is_navigation, narration}`. narration = `${preview}. Confirma?`.
  - **execute** (`POST {action_id}`): valida ownership (dono OU admin/super_admin via `user_roles`) + status ∈ {waiting_confirmation,approved,draft} senão 409; marca `executing`; roda handler em background (`EdgeRuntime.waitUntil`); grava `status`(executed/failed)+`result`+`error_message`+`executed_at`. Retorna 202 `{status:executing}` (ou 200 síncrono p/ nav).
  - **8 action_types (= CHECK da tabela D5)**: NAV (auto-exec, só frontend navega) = `open_conversation/open_lead/open_calendar/open_tasks/open_report`; EXECUTÁVEIS (3) = `create_task`{title,description?,assignee_id|assignee_name,due_at?,priority?}, `schedule_followup`{lead_id|lead_name,when?,objective?,extra_context?}, `notify_seller`{seller_id|seller_name,title?,message}. (O execute do modelo tem +12 handlers whatsapp/email/webchat/booking — FORA do escopo do prepare v1.)
  - **Remap tenant→plataforma (D5.2)**: `create_task`→ `platform_crm_lead_tasks` · `schedule_followup`→ tabela de cadência/fila da plataforma (verificar em D5.2) · `notify_seller`→ notificação da plataforma. Zero `organization_id`; resolver assignee/lead por nome dentro do escopo da plataforma (sem org filter).
  - **Chat da plataforma**: edge `platform-mia` (1390 linhas, 22 tools read-only; comentário l.36-37 diz que prepare/execute+`mia_actions` foram deixados p/ **v2 = agora**). Hook `usePlatformCrmMiaChat` (`usePlatformCrmMia.ts`) → `invoke('platform-mia',{messages})` → `{reply, tool_events}`; turns locais; `callPlatformMiaTool(tool,args)` p/ query direta. **Render**: `PlatformCrmMia.tsx:216` `turns.map` → bolha user (justify-end) / assistant (justify-start, `bg-card border` l.217-222) ← **botões inline do D5.5 entram aqui**.
  - **Tabelas D5 (prod + types.ts)**: `platform_crm_mia_actions`{user_id,action_type,payload,preview,status,result,error_message,executed_at,cancelled_at}; `platform_crm_mia_user_memory`{user_id UNIQUE,display_name,role_label,timezone,locale,preferences,facts[],last_active_entities}.
- [ ] **D5.2** Portar edges `platform-mia-prepare-action` + `platform-mia-execute-action` (decoupled: `platform_crm_mia_actions`, targets `platform_crm_lead_tasks`/`platform_crm_leads`/etc. conforme action_type; SEM organization_id). Deploy um a um.
  **CHECK:** `list_edge_functions` contém os 2 + curl sem auth → 401.
- [ ] **D5.3** Estender edge `platform-mia` (existente, 22 tools): tools de ação (draft → grava `platform_crm_mia_actions` status `waiting_confirmation`, retorna preview) + memória (ler/gravar `platform_crm_mia_user_memory`: display_name, preferences, facts, last_active_entities). Seguir o padrão de tools que o arquivo já usa.
  **CHECK (smoke SQL):** POST de teste ao platform-mia (service key) com prompt tipo "crie uma tarefa de teste pra amanhã" → row nova em `platform_crm_mia_actions` com status `waiting_confirmation` (SQL) → depois invocar execute → status `executed` + task real em `platform_crm_lead_tasks` (SQL). Limpar dados de teste ao final.
- [ ] **D5.4** Hooks `usePlatformCrmMiaActions` (list pending por user + confirm/cancel mutations chamando execute edge) + `usePlatformCrmMiaMemory`. Padrões: queryKey `['platform-crm',...]`, shapes conferidos.
  **CHECK:** `verify.sh --fast` verde.
- [ ] **D5.5** UI botões inline: no componente de chat da Mia da plataforma, quando houver action `waiting_confirmation` do usuário → bolha inline com preview + botões **Confirmar / Cancelar** (mutations do D5.4). Portar a lógica visual do `MiaPendingActions.tsx` adaptada pra inline (decisão B).
  **CHECK:** `verify.sh` completo verde (com build).
- [ ] **D5.6** Deploy VPS + anti-phantom.
  **CHECK:** bundle novo nos 2 hosts.
- [ ] **D5.7** 🧍 notify Marcelo p/ teste visual (chat da Mia → pedir ação → botões aparecem → confirmar → executa). `feature-list.json`: `d5b-mia-acao-memoria` done+verified. Commit+push.
  **CHECK:** confirmação do Marcelo OU smoke D5.3 como evidência mínima + [4] do gate ok.

## FRENTE D2 — Builders visuais de captação (esforço TOTAL: 13-15 dias — NÃO fecha nesta megasessão)
**Meta realista da megasessão: F1 + F2 (Widget) + F3 (Flow).** Quiz (F4) e Form (F5) continuam no loop em sessões seguintes. Total modelo: ~15.4k LOC (Form 7.3k · Quiz 5k · Flow 1.6k · Widget 1.4k).

- [ ] **D2.F1** Camada de suporte (~1 dia). PASSO 0 OBRIGATÓRIO (aprendizado do subagente morto): `usePlatformCrmFormBlocks`/`usePlatformCrmForm` JÁ EXISTEM em `usePlatformCrmForms.ts` — NÃO duplicar; e as tabelas `platform_crm_{form,quiz,funnel}_blocks` NÃO existem em types.ts → descobrir no MODELO se blocks são tabela própria ou coluna jsonb (ler `useForms.ts` + migrations do modelo) e replicar a MESMA estratégia. Se precisar de migration: escrever `.sql` em `migrations_platform_crm/` e aplicar (serial, loop principal). Portar tipos (`forms.ts` 250+ linhas, `chatFlow.ts`) → `src/types/platformCrmCapture.ts` + hooks CRUD que faltarem.
  **CHECK:** `verify.sh --fast` verde + tipos/hooks importáveis (um import em componente existente compila).
- [ ] **D2.F2** WidgetBuilder (~1.5-2 dias): copiar `admin/capture/widget/` → `superadmin/crm/capture/widget/`, adaptar tipos/hooks (`usePlatformCrmWebchatWidgets` existe), integrar botão "Abrir builder" em `PlatformCrmCaptureWidgetsTab` (hoje toast TODO l.142), embed code generator.
  **CHECK:** gate completo verde + smoke: criar widget via builder → row em `platform_crm_webchat_widgets` + embed snippet contém o widget id.
- [ ] **D2.F3** FlowBuilder p/ funnels (~2 dias): copiar `admin/flowbuilder/` → adaptar `PlatformCrmFunnelBlock` (channel-agnostic), integrar em `PlatformCrmCaptureFunnelsTab`. Reuso ~90% (canvas/editor/palette @dnd-kit).
  **CHECK:** gate completo verde + smoke: fluxo com 2 blocos salvo → JSON persistido (SQL) e re-carregado no canvas sem perda (abrir de novo = mesmos blocos).
- [ ] **D2.F2/F3 deploy** + anti-phantom + notify marco.
  **CHECK:** bundle novo nos 2 hosts.
- [ ] **D2.F4** QuizBuilder (4-5d) — **PRÓXIMA SESSÃO** (registrar resume-point aqui ao parar).
- [ ] **D2.F5** FormBuilder (5-6d, FormBlockEditor 50KB é o elefante) — **PRÓXIMA SESSÃO**.

## Ordem do loop (cada iteração)
1. Reler este arquivo → escolher a próxima fatia executável não-bloqueada. Prioridade: **D9 → D5 → D2** (D9/D5 curtas destravam valor; D2 é maratona). Quando D9/D5 esperarem átomo humano, avançar D2.
2. Executar a fatia (subagente p/ port isolado grande; loop principal p/ tudo que é serial).
3. Rodar o CHECK da fatia. Verde → marcar checkbox + evidência inline + commit (`feat(crm-grupo): ...`). Vermelho → consertar (causa raiz); >2 falhas → notify + registrar bloqueio aqui.
4. Notify Telegram nos marcos (fim de frente/fase, deploy verde) e átomos humanos.
5. Compactação de contexto vem? Sem pânico: este arquivo é o estado. Retomar do checkbox.

## Critério de sucesso da megasessão (mensurável)
- [ ] D9 100% (9/9) com push real recebido + Telegram no dispatch
- [ ] D5 100% (7/7) com ação executada end-to-end via botões inline
- [ ] D2 F1+F2+F3 verdes e deployados (F4/F5 com resume-point registrado)
- [ ] Zero regressão: gate verde em TODO commit · fronteira sempre zero
- [ ] `feature-list.json` refletindo a verdade com evidências
