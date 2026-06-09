# Análise: Desacoplamento Lovable + Sanitização base44 × lovable

> **Data:** 2026-06-09
> **Origem:** 3 questões do Marcelo antes de escrever o automatizador de cascateamento.
> **Método:** análise direta do código (grep/leitura), não achismo.

---

## Q1 — Substituir a infraestrutura de APIs do Lovable

### O que o código REALMENTE depende do Lovable (achados)

| Dependência | Onde | Acoplamento | Substituível? |
|---|---|---|---|
| **AI Gateway** (`ai.gateway.lovable.dev`) | **29 edge functions** | Médio | ✅ é OpenAI-compatible |
| `LOVABLE_API_KEY` | 29 edges (auth do gateway) | Médio | ✅ trocar por key do provider |
| `@lovable.dev/cloud-auth-js` | 3 arquivos (OAuth social) | Baixo | ✅ Supabase OAuth nativo |
| `LOVABLE_SEND_URL` (email) | 1 edge (`process-email-queue`) | Baixo | ✅ Resend (já suportado no código) |
| `lovable-tagger` | `vite.config.ts` (dev-only) | Nenhum | ✅ remover linha |
| URLs `*.lovable.app` | 3 edges (fallback de `SITE_URL`) | Nenhum | ✅ setar `SITE_URL` próprio |

**Models usados no gateway:** `google/gemini-2.5-flash` (20×), `gemini-3-flash-preview` (7×), `openai/text-embedding-3-small` (embeddings/RAG), `gpt-4o-transcribe`/`whisper-1` (transcrição), `gpt-4o-mini`.

### Pontos-chave
- **O auth real NÃO depende do Lovable.** Login email/senha é `supabase.auth` puro. O `@lovable.dev/cloud-auth-js` só faz OAuth social (Google/Apple/Microsoft) e injeta o token no Supabase. Removível → usar OAuth nativo do Supabase.
- **O gateway é OpenAI-compatible** (`/v1/chat/completions`, `/v1/embeddings`). Trocar = mudar endpoint + key + (talvez) nomes de model. O código já tem `OPENAI_EMBEDDINGS_ENDPOINT` como referência direta.
- **O acoplamento Lovable é FRACO** — é builder + serviços opcionais, não runtime obrigatório. Diferente do base44 (ver Q2).

### Faz sentido? É a melhor decisão? → **SIM, com 1 ressalva**

**Por que desacoplar:**
- **Risco de vendor:** hoje 29 edges (toda a IA) dependem do gateway Lovable. Se ele cair, cobrar ou bloquear, a IA do produto inteiro para.
- **Custo/controle:** keys próprias por provider (OpenAI/Gemini/Anthropic direto) = billing transparente + alinhado com Seção 11.1 do CLAUDE.md (keys próprias server-side).
- **Multi-tenant real:** o sales-spark já tem `org_ai_credentials` (credenciais de IA por organização) — a arquitetura já prevê provider próprio por cliente.

**A ressalva (trade-off):** o gateway Lovable dá conveniência — um endpoint, vários models (gemini+openai), billing unificado. Trocar por providers diretos significa gerenciar N keys. **Alternativa intermediária:** usar um gateway OpenAI-compatible neutro (OpenRouter, ou o próprio AI Gateway da Vercel) — mantém 1 endpoint, sem amarração ao Lovable.

### Plano de desacoplamento (esforço: M)
1. **AI (29 edges):** criar helper único `_shared/ai.ts` com endpoint+key configuráveis via env (`AI_GATEWAY_URL`, `AI_API_KEY`). Apontar pra OpenAI direto OU OpenRouter. Os models gemini → manter (se gateway suportar) ou mapear pra gpt-4o-mini. Find/replace de `ai.gateway.lovable.dev`.
2. **OAuth (3 arquivos):** trocar `lovable.auth.signInWithOAuth` por `supabase.auth.signInWithOAuth` (nativo). Configurar provider Google no dashboard Supabase.
3. **Email (1 edge):** `LOVABLE_SEND_URL` → Resend (`RESEND_API_KEY`, já suportado).
4. **vite.config:** remover `lovable-tagger` (dev-only).
5. **SITE_URL:** setar por SaaS (elimina fallbacks `*.lovable.app`).

> **Decisão pendente:** provider de destino — OpenAI direto, OpenRouter (1 gateway neutro), ou Vercel AI Gateway? Recomendo **OpenRouter** (OpenAI-compatible, mantém os models gemini, troca mínima no código).

---

## Q2 — Sanitização base44 × lovable (evitar conflito de plataforma)

### A descoberta mais importante

**Não há coexistência base44 + lovable no mesmo app.** No big-bang do Oficinas, o ERP base44 foi **substituído** pelo CRM lovable inteiro. Estado atual:

| App | Plataforma | base44 SDK | Supabase |
|---|---|---|---|
| **NexvyOficinas** | lovable (pós big-bang) | **0 arquivos** ✅ | 100% |
| BarbeiroPro | base44 (ERP) | 28 arquivos | parcial |
| NexvyFoods | base44 (ERP) | 28 arquivos | parcial |
| NexvyGYM | base44 (ERP) | 29 arquivos | + 6 supabase (híbrido) |
| NexvyBeauty | misto | 0 base44 | supabase |

### Diferença de acoplamento — por que base44 ≠ lovable

| | **Lovable** | **base44** |
|---|---|---|
| Natureza | Builder + serviços opcionais | **Plataforma de runtime** (backend próprio) |
| Dados | Supabase (seu) | `base44.entities.X` → **API/DB do base44** |
| Auth | `supabase.auth` (seu) | `base44.auth` → **auth do base44** |
| Roda sem a plataforma? | **Sim** (Vite+Supabase puro) | **Não** (entities/auth são runtime calls) |

**Conclusão técnica:** base44 tem amarração **forte** (o ERP não funciona sem o backend base44); lovable tem amarração **fraca** (removível). São **dois backends/auth diferentes**.

### Há conflito real? Quando?

**Se coexistirem no mesmo app/deploy (base44 + supabase):**
- 🔴 **Dois sistemas de auth** (`base44.auth` vs `supabase.auth`) — sessões concorrentes, qual é a fonte de verdade do usuário?
- 🔴 **Dois backends de dados** (entities base44 vs Postgres Supabase) — dados fragmentados, sem JOIN/RLS unificado.
- 🟡 Dois SDKs no bundle — peso + risco de conflito de versão/polyfill.
- 🟡 Modelos de multi-tenancy/permissão diferentes (base44 próprio vs RLS sales-spark).

**Se NÃO coexistirem (uma plataforma de runtime por app):** sem conflito.

### Recomendação: **NÃO coexistir — Supabase como runtime único**

O caminho limpo (e que o big-bang do Oficinas já iniciou):
1. **Supabase é o runtime de todos** (DB, auth, edges). Lovable e base44 viram só "de onde o código veio", não dependência de produção.
2. **O ERP de cada nicho** (hoje em base44: oficina/barbearia/foods/academia) é **reescrito como módulo vertical dentro do sales-spark/Supabase** — OU aposentado se o sales-spark já cobre a necessidade. É a "estratégia B" do spec de cascateamento.
3. **Sanitização necessária** = remover amarrações de AMBAS as plataformas:
   - **Lovable:** itens da Q1 (AI gateway, OAuth, email, tagger, URLs).
   - **base44:** `@base44/sdk`, `base44.entities`, `base44.auth`, `base44Client` — somem no big-bang de cada casca (como sumiram no Oficinas).

### O que sanitizar JÁ no NexvyOficinas (dívida do big-bang)
- `package.json` `"name": "base44-app"` → `"nexvy-oficinas"` (cosmético, mas confunde).
- Desacoplamento Lovable (Q1) — antes de cascatear, pra o core já sair limpo.

---

## Q3 — Lista direta de inputs que preciso de você

### Domínios & marca (por SaaS)
| # | Input |
|---|---|
| 1 | Domínio de cada SaaS: NexvyOficinas, NexvyBeauty, BarbeiroPro, NexvyFoods, NexvyGYM (ex: `barbeiropro.com.br`) |
| 2 | Subdomínio do app vs site? (ex: `app.X.com.br` pro sistema, `X.com.br` pra landing) |
| 3 | Nome de exibição (platform_name) de cada um |
| 4 | Cor primária + secundária (hex) de cada |
| 5 | Logo (claro + escuro) de cada — arquivo ou URL |

### Acessos & credenciais
| # | Input |
|---|---|
| 6 | Provider de IA destino: OpenRouter (recomendo) / OpenAI direto / manter Lovable? + a **API key** |
| 7 | `RESEND_API_KEY` + **domínio de email verificado** (ex: `noreply@nexvy.com.br`) |
| 8 | `ELEVENLABS_API_KEY` (transcrição de áudio) — ou desabilitar |
| 9 | `FIRECRAWL_API_KEY` (RAG/crawl) — ou desabilitar |
| 10 | Super-admin: 1 e-mail global ou 1 por SaaS? Quais? |
| 11 | Evolution API (WhatsApp): URL + global API key — 1 instância compartilhada ou por SaaS? |

### Decisões de escopo
| # | Input |
|---|---|
| 12 | Vertical de nicho (ERP): reescrever no Supabase agora (estratégia B) ou só core sales-spark primeiro (A)? |
| 13 | As cascas base44 (Barbeiro/Foods/GYM) têm **dados reais** a preservar, ou greenfield (como o Oficinas)? |
| 14 | OAuth social (Google login) entra agora? (precisa Client ID/Secret no Supabase) |

---

## "Algo mais que esqueci?" — sim, 6 pontos pra discutirmos

1. **Custo de IA pós-Lovable:** hoje o gateway Lovable absorve o billing. Direto (OpenAI/OpenRouter) = você paga por uso. Com 29 edges + RAG + transcrição, vale estimar o custo/mês por SaaS antes de escalar pra 5.

2. **Vertical de nicho é trabalho real, não config.** O sales-spark é CRM de vendas genérico. "NexvyOficinas" sem Veículos/OS/Orçamentos é "sales-spark rebatizado". Cada nicho (oficina/barbearia/academia/food/salão) tem entidades próprias. Precisa decidir: o sales-spark já basta como CRM+inbox+booking, ou cada nicho precisa do seu ERP? Isso define se o cascateamento é 1,5 sprint (A) ou 8-10 sprints (B, com 5 ERPs).

3. **Migração de dados das cascas base44:** se Barbeiro/Foods/GYM já têm clientes reais no backend base44, o reset (DROP SCHEMA) os perde. Precisa exportar do base44 antes. (Confirmar item 13.)

4. **Email — domínio verificado é pré-requisito.** Resend/qualquer provider exige domínio verificado (SPF/DKIM) pra não cair em spam. Sem isso, CSAT/convites/notificações não chegam. Precisa configurar DNS de email por domínio.

5. **Evolution API (WhatsApp) por SaaS:** o inbox (coração do CRM) depende de instância Evolution. Hoje há 1 no VPS. 5 SaaS × N clientes = quantas instâncias? Arquitetura de WhatsApp multi-tenant precisa ser pensada (já existe `evolution_instances` por empresa no schema — bom — mas a infra Evolution precisa escalar).

6. **`org_ai_credentials` — IA por cliente, não global:** o sales-spark permite cada organização ter sua própria key de IA. Isso muda o modelo de custo (cliente paga sua IA) e o desacoplamento (a key global vira fallback). Vale decidir o modelo: IA por conta da Nexvy (global) ou repassada ao cliente (por org)?

---

## Síntese & sequência recomendada

**Antes do automatizador de cascateamento, nesta ordem:**
1. **Desacoplar Lovable no NexvyOficinas** (Q1) — deixa o core limpo antes de replicar. ~1 sessão.
2. **Sanitizar nomes base44 residuais** (package.json) — trivial.
3. **Decidir escopo do vertical** (item 12) — define o tamanho do projeto.
4. **Validar o login do Oficinas** (smoke-test real pendente) — antes de replicar um core não-validado.
5. **Então** escrever o `cascade-core.sh` e cascatear.

**Por quê nesta ordem:** cascatear o core ANTES de desacoplar o Lovable = propagar a dependência de vendor pros 5 SaaS, e ter que desfazer 5× depois. Desacoplar 1× no Oficinas e replicar limpo é muito mais barato.
