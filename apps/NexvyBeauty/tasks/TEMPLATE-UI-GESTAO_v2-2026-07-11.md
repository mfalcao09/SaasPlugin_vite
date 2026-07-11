# TEMPLATE-UI-GESTAO_v2 — Design system operacional do gestao.* (Lux navy/gold)

> 🔒 **TRAVADA — ratificação verbatim do Marcelo 2026-07-11: "Travo, siga em frente!"** (após revisão do par visual .html + decisão MONO TOTAL). A partir deste ato: rubric = LEI da frente Lux; mudanças só via `_v3` com nova ratificação. Escopo: SOMENTE gestao.* (app.* = Beauty Rosé, identidade própria aprovada 07-06).
> **2026-07-11 · sessão `6cf2fc02`** · rubric v2 canônica da onda **L4** (NexvyBeauty gestao.*).
> **Supersede:** `TEMPLATE-UI-GESTAO-2026-07-05.md` (v1), que ancorava no **azul `#0A52D1`** — cor **OBSOLETA**, substituída pelo **Nexvy Lux navy `#213156` + dourado**. A ESTRUTURA da v1 (famílias F1–F6, receitas §2, transversais §3, processo GAN §4, mapa §5) é **boa e preservada**; o v2 apenas **RE-ANCORA a paleta** na identidade viva e corrige as contradições que a v1 carregava.
> **Fonte-de-verdade da cor (verbatim):** `src/index.css` → `:root.theme-nexvy-institucional` (claro, L267–370) e `:root.theme-nexvy-institucional.dark` (dark, L374–466); REF Lovable `tasks/lux-reference/lovable-styles-aprovado.css`.
> **Worklist de limpeza pareada:** `P1B-LUX-L4-WORKLIST-HARDCODE-2026-07-11.md` (tabela `arquivo:linha` mecanicamente aplicável).
> **Como usar:** pegar a tela → achar a FAMÍLIA (§5) → aplicar receita (§2) + transversais (§3) → limpar hardcodes da worklist → pontuar pela RUBRIC (§4) → gate **≥85** (máx 4 iterações).

---

## 0 · O que muda da v1 para a v2 (delta explícito)

| # | v1 (2026-07-05) — OBSOLETO | v2 (2026-07-11) — CANÔNICO |
|---|---|---|
| 1 | `--primary/--accent/--ring = 218 91% 43%` (**#0A52D1 azul Nexvy**) | **Claro:** `--primary = 221.8 44.7% 23.4%` (**navy #213156**). **Dark:** `--primary = 38.1 68% 55.7%` (**gold #dba341**). Navy protagoniza o claro; dourado protagoniza o dark. |
| 2 | Proibições não citavam o azul | **Nova proibição dura:** `blue-*` / `#0A52D1` como cor de **ação/marca** = SUPERSEDIDO → reprova (§1.2). |
| 3 | `--gradient-primary` azul→cyan | `--gradient-primary` = **dourado 135°** (`oklch(0.62 0.11 76)→…→0.44 0.07 60`); `--gradient-navy` p/ heros navy. |
| 4 | Tipografia "Inter única" | **No escopo `.theme-nexvy-institucional` a fonte é stack Apple (SF Pro Display/Text)** — Inter vale só para `app.*`. `html` base = 90% (densidade). |
| 5 | Charts `chart-1=azul, chart-2=cyan` | `chart-1=navy, chart-2=gold, chart-3=bronze, chart-4=warm, chart-5=success` (§1.1). |
| 6 | Checklist "grep sem hex de marca" genérico | Checklist explicita **pink-legado (§1.2b)** E **blue-ação/decorativo (§1.2b)**; prova = **computed `--primary #213156`** (claro) no ar. |
| 7 | Mapa = 54 itens | Mapa = **55 itens** (add `v-tarefas`); 7 telas P1 marcadas ✅ referência-viva. |

> ⚠️ **A cor já está viva no código.** O `index.css` foi re-ancorado ao Lux no commit `ec8966c` (azul→superseded) + `125ebbe` (Lux L1/L2). A v1 nunca foi atualizada — por isso ela **ainda documenta o azul**. Este v2 documenta o que **de fato renderiza**. **273/323** `.tsx` do superadmin são token-only → já navy. Só ~34 arquivos carregam hardcode a limpar (worklist).

---

## 1 · Tokens canônicos

**Regra nº 1:** cor de marca SÓ via token semântico (`bg-primary`, `text-primary`, `text-muted-foreground`, `hsl(var(--primary))` inline). O tema entra pela classe `.theme-nexvy-institucional` no `<html>` (host `gestao.*`, aplicada em `main.tsx` antes do 1º paint). **O componente nunca sabe o hue** — o mesmo componente no `app.*` renderiza Beauty Rosé sem mudar 1 linha (guard host-aware, `usePlatformBranding.ts`; inline > CSS).

### 1.1 Paleta efetiva no gestao.* (valores VERBATIM de `src/index.css`)

**Tema CLARO — default — navy protagonista, dourado nobre** (`:root.theme-nexvy-institucional`, L271–306):

| Token | HSL (claro) | Hex aprox. | Uso |
|---|---|---|---|
| `--background` | `211.2 52.7% 97.8%` | `#f7f9fc` | fundo de página (off-white frio) |
| `--foreground` | `222.5 62.3% 13.1%` | `#0d1936` | texto principal (navy quase-preto) |
| `--card` / `--popover` | `0 0% 100%` | `#ffffff` | superfícies |
| `--primary` / `--accent` / `--ring*` | `221.8 44.7% 23.4%` | **`#213156` NAVY** | **ação, seleção, foco, marca** |
| `--primary-foreground` | `211.2 64.5% 98.2%` | `#f8fafd` | texto sobre primary |
| `--secondary` | `211.2 42.5% 95.7%` | `#f0f4f9` | superfície secundária |
| `--muted` | `211.2 32.5% 94.4%` | `#ecf1f5` | fundos secundários (`bg-muted/40` inputs, `/20` áreas) |
| `--muted-foreground` | `217 8.1% 45.6%` | `#6b727e` | texto secundário |
| `--border` / `--input` | `222.4 9.3% 92.2%` / `89.6%` | `#e9eaed` | bordas (hairline navy translúcida; `border-border/30` p/ suave) |
| `--destructive` | `353.4 62.4% 33.1%` | `#89202b` | perigo |
| `--success` | `143.1 32.5% 38.2%` | `#42815a` | sucesso semântico |
| `--warning` | `39 58% 53%` | — | atenção (alinhada ao warm dourado) |
| `--brand` (dourado) | `35 54% 40%` | `#9f702f` | **dourado ocre** — realces nobres, valor, hairline-gold |
| `--chart-1..5` | navy · gold · bronze · warm · success | — | gráficos — SEMPRE por token |
| `--radius` | `0.875rem` | — | `rounded-lg`=radius, `md`=−2px, `sm`=−4px, `xl`=+4px, `2xl`=+8px |
| `--gradient-primary` | dourado 135° (`0.62 0.11 76 → 0.44 0.07 60`) | — | CTA/valor raros |
| `--gradient-navy` | navy 135° | — | hero/faixa navy |

**Tema DARK — cinza automotivo fosco + dourado assinatura** (`:root.theme-nexvy-institucional.dark`, L376–410):

| Token | HSL (dark) | Hex aprox. | Uso |
|---|---|---|---|
| `--background` | `26 5.5% 8.6%` | `#171615` | charcoal fosco (zero azul/preto puro) |
| `--foreground` | `40.3 27.8% 94.1%` | `#f4f1ec` | off-white quente |
| `--card` / `--popover` | `25.9 3.9% 12.6%` | `#22201f` | superfícies |
| `--primary` / `--accent` / `--ring*` | `38.1 68% 55.7%` | **`#dba341` GOLD** | **ação, seleção, foco, marca (dark)** |
| `--primary-foreground` | `26 5.5% 8.6%` | `#171615` | texto sobre gold |
| `--muted-foreground` | `37.1 2% 52.2%` | `#888683` | "Nardo" — texto secundário |
| `--border` / `--input` | `20 2.9% 18.9%` / `21.5%` | `#31302f` | bordas (white .07/.10 sobre card) |
| `--chart-1..5` | gold · gold-deep · gold-bright · warm · success | — | gráficos dark |

> **Regra de tradução (Lovable T4 oklch → repo T3 HSL):** tokens shadcn = oklch→HSL 1 casa (Δ≤1/255). Tokens custom (`--navy`, `--gold*`, `--gradient-*`, `--shadow-*`, `--value-color`, `--hairline*`) = **oklch VERBATIM** (consumidos via `var()`). Séries de gráfico: só a série 0 vira `hsl(var(--primary))`; as demais mantêm cor-dado. **Nunca aproximar cor a olho — sempre computed-style contra o REF.**

### 1.2 PROIBIÇÕES (reprova direto na rubric)

1. **Azul institucional supersedido** — `#0A52D1` literal, `bg-blue-600`/`text-blue-600`/`bg-blue-500` **como cor de ação, link, CTA, marca ou ícone decorativo de seção** = OBSOLETO (era o primary da v1). → sempre `primary`. *(Exceção: azul de SIGNIFICADO da §1.3 — canal webchat/facebook, temperatura fria, status IA/bot, tipo de evento de agenda. Esse fica.)*
2. **Rosa Beauty (hue 330 / `#EC4899` / `pink-*`) como marca** em tela de gestão — é o default do tenant no `app.*`; no gestao o token troca sozinho. *(Exceção: canal **Instagram** = `bg-pink-500`, §1.3 — semântico, fica.)*
3. **Verde-lima Vendus** (`#84CC16`, `bg-vendus-gradient` legado no `tailwind.config.ts`) — não usar em tela nenhuma do gestao.*.
4. **Dark-first / overrides `dark:` por tela** — o gestao.* é calibrado no tema CLARO; os tokens globais seguram o `.dark` (não desenhar dark-first, não criar `dark:` ad-hoc por tela).
5. **Hex/hsl de marca hardcoded** de qualquer hue → sempre token.

**(1.2b) Checklist de grep pré-score** (ver worklist p/ os alvos exatos):
- `grep pink-500 <tela>` no gestao → **só** canais Instagram (§1.3).
- `grep "blue-[0-9]" <tela>` → **só** significado da §1.3 (webchat/facebook/cold/bot/evento). Zero blue de ação/decoração.
- `grep -i "0A52D1\|EC4899" <tela>` → **zero** (salvo swatch de color-picker = dado, §1.3d).

### 1.3 Cores fixas de SIGNIFICADO (as únicas literais permitidas)

Codificam semântica de domínio, não marca:

| Significado | Classe canônica |
|---|---|
| Canal WhatsApp | `bg-emerald-500 text-white` |
| Canal Instagram | `bg-pink-500 text-white` *(gradiente IG: `from-purple-500 to-pink-500`)* |
| Canal Facebook/Messenger (Meta) | `text-blue-600` / `bg-[#0866FF]` (azul-marca Meta) |
| Canal Site/WebChat | `bg-primary text-primary-foreground` *(ícone Globe: `text-blue-500` tolerado como convenção web)* |
| Canal E-mail | `bg-sky-500/10 text-sky-600` (ícone Mail `text-blue-500` tolerado) |
| Não-lidas / atividade viva | `bg-emerald-500 text-white` (badge) · `text-emerald-600` (texto) |
| Badge IA atendendo | `bg-emerald-500/10 text-emerald-600 border-emerald-500/30` |
| Fila / urgência (contador) | `bg-red-500 text-white` |
| Status: humano ativo | dot `bg-green-500` |
| Status: aguardando humano | dot `bg-yellow-500` |
| Status: IA/bot ativo | dot `bg-blue-500` *(⚠️ validar contraste no dark-gold; §4 nota)* |
| Status: encerrada | dot `bg-muted` |
| Temperatura quente | `bg-red-500/10 text-red-600 border-red-500/30` |
| Temperatura morna | `bg-orange-500/10 text-orange-600 border-orange-500/30` |
| Temperatura fria | `bg-sky-500/10 text-sky-600` ou `text-blue-500` (Snowflake) |
| Estado negativo (Não/Falso/Cancelado/Falhou) | família `red-/rose-` (`bg-rose-500/15 text-rose-600`) |
| Cor de categoria (tipo de bloco/objeção/setor/estágio) | mapa de cores da FEATURE (`bg-blue-500`, `bg-pink-500`… como **rótulo de categoria**, não marca) |
| Cor de evento de agenda / estágio de pipeline / etiqueta / setor | **cor vinda do banco** `style={{backgroundColor: x.color}}` — é DADO |
| Seleção de item de lista | barra `before:` `bg-emerald-500` (herança Vendus) |
| **Ação de IA** ("Gerar com IA", "Otimizar", affordance de IA) | família **`violet-*`/`purple-*`** — ✅ ratificada por Marcelo 07-11 como cor SEMÂNTICA de IA (convenção app-wide, ~32 arquivos; NÃO colapsa pro primary) |

**(1.3d) DADO ≠ marca:** swatches de color-picker (`#EC4899`, `#3b82f6`… em arrays de opções), presets de tema de formulário e seed de estágios são **dado editável pelo usuário** — não são vazamento de marca. **Não trocar** (opcional: reseedar só o *default* se ele for cor-de-marca; baixa prioridade).

### 1.4 Tipografia

- **No escopo `.theme-nexvy-institucional`: stack Apple** — `-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", sans-serif` (definida em `index.css` L470). `app.*` segue **Inter**. Headings Lux: `letter-spacing: -0.022em`.
- `html { font-size: 90% }` = densidade global — **não compensar** com fontes maiores. Inputs travados em 16px (anti-zoom iOS, `!important`).
- Escala (idêntica à v1):

| Papel | Classe |
|---|---|
| Micro-label de seção | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Metadado/timestamp | `text-[11px]` (+ `tabular-nums`) |
| Preview/secundário | `text-[13px]` |
| Título de item de lista | `text-[14px] font-semibold leading-tight truncate` |
| Corpo | `text-xs` / `text-sm` |
| Título de painel | `text-sm font-semibold` |
| Título de página | `text-lg font-semibold` (+ subtítulo `text-sm text-muted-foreground`) |
| KPI | `text-2xl font-bold tabular-nums` |

### 1.5 Spacing / densidade + sombras Lux (receita 86/100)

Medidas de densidade **idênticas à v1** (§1.5 v1: toolbar `px-3 py-2.5`, header contexto `h-14`, header chat `h-16`+barra accent `w-1`, item `px-3 py-3 border-b border-border/30`, ícones `h-4 w-4`/`h-3.5`/`h-2.5`, avatares `h-11`/`h-16`/`h-5`, radius `rounded-lg`/`rounded-2xl`/`rounded-full`). **Novo no Lux:** sombras multicamada por token — `shadow-premium`=`--shadow-lg`, `shadow-premium-sm`=`--shadow-sm`, `.surface-card`/`.brand-glow`/`.gold-gradient` (definidas em `index.css`). Preferir os utilitários Lux a `shadow-md` cru quando a superfície for "premium" (card de KPI, painel de destaque).

---

## 2 · Receitas por FAMÍLIA de tela

**Inalteradas da v1 — usar §2 da v1 verbatim** (F1 Lista+Detalhe · F2 Kanban · F3 Dashboard/KPIs · F4 Editor/Wizard · F5 Tabela · F6 Configurações). A anatomia (3 painéis inbox, colunas kanban, grid KPI, stepper wizard, tabela+DropdownMenu por linha, cards de setting) **não muda** — muda só o hue (navy/gold em vez de azul). Pontos onde o hue aparece explícito na receita:

- **F3 · ícone de card KPI:** `h-9 w-9 rounded-lg bg-primary/10 text-primary` → agora **navy /10 + navy**. Ícones decorativos de KPI/seção que estavam `text-blue-500` → `text-primary` (worklist).
- **F3 · charts:** série 0 = `hsl(var(--chart-1))` navy; 1 = `chart-2` gold. Nunca azul/cyan cru.
- **F4 · stepper ativo:** `bg-primary text-primary-foreground` → navy (claro) / gold (dark).
- **F5 · seleção/ordenação/foco:** `ring`/`accent` = navy.
- **F1 · barra accent do header** `w-1` + botão IA (`Sparkles text-primary`) → navy/gold.

---

## 3 · Padrões transversais

**Inalterados da v1 — §3.1 a §3.8 valem integralmente** (estados obrigatórios, badge de canal no avatar, identidade `platformCrmIdentity`, contadores/tabs, persistência localStorage, mobile <lg Sheet, a11y, datas/números). Nenhuma mudança de cor semântica além do primary navy/gold.

---

## 4 · RUBRIC de aprovação (0–100) — gate ≥ 85

Pesos **idênticos à v1** (o modelo 86/100 do Pele Viva não muda de estrutura):

| # | Critério | O que mede | Peso |
|---|---|---|---|
| 1 | **Hierarquia visual** | 1 ação primária clara; escala §1.4; anatomia idêntica à receita da família (§2) | 25 |
| 2 | **Densidade & usabilidade** | densidade Vendus (§1.5); Nielsen; atalhos (Ctrl+K) | 20 |
| 3 | **Affordance** | tudo visível/descobrível; tooltips; contadores sempre visíveis; stub-com-TODO | 15 |
| 4 | **Consistência de token** | **zero azul-ação/pink-marca (§1.2)**; literais SÓ da §1.3; SF Pro/escala/radius/spacing Lux | 15 |
| 5 | **Estados** | vazio/carregando/erro/sucesso-otimista + skeleton anatômico (§3.1) | 15 |
| 6 | **Mobile + higiene** | <lg funcional (§3.6); a11y §3.7; 0 erro console; sem scroll horizontal acidental | 10 |

**Checklist binário pré-score** (reprovou 1 ⇒ nem pontua, volta):
- [ ] `grep "blue-[0-9]"` na tela → **só** significado §1.3 (webchat/facebook/cold/bot/evento). Zero blue de ação/decoração.
- [ ] `grep "pink-\|EC4899"` na tela → **só** canal Instagram (§1.3) ou swatch de color-picker (dado §1.3d).
- [ ] `grep "0A52D1"` → **zero**.
- [ ] Nenhum `vendus-gradient` / verde-lima / design dark-first.
- [ ] Pessoa de WhatsApp via `platformCrmIdentity` (nunca "~" cru).
- [ ] Estado vazio + skeleton anatômico + erro com retry presentes.
- [ ] Botões-ícone com `aria-label` + Tooltip.
- [ ] `<lg` testado (painéis viram Sheet; nada corta).
- [ ] `npx tsc --noEmit -p tsconfig.app.json` verde nos arquivos da tela.
- [ ] Computed no ar: `--primary` = navy `#213156` (claro) / gold `#dba341` (dark).

**Processo (loop GAN):** 1ª tela de cada família roda o loop completo (máx 4 iterações); demais propagam a receita calibrada. Se a receita divergir do REF numa família nova, roda GAN completo e **atualiza este doc** (`_v3`), não forka padrão por tela.

> **Nota de contraste (herdada do mapa §5.3):** o dot `bg-blue-500` de "status IA/bot ativo" pode ficar fraco sobre o dark-gold. Na 1ª tela que usar esse dot em dark, validar contraste; se falhar, promover a um token (`--info`) em vez de trocar caso-a-caso.

---

## 5 · Mapa dos 55 itens → família + prioridade

**Preservar o mapa §5 da v1** (54 itens) **+ adicionar `v-tarefas`** (F5/F1, P2, nasceu no commit `3135374` pós-baseline). Marcar como **✅ referência-viva** as 7 telas P1 já calibradas (ondas L1–L3): `v-chat` (F1, 86/100), `v-pipeline` (F2), `v-leads` (F5), `v-painel` (F3), `v-radar-ia` (F3), `v-follow-up` (F5), `v-dashboard`=`v-operacao` (F3). As 47 (+`v-tarefas`) pendentes e suas ondas L4.0→L4.6 estão detalhadas no mapa de execução `P1B-LUX-L4-MAPA-EXECUCAO-2026-07-11.md` §2–§3.

**Tracker de calibração (L4)** — preencher a cada aprovação de onda:

| Onda | Família | 1ª tela (GAN) | Score | Iterações | Status |
|---|---|---|---|---|---|
| L4.0 | — (rubric+cleanup) | — | — | — | ⏳ este doc + worklist |
| L4.1 | F3 | dashboard | — | 0/4 | ⏳ |
| L4.2 | F5 (ERP) | organizations | — | 0/4 | ⏳ |
| L4.3 | F5 (Vendas) | v-negocios(list) | — | 0/4 | ⏳ |
| L4.4 | F4 | v-agentes-ia | — | 0/4 | ⏳ |
| L4.5 | F6 | v-conexoes | — | 0/4 | ⏳ |
| L4.6 | F1 | v-mia | — | 0/4 | ⏳ |

---

## 6 · Decisões, limites e riscos

1. **[Certo]** Tokens/medidas extraídos verbatim de `src/index.css` (L267–466) e `lux-reference` — não são proposta, é o que **renderiza em produção** no gestao.* (bundle `DcPLkMzY`).
2. **[Certo]** A v1 documentava o azul porque nunca foi atualizada pós-`ec8966c`; o v2 fecha essa dívida. A v1 fica marcada ⚰️ superseded-by-v2.
3. **[Provável]** F2–F6 são derivação (o 86/100 cobre só F1); a 1ª tela de cada família nova roda GAN completo e atualiza este doc se divergir.
4. **Guardrails herdados:** `affiliates` = sessão CONJUNTA (never-touch-alone); porte 1:1 (nunca "simplificar"); `v-operacao`=`v-dashboard` (mesmo componente, prop-driven).
5. ✅ **DECISÃO RATIFICADA (Marcelo, 07-11): MONO TOTAL, Opção A claro + Opção A dark.** Todo acento **DECORATIVO** colapsa pra marca via `text-primary` (navy `#213156` no claro / gold `#dba341` no dark — o token resolve por tema): os 17 azuis do balde §3.2 da worklist (incl. #31 Thermometer decorativo) **E TAMBÉM os acentos decorativos `amber-*`/`emerald-*` de KPI** ("rainbow" de cards). ⚠️ **O que NÃO colapsa:** as cores de SIGNIFICADO da §1.3 continuam lei — canal (WhatsApp emerald, Instagram pink, Meta blue), temperatura, dots de status, badge "IA atendendo", estados negativos, contadores de fila, cores-de-dado do banco. Mono total = decoração monocromática; semântica intocada. A worklist §3.2 vira TROCAR integral + o executor L4.0 estende o catálogo para os amber/emerald decorativos (mesma disciplina TROCAR/MANTER).

---

## 7 · Pareamento `.html`

Seguindo a convenção declarada da frente (mapa §linha 4: "o `.html` pareado vem na entrega final"), o `.html` deste v2 é gerado **na aprovação do Marcelo** — junto com a versão final da rubric. Este `.md` é a proposta para revisão.
