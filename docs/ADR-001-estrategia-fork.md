# ADR-001 — Estratégia de fork e atualização vs. upstream Vendus

> **Status:** ACEITA · **Data:** 2026-07-06 · **Escopo:** ecossistema NexvyTech (todos os apps do monorepo `SaasPlugin_vite`)
> **Decisores:** Marcelo Silva (dono) · cofundador de produto (análise)
> **Contexto de origem:** replanejamento do NexvyPayments — ao decidir de qual base o novo app forka, emergiu o problema estrutural de manter N apps forkados de um upstream fechado que evolui sozinho.

---

## 1. Contexto e problema

O ecossistema NexvyTech constrói cada SaaS (NexvyBeauty, NexvyPayments, …) como **fork do CRM Vendus** — um produto fechado, comprado pronto, que um desenvolvedor externo evolui e nos entrega como **snapshot do Lovable** ("Initial commit from remix"), sem histórico Git compartilhado com os nossos forks.

Estado atual (três forks divergentes):

| Fork | Base Vendus | Natureza |
|------|-------------|----------|
| **NexvyBeauty** | V3 + ~12 meses de modificações nossas | Mais maduro como produto (quase lançável) |
| **CRM NexvyTech central** | V4 + modificações de vendas | Canal único de venda dos SaaS aos tenants |
| **Clone recebido p/ Payments** | V5 puro do upstream | Base de plataforma mais nova, porém "crua" |

**As três verdades incômodas que restringem qualquer solução:**

1. **Não há `git merge` possível com o upstream.** O Vendus chega como export inteiro e novo do Lovable, sem ancestral comum. Não existe base para 3-way merge limpo — qualquer atualização vinda do upstream é **manual e seletiva por natureza**.
2. **As versões divergem e não se reconciliam.** As melhorias do desenvolvedor externo não retroagem para as versões que já forkamos, e ele não enxerga as modificações que fazemos. Cada fork é uma ilha no tempo + nossas mods.
3. **Nossos apps são verticais.** As melhorias do upstream concentram-se no CRM de vendas/SDR genérico — a camada que nossos apps (beleza, cobrança) **menos** usam. O valor marginal de puxar cada nova versão é baixo e decrescente.

---

## 2. Alternativas consideradas

| Estratégia | Como funciona | Veredito |
|------------|---------------|----------|
| **Vendor branch + merge periódico** | Manter o upstream como branch e mergear cada versão | ❌ Frágil: snapshots Lovable sem histórico comum → conflito pesado a cada versão |
| **Golden core compartilhado** | Extrair o core Vendus comum para `packages/core`, todos os apps consomem; atualizar 1 lugar propaga | 🟡 Ideal de longo prazo, mas exige refactor grande + reconciliar Beauty(V3) e V5 antes → travaria lançamentos agora |
| **Status quo (forks ad-hoc)** | Cada app evolui sozinho, atualização caso a caso sem estratégia | ❌ É o que acontece hoje; vira N ilhas ingerenciáveis |
| **Hard fork gerenciado** | Beauty = base-mãe própria; upstream = fonte de patches seletivos; disciplinas de isolamento | ✅ **ESCOLHIDA** |

---

## 3. Decisão

**Adotamos o HARD FORK GERENCIADO.** O NexvyBeauty (a linhagem mais madura) é declarado a **base-mãe da plataforma Nexvy**. Cada novo app (a começar pelo NexvyPayments) forka da base-mãe, não do upstream cru. As versões futuras do Vendus (V6, V7…) deixam de ser "upstream a mergear" e passam a ser **catálogo de patches seletivos**: quando chegam, fazemos o diff, escolhemos item a item o que vale portar e ignoramos o resto.

Isso é sustentado por **três disciplinas de engenharia obrigatórias** em todo app do ecossistema:

### Disciplina 1 — Isolamento máximo das mods
Tudo que é nosso (domínio do app, LGPD, branding, multi-host, cobrança) vive em **arquivos e migrations próprios e aditivos** — nunca editando arquivos do core Vendus. Convenções:
- Migrations de domínio em pasta própria por app (ex.: `migrations_cobranca/` no Payments, `migrations_salao/` no Beauty), com `organization_id` (multi-tenant), separadas de `migrations_platform_crm/` (o CRM de venda do grupo, tenant-of-one).
- Edge functions novas com nomes próprios; NÃO editar as `_shared/` do core.
- Diferenças entre apps por **configuração** (`brand.ts`, `modules.ts`, platform-shell modular), não por bifurcação de código.

### Disciplina 2 — `CORE-DELTA.md` por app (o registro do que é nosso)
Quando editar um arquivo do core Vendus for **inevitável** (ex.: `main.tsx` para branding pré-paint, ou correção de bug de segurança no core), essa edição é a **exceção documentada**: registrada em `apps/<App>/docs/CORE-DELTA.md` com arquivo, motivo e diff conceitual. Sem esse registro, um diff futuro V5→V6 não distingue "mudança do dev" de "mudança nossa" — e o merge vira arqueologia. Com ele, atualizar é: aplico o snapshot novo do core, re-aplico o delta pela lista.

### Disciplina 3 — Patches seletivos, não merges cegos
Quando chega uma versão nova do upstream: (1) diff da versão nova vs a base do último snapshot conhecido; (2) lista curada do que mudou; (3) decisão item a item do que portar; (4) porta manualmente para a base-mãe as 2–3 melhorias que importam, registrando em `CORE-DELTA.md`. O upstream é catálogo, não patrão.

---

## 4. Consequências

**Positivas:**
- Lançamentos rápidos: novos apps herdam a plataforma madura (multi-tenant, WhatsApp, cadência, IA, LGPD, branding, hardening) sem reconstruir.
- Controle total da linhagem: nenhuma surpresa vinda de merge automático.
- Atualização futura viável (não indolor, mas possível) graças ao isolamento + `CORE-DELTA.md`.

**Negativas / custos aceitos:**
- Abrimos mão da incorporação automática das melhorias do upstream; portá-las é trabalho manual e seletivo.
- A V5 recebida não é adotada como base do Payments — vira fonte de patches seletivos como qualquer outra versão.
- Exige **disciplina contínua**: um único `edit` no core sem registro em `CORE-DELTA.md` degrada a capacidade de atualização. É uma dívida que se paga com hábito, não com ferramenta.

**Norte de longo prazo (decisão futura, não bloqueia nada):** quando ≥3 apps compartilharem a mesma base-mãe estável, avaliar a extração de um **golden core** (`packages/core`) que unifique a plataforma comum e transforme "atualizar N apps" em "atualizar 1 pacote". Depende de reconciliar as divergências atuais entre os forks — projeto próprio, fora do escopo de qualquer lançamento individual.

---

## 5. Aplicação imediata (NexvyPayments)

- Forka do Beauty via `rsync -a --exclude=docs --exclude=tasks --exclude=node_modules --exclude=dist --exclude=.vendus-src-reference apps/NexvyBeauty/ apps/NexvyPayments/`.
- Núcleo de cobrança 100% em `migrations_cobranca/` + edge functions próprias (`c6-billing`, `notaas-emit`, `invoice-batch`, …) — zero edição do core.
- `apps/NexvyPayments/docs/CORE-DELTA.md` criado desde o dia 0; toda exceção registrada.
- Ver `apps/NexvyPayments/docs/specs/` e `apps/NexvyPayments/tasks/` para o plano completo reassentado.
