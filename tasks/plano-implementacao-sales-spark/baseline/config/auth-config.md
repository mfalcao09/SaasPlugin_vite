# Auth — Configuração

## Providers a habilitar no Supabase (Auth → Providers)
| Provider | Status no projeto fonte | Observações |
|---|---|---|
| **Email/Password** | ativo | Sem auto-confirm (usuário precisa confirmar e-mail). Recomendado manter HIBP **ativo**. |
| **Google OAuth** | configurável por super admin via UI | Flag `platform_settings.google_oauth_configured` indica se foi feito. Configurar `Client ID` e `Client Secret` no dashboard Supabase. Redirect: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`. |
| Anonymous sign-ups | **DESATIVADO** | Não habilitar. |
| Phone / Apple / SAML | não usados | – |

## Site URL e Redirect URLs (Auth → URL Configuration)
- **Site URL**: a URL pública do app (ex.: `https://app.suamarca.com`). Também é o valor do secret `SITE_URL` usado em emails.
- **Additional Redirect URLs** (cobrem login OAuth, magic link, reset, invite, confirmação de mudança de e-mail):
  - `https://<custom-domain>/*`
  - `https://<lovable-preview>.lovable.app/*`
  - `https://<custom-domain>/auth/callback`
  - `https://<custom-domain>/reset-password`
  - `https://<custom-domain>/accept-invite`
  - `http://localhost:5173/*` (somente dev)

## SMTP / Email transacional de auth
O projeto fonte usa **Lovable Emails** (não SMTP custom). Auth emails são interceptados pelo
edge function `auth-email-hook` (Supabase Auth Hook → "Send email") que enfileira na pgmq
`auth_emails` e o cron `process-email-queue` envia via Lovable Send API (`LOVABLE_SEND_URL` + `LOVABLE_API_KEY`).

Para replicar no novo projeto:
1. Provisionar domínio de email no Lovable Cloud (UI: Cloud → Emails).
2. Deploy de `auth-email-hook` e `process-email-queue`.
3. No dashboard Supabase → Auth → Hooks: registrar `auth-email-hook` como **Send Email Hook**.
4. (Opcional) Se preferir Resend direto: setar `RESEND_API_KEY` e ajustar as funções `send-*`.

**Remetente padrão**: derivado do domínio configurado no Lovable Emails.

## Templates de email de auth (custom)

Os templates **não usam** os templates default do Supabase (ficam vazios no dashboard).
Tudo é renderizado em React Email em `supabase/functions/_shared/email-templates/`:
- `signup.tsx` — confirmação de signup
- `recovery.tsx` — reset de senha
- `magic-link.tsx` — magic link
- `invite.tsx` — convite (também usado para `team_invitations` via `send-invite-email`)
- `email-change.tsx` — confirmação de troca de e-mail
- `reauthentication.tsx` — código OTP de reautenticação

O `siteName`, `siteUrl`, cores e logo são derivados de `platform_settings` (branding) em runtime.

## Bootstrap do primeiro super admin
- Trigger `handle_new_user` cria `profiles` automaticamente em todo `auth.users`.
- Função `claim_first_super_admin` + edge `bootstrap-super-admin` / `auto-promote-super-admin` /
  `ensure-default-super-admin` promovem o usuário cujo email é igual ao secret `SUPER_ADMIN_EMAIL`
  ao papel `super_admin` em `user_roles`.
- Ver `bootstrap.md` para o fluxo completo.
