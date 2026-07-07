# PLANO — Módulo Telefonia (Salvy) no gestão super-admin · 2026-07-07

> **Origem:** continuação da sessão `dc984ded` (morreu em rate-limit logo após as decisões travarem).
> **Pedido verbatim (Marcelo):** *"criar uma página, dentro de gestao.nexvy.tech, para gerir as linhas adquiridas… um novo módulo… Lá temos uma replicação de tudo que podemos trazer de infos da Salvy"* + decisões: **"Módulo top-level novo"** e **"Espelho + pedir/cancelar" (billable na Fase 1)**.
> **Branch:** `feat/telefonia-salvy` (a partir da main, que já contém o parecer + spike `4e8d64e`).

## Premissas explícitas (§8.1)

1. **App alvo = `apps/NexvyBeauty`** — é onde vive o platform-shell do gestão (registry/PlatformShell). Confirmado no código.
2. **Todas as ações Telefonia são super-admin only** — linhas Salvy são da conta Nexvy (plataforma), não do tenant. Decidido na sessão anterior.
3. **DESVIO consciente do molde Evolution:** a key Salvy vai em **secret da Edge Function** (`Deno.env.get('SALVY_API_KEY')`, via `supabase secrets set`), **não** em `platform_settings`. Motivo: `platform_settings` é lida pelo frontend com `select('*')` (`usePlatformSettings`) e não achei RLS nas migrations locais que prove proteção da linha — key ali arriscaria vazar pro client (viola Seção 11.1). Secret de função nunca toca o client. **Marcelo pode vetar** — trocar depois é 1 função (`getSalvyKey`).

## Arquitetura (moldes reais do código)

| Camada | Arquivo novo | Molde |
|---|---|---|
| Backend | `supabase/functions/salvy-proxy/index.ts` | `evolution-proxy/index.ts` (JWT + user_roles super_admin, actions em body) |
| Hooks | `src/hooks/useTelefonia.ts` | `useSuperAdmin.ts` (react-query + `functions.invoke`) |
| UI lista | `src/components/superadmin/telefonia/TelefoniaManager.tsx` | `OrganizationsManager.tsx` (cards, filtros client-side, AlertDialog type-to-confirm) |
| UI detalhe | `src/components/superadmin/telefonia/TelefoniaDetailPage.tsx` | `OrganizationDetailPage.tsx` (`{id, onBack}`) |
| Drill-down | `telefonia/TelefoniaSection.tsx` (state interno — nav não usa URL) | padrão do shell |
| DDDs | `telefonia/TelefoniaAreaCodes.tsx` | — |
| Faturas | `telefonia/TelefoniaFaturas.tsx` (link p/ painel Salvy; API não expõe fatura) | — |
| Nav | módulo top-level `telefonia` em `registry.tsx` + `usePlatformModule.tsx` | módulos `erp`/`vendas` |

## API Salvy (do OpenAPI baixado + prova ao vivo de 2026-07-06)

- `GET /api/v2/virtual-phone-accounts` → **array plano** `{id, name, phoneNumber(E.164), status(pending|active|blocked|canceled), createdAt, canceledAt, cancelReason, redirectPhoneNumber, redirectExpiresAt, costCenter, employeeId, customFields}`
- `GET /{id}/sms-messages?page&pageSize` → `{smsMessages: [{id, receivedAt, originPhoneNumber, destinationPhoneNumber, message, detections?.whatsapp?.verificationCode}]}`
- `GET /area-codes` → `{areaCodes: [{areaCode, available}]}`
- `POST /` `{areaCode, name?, costCenter?}` → cria linha (**billable ~R$ 29,90/mês**)
- `DELETE /{id}?reason=<unnecessary|whatsapp-ban|technical-issues|company-canceled>` → 204 (body `reason` é deprecated; usar query param)

## Passos com check binário (§8.3)

1. Edge `salvy-proxy` (6 actions; create exige `confirm:true`; create/cancel gravam `platform_audit_logs` server-side) → *check: deploy + invoke `list_numbers` retorna as 2 linhas reais (200)*
2. `useTelefonia.ts` → *check: `tsc` limpo*
3. `TelefoniaManager` + `TelefoniaSection` → *check: build passa*
4. `TelefoniaDetailPage` (detalhe + SMS/OTP com copy + cancelar type-to-confirm) → *check: build passa*
5. `TelefoniaAreaCodes` + `TelefoniaFaturas` → *check: build passa*
6. Módulo `telefonia` no registry + `PlatformModuleId` → *check: build passa + "Telefonia" no switcher*
7. Verificação: `npm run build` (ou `tsc -b`) do NexvyBeauty verde → *check binário: exit 0*
8. Commit na branch + push → *check: branch no origin*

**Fora do meu alcance nesta sessão (fica pro Marcelo/deploy):** `supabase secrets set SALVY_API_KEY=...` + `supabase functions deploy salvy-proxy` + smoke na UI real (Chrome, host gestão).

## Blindagem das ações billable (decisão da sessão anterior)

- `Pedir linha`: dialog mostra custo (R$ 29,90/mês) + disponibilidade do DDD; proxy recusa sem `confirm: true`.
- `Cancelar`: exige digitar o número exato (type-to-confirm, padrão `OrganizationsManager`) + motivo.
- Ambos: só super-admin (403 no proxy) + audit log server-side (`telefonia.create_number` / `telefonia.cancel_number`).

## Review (2026-07-07)

**Entregue nesta sessão (branch `feat/telefonia-salvy`):**

- ✅ `salvy-proxy` Edge Function — 6 actions (`list_numbers`, `get_number`, `list_sms`, `list_area_codes`, `create_number`, `cancel_number`); super-admin only; `create`/`cancel` exigem `confirm:true` e gravam `platform_audit_logs` **server-side**; key via `Deno.env.get('SALVY_API_KEY')` (secret) — `deno check` OK.
- ✅ `useTelefonia.ts` — hooks react-query + tipos do OpenAPI; SMS com `refetchInterval` 15s (OTP fresco); unwrap do body de erro do `FunctionsHttpError`.
- ✅ UI: `TelefoniaManager` (cards, busca, filtro status, dialog "Pedir linha" com estoque de DDD + custo), `TelefoniaDetailPage` (detalhe + SMS/OTP com copy + cancelar type-to-confirm com motivo), `TelefoniaSection` (drill-down por state), `TelefoniaAreaCodes`, `TelefoniaFaturas` (estimativa linhas ativas × R$ 29,90 + link painel).
- ✅ Módulo top-level `telefonia` no switcher (`registry.tsx` + `PlatformModuleId` + ícones Phone/MapPinned/Receipt).
- ✅ Check binário: `npm run typecheck` (tsc -b) exit 0.

**Deploy (feito na mesma sessão, com autorização explícita do Marcelo após bloqueio do classificador):**
1. ✅ Secret `SALVY_API_KEY` setado via CLI (`--env-file` filtrado do `.env.local`; valor nunca impresso) — confirmado no `secrets list`.
2. ✅ `salvy-proxy` deployada via Supabase MCP — v1 `ACTIVE`, `verify_jwt: true` (id `58086d98`).
3. ✅ Liveness: `POST /functions/v1/salvy-proxy` sem JWT → **HTTP 401** (auth sendo aplicada).

**Única pendência restante (só o Marcelo pode):** smoke no Chrome real logado como super-admin no host gestão — módulo "Telefonia" no switcher → 2 linhas reais na lista; OTP no detalhe da linha "Vendas". Depois, merge da branch `feat/telefonia-salvy` na main.

**Não feito de propósito:** verificação em preview headless (regra do Marcelo: browser só no Chrome real via chrome_control) — e a função nem funcionaria sem o secret deployado.
