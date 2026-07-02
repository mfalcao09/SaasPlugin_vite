# Auditoria de Portagem C — CONEXÕES (super_admin/plataforma) vs INTEGRATIONS (Vendus)

**Read-only.** App: `apps/NexvyBeauty`. Data: 2026-07-02.
**PORTADO:** `src/components/superadmin/crm/connections/` (8) + `src/components/superadmin/crm/data/usePlatformCrm{EvolutionInstances,MetaWhatsApp,Instagram}.ts` (3) + edges `platform-*` (11).
**ORIGINAL:** `.vendus-src-reference/src/components/admin/integrations/` (30) + `.../admin/meta/` (2) + hooks `use{EvolutionInstances,MetaWhatsApp,InstagramConnections}` (3) + edges (17).

> **Achado-chave:** o "gap 30→8" **NÃO é o eixo real de fidelidade**. Dos 30 arquivos de `integrations/`, **apenas ~8 pertencem aos 3 canais (Conexões)**. Os outros ~22 são **outras integrações** (provedores IA, gateways de pagamento, e-mail, Facebook Leads, Google Calendar, campanhas, o shell do catálogo) — superfície "Integrações" do Vendus, fora do escopo de "Conexões". O portado (8) casa **quase 1:1** com o subconjunto de-3-canais do original (10 componentes: 8 dos 30 + 2 wizards). Fidelidade dos 3 canais ≈ alta; as lacunas reais são **webhook inbound Meta/IG** e **mídia de template**.

---

## 1. Componentes (painéis/wizards/dialogs)

| # | PORTADO | ORIGINAL | Tag | Evidência (arquivo:linha) + razão |
|---|---|---|---|---|
| 1 | `PlatformCrmConnectionsPanel.tsx` | `UnifiedConnectionsPanel.tsx` | `[MAPEADO-ERP]` `[TEMA]` | Estrutura idêntica (mesmo `handleSelect`, mesmos 3 painéis filhos). Portado `Panel.tsx:19-71` **remove** o gate de plano: `useOrganizationEffectivePlan`/`max_connections`/badge `used/limit`/upgrade (`Unified…:23,30-32,54-78`). Justificado: operador = ILIMITADO (single-tenant super_admin). Comentário verbatim em `:14-18`. |
| 2 | `PlatformCrmNewConnectionDialog.tsx` | `NewConnectionDialog.tsx` | `[1:1]` `[RENOMEADO]` | Diferença única funcional: dropou o prop `disabled` de `Option` (`New…:19,23,29-33,45`) — no portado nenhum provider fica desabilitado (`Platform…New…:22-41`). Coerente com "sem gate". Copy: "Evolution Go" → "Evolution" (`:68` vs `Platform…:62`). |
| 3 | `PlatformCrmEvolutionInstancesPanel.tsx` | `EvolutionInstancesPanel.tsx` | `[PLATFORM_CRM]` `[MAPEADO-ERP]` `[DROP-OK]` | Corpo do card/ConnectDialog/Rename/Create **idêntico**. Portado **remove** (tenant-only): (a) gate `max_connections`/badge/upgrade/`useOrganizationEffectivePlan` (`Evolution…:29,282,301-343`); (b) `<PresenceTestButton>` (`Evolution…:402`, edge `presence-test`); (c) `<ProviderCooldownBadge>` (`Evolution…:379-386`); (d) `useNavigate`/`isSuperAdmin`. `.from('platform_crm_evolution_instances')`, edge `platform-evolution-proxy`. |
| 4 | `PlatformCrmMetaWhatsAppConnectionsPanel.tsx` (142 l) | `MetaWhatsAppConnectionsPanel.tsx` (154 l) | `[PLATFORM_CRM]` `[DROP-OK]` | Diff normalizado: portado dropa só `<ProviderCooldownBadge>`+`useAuth`/`canResetCooldown` (`Meta…Panel:12-13,35-36,83-90`) e o ícone `MessageSquare`. Copy "…nunca saem desta empresa" → "…ficam criptografadas" (`:59`). Resto 1:1. |
| 5 | `PlatformCrmMetaWhatsAppWizard.tsx` (580 l) | `MetaWhatsAppWizard.tsx` (586 l) | `[PLATFORM_CRM]` `[MAPEADO-ERP]` `[TEMA]` | Remove `useAuth`/`organization_id` do draft/connect. `[TEMA]`: dropou variantes `dark:` em 3 `<Alert>` (`bg-emerald-950/20`, `bg-green-950/30`). Copy: remove "do Vendus"/"neste modelo". Fluxo (5 passos, verify_token, webhook) 1:1. |
| 6 | `PlatformCrmMetaWhatsAppTemplatesPanel.tsx` (512 l) | `MetaWhatsAppTemplatesPanel.tsx` (634 l, **−122**) | `[PLATFORM_CRM]` `[TEMA]` `[DROP-OK]`→**degrada** | Builder + preview WhatsApp + IA + sync/submit/default **mantidos** (`Platform…Templates:117 TemplatePreview`, `:354 headerText`). **Única perda funcional:** `TemplateMediaConfig` (orig `:509,535-620`) + seção "Configurar mídia" + `MIME_LIMITS`. Motivo: edge `meta-whatsapp-media-upload`, colunas `header_media_id/_uploaded_at` e bucket `whatsapp-media` **inexistentes no lado plataforma**. `[TEMA]`: preview sem `dark:` (`:119`). **⚠** templates header IMAGE/VIDEO/DOCUMENT não recebem mídia → **envios falham** (orig avisa "Sem mídia — envios falharão"). |
| 7 | `PlatformCrmInstagramConnectionsPanel.tsx` (119 l) | `InstagramConnectionsPanel.tsx` (119 l) | `[1:1]` `[PLATFORM_CRM]` | Diff = só o path do import de hook. Idêntico no resto. |
| 8 | `PlatformCrmInstagramWizard.tsx` (350 l) | `InstagramWizard.tsx` (357 l) | `[PLATFORM_CRM]` `[MAPEADO-ERP]` `[DROP-OK]` | Remove `useAuth`/`organization_id`. Dropou import **morto** `useTestInstagramConnection`+`const test` (orig `:13,45` declara mas `test.mutate` **nunca é chamado** → dead code). `[TEMA]`: 2 `<Alert>` sem `dark:`. |

---

## 2. Hooks (data layer)

| PORTADO | ORIGINAL | Tag | Razão |
|---|---|---|---|
| `usePlatformCrmEvolutionInstances.ts` (124 l) | `useEvolutionInstances.ts` (334 l) | `[PLATFORM_CRM]` `[MAPEADO-ERP]` `[DROP-OK]` | CRUD self (create/connect/disconnect/logout/delete/rename/setDefault) 1:1, `.from('platform_crm_evolution_instances')`, edge `platform-evolution-proxy`, sem `useAuth`. **Dropou** (super-admin-cross-org / config-global, verificado **não-referenciados** no CRM plataforma): `usePlatformEvolutionConfig`, `useTestEvolutionConnection`, `useAllEvolutionInstancesAdmin`, `useAssignEvolutionInstance`, `useSubscribeEvolutionWebhook`, `useSyncEvolutionInstances`, `useCreateEvolutionInstance`(admin). Config global vive em `platform_settings` (outra tela). |
| `usePlatformCrmMetaWhatsApp.ts` | `useMetaWhatsApp.ts` | `[1:1]` `[PLATFORM_CRM]` | connect/draft/test/templates-sync/submit/ai-generate/delete/default equivalentes. `.from('platform_crm_whatsapp_meta_*')`, edges `platform-meta-whatsapp-*`, sem `organization_id`. |
| `usePlatformCrmInstagram.ts` | `useInstagramConnections.ts` | `[1:1]` `[PLATFORM_CRM]` | draft/connect/test/delete equivalentes. `.from('platform_crm_instagram_connections')`, edges `platform-instagram-*`. |

---

## 3. Edge Functions

| PORTADO (11) | ORIGINAL (17) | Tag |
|---|---|---|
| `platform-evolution-proxy` | `evolution-proxy` | `[1:1]` `[RENOMEADO]` (roteia por `body.action`) |
| `platform-evolution-webhook` | `evolution-webhook` | `[1:1]` `[RENOMEADO]` |
| `platform-instagram-{connect,draft,test}` | `instagram-{connect,draft,test}` | `[1:1]` `[RENOMEADO]` |
| `platform-meta-whatsapp-{connect,draft,test,templates-sync,template-submit,template-ai-generate}` | idem s/ prefixo | `[1:1]` `[RENOMEADO]` |
| — | `meta-whatsapp-webhook` | **`[FALTA]`** (inbound Graph) |
| — | `instagram-webhook` | **`[FALTA]`** (inbound Graph) |
| — | `meta-whatsapp-media-upload` | `[DROP-OK]` (dep. do `TemplateMediaConfig` dropado) |
| — | `evolution-send` / `meta-whatsapp-send` / `instagram-send` | `[DROP-OK]` (**outbound = superfície de mensageria/inbox**, não "Conexões") |

> `platform-webhook-receiver` **existe** mas é ingester genérico de webhook-CRM/automação (flatten/variable-map/lead metadata — `index.ts:87-155,432`), **NÃO** o webhook Graph da Meta/IG (sem `hub.challenge`/`verify_token`/`entry`). Não cobre inbound de DM/WhatsApp-Meta.

---

## 4. Os 30 arquivos do original SEM equivalente no portado (e por quê)

**A. Dos 3 canais — perdas reais dentro do escopo:**
- `PresenceTestButton.tsx` → `[DROP-OK]` (feature tenant "testar digitando"; edge `presence-test`; não crítico).
- `ProviderCooldownBadge.tsx` → `[DROP-OK]` (badge cooldown + RPC `clear_provider_cooldown`; UX de resiliência).
- `TemplateMediaConfig` (dentro de `MetaWhatsAppTemplatesPanel`) → `[DROP-OK]` mas **degrada** (ver #6).

**B. Fora dos 3 canais — 20 arquivos, superfície "Integrações" ≠ "Conexões" (não portados de propósito):**
`AIProviderConfigs`, `AIRoutingPanel`, `ApiKeysManager`, `BotConversaConfig`, `CampaignComposer`, `CampaignDetailsDialog`, `DoppusConfigManager`, `EmailConfigManager`, `EmailTemplatesManager`, `FacebookLeadsConfig`, `GoogleCalendarOAuthConfig`, `HotmartConfigManager`, `IntegrationCard`, `IntegrationConfigDrawer`, `IntegrationsManager`, `MassEmailManager`, `SankhyaConfigManager`, `TemplateEditorDialog`, `TemplatePreviewDialog`, `WhatsAppConfig`.
→ Provedores IA (roteamento LLM), gateways de pagamento (Doppus/Hotmart), ERP Sankhya, e-mail em massa, Facebook Leads, Google Calendar OAuth, campanhas, BotConversa e o **shell do catálogo** (`IntegrationsManager`+`IntegrationCard`+`ConfigDrawer` consomem `integrationsCatalog` e `integration_settings`). **Nenhum é dos 3 canais** → out-of-scope legítimo, não regressão de Conexões.

**C. `admin/meta/` (2):** `TemplatePicker.tsx`, `MultiTemplatePicker.tsx` → `[DROP-OK]` no escopo Conexões: são **seletores de template consumidos por inbox/cadences/campaigns** (`seller/inbox/SendTemplateDialog`, `admin/cadences/CadenceWizard`, `admin/campaigns/CampaignWizard`), não pela tela de Conexões.

---

## 5. Contagem por tag

| Tag | Qtd (itens auditados) |
|---|---|
| `[1:1]` | 3 comp + 2 hooks + 9 edges |
| `[PLATFORM_CRM]` | 7 comp + 3 hooks (transversal) |
| `[MAPEADO-ERP]` (org→super_admin, sem `organization_id`/`useAuth`) | 5 comp + 1 hook |
| `[RENOMEADO]` | 11 edges + naming de todos os arquivos |
| `[TEMA]` (variantes `dark:` dropadas) | 4 comp |
| `[DROP-OK]` | 3 comp/subcomp + 7 hooks-Evolution + 4 edges + 22 arquivos out-of-scope |
| `[FALTA]` | **2** (edges) + **1** degradação (mídia) |
| `[ADICIONADO]` | **0** |
| `[CONSOLIDADO]` | 0 confirmado (webhook-receiver NÃO consolida Graph) |

---

## 6. Veredito de fidelidade

- **Cobertura dos 3 canais (o que importa): ~92%.** 8 componentes + 3 hooks + 9 edges core portados fielmente (1:1 com renome/desacople). Diferenças majoritariamente **intencionais e justificadas** (`[MAPEADO-ERP]` remove multi-tenancy; `[DROP-OK]` remove features tenant-only).
- **Regressões reais:** (1) inbound webhook Meta+IG ausente; (2) mídia de template Meta ausente. Ambas **quebram funcionalidade end-to-end** de Meta/Instagram (receber mensagens; enviar templates com mídia); "conectar" e Evolution/QR estão 100%.
- **Cobertura literal 30→8 é enganosa:** 22 dos 30 são outra superfície; comparar 8-portados vs 10-de-3-canais dá a leitura correta.

---

## 7. Top-3 para o Marcelo

1. **🔴 `[FALTA]` webhook inbound Meta/IG.** Os wizards portados **geram `verify_token` + `webhook_url`** e mandam cadastrar na Meta, mas **não existe** `platform-meta-whatsapp-webhook` nem `platform-instagram-webhook` (e `platform-webhook-receiver` é ingester de automação, não Graph). Efeito: conexão "ativa" mas **não recebe DM/resposta de WhatsApp-Meta** → Inbox mudo nesses canais. **(A sessão que edita `platform-evolution-proxy` NÃO cobre isto — é Evolution.)**
2. **🟠 Mídia de template Meta (`TemplateMediaConfig` dropado).** Templates com header IMAGE/VIDEO/DOCUMENT são **criados mas nunca recebem mídia** (sem edge `media-upload`, sem colunas `header_media_*`, sem bucket). O original alerta "Sem mídia — envios falharão". Ou portar (edge+colunas+bucket) ou **bloquear header de mídia** no builder.
3. **🟡 `ProviderCooldownBadge`/cooldown ausente.** Os hooks Meta ainda referenciam `cooldown_until`/`consecutive_failures`, mas a UI de cooldown + RPC `clear_provider_cooldown` foram dropadas. Sem isso o super_admin não vê nem reseta cooldown → falha silenciosa de envio. Re-adicionar é barato (componente self-contained, 67 l).
