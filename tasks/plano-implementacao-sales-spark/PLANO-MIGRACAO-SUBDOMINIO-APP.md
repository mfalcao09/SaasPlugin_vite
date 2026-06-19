# Plano de Correção — Mover o SaaS para `app.nexvybeauty.com.br`

**Para:** Marcelo · **Data:** 2026-06-19 · **Status:** plano para aprovação (nada executado ainda).

> **Problema:** o SaaS (login, hub, super-admin) roda hoje no **apex** `nexvybeauty.com.br`. O correto, pela convenção do ecossistema (Oficinas: `app.*` = aplicação; apex = marketing/LP), é o app rodar em **`app.nexvybeauty.com.br`**.

---

## 1. Diagnóstico (estado atual — verificado)

| Item | Hoje | Implicação |
|---|---|---|
| App | **1 SPA único** (LP `/vendas` + `/termos`/`/privacidade` + login + hub + super-admin) | apex e app serviriam o mesmo build |
| Traefik | router só pro **apex + www** (`Host(nexvybeauty.com.br) \|\| Host(www…)`) — **sem router `app.`** | `app.nexvybeauty.com.br` hoje **não tem rota** (DNS resolve, mas Traefik não atende) |
| DNS | apex, www **e `app.`** já apontam pro VPS `145.223.29.96` | ✅ **nenhuma mudança de DNS necessária** |
| Domínio no código | **nenhum hardcoded** (URLs relativas / `window.location.origin`) | ✅ o app se adapta ao host sozinho |
| `platform_settings.public_app_url` | `https://nexvybeauty.com.br` | precisa virar `https://app.nexvybeauty.com.br` |
| Supabase Auth (Site URL / Redirect URLs) | **a confirmar no painel** | 🔴 **risco #1** — usado nos e-mails de definir-senha (`welcome-admin-access`) e no redirect de login |
| Cakto webhook | `…supabase.co/functions/v1/cakto-webhook` | ✅ **não afetado** (é domínio do Supabase) |
| Cookie de tracking (`nxv_track`) | setado no host atual (apex) | precisa de `domain=.nexvybeauty.com.br` p/ sobreviver apex↔app.* |

**Conclusão:** a correção é **infra (Traefik + script de deploy) + config do Supabase Auth + 1 ajuste de cookie**. **Não há mudança de código de domínio no app.** Risco baixo se feito de forma **faseada e aditiva** (o apex nunca para de funcionar durante a transição).

---

## 2. Arquitetura-alvo — DECISÃO necessária

### 🅰️ Opção A (recomendada) — apex = marketing, `app.*` = aplicação
- **`app.nexvybeauty.com.br`** → a **aplicação** (login, hub, super-admin). Canônico para **auth**.
- **`nexvybeauty.com.br` (apex) + www** → **marketing/funil**: `/vendas`, `/termos`, `/privacidade`. É onde **ads + links de afiliado** caem (host curto e brandável).
- **O mesmo container serve os dois** (2 routers Traefik → mesmo service). **Sem novo build.**
- App-facing (e-mails, CTAs internos) padronizam para `app.*`; ads/afiliados usam o apex.

### 🅱️ Opção B (mais simples) — apex redireciona para `app.*`
- **`app.nexvybeauty.com.br`** → **tudo** (a SPA inteira).
- **apex** → **308 redirect** para `app.*` (preserva path + query, então `nexvybeauty.com.br/vendas?ref=X` → `app.nexvybeauty.com.br/vendas?ref=X`).
- Mais simples; marketing dedicado no apex fica para depois.

> **Recomendo a A:** mantém o funil/afiliados no apex (memorável) e a aplicação em `app.*`. Custo igual ao da B (ambas só mexem em Traefik + auth), mas a A já deixa a topologia certa para crescer.

---

## 3. Passos da migração (faseado, não-quebra)

| # | Passo | Onde | Quebra algo? |
|---|---|---|---|
| 1 | **Adicionar router `app.nexvybeauty.com.br`** → `nexvy-beauty-svc` (+ cert Let's Encrypt automático) | Traefik (`/opt/stacks/traefik/dynamic/nexvy-beauty.yml`) | ❌ aditivo — `app.*` passa a servir, apex segue igual |
| 2 | **Ajustar `deploy-vps.sh` + template** para renderizar os 2 hosts (app. canônico + apex) — assim deploys futuros não revertem | `infra/traefik/NexvyBeauty.yml.template` + `infra/deploy-vps.sh` | ❌ |
| 3 | 🔴 **Supabase Auth (painel):** `Site URL` → `https://app.nexvybeauty.com.br`; `Redirect URLs` → **incluir** `https://app.nexvybeauty.com.br/**` (manter o apex durante a transição) | Dashboard Supabase → Authentication → URL Configuration | ⚠️ **crítico** — sem isso, link de definir-senha/login quebra |
| 4 | **`platform_settings.public_app_url`** → `https://app.nexvybeauty.com.br`; setar `terms_url`/`privacy_url` | SQL (1 UPDATE) | ❌ |
| 5 | **Cookie de tracking** `nxv_track` → `domain=.nexvybeauty.com.br` (sobrevive apex↔app.*) | `src/lib/tracking.ts` (frente — meu) | ❌ |
| 6 | **Padronizar links do app** para `app.*` (e-mail de boas-vindas, CTAs internos) | template de e-mail + app | ❌ |
| 7 | *(opcional)* **Guard** no apex: rota de app no apex → redireciona p/ `app.*` | frontend | ❌ |
| 8 | **Coordenar com a sessão de afiliados:** links `?ref=` caem no host de marketing (apex `/vendas`) | comunicação | ❌ |

> Ordem segura: **1 → 3 → 4 → 5/6** primeiro torna `app.*` plenamente funcional **antes** de qualquer corte; o apex só muda de papel no fim.

---

## 4. Verificação (critérios binários)

- [ ] `https://app.nexvybeauty.com.br` responde **200** com **cert TLS válido**.
- [ ] **Login + "definir senha"** funcionam em `app.*` (link do e-mail abre em app.*).
- [ ] Opção A: `nexvybeauty.com.br/vendas?ref=X` carrega a LP **com o `ref` preservado**. Opção B: apex **308 → app.*** preservando path+query.
- [ ] Cookie `nxv_track` presente nos **dois** hosts (domain `.nexvybeauty.com.br`).
- [ ] Provisionamento Cakto continua criando empresa + e-mail (webhook intacto).

---

## 5. Rollback

Cada passo é reversível e o **apex nunca para** durante a transição:
- Remover o router `app.*` do Traefik (reverte ao estado atual).
- Reverter `Site URL` → apex no painel Supabase.
- `UPDATE platform_settings SET public_app_url='https://nexvybeauty.com.br'`.

---

## 6. Decisões pendentes (você)

1. **Opção A (apex=marketing / `app.*`=app)** ou **Opção B (apex redireciona p/ app.*)**?
2. **Supabase Auth:** quem ajusta o `Site URL`/`Redirect URLs` no painel — **você** (eu te passo o passo-a-passo exato) ou você me libera o **PAT/Management API** (o do keychain deu 401 no cascateamento)?
3. **`terms_url`/`privacy_url`** apontam para apex (`nexvybeauty.com.br/termos`) ou `app.*`?
4. **Quando executar:** agora (paro tudo e migro) ou agendo junto com o próximo deploy?

> Observação de coordenação: essa mudança de domínio afeta **onde os links de afiliado (`?ref=`) caem** e o **domínio do cookie de tracking**. A sessão de afiliados precisa saber o host de marketing escolhido (apex, na Opção A).
