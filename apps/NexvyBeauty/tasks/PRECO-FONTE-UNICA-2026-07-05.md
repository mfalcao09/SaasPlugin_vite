# Preço — Fonte Única no Banco (NexvyBeauty)

> **Data:** 2026-07-05 · **Autor:** Claude (orquestrador) · **Escopo:** auditoria read-only + design dos 4 patches. **NÃO aplicado** — pronto para go-live (Onda 7).
> **Decisão Marcelo (verbatim):** "preço seguir sempre o que está na UI (que deve ser o mesmo do banco)... uma regra que prevalece o DB, sempre."
> **Tese do orquestrador (aprovada nesta análise):** a cura não é sincronizar duas cópias do número — é **eliminar a duplicação**. Preço existe só no banco (`platform_plans` → view `public_plans`); playbook/persona nunca citam número; o brain injeta o preço em runtime.

---

## 0. TL;DR — verdade desconfortável primeiro

**[Certo]** A UI e o motor de venda **já são fonte-única** hoje. A `SalesPage` lê `public_plans` (sem preço hardcoded) e o `platform-sales-brain` busca `price_monthly`/`checkout_url` de `public_plans` em runtime e injeta na seção `LINKS DE PAGAMENTO`. O bug **não está na UI nem no fluxo de checkout.**

**[Certo]** A divergência vive **exclusivamente nos textos das personas/knowledge_base** (migrations `20260705_*`), onde os preços foram **transcritos à mão** para dentro do prompt (`Essencial R$217 · Premium R$387 · Ultra R$687`). São cópias congeladas. Hoje elas **coincidem** com o banco — confirmei contra o DB vivo (ver §2) — mas são frágeis: na próxima mudança de preço, o banco muda e o prompt não, e a Bia/Duda passa a falar um número que a LP não mostra. Foi exatamente isso que gerou o histórico "347/197/487" espalhado.

**[Certo]** Há **um** acoplamento residual legítimo: `QCRV_PRICE_ANCHOR = 217` no score determinístico do brain. Não é preço-de-venda (é denominador de cálculo de razão PR÷preço), mas é o mesmo número hardcoded. Tratamento recomendado no §3(c)/§4.

**Régua de sucesso (declarativo, §8.3):** *depois dos 4 patches, grep por `217|387|687` em `supabase/functions/` e nas migrations de persona retorna zero preço-de-venda hardcoded; a única ocorrência remanescente é o `QCRV_PRICE_ANCHOR`, e essa lê do banco no boot (ou está documentada como constante com fallback).*

---

## 1. Mapa de divergências (auditoria exaustiva, read-only)

Grep: `\b(197|217|297|347|387|487|687)\b` em `migrations_platform_crm/`, `functions/`, `src/`.

Legenda de classificação:
- **(i) PREÇO-DINÂMICO** — número de preço de venda que **deve** vir do banco e **não** estar no texto.
- **(ii) ÂNCORA-CÁLCULO** — número usado em fórmula (não é o preço exibido), acoplamento a documentar.
- **(iii) NÃO-PREÇO** — placeholder de UI, exemplo de doc, quota. Ignorar.

### 1.1 `supabase/functions/` — motor

| Arquivo:linha | Trecho | Classe | Ação |
|---|---|---|---|
| `platform-sales-brain/index.ts:452` | comentário `Preço-âncora do banco = 217 (NÃO 197)` | (ii) | doc — vira comentário do patch (c) |
| `platform-sales-brain/index.ts:453` | `const QCRV_PRICE_ANCHOR = 217;` | (ii) | **acoplamento residual** → ler do banco no boot (patch c) |
| `platform-sales-brain/index.ts:469` | comentário `R = PR ÷ 217` | (ii) | doc — ajustar junto |
| `platform-sales-brain/index.ts:510` | `r = pr / QCRV_PRICE_ANCHOR;` | (ii) | usa a constante (não é literal) — ok se (c) resolver a constante |
| `_shared/tools/impl/criar_deal.ts:19` | `'...em reais (ex: 297.00).'` | (iii) | exemplo de doc de tool — **manter** |

> **Confirmação-chave:** o brain **já busca** `plans` do banco (linhas 779-785: `.from('public_plans').select('name, slug, price_monthly, checkout_url')`) e injeta via `buildCheckoutContext` (linha 194: `R$${p.price_monthly}`). O preço de venda no runtime **já é do banco** — o número no prompt de persona é redundante e perigoso.

### 1.2 `supabase/migrations_platform_crm/` — personas & knowledge_base (o foco do problema)

| Arquivo:linha | Trecho (resumo) | Classe | Ação |
|---|---|---|---|
| `20260705_modelo_checkout_bia_valor.sql:35` | persona Bia: `preços (Essencial 217 · Premium 387 · Ultra 687)` | (i) | **remover número** → apontar p/ LINKS DE PAGAMENTO |
| `20260705_bia_persona_closer_playbook.sql:23-24` | comentário: revisão citou 347 p/ Premium; banco diz 387 | (i)/doc | evidência viva da divergência histórica |
| `20260705_bia_persona_closer_playbook.sql:48` | `Essencial 217; Premium 387; Ultra 687` + `R$217/mês` | (i) | **remover número** |
| `20260705_bia_persona_closer_playbook.sql:58` | objeção "tá caro": `R$217 é uma fração` | (i) | **remover número** → "o valor do plano recomendado" |
| `20260705_bia_persona_closer_playbook.sql:65` | cardápio: `Essencial 217 é o certo` | (i) | **remover número** |
| `20260705_bia_persona_closer_playbook.sql:80` | `Preços oficiais SEMPRE... 217 · 387 · 687` | (i) | **substituir** por regra dura anti-memória |
| `20260705_bia_persona_closer_playbook.sql:120` | REGRAS DE COERÊNCIA: `217 · 387 · 687` | (i) | **substituir** por regra dura |
| `20260705_agents_linha_duda_bia.sql:61` | `Preços oficiais sempre: 217 · 387 · 687` | (i) | **substituir** por regra dura |
| `20260705_playbook_qualificacao_v2.sql:25` | bloco QCR-V: `R = PR÷217` **e** `Essencial (R$217/mês)` | (i)+(ii) | 217-de-cálculo = manter conceito; 217-de-preço = remover |
| `20260705_playbook_qualificacao_v2.sql:45` | objetivo: `<40 = Essencial R$217` | (i) | **remover número** |
| `20260705_playbook_qualificacao_v2.sql:52` | `recomendar Essencial (R$217)` | (i) | **remover número** |
| `20260705_playbook_qualificacao_v2.sql:55` | `Preços oficiais sempre: 217 · 387 · 687` | (i) | **substituir** por regra dura |
| `20260705_seed_product_nexvybeauty_playbook.sql:15` | `v_pricing` jsonb: `preco_mensal:217/387/687` | (i) | **remover números** do jsonb (deixar só público/nota + fonte) |
| `20260705_seed_product_nexvybeauty_playbook.sql:24` | `v_plans`: `Essencial R$217/mês ... Ultra R$687` | (i) | **remover números** → nomes + público + "preços do banco/LP" |

### 1.3 `src/` — UI

| Arquivo:linha | Trecho | Classe | Ação |
|---|---|---|---|
| `pages/SalesPage.tsx:449` | `{BRL.format(p.price_monthly)}` | **fonte-única OK** | **confirmado** — lê `public_plans`, zero hardcode |
| `hooks/usePlatformPlans.ts` (`usePublicPlans`) | `.from('public_plans')` | **fonte-única OK** | **confirmado** |
| `components/seller/inbox/PaymentLinkDialog.tsx:119` | `placeholder="297,00"` | (iii) | placeholder de input — **manter** |
| `components/superadmin/PlatformTemplateEditor.tsx:24` | `amount: 'R$ 297,00'` | (iii) | preview de template — **manter** |
| `components/{superadmin,admin}/**/PricingPlansSection.tsx:190-192` | `placeholder="297,00"` | (iii) | placeholder do editor de plano — **manter** |
| `components/**/PostSaleVariablePicker.tsx` | `ex.: 197,00` / `ex.: 297,00` | (iii) | doc de variável — **manter** |
| `data/mockData.ts:45` | `price: 'R$ 1.297/mês'` | (iii) | **mock/demo** — não é plano real, manter (idealmente marcar como mock) |

**Veredito UI:** **nenhum** componente de produção tem preço de plano hardcoded. A UI já cumpre a decisão do Marcelo. Patch (d) é só **confirmação**, não correção.

---

## 2. Fonte de verdade — como é hoje (verificado)

### 2.1 Cadeia canônica
```
platform_plans (tabela, RLS fechada)  ← ÚNICO lugar onde o número existe
        │  price_monthly, name, slug, checkout_url
        ├──▶ VIEW public.public_plans (SELECT anônimo, só colunas de vitrine)
        │        ├──▶ UI:   usePublicPlans() → SalesPage (BRL.format(price_monthly))
        │        └──▶ BRAIN: platform-sales-brain .from('public_plans')
        │                     → buildCheckoutContext → "LINKS DE PAGAMENTO"
        └──▶ (personas/knowledge_base NÃO deveriam tocar aqui — hoje transcrevem à mão)
```

### 2.2 Preço REAL no banco (consultado via REST em 2026-07-05, projeto `fzhlbwhdejumkyqosuvq`)

| name | slug | price_monthly | is_public |
|---|---|---|---|
| Trial | `trial` | **0,00** | false |
| Essencial | `starter` | **217,00** | true |
| Premium | `pro` | **387,00** | true |
| Ultra | `premium` | **687,00** | true |

> **Comando de verificação (idempotente, sem expor secret):**
> ```bash
> ANON=$(grep -E 'VITE_SUPABASE_ANON|ANON_KEY' .env | head -1 | cut -d= -f2-)
> curl -s "https://fzhlbwhdejumkyqosuvq.supabase.co/rest/v1/public_plans?select=name,slug,price_monthly,is_public,display_order&order=display_order" \
>   -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
> ```

**Achado importante:** os números das personas (`217/387/687`) **batem** com o banco hoje. O "347" aparece **só** num comentário de migration relatando uma revisão anterior errada — já corrigida. Ou seja: o incêndio "347/197/487" foi **apagado nos números**, mas as **cópias manuais continuam no prompt** — a próxima mudança de preço reacende tudo. É por isso que a cura tem que ser estrutural, não mais um "acerte o número".

### 2.3 `buildCheckoutContext` (brain, linha 190-196) — confirmado correto
```ts
function buildCheckoutContext(plans: Array<Record<string, any>>): string {
  if (!plans.length) return '';
  let ctx = `\n## LINKS DE PAGAMENTO (a sua maquininha — mande o link DIRETO quando o cliente DECIDIR contratar)\n`;
  for (const p of plans) {
    ctx += `- ${p.name} (R$${p.price_monthly}): ${p.checkout_url}\n`;  // ← preço do banco, runtime
  }
  return ctx;
}
```
O `plans` vem de `public_plans` (linhas 779-785), filtrado por `checkout_url` presente. **Já é a fonte única em runtime.** O patch (c) só precisa garantir que o **prompt de persona pare de competir** com esta seção e que o **ANCHOR** também venha daqui.

---

## 3. Os 4 patches (drafts — NÃO aplicar até Onda 7)

### (a) Migration de limpeza das personas/knowledge_base

**Objetivo:** trocar todo número de preço nos textos por uma referência à seção `LINKS DE PAGAMENTO` (injetada em runtime). Idempotente, por `regexp_replace` — não recria a persona, só limpa os números.

**Arquivo novo:** `supabase/migrations_platform_crm/20260705_precos_fonte_unica_limpeza.sql`

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 20260705_precos_fonte_unica_limpeza.sql
-- Remove preços de venda TRANSCRITOS À MÃO de personas/knowledge_base/produto.
-- Regra: preço vive SÓ em platform_plans → o brain injeta em runtime na seção
-- "LINKS DE PAGAMENTO". Persona nunca cita número (evita divergência com o banco).
-- Idempotente: regexp_replace sobre os textos; rodar 2x não muda nada.
-- NÃO toca no QCRV (razão PR÷preço) — isso é cálculo, tratado no brain (patch c).
-- ─────────────────────────────────────────────────────────────────────────────

-- Frase-substituta canônica (única em todo o repo):
--   "o plano recomendado (preço na seção LINKS DE PAGAMENTO — nunca de memória)"

DO $$
DECLARE
  -- Casa "Essencial 217 · Premium 387 · Ultra 687", com/sem R$, com/sem /mês,
  -- separadores · , ; e — . Substitui pela regra sem número.
  v_re_lista text := '(?i)Essencial[^.\n]{0,6}R?\$?\s*217[^.\n]{0,40}687[/mês ]*';
  v_sub_lista text := 'os planos oficiais (nomes e valores SEMPRE da seção LINKS DE PAGAMENTO — nunca de memória)';
  -- Casa "R$217", "217/mês", "Essencial (R$217)" isolados → "o plano recomendado".
  v_re_solo  text := '(?i)\(?R\$\s*(217|387|687)(/mês)?\)?';
  v_sub_solo text := 'o valor do plano recomendado (seção LINKS DE PAGAMENTO)';
BEGIN
  -- 1) additional_prompt das personas (Duda/Bia e afins)
  UPDATE public.platform_crm_product_agents
     SET additional_prompt = regexp_replace(
           regexp_replace(additional_prompt, v_re_lista, v_sub_lista, 'g'),
           v_re_solo, v_sub_solo, 'g'),
         updated_at = now()
   WHERE additional_prompt ~ '(217|387|687)';

  -- 2) description das personas
  UPDATE public.platform_crm_product_agents
     SET description = regexp_replace(description, v_re_lista, v_sub_lista, 'g'),
         updated_at = now()
   WHERE description ~ '(217|387|687)';

  -- 3) knowledge_base + plans + pricing do produto nexvybeauty
  UPDATE public.platform_crm_products
     SET knowledge_base = regexp_replace(
           regexp_replace(COALESCE(knowledge_base,''), v_re_lista, v_sub_lista, 'g'),
           v_re_solo, v_sub_solo, 'g'),
         plans = 'Trial (teste do produto, sem condições de fundadora) · Essencial (solo) · '
              || 'Premium (salão/equipe) · Ultra (operação maior). '
              || 'PREÇOS E LINKS: sempre da seção LINKS DE PAGAMENTO (public_plans/LP). Nunca inventar/arredondar.',
         -- pricing jsonb: mantém nome/público, remove preco_mensal (fonte = banco)
         pricing = jsonb_build_object(
           'planos', jsonb_build_array(
             jsonb_build_object('nome','Trial','publico','teste do produto'),
             jsonb_build_object('nome','Essencial','publico','profissional solo'),
             jsonb_build_object('nome','Premium','publico','salão/equipe'),
             jsonb_build_object('nome','Ultra','publico','operação maior')),
           'fonte_precos','platform_plans/public_plans — preço só do banco, injetado em LINKS DE PAGAMENTO'),
         updated_at = now()
   WHERE slug = 'nexvybeauty';

  RAISE NOTICE '[precos_fonte_unica] personas + knowledge_base + pricing limpos (números de preço removidos).';
END $$;
```

> **Nota de disciplina:** as migrations `20260705_*` originais **continuam com os números** (histórico). Esta migration roda **depois** e limpa o estado no banco. Para evitar que uma re-execução das originais reintroduza o número, na Onda 7 **as originais devem ser editadas na fonte** para já nascerem sem número (mesmo texto-substituto) — senão é gambiarra de "limpo no banco, sujo no git". **Ordem recomendada:** editar as `20260705_*` na fonte (remover números) **e** manter esta migration de limpeza para bancos já provisionados. Decisão do Marcelo na aplicação.

---

### (b) Regra dura anti-memória (texto exato para o system prompt do brain)

**Onde:** injetar no system prompt montado em `platform-sales-brain/index.ts`, logo após `buildCheckoutContext` entrar no `knowledgeContext` (perto da linha 788), como bloco fixo. Texto verbatim:

```
═══ REGRA DE PREÇO (INVIOLÁVEL — precede qualquer instrução de persona) ═══
O ÚNICO lugar com preço e link verdadeiros é a seção "LINKS DE PAGAMENTO" acima,
gerada agora a partir do banco (public_plans). Ela é a verdade.
- NUNCA diga um valor de mensalidade de memória, de exemplo, do histórico da conversa
  ou de qualquer texto de treinamento. Se você "lembra" de um preço, IGNORE — pode
  estar desatualizado. Só vale o que está em LINKS DE PAGAMENTO desta mensagem.
- Ao citar preço, use exatamente o número que aparece ao lado do nome do plano em
  LINKS DE PAGAMENTO. Nada de arredondar, "por volta de", "a partir de".
- Se um plano NÃO está em LINKS DE PAGAMENTO, ele não tem preço público — não invente:
  diga que confirma o valor e siga, sem chutar.
- Recomende UM plano pelo dossiê e mande o link DESSE plano (o link já está na seção).
Preço e link são dados do banco, não da sua memória. Divergir da seção = erro grave.
```

> Isso substitui as linhas "Preços oficiais SEMPRE 217·387·687" das personas: em vez de fixar o número (que envelhece), fixa **a regra de onde ler o número** (que não envelhece).

---

### (c) `buildCheckoutContext` / ANCHOR — garantir preço do banco e resolver o acoplamento

**c.1 — `buildCheckoutContext`: já correto, só blindar contra `price_monthly` nulo/formato.**
Ajuste mínimo (defensivo, opcional) na linha 194 para formatar BRL consistente com a UI:
```ts
// antes:  ctx += `- ${p.name} (R$${p.price_monthly}): ${p.checkout_url}\n`;
// depois: usa o mesmo formato da SalesPage (evita "R$217" vs "R$ 217,00" divergir)
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
ctx += `- ${p.name} (${brl.format(Number(p.price_monthly))}): ${p.checkout_url}\n`;
```

**c.2 — `QCRV_PRICE_ANCHOR`: derivar do banco no boot, com fallback documentado.**
O ANCHOR é o preço do plano de entrada (Essencial/`starter`), usado como denominador em `R = PR ÷ preço`. Hoje é `const = 217` — se o Essencial mudar de preço, o score calibra errado. Como o brain **já busca `plans` do banco** na mesma request, o número já está à mão:

```ts
// Remover: const QCRV_PRICE_ANCHOR = 217;
// No handler, após buscar `plans` (linha ~785), derivar o âncora do plano de entrada:
const ENTRY_PLAN_SLUG = 'starter'; // Essencial = plano de entrada (menor price_monthly público)
function resolveAnchor(plans: Array<Record<string, any>>): number {
  const publicPaid = plans
    .map((p) => Number(p.price_monthly))
    .filter((n) => Number.isFinite(n) && n > 0);
  // preferir o plano de entrada por slug; senão o menor preço público; senão fallback.
  const entry = plans.find((p) => p.slug === ENTRY_PLAN_SLUG);
  const anchor = entry ? Number(entry.price_monthly)
               : publicPaid.length ? Math.min(...publicPaid)
               : 217; // FALLBACK documentado: preço do Essencial em 2026-07-05.
  return Number.isFinite(anchor) && anchor > 0 ? anchor : 217;
}
// Passar `resolveAnchor(plans)` para computeQcrScore em vez da constante global.
// computeQcrScore(facts) → computeQcrScore(facts, anchor) e usar `anchor` na linha 510.
```

> **Trade-off honesto:** isso adiciona 1 parâmetro em `computeQcrScore`. O ganho é que o score deixa de mentir se o preço de entrada mudar. Se o Marcelo achar over-engineering para a Onda 7, o **mínimo aceitável** é manter `const QCRV_PRICE_ANCHOR = 217` **com comentário explícito** apontando que é o preço do `starter` e que **precisa ser atualizado à mão se o Essencial mudar** — mas isso é dívida técnica consciente, não fonte-única de verdade.

---

### (d) UI — confirmação (nada a corrigir)

- `SalesPage.tsx:449` → `{BRL.format(p.price_monthly)}` lendo `usePublicPlans()` → **fonte-única OK**.
- `usePlatformPlans.ts` → `usePublicPlans` lê `public_plans` → **OK**.
- Ocorrências `297/197` em `src/` são **placeholders de input** e **exemplos de doc de variável** (não preço de plano) → **manter**.
- `data/mockData.ts:45` (`R$ 1.297/mês`) é **mock de demonstração**, não plano real → manter (sugestão menor: renomear para `MOCK_` ou marcar com comentário, fora do escopo desta cura).

**Ação (d):** nenhuma correção. Apenas registrar no PR que a UI foi auditada e está conforme.

---

## 4. Auto-avaliação honesta

**Elimina a divergência na raiz?** **Sim, para o preço de venda.** Depois dos patches (a)+(b), não existe mais nenhuma cópia do preço de venda fora de `platform_plans`. A persona passa a **ler** o preço (via LINKS DE PAGAMENTO, que vem do banco) em vez de **carregar** o preço. Uma mudança de preço no super-admin passa a propagar automaticamente para UI, checkout e discurso da IA — sem tocar em migration nem em prompt. Isso é fonte única de verdade real, não sincronização de duas cópias.

**Onde ainda "adia" (honestidade):**
1. **O `QCRV_PRICE_ANCHOR`.** Sem o patch (c.2), ele continua sendo um `217` congelado. É o **único** número que sobrevive. Não é preço-de-venda (é denominador de razão), então o risco é menor — mas é o mesmo tipo de dívida. **Recomendação:** aplicar (c.2) (ler do banco no boot). Custo: 1 parâmetro extra numa função. Benefício: zero número de preço hardcoded no motor. Se o Marcelo optar pelo fallback documentado, é uma decisão de proporcionalidade legítima, **desde que o comentário deixe explícito o acoplamento** — o pior cenário é o `217` mudo que ninguém sabe que existe.
2. **As migrations `20260705_*` originais no git.** A migration de limpeza (a) corrige o **banco**, mas se as originais não forem editadas na fonte, o git continua "sujo" e um re-provisionamento reintroduz os números antes da limpeza rodar. Não é fonte-única de verdade enquanto a fonte (git) tiver o número. **Recomendação:** editar as originais na Onda 7 (remover números, apontar para LINKS DE PAGAMENTO) **e** manter a migration de limpeza para bancos já vivos.

**Tratamento recomendado do ANCHOR (resposta direta à pergunta):** **ler do banco no boot** (patch c.2), usando o `price_monthly` do plano de entrada (`starter`) que o brain já busca na mesma request — custo marginal zero de I/O. Fallback `217` só como último recurso, com comentário. Aceitar como constante documentada é a **segunda melhor** opção, válida só se a proporcionalidade da Onda 7 exigir — mas então não venda como "fonte-única": venda como "dívida consciente com data de validade".

---

## 5. Entregáveis

- **Este arquivo:** `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tasks/PRECO-FONTE-UNICA-2026-07-05.md`
- **Par HTML:** `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty/tasks/PRECO-FONTE-UNICA-2026-07-05.html`
- **4 patches** prontos nos §3(a)-(d) — aplicar na Onda 7 (go-live), na ordem: (b) e (c) no brain → (a) limpeza no banco → editar migrations originais na fonte → (d) só confirmar.
