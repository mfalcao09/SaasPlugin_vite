# Spec de Cascateamento — sales-spark core → 4 SaaS

> **Data:** 2026-06-09
> **Premissa:** o core (schema + edges + frontend + crons) está **provado no NexvyOficinas**. Cascatear = **replicar o core idêntico** + **personalizar** cada SaaS (domínio, branding, secrets, vertical de nicho).
> **Alvos:** NexvyBeauty, BarbeiroPro, NexvyFoods, NexvyGYM (todos cascas hoje).

---

## 0. Você está certo — mas com 2 ressalvas

Sim: o trabalho pesado (descobrir/coletar/validar tudo) foi feito uma vez no Oficinas. O resto é **replicação mecânica + personalização**. Duas ressalvas que o spec trata pra não virar bug:

1. **Cada casca tem um vertical-template diferente no banco** (Beauty=agendamentos/pacotes, Foods=cardapio/entregas, GYM=alunos/checkins, Barbeiro=booking). No reset (DROP SCHEMA) esses somem e são substituídos pelo schema sales-spark. Precisa ser intencional (greenfield confirmado, como no Oficinas).
2. **Domínios + branding + secrets + super-admin são por-app** — e os domínios ainda são placeholders nos templates Traefik. São as entradas que você precisa fornecer.

---

## 1. Anatomia: o que é IDÊNTICO vs o que PERSONALIZA

### CORE — idêntico nos 4 (replicação mecânica, zero decisão)
| Artefato | Fonte | Como aplica |
|---|---|---|
| Schema (161 tabelas, 415 policies, 11 enums) | `baseline/sales-spark-baseline-schema.sql` | reset + db query -f (com vector/pg_trgm em `public`) |
| Extensions (10) | bootstrap.md | CREATE EXTENSION antes do schema |
| Seeds (4 planos, 7 cats, 3 forms, 1 release) | `baseline/config/seeds.sql` | por-tabela (help_articles tem quoting — opcional) |
| Storage (12 buckets + 45 policies) | `baseline/config/storage-setup.sql` | db query -f |
| Realtime (6 tabelas) | `baseline/config/rpc-and-realtime.md` | ALTER PUBLICATION |
| Cron (10 jobs) | `baseline/config/cron-webhooks.md` | template idempotente (parametriza ref+anon) |
| 115 edge functions | `apps/NexvyOficinas/supabase/functions/` | cp + `supabase functions deploy` |
| Frontend (490 comp + 22 pages) | `apps/NexvyOficinas/src/` | cp src → app alvo |

### PERSONALIZAÇÃO — por SaaS (entradas suas)
| Item | Onde | Quem define |
|---|---|---|
| **Domínio** | `infra/traefik/<APP>.yml.template` (placeholder DOMAIN) + DNS Cloudflare | **você** |
| **Branding** (nome, cores, logo) | `platform_settings` (white-label) ou wizard 1º acesso | **você** |
| **Secrets** (IA/email) | `supabase secrets set` por project | **você** (ou compartilhar 1 LOVABLE_API_KEY) |
| **Super admin** | secret `SUPER_ADMIN_EMAIL` por project | **você** |
| **Auth** (Site URL/redirect) | dashboard/API por project | eu (com seu OK) |
| **Vertical de nicho** | tabelas + UI extras | decisão: agora ou depois |

---

## 2. Matriz dos 4 SaaS

| App | APP_DIR | Container | Supabase ref | Domínio (definir) | Nicho | Vertical-template atual (será resetado) |
|---|---|---|---|---|---|---|
| NexvyBeauty | NexvyBeauty | nexvy-beauty | `fzhlbwhdejumkyqosuvq` | ? (ex: nexvybeauty.com.br) | Salão de beleza | agendamentos, clientes, pacotes |
| BarbeiroPro | BarbeiroPro | nexvy-barbeiro | `hjgobmfvejdhrpeqyspa` | ? (ex: barbeiropro.com.br) | Barbearia | booking |
| NexvyFoods | NexvyFoods | nexvy-foods | `qautueaaqooyiyrgnxeg` | ? (ex: nexvyfoods.com.br) | Restaurante/delivery | cardapio, entregas |
| NexvyGYM | NexvyGYM | nexvy-gym | `zgxptkokuxgdpoowjuty` | ? (ex: nexvygym.com.br) | Academia | alunos, checkins, agenda |

---

## 3. Decisão de arquitetura — vertical de nicho: agora ou depois?

O sales-spark é um **CRM/atendimento genérico** que serve qualquer nicho. Há 2 estratégias:

| Estratégia | O que entrega | Esforço/SaaS |
|---|---|---|
| **A — Core puro primeiro** ⭐ | Cada SaaS sobe com o sales-spark completo (CRM, IA, captura, booking, inbox) + branding do nicho. 100% das funções do sales-spark, operante. | ~0,5 sprint (replicação) |
| **B — Core + vertical de nicho** | Além do core, adiciona as tabelas/UI específicas (Beauty: serviços/profissionais; Foods: cardápio/delivery; GYM: treinos/check-in; Barbeiro: agenda de cortes) | +1-2 sprints/SaaS |

**Recomendação: A primeiro** (replicar o core nos 4, todos operantes), **depois B** por SaaS conforme demanda. Isso entrega 4 SaaS vivos rápido, e o vertical vira incremento. (Mesma lógica que aplicamos no Oficinas: core primeiro, vertical oficina depois.)

---

## 4. Runbook parametrizado (o cascateamento como script)

Transforma os 14 passos do `bootstrap.md` num fluxo reproduzível. Variáveis por SaaS:
```bash
APP_DIR=NexvyBeauty
SUPABASE_REF=fzhlbwhdejumkyqosuvq
CONTAINER=nexvy-beauty
DOMAIN=nexvybeauty.com.br
PLATFORM_NAME="NexvyBeauty"
SUPER_ADMIN_EMAIL=<email>
```

### Fase A — Banco (idêntico ao Oficinas, ~10 min)
1. `supabase link --project-ref $SUPABASE_REF`
2. Extensions: `CREATE EXTENSION vector/pg_trgm WITH SCHEMA public` + pg_cron/pg_net/pgmq/uuid-ossp
3. `DROP SCHEMA public CASCADE` (greenfield — apaga o vertical-template da casca)
4. Aplicar `baseline-schema.sql` (limpo: sem `\restrict`, sem `CREATE SCHEMA public`)
5. Grants (anon/authenticated/service_role)
6. Seeds por-tabela (platform_plans, help_categories, form_templates, platform_releases)
7. `storage-setup.sql`
8. `ALTER PUBLICATION supabase_realtime ADD TABLE ...` (6 tabelas)
9. Cron template (parametriza ref + anon key do app)

### Fase B — Edges (idêntico, ~8 min)
10. `cp -r apps/NexvyOficinas/supabase/functions/* apps/$APP_DIR/supabase/functions/`
11. config.toml com project_id = $SUPABASE_REF
12. `supabase functions deploy --project-ref $SUPABASE_REF`

### Fase C — Frontend (idêntico + branding, ~5 min build)
13. `rm -rf apps/$APP_DIR/src && cp -r apps/NexvyOficinas/src apps/$APP_DIR/src` (mesmo código)
14. `.env`/`.env.production` do app: VITE_SUPABASE_URL + ANON do project alvo
15. (Branding) UPDATE `platform_settings` SET platform_name, primary_color, logo_url — OU wizard 1º acesso
16. `npm install && npm run build`

### Fase D — Deploy + Auth (personalização)
17. DNS: apontar $DOMAIN → VPS 145.223.29.96 (Cloudflare)
18. Traefik: renderizar `infra/traefik/$APP_DIR.yml.template` com $DOMAIN
19. `bash infra/deploy-vps.sh $APP_DIR $CONTAINER $DOMAIN`
20. Secrets: `supabase secrets set` (SUPER_ADMIN_EMAIL + IA/email) no project
21. Auth: Site URL=$DOMAIN + redirect URLs (via API/dashboard)
22. Super admin: signup com $SUPER_ADMIN_EMAIL → promovido automático

> **Automação proposta:** empacotar Fases A-C num script `infra/cascade-core.sh <APP_DIR> <SUPABASE_REF> <CONTAINER> <DOMAIN>` que roda tudo. Fase D (DNS/Auth/secrets) fica semi-manual (depende de inputs seus).

---

## 5. O que preciso de você para cascatear

| # | Input | Para |
|---|---|---|
| 1 | **Domínios** dos 4 SaaS (ou subdomínios) | DNS + Traefik + Auth Site URL |
| 2 | **Branding** de cada (nome final, cor primária, logo) | platform_settings |
| 3 | **Secrets** — usar 1 `LOVABLE_API_KEY` compartilhado p/ todos, ou chaves por SaaS? | IA/email |
| 4 | **Super admin email** por SaaS (ou o mesmo pra todos) | bootstrap |
| 5 | **Vertical de nicho**: estratégia A (core puro) ou B (core+vertical) agora? | escopo |

---

## 6. Ordem & esforço

| SaaS | Ordem sugerida | Esforço (estratégia A) |
|---|---|---|
| NexvyBeauty | 1º (valida o runbook replicado) | ~0,5 sprint |
| BarbeiroPro | 2º | ~0,3 sprint (runbook já provado) |
| NexvyFoods | 3º | ~0,3 sprint |
| NexvyGYM | 4º | ~0,3 sprint |

Total estratégia A: **~1,5 sprint** para os 4 operantes. Verticais de nicho (B): incremento posterior por demanda.

---

## 7. Riscos & validação

- **Risco:** reset apaga o vertical-template da casca → confirmar greenfield de cada (como no Oficinas, sem dados reais).
- **Risco:** domínio/DNS não propagado → Traefik não roteia. Validar com `curl https://$DOMAIN`.
- **Risco:** secrets ausentes → IA/email inertes (não bloqueia o app subir).
- **Validação por SaaS (critério de done):** `curl https://$DOMAIN` HTTP 200 + login do super admin funciona + 161 tabelas no banco.

---

## Conclusão

O cascateamento é **80% replicação mecânica** (core idêntico, runbook provado) + **20% personalização** (domínio/branding/secrets/super-admin por SaaS). Com a estratégia A (core puro primeiro), os 4 SaaS ficam operantes em ~1,5 sprint. O vertical de nicho de cada um é incremento posterior.

**Próximo passo:** você me dá os 5 inputs da Seção 5 (pelo menos domínio + super-admin de um SaaS) e eu cascateio o primeiro (NexvyBeauty), validando o runbook replicado ponta a ponta antes de repetir nos outros 3.
