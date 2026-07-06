# PLANO — Redesign "Nexvy Lux" do gestao.* (navy + dourado, claro default + dark cinza-automotivo)

> **2026-07-06 · APROVADO pelo Marcelo (verbatim): "Essa última versão está aprovada, planeje a implementação a partir dela. Deve ficar igual!"**
> Fonte da verdade: projeto Lovable `b703093e` commit `86d61a7` — tokens verbatim em [`tasks/lux-reference/lovable-styles-aprovado.css`](lux-reference/lovable-styles-aprovado.css).
> Preview aprovado: https://id-preview--b703093e-3fd3-4aea-9ca9-5ec326aca1a8.lovable.app

## 0 · O padrão aprovado (resumo)

| Tema | Base | Assinatura |
|---|---|---|
| **CLARO (default)** | off-white frio `oklch(0.982 0.005 250)` + superfícies brancas c/ gradiente sutil | navy `#233059/#101D3D` estrutural (texto, primary, sidebar) + **DOURADO ocre `#A67E33`** em valores R$, botão primário-lux, acentos (calibrado p/ não estourar; `#D9A84E` só em micro-highlights) |
| **DARK** | cinza automotivo FOSCO `#1A1B1D`→`#26282B`→`#2F3236` (zero azul, zero preto puro) | **DOURADO brilhante `#D9A84E`** como primary/valores/glow · texto off-white quente `#F4F2EC` · secundário Nardo `#8E9492` |
| Fundação | Tipografia Apple (`-apple-system, SF Pro…`) + letter-spacing −0.022em em headings + tabular-nums · sombras SEMPRE multicamada (2-4 camadas + inset highlight no claro) · easing `cubic-bezier(.16,1,.3,1)` 200-280ms · hover = eleva sombra + translateY(-2px) · radius 0.875rem · hairlines translúcidas | |

## 1 · O desafio técnico central (por que não é copiar)

O Lovable é **Tailwind 4** (`@theme inline`, `@utility`, oklch). O gestao é **Tailwind 3 + shadcn** com tokens **HSL** (`hsl(var(--primary))` no `tailwind.config.ts`). Tradução com fidelidade total:

1. **Tokens shadcn** (`--primary`, `--background`, `--card`…): converter oklch→**HSL triplet** com precisão (via culori/conversão exata, nunca "de olho"). Vivem em `.theme-nexvy-institucional` (claro) e `.theme-nexvy-institucional.dark` — **substituindo o azul institucional** que está lá (o azul de 05/07 fica obsoleto; a infra host-aware de ontem — `main.tsx` classList + guard do `usePlatformBranding` — é REUSADA intacta).
2. **Tokens custom** (`--gold*`, `--hairline*`, `--shadow-*`, `--gradient-*`, `--value-color`): consumidos via `var()` direto → **manter oklch VERBATIM** (zero erro de conversão; suporte de browser ok p/ dashboard).
3. **Utilities** (`.surface-card`, `.brand-gradient`, `.gold-gradient`, `.navy-gradient`, `.text-value`, `.text-gradient`, `.hairline`, `.hairline-gold`, `.brand-glow`, `.surface-card-hover`): reescrever como classes CSS normais em `@layer components` no `index.css` — funcionam nos 2 temas automaticamente (as vars trocam).
4. **Tipografia**: aplicar o stack Apple **dentro do escopo** `.theme-nexvy-institucional` (gestao vira SF Pro; app.* continua Inter/rosa, intocado).
5. **Radius**: 0.75rem→0.875rem no escopo do tema.
6. **Mapa automático shadcn**: no claro `--primary`=navy, no dark `--primary`=gold-bright — igual ao Lovable. Botões/inputs/rings shadcn herdam o design sem tocar componente.

## 2 · Ondas

| Onda | Entrega | Gate binário |
|---|---|---|
| **L1 — FUNDAÇÃO** | Tokens traduzidos nos 2 temas + utilities + fonte + radius + dark automotivo + default CLARO no gestao (toggle já existe no shell). 1 arquivo-alvo: `src/index.css` (+`tailwind.config.ts` se precisar de shadow/font extend) | tsc verde · deploy anti-phantom · inspeção computed-styles no browser: `--primary` claro = navy convertido, `--gold` = oklch verbatim, dark = `#1A1B1D` |
| **L2 — EXEMPLAR Pipeline** | Anatomia FIEL do Lovable na tela Pipeline: KPI cards (pílula-ícone, label uppercase 12px, valor 30px, chip delta), filter-bar chips "label: valor", colunas kanban (header FORA do box: dot c/ ring-glow + nome uppercase + pílula count; "R$ X em pipeline" dourado), deal cards (avatar navy-gradient, valor 19px DOURADO `.text-value`, badges temp c/ ícone Flame/Thermometer/Snowflake, badge WhatsApp, footer hairline c/ mini-avatar + quando, hover eleva) | **side-by-side** gestao vs Lovable preview (eval-visual + inspeção de cor computada) — "igual" |
| **L3 — P1 restantes** | Leads, Painel, Radar IA, Follow-Up, Dashboard, Chat na anatomia lux (famílias F1-F5 do TEMPLATE-UI reescritas c/ tokens lux) | eval-visual por tela ≥85 na rubric v2 (lux) |
| **L4 — Varredura** | P2 (18 telas) + P3 (29) por família · limpeza `text-pink-500` hardcoded no superadmin · TEMPLATE-UI-GESTAO_v2 (lux substitui azul) · rubric-visual v2 | grep sem rosa hardcode no gestao · evals visuais |

Execução: Opus executa, Fable revisa adversarialmente (valores de token conferidos contra a referência), deploy com anti-phantom + prova visual. ≤6 braços, 1 workflow/vez.

## 3 · Decisões travadas
- **Azul institucional (05/07) → SUBSTITUÍDO** pelo lux navy+gold. A classe `.theme-nexvy-institucional` permanece (infra host-aware reusada); só os VALORES mudam.
- **Default = CLARO** no gestao; dark opt-in via toggle existente.
- **app.*/apex intocados** (rosa Beauty + Inter).
- Nome interno do design system: **"Nexvy Lux"**. Branding "Lumière/CRM Suite" do Lovable = placeholder, NÃO portar (fica "Nexvy · CRM da plataforma").
- Dados/urls do mockup Lovable NÃO portar — apenas forma/estilo.

## 4 · Riscos honestos
1. **[Provável] Conversão oklch→HSL** tem arredondamento; mitigação: converter com culori (não à mão) + comparar computed-color no browser contra o preview Lovable.
2. **[Certo] shadcn `--primary`=gold no dark** pinta TODOS os botões primários de dourado no dark — comportamento aprovado no mockup, mas telas P2/P3 não-redesenhadas podem ter combinações estranhas até a L4. Aceito (o mesmo aconteceu no azul).
3. **PWA/SW**: rede-only, sem risco de cache (provado em 05/07).
4. **Fonte SF Pro** só existe em Apple; em Windows cai pro `Segoe UI` (fallback do próprio stack aprovado) — fidelidade total em Mac (onde o Marcelo avalia).

## Review
- (preencher ao fim de cada onda com provas: hash bundle, screenshots claro/dark, computed styles)
