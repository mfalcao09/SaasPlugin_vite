# Onboarding / criação de tenant no Vendus v5 — pesquisa fiel ("exatamente como está lá")

> **Repo fonte confirmado:** `/Users/marcelosilva/Projects/GitHub/oficial-vendus-v5`
> Remote: `https://github.com/mfalcao09/oficial-vendus-v5.git`
> HEAD lido: `7437acca69a5d42b38e0ce856b1208284a1b7013` (2026-07-06 03:55:35 +0000)
>
> Objetivo desta pesquisa: mapear FIELMENTE o(s) fluxo(s) de criação de tenant/organização e onboarding pós-venda existentes no Vendus v5, para servir de base de reuso no onboarding pós-compra do NexvyBeauty. **Nada aqui foi melhorado ou reinterpretado** — é transcrição do que existe no código, com arquivo:linha.

---

## Mapa geral — 3 fluxos distintos encontrados

O Vendus v5 tem **3 mecanismos separados** que, juntos, cobrem "criação de tenant" + "onboarding":

| # | Fluxo | Gatilho | Quem roda | Onde vive |
|---|---|---|---|---|
| 1 | **Provisionamento automático pós-compra (Cakto)** | Webhook de pagamento aprovado | Server-side (edge function), sem intervenção humana | `supabase/functions/cakto-webhook/`, `_shared/cakto-plan-provisioning.ts` |
| 2 | **Criação manual de tenant pelo Super Admin** | Super Admin clica "Criar Empresa" no painel | Super Admin logado | `src/components/superadmin/OrganizationCreateForm.tsx` + edge `create-organization-admin` |
| 3 | **Wizard de "Implantação" (onboarding guiado)** | Após #1 ou #2, admin da empresa preenche dados operacionais | Admin da organização (autenticado OU via link público com token) | `src/components/onboarding/implantacao/ImplantacaoWizard.tsx` + `useImplantacao.ts` + edge `apply-onboarding` |

Um 4º item — `useSuperAdminFirstAccess.ts` / `FirstAccessSuperAdminModal.tsx` — **NÃO é onboarding de tenant**. É o setup de primeiro acesso do **Super Admin da plataforma** (trocar senha padrão pós-remix, `platform_settings.default_password_changed`). Documentado no fim por completude, mas fora do escopo de "criação de tenant".

---

## Fluxo 1 — Provisionamento automático pós-compra (Cakto)

Este é o fluxo mais próximo do que o NexvyBeauty precisa (pós-compra → tenant nasce sozinho).

### 1.1 Webhook recebe o pedido pago

`supabase/functions/cakto-webhook/index.ts:17-179`

- Recebe POST da Cakto, valida `secret` (query param ou header `x-cakto-secret`) contra `cakto_credentials` (linha 30-40).
- Faz upsert do pedido em `cakto_orders` (linha 87).
- Resolve `product_id`/`offer_id` via `product_offers` — se não achar, **auto-cria uma "oferta órfã"** pra aparecer numa tela de mapeamento manual depois (linha 54-85).
- Roda motor de tags automáticas sobre o lead (linha 89-121) — específico de CRM, não relevante pro onboarding de tenant.
- **Linha 165-172**: se `scope=platform` (venda da própria plataforma Vendus, não de um produto de um tenant), chama `provisionFromOrder(admin, row)` — é aqui que o tenant nasce.

### 1.2 `provisionFromOrder` — o motor real de criação de tenant

`supabase/functions/_shared/cakto-plan-provisioning.ts:293-317`

Pipeline de 2 etapas, cada uma **idempotente**:

**Etapa A — `provisionPlatformPlan`** (`cakto-plan-provisioning.ts:81-172`)
1. Só provisiona se `order.status` for `paid` ou `approved` (linha 90-93) — senão retorna `skipped`.
2. Extrai o slug da oferta da URL de checkout (`extractOfferSlug`, linha 20-37) e resolve o `platform_plans` correspondente por `cakto_offer_slug` ou `cakto_product_id` (linha 51-73). Se não achar plano mapeado → `skipped` (linha 97-102).
3. **Localiza ou cria a organization** pelo `cakto_customer_email` (linha 104-130):
   ```ts
   // linha 115-124
   const { data: created } = await admin.from('organizations').insert({
     name: order.customer_name || email,
     email,
     cakto_customer_email: email,
     status: 'active',
   }).select('id').single();
   ```
   Campos mínimos no create: `name`, `email`, `cakto_customer_email`, `status: 'active'`. Tudo mais fica vazio até o wizard de implantação preencher.
4. Ativa o plano na organization: `plan_id`, `plan_status: 'active'`, `plan_activated_at`, `cakto_subscription_id` (linha 132-142).
5. Registra `billing_history` de forma idempotente, checando `metadata->>cakto_id` antes de inserir (linha 144-169).

**Etapa B — `ensureAdminUser`** (`cakto-plan-provisioning.ts:193-288`)
1. Tenta achar usuário Auth existente pelo email via RPC `get_auth_user_id_by_email` (linha 203-207).
2. Se não existir, cria via `admin.auth.admin.createUser` com **senha aleatória gerada** (`randomPassword()`, linha 174-180 — 24 bytes hex com prefixo/sufixo pra garantir classes de caractere) e `email_confirm: true` (linha 210-222).
3. Upsert em `profiles` vinculando `organization_id` (linha 225-236).
4. Garante role `admin` em `user_roles`, sem duplicar (linha 239-250).
5. **Gera link de recovery** via `admin.auth.admin.generateLink({ type: 'recovery', email })` e dispara e-mail transacional `welcome-admin-access` com esse link, idempotente por `idempotencyKey: welcome-admin-${userId}` (linha 252-285). É assim que o usuário "define a senha" na prática — não há tela de senha no onboarding, é o fluxo padrão de recovery do Supabase Auth.

### 1.3 Reprocessamento manual (idempotência coberta)

`supabase/functions/cakto-reprocess-order/index.ts:1-57` — endpoint só pra `super_admin` (checado via RPC `is_super_admin`, linha 36-37) que pega um `cakto_orders` já salvo e roda `provisionFromOrder` de novo. Existe porque o pipeline pode falhar parcialmente (plano não mapeado, etc.) e precisa ser reexecutado sem duplicar nada.

**O que este fluxo NÃO faz:** não roda nenhuma etapa de "preencher dados da empresa" — ele só cria o esqueleto (org + admin). Quem preenche horário, produtos, agentes de IA, setores e equipe é o Fluxo 3 (wizard de Implantação), separado.

---

## Fluxo 2 — Criação manual de tenant pelo Super Admin

Existe em paralelo ao fluxo automático — usado quando o Super Admin cria uma empresa na mão (sem passar pela Cakto).

### 2.1 UI — `OrganizationCreateForm.tsx`

`src/components/superadmin/OrganizationCreateForm.tsx:32-355`

Formulário único (não é wizard multi-step) com campos: `name`, `email`, `cnpj`, `phone`, `max_users`, `max_products`, `status`, `plan_id` (linha 44-54). Seleção de plano auto-preenche `max_users`/`max_products` a partir de `platform_plans` (linha 78-87), com switch "Personalizar limites" pra sobrescrever (linha 283-296).

`handleCreate` (linha 89-186) roda em sequência:
1. `createOrganization.mutateAsync(...)` — hook `useCreateOrganization` de `src/hooks/useSuperAdmin.ts` (insere em `organizations`, incluindo `features` copiadas do plano se não for customizado — linha 96-131).
2. Se tem plano selecionado, `createSubscription.mutateAsync(...)` (linha 133-140).
3. `createAuditLog.mutateAsync(...)` — audit log genérico (linha 142-146).
4. **Chama edge `create-organization-admin`** (linha 150-175) passando `organization_id`, `email`, `full_name` — é essa function que cria/vincula o usuário admin.
5. Se a function retornar `invite_token`, mostra tela de "Convite Criado" com link copiável `/aceitar-convite?token=...` (linha 188-212) em vez de fechar direto.

### 2.2 Edge `create-organization-admin`

`supabase/functions/create-organization-admin/index.ts` (arquivo completo, 1 função `Deno.serve`)

1. Exige `Authorization` header + valida chamador via RPC `is_super_admin` (checagem de permissão, meio do arquivo).
2. Procura usuário existente por email **paginando `admin.auth.admin.listUsers`** (até 20 páginas de 200 — não usa a mesma RPC `get_auth_user_id_by_email` do Fluxo 1; é uma implementação paralela/duplicada).
3. Se não existe: tenta `admin.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo: origin + '/login' })` (fluxo de convite por e-mail nativo do Supabase). Se falhar, faz fallback pra `createUser` com senha aleatória `crypto.randomUUID()...`.
4. Se já existe e pertence a **outra** organização → erro 409 "Este e-mail já pertence a outra empresa" (trava anti-duplo-tenant por e-mail).
5. Upsert `profiles` com `organization_id`; insere role `admin` em `user_roles`; **remove qualquer outro role** que o trigger `handle_new_user` possa ter inserido (ex: `seller` default) — garante que admin de empresa tenha só o papel `admin`.
6. Cria (ou reaproveita, se `pending` e não expirado) um `team_invitations` com `role: 'admin'`, `expires_at: +7 dias`, retornando `invite_token` pro form copiar o link.
7. Audit log em `platform_audit_logs`.

**Diferença chave vs. Fluxo 1:** aqui o admin recebe um **convite explícito com token de `team_invitations`** (rota `/aceitar-convite?token=`), não um link de recovery do Supabase Auth. São dois mecanismos de "primeiro acesso" diferentes coexistindo no mesmo repo.

---

## Fluxo 3 — Wizard de "Implantação" (o onboarding guiado de verdade)

Este é o núcleo do que interessa pro onboarding pós-compra: depois que o tenant existe (via Fluxo 1 ou 2), o admin preenche os dados operacionais num wizard de 7 etapas.

### 3.1 Duas portas de entrada

- **`/admin/implantacao`** → `src/pages/AdminImplantacao.tsx:1-47` — admin já logado, dentro do painel (`ProtectedRoute requiredRole="manager"`, `App.tsx:182-189`). Tem botão "Fechar e continuar depois" com limite de **3 adiamentos** rastreados em `localStorage` (`implantacao_skip_count_${organizationId}`, `AdminImplantacao.tsx:6,26-33`).
- **`/implantacao/:token`** → `src/pages/ImplantacaoPublic.tsx:1-51` — link público enviado por e-mail, **sem exigir login** (`App.tsx:190`, rota fora de `ProtectedRoute`). Usado quando o Super Admin quer que uma pessoa que ainda não tem conta preencha o onboarding.

Ambas renderizam o **mesmo componente** `ImplantacaoWizard`, mudando só a fonte dos dados (`useImplantacao({ token })` vs. `useImplantacao({})`).

### 3.2 As 7 etapas do wizard (fiéis, em ordem)

`src/components/onboarding/implantacao/ImplantacaoWizard.tsx:26-34` define os steps:

| # | id | Título | O que coleta (campos reais do form) |
|---|---|---|---|
| 0 | `empresa` | Empresa | Logo (upload), Razão Social, Nome fantasia, CNPJ, Telefone comercial, Instagram, Site, Endereço completo (CEP/Rua/Número/Complemento/Bairro/Cidade/UF) — linha 126-153 |
| 1 | `horarios` | Horários | Fuso horário (select fixo: São Paulo/Manaus/Cuiabá/Fortaleza) + grade de 7 dias (switch enabled + horário início/fim por dia) — linha 156-189 |
| 2 | `negocios` | Negócios | Repetidor de "negócios" (produtos/linhas de negócio): Nome, Status (Rascunho/Em Revisão/Publicado), Categoria, Descrição curta/completa, Informações personalizadas, ICP, Diferenciais (textarea 1/linha) — **e um bloco "Cérebro"** por negócio: Websites, Vídeos YouTube, FAQ, Dados/Tabelas, Treinamento, Catálogo (linha 191-232) |
| 3 | `agentes` | Agentes IA | Repetidor de agentes: Tipo (SDR/Closer/Suporte/Financeiro/Administrativo), Nome do agente, Missão principal, Tom de voz (Formal/Consultivo/Amigável/Técnico) — linha 234-270 |
| 4 | `setores` | Setores | Repetidor simples: Nome do setor, Ordem — linha 272-283 |
| 5 | `equipes` | Equipes | Repetidor de convites de time: Nome, Perfil (admin/manager/seller), E-mail, WhatsApp. Nota na UI: "A senha é definida pelo próprio usuário através do convite enviado por e-mail." — linha 285-310 |
| 6 | `revisao` | Revisão | Resumo somente-leitura de tudo (contadores por seção) antes de enviar — linha 312-325 |

Navegação: barra de progresso (`Progress`, `%` calculado por `(step+1)/STEPS.length`) + pills clicáveis por step (linha 92-116) + botões Voltar/Continuar, e no último step um botão "Enviar implantação" (linha 327-340).

Se `status === 'applied'` o wizard inteiro é substituído por uma tela de "Implantação concluída" com botão "Ir para o painel" (linha 58-69) — não deixa reabrir/reeditar por essa rota.

### 3.3 Onde vive o estado/progresso — `useImplantacao.ts`

`src/hooks/useImplantacao.ts:58-230`

- **Tabela**: `onboarding_submissions` (schema completo abaixo). O progresso **não é rastreado por índice de step** — é rastreado por **`status` da submission** (`draft` → `submitted` → `applied`, ou `expired`) mais o **conteúdo do `payload` jsonb**, que guarda o form inteiro (`empresa`, `horarios`, `negocios[]`, `agentes[]`, `setores[]`, `equipes[]` — shape definido em `ImplantacaoPayload`, linha 6-28).
- **Autosave debounced** (1500ms) a cada mudança de campo, via RPC `save_onboarding_draft` (modo autenticado) ou `save_onboarding_draft_public` (modo token) — linha 148-169.
- **Carregamento inicial** (linha 71-145):
  - Com token: RPC `validate_onboarding_token(_token, _session_token, _ip, _ua)` — guarda `session_token` em `sessionStorage` (`onboarding_session_${token}`) pra travar o link numa única aba/sessão.
  - Sem token (admin logado): RPC `get_or_create_first_access_onboarding()` — cria a submission `mode: 'first_access'` se não existir uma em `draft`/`submitted`.
  - Se o payload carregado não tem `empresa.nome_fantasia` ainda, faz **pre-fill a partir da tabela `organizations`** (name, cnpj, phone, instagram, website, logo_url, address) — linha 107-134. É o único ponto onde dados que já existem no tenant (do Fluxo 1/2) entram no formulário.
- **Submissão** (`submit`, linha 177-223): salva o draft final, chama RPC `submit_onboarding`/`submit_onboarding_public` (marca `status: 'submitted'`), depois **invoca a edge `apply-onboarding`** que de fato grava tudo nas tabelas reais. Só troca `status` local pra `'applied'` depois da function responder com sucesso.
- **Upload de arquivos** (`uploadOnboardingFile`, linha 232-241): sobe pro bucket `onboarding-uploads`, path `${organizationId}/${timestamp}-${random}.${ext}`, gera signed URL de 7 dias.

### 3.4 Como termina / o que "libera" a plataforma — edge `apply-onboarding`

`supabase/functions/apply-onboarding/index.ts:1-299`

Aceita 2 modos de autenticação (linha 54-99):
- **Público**: `{ token, session_token }` — valida hash do token contra `onboarding_submissions.token_hash`, checa `revoked_at`, `expires_at`, `session_token` batendo, `status === 'submitted'`.
- **Autenticado (legado)**: `{ submission_id }` + Bearer token do usuário — valida que o usuário é dono da org ou `super_admin`.

Em ambos os casos, antes de aplicar, checa se a org **já não foi onboardada**: `organizations.onboarding_completed_at` OU `onboarding_locked` → erro `already_applied` (linha 68-70, 94-97). Isso é o gate de idempotência.

Aplica o `payload` em 6 blocos sequenciais, cada um com try/catch isolado que acumula em `errors[]` sem abortar o restante (padrão "best-effort, reporta avisos"):

1. **Empresa** (linha 108-132): update em `organizations` (name, cnpj, phone, instagram, website, logo_url, address) + **seta `onboarding_completed_at = now()` e `onboarding_locked = true`** — é literalmente aqui que a implantação "tranca".
2. **Horários** (linha 135-146): upsert em `business_hours` (timezone + schedule jsonb) + propaga timezone pra `organizations.timezone`.
3. **Setores** (linha 149-161): insere em `sectors`, deduplicando por nome existente.
4. **Negócios** (linha 164-205): insere em `products`; para cada negócio, monta um array de `product_knowledge_sources` (website/youtube/faq/dados/treinamento/catálogo/arquivos) — é o "cérebro" do agente de IA por produto.
5. **Agentes** (linha 208-230): insere em `product_agents`, vinculado ao **primeiro** produto criado (`refs.products[0]`) — mapeia os enums de tipo/tom da UI pt-BR pros valores internos (`sdr`, `closer`, `support`, etc.).
6. **Equipes** (linha 233-255): para cada convite, chama a edge `create-team-member` (não lida no detalhe nesta pesquisa) passando `role` validado.

Ao final (linha 258-292):
- Marca `onboarding_submissions.status = 'applied'`, grava `applied_refs` (todos os IDs criados, pra rastreabilidade/idempotência futura) e `error_message` se houve avisos.
- Reforça `organizations.onboarding_locked = true` + `onboarding_completed_at`.
- Grava `platform_audit_logs` (action `onboarding_applied`).
- Cria `admin_notifications` (`type: onboarding_completed`) — dispara notificação interna, severidade `warning` se houve avisos.

Resposta final: `{ ok: true, refs, warnings: errors }` — o front usa isso pra decidir toast de sucesso puro vs. sucesso-com-avisos (`useImplantacao.ts:194-199`).

### 3.5 Geração e envio do link público — edge `send-onboarding-link`

`supabase/functions/send-onboarding-link/index.ts:1-106`

Só `super_admin` pode chamar (checa role, linha 32-36). Body: `{ organization_id, ttl_days=7, email_to, send_email=false, force_reopen=false }`.

1. Chama RPC `create_onboarding_link(_organization_id, _ttl_days, _force_reopen)` **impersonando o super admin** (usa `userClient`, não `admin`, pra a RPC checar `has_role` corretamente) — linha 45-49.
2. Monta o link: `${origin}/implantacao/${token}` (linha 66).
3. Se `send_email: true`, dispara via `sendPlatformEmail` com template `onboarding-implantacao-link`; se falhar, fallback pra `send-transactional-email` genérico (linha 70-94).
4. Retorna `{ link, token, expires_at, submission_id, email }`.

### 3.6 Banner de nudge no painel — `OnboardingBanner.tsx`

`src/components/onboarding/OnboardingBanner.tsx:16-76`

Renderizado dentro de `Admin.tsx`/`Index.tsx`. Sticky no topo, amarelo, só aparece se `isAdmin()` e `organizations.onboarding_completed_at` for `null` (linha 22-40). Botão "Continuar" → `navigate('/admin/implantacao')`. O X só esconde **na sessão atual** (state React, não persiste) — reaparece em novo load até a org concluir de verdade.

### 3.7 Schema DB — `onboarding_submissions` e colunas relacionadas

Migrações relevantes, em ordem cronológica:

- `supabase/migrations/20260619001042_d22afbd7-...sql` — cria a tabela (linha 20-40 do arquivo) e as RPCs iniciais (`create_onboarding_link` sem `force_reopen`, `validate_onboarding_token` só-autenticado, `save_onboarding_draft`, `get_or_create_first_access_onboarding`, `submit_onboarding`).
  ```sql
  CREATE TABLE public.onboarding_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token_hash text UNIQUE,
    mode text NOT NULL CHECK (mode IN ('link','first_access')),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','applied','expired')),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid, submitted_by uuid, applied_by uuid,
    submitted_ip text, user_agent text,
    applied_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    expires_at timestamptz, consumed_at timestamptz,
    submitted_at timestamptz, applied_at timestamptz,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );
  ```
  Também adiciona `organizations.instagram`, `organizations.website`, `organizations.onboarding_completed_at`; e `products.category`, `products.short_description`, `products.custom_info`.
- `supabase/migrations/20260622110109_0e3ac81f-...sql` — só recria `create_onboarding_link` com `search_path` ajustado (fix técnico, sem mudança funcional).
- `supabase/migrations/20260622113052_63fdf81d-...sql` — a migração grande de segurança do link público: adiciona `first_seen_at`, `first_seen_ip`, `first_seen_ua`, `session_token`, `revoked_at`, `revoked_by`, `access_count` em `onboarding_submissions`; adiciona `organizations.onboarding_locked`; reescreve `create_onboarding_link` com `_force_reopen` + revogação de submissions abertas anteriores; cria `revoke_onboarding_link`; reescreve `validate_onboarding_token` pra aceitar chamada **anônima** com trava de sessão única (session_token) no primeiro acesso; cria `save_onboarding_draft_public` e `submit_onboarding_public`.
- `supabase/migrations/20260622114552_457247b2-...sql` — não é schema, é uma correção de dados pontual (reabre uma submission específica) — não relevante como padrão, só reflete uma correção manual feita em produção.

RLS em `onboarding_submissions` (do primeiro migration): `super_admin` tem acesso total; admin da própria org só tem `SELECT` na própria submission — todo o resto (insert/update/submit) passa **exclusivamente por RPCs `SECURITY DEFINER`**, nunca acesso direto de escrita pela policy.

---

## O que dá pra REUSAR vs. o que precisa ADAPTAR pro NexvyBeauty

Isto é leitura minha (Sonnet) sobre a pesquisa, não parte do "exatamente como está" — o Marcelo pediu pra reportar isso separadamente.

### Reusável quase 1:1 (padrão de arquitetura, independe do domínio "vendas de agentes de IA")
- **O padrão token público + session_token com trava de sessão única** (`validate_onboarding_token`) é uma peça de segurança sólida e genérica — não tem nada de Vendus-específico, só amarra "link só abre numa aba" antes do login existir.
- **O padrão de `onboarding_submissions` como rascunho versionável + autosave debounced + status `draft/submitted/applied/expired`** — desacopla "preencher" de "aplicar", com idempotência real via `applied_refs` + checagem `onboarding_completed_at`/`onboarding_locked`. Isso é diretamente portável.
- **`apply-onboarding` como function idempotente, best-effort por bloco, com `errors[]` acumulado em vez de abortar tudo** — bom padrão pra não travar o cliente numa etapa que falhou (ex: e-mail de um convite de equipe deu erro, mas o resto aplica).
- **`ensureAdminUser`** (busca-ou-cria + link de recovery em vez de senha na tela) é exatamente o padrão que a Seção 11.1 do CLAUDE.md do Marcelo já pede (nunca expor senha, plaintext never persisted).
- **`OnboardingBanner` sticky com botão "Continuar" + auto-esconde só na sessão** é um padrão de UX barato de portar.

### Precisa ADAPTAR (domínio diferente: salão de beleza ≠ agência de agentes de IA)
- As 7 etapas do wizard (`empresa/horarios/negocios/agentes/setores/equipes`) são pensadas pra um produto que vende **agentes de IA por "negócio"** (cada negócio tem um "Cérebro" com website/YouTube/FAQ/treinamento). No NexvyBeauty, o equivalente seria outra coisa (serviços do salão, profissionais, agenda) — a ESTRUTURA do wizard (progress bar, steps clicáveis, repeaters, revisão final) é reusável, o CONTEÚDO de cada step não é.
- O Fluxo 1 (Cakto) resolve plano por `cakto_offer_slug`/`cakto_product_id` mapeado manualmente em `platform_plans` — o NexvyBeauty já tem seu próprio pipeline Cakto (`cakto-webhook`/`cakto-reprocess-order` citados no MEMORY como já PROVADOS em produção, ver `project_nexvybeauty_golive_autopilot_seeds_2026-07-06.md`), então essa parte provavelmente já existe equivalente — precisa comparar side-by-side antes de portar, não presumir que falta.
- `create-organization-admin` duplica lógica de busca de usuário (paginando `listUsers`) em vez de reusar a RPC `get_auth_user_id_by_email` que o Fluxo 1 usa — isso é uma inconsistência do próprio Vendus v5, não um padrão a copiar; se for portar, vale unificar num só helper.
- O wizard NÃO tem passo de "conectar WhatsApp/QR" em nenhum lugar do payload ou dos 7 steps — **não encontrei esse ponto no Vendus v5**. Se o NexvyBeauty precisa disso no onboarding, é uma etapa nova, não uma adaptação de etapa existente.

### Confirmação negativa (evitar assumir)
- **Não existe conexão de WhatsApp/QR no fluxo de onboarding do Vendus v5** — busquei em `ImplantacaoWizard.tsx`, `useImplantacao.ts` e `apply-onboarding/index.ts`; o único lugar com "whatsapp" é o campo de contato de cada convidado de equipe (`equipes[].whatsapp`, um texto livre, não uma conexão real).
- **Não existe progress bar por step persistido no banco** — o "progresso" salvo é o `payload` inteiro + `status`, não um índice de step. Se o NexvyBeauty quiser retomar exatamente na etapa 4, por exemplo, isso precisa ser implementado (hoje o wizard sempre reabre no step 0 visualmente, mesmo com dados dos steps anteriores já preenchidos vindos do autosave).

---

## Lista de arquivos-fonte (para o Marcelo abrir e ler junto)

```
oficial-vendus-v5/
├── supabase/functions/cakto-webhook/index.ts                  (webhook Cakto → dispara provisionamento)
├── supabase/functions/cakto-reprocess-order/index.ts           (reprocessamento manual, super_admin only)
├── supabase/functions/_shared/cakto-plan-provisioning.ts       (provisionPlatformPlan + ensureAdminUser + provisionFromOrder)
├── supabase/functions/create-organization-admin/index.ts       (Fluxo 2: cria admin pra org criada manualmente)
├── supabase/functions/send-onboarding-link/index.ts            (gera + envia link público /implantacao/:token)
├── supabase/functions/apply-onboarding/index.ts                (aplica payload final nas tabelas reais, idempotente)
├── src/components/superadmin/OrganizationCreateForm.tsx        (Fluxo 2: form manual de criação de tenant)
├── src/components/onboarding/implantacao/ImplantacaoWizard.tsx (o wizard de 7 steps)
├── src/hooks/useImplantacao.ts                                 (estado, autosave, submit, upload)
├── src/pages/ImplantacaoPublic.tsx                              (porta de entrada via token público)
├── src/pages/AdminImplantacao.tsx                               (porta de entrada autenticada, com skip)
├── src/components/onboarding/OnboardingBanner.tsx               (nudge sticky no painel)
├── src/hooks/useSuperAdminFirstAccess.ts                        (NÃO é onboarding de tenant — setup do Super Admin da plataforma)
├── supabase/migrations/20260619001042_d22afbd7-...sql           (schema onboarding_submissions + RPCs v1)
├── supabase/migrations/20260622113052_63fdf81d-...sql           (RPCs v2: link público seguro, force_reopen, session_token)
└── src/App.tsx (linhas 40-41, 174-190)                          (rotas /admin/implantacao e /implantacao/:token)
```
