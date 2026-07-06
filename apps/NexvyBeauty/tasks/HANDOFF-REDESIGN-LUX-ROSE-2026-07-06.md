# HANDOFF — Redesign Nexvy Lux (gestao) + Beauty Rosé (app) + Autopilot

> ⬆️ **Este é o deep-dive do EIXO 6 (visual).** O documento guarda-chuva dos 6 eixos da reestruturação é [HANDOFF-REESTRUTURACAO-NEXVYBEAUTY-2026-07-06.md](HANDOFF-REESTRUTURACAO-NEXVYBEAUTY-2026-07-06.md) — leia-o primeiro.
>
> **Propósito:** documento de transferência para **redisparar o trabalho numa sessão nova, em conta paralela com Fable 5**. Autossuficiente — a nova sessão não tem o histórico desta conversa; tudo que precisa está em disco (repo + memórias `~/.claude/`, ambos compartilhados por máquina, não por conta).
> **Data:** 2026-07-06 · **Autor:** sessão `75021603` (Opus 4.8) · **Máquina:** Mac `marcelosilva`
> **Repo:** `github.com/mfalcao09/SaasPlugin_vite` · app: `apps/NexvyBeauty/`

---

## 0 · TL;DR (estado atual em 5 linhas)

Duas frentes de redesign **no ar e verificadas** por computed-style: **gestao.nexvy.tech** com o design system **Nexvy Lux** (navy `#213156` + dourado, claro default, dark cinza-automotivo) nas telas de fundação + Pipeline + 5 telas P1 (ondas **L1+L2+L3**); e **app.nexvybeauty.com.br** com a paleta **Beauty Rosé** (primary `#c54b60`, sidebar vinho `#8c041d`, fundo creme `#faf7f2`) substituindo o rosa chapado `#EC4899`. Fundo decorativo removido do gestao. Autopilot de vendas (Duda SDR → Bia closer) no ar com evals 12/12. Tudo num único bundle **`DcPLkMzY`** (DEPLOY-VERDE anti-phantom), commit **`5e0e36c`**, árvore limpa. **Falta:** onda **L4** (varredura P2+P3 do gestao), finalizar **atribuição Cakto** (1 pagamento-teste), e a **revisão adversarial** (o par revisor Fable ficou sem crédito — só o gate objetivo rodou).

---

## 1 · Sessões envolvidas (JSONLs — caminhos no disco)

> Não há URL web para transcript (a menos de arquivamento Notion). São arquivos locais, acessíveis por qualquer conta na mesma máquina. Base: `~/.claude/projects/-Users-marcelosilva-Projects-GitHub/`

| Sessão (ID) | Tamanho | mtime | Papel | Memória-origem |
|---|---|---|---|---|
| **`75021603-32bd-46de-8930-fdc4cfd342a4`** | 70 MB | 07-06 05:33 | **ESTA** — aplicou Lux L3 + Rosé no código, commit `5e0e36c`, índice de memória | — |
| **`22085aba-3283-4933-8ff6-77f4dcb7153e`** | 147 MB | 07-06 04:54 | Nexvy Lux (design system) + azul institucional + **preço fonte-única** | Lux, preço, tema-órfão |
| **`0da479d7-0c89-4455-9d9e-5506e1f46eae`** | 70 MB | 07-06 05:28 | Recuperação "Cinza Nardo" + geração da paleta **Beauty Rosé** | Rosé |
| `b58002ed-d7b0-432d-9ac0-69392b2cb91b` | 16 MB | 07-06 05:26 | (auxiliar — sessão paralela, provável deploy) | — |

Caminho completo de cada um: `~/.claude/projects/-Users-marcelosilva-Projects-GitHub/<ID>.jsonl`
Arquivamento Notion desta sessão (marco 0): `https://notion.so/39519a77ca338116ae5ac525d57498a8`

---

## 2 · Decisões travadas (não reabrir sem pedido explícito)

| # | Decisão | Verbatim / fonte | Memória |
|---|---|---|---|
| D1 | **Nexvy Lux** é o design system do gestao. Claro default (navy+dourado ocre), dark cinza-automotivo+dourado, **zero azul** ("azul é muito batido para SaaS"). SF Pro + sombras multicamada. | "Essa última versão está aprovada, planeje a implementação a partir dela. **Deve ficar igual!**" | `decision_nexvy_lux_design_system_gestao_2026-07-06` |
| D2 | **Beauty Rosé** é a paleta do app.*. Sai `#EC4899`, entra mesclado rosé/terracota/creme + âncora vinho. **Estrutura (menus/telas/fluxos) INTOCADA** — muda paleta/acabamento, não organização. | "Gostei da versão para o app.*. Está aprovado. **Quero igual, respeitada a estrutura de organização**" | `decision_beauty_rose_app_2026-07-06` |
| D3 | **Preço = fonte única no DB.** Personas nunca guardam número; o brain injeta de `public_plans` em runtime. Banco: 217/387/687. Elimina divergência na raiz. | "uma regra que prevalece o DB, sempre" | `feedback_preco_fonte_unica_db_playbook_2026-07-05` |
| D4 | **Branding host-aware.** `gestao.*` nunca herda cor do tenant; app usa CSS exato quando é marca-padrão (guard `isBrandDefault`). **Inline > CSS** — sempre checar `documentElement.style` primeiro quando "o CSS não vence". | (lição registrada após 3 deploys errados) | `feedback_tema_orfao_host_aware_gestao_azul_2026-07-05` |
| D5 | **Roteamento de modelo:** Fable orquestra; **Opus executa** (spec detalhada no prompt); Sonnet mecânico; revisão/arquitetura/síntese = Fable. | (permanente) | `feedback_roteamento_modelos_orquestrador_fable_2026-07-05` |
| D6 | **Teto de paralelismo:** máx **10–12 tarefas** paralelas (Mac trava acima); **1 workflow por vez**. | (permanente) | — |
| D7 | **Gate de qualidade:** auto-pergunta "é o melhor resultado? melhor agente 95/100?"; verificação **com prova** (nunca "aterrissou" — sempre a comparação computed==REF). | (permanente) | — |

⚠️ **Supersessão:** o azul institucional `#0A52D1` foi **SUPERSEDIDO** pelo Nexvy Lux (D1). O que sobrevive do episódio azul é a **infra host-aware** (D4), não a cor.

---

## 3 · Planejado → Realizado → Falta

### 3.1 Ondas do redesign Lux (gestao) — fonte: `tasks/PLANO-REDESIGN-LUX-GESTAO-2026-07-06.md`

| Onda | Escopo | Status | Prova |
|---|---|---|---|
| **L1 — Fundação** | Tokens Lux em `:root.theme-nexvy-institucional` + `.dark` (HSL 1-decimal + tokens oklch verbatim) + utilities | ✅ **no ar** | computed `--primary #213156` navy |
| **L2 — Pipeline** | Tela exemplar (Pipeline/Kanban) na anatomia lux | ✅ **no ar** | bundle `DcPLkMzY` |
| **L3 — P1 (5 telas)** | Leads, Painel, Radar IA, Follow-Up, Dashboard superadmin (37 arquivos) | ✅ **no ar** | `tsc` limpo + computed==REF |
| **L4 — Varredura** | **P2 (18 telas) + P3 (29)** por família · limpeza `text-pink-500` hardcoded no superadmin · **TEMPLATE-UI-GESTAO_v2** (lux substitui azul) · rubric-visual v2 | 🔲 **FALTA** | check: `grep` sem rosa hardcode no gestao + evals visuais |

### 3.2 Beauty Rosé (app) — fonte: `tasks/rose-reference/lovable-styles-aprovado.css`

| Item | Status | Prova |
|---|---|---|
| `:root`/`.dark` do app convertidos hex→HSL (roundtrip Δ=0) | ✅ | computed `--primary #c54b60` |
| Sidebar vinho `#8c041d` (não rosé) via guard `isBrandDefault` | ✅ | computed `--sidebar-primary #8c041d` |
| Fundo creme `#faf7f2` + accent `#f2dfd5` | ✅ | computed batendo REF |
| `brand.ts` `#EC4899`→`#C54B60`; DB `platform_settings` atualizado | ✅ | `primary_color=#C54B60`, `accent_color=#F2DFD5` |
| utilities `.bg-signature`/`.text-signature`/`.shadow-premium` | ✅ | no bundle |

### 3.3 Outras frentes já entregues (contexto)

- **Fundo do gestao limpo:** `FooterDecoration.tsx` retorna `null` em `isGestaoHostname()` — ornamento some no gestao, permanece no app. ✅
- **Autopilot de vendas (go-live):** Duda SDR → Bia closer, revival de ações Vendus, `platform-sales-brain` EF; evals **12/12 verde** (`a_falha_50_clientes` desbloqueado). ✅
- **Preço fonte-única:** personas sem número; `resolveAnchor(plans)` + `buildCheckoutContext` injetam de `public_plans`. ✅

### 3.4 O que FALTA (backlog priorizado)

1. **[Onda L4]** Varredura P2 (18) + P3 (29) do gestao no padrão Lux + limpeza de `text-pink-500` residual + `TEMPLATE-UI-GESTAO_v2`. — *É a continuação natural; D1 aprovado, L1–L3 no ar.*
2. **[Atribuição Cakto]** Reconciliar slug do brain (slugify `persona name` → `"duda-sdr"` vs `ref_code "duda"`) + **1 pagamento-teste** para confirmar o campo Cakto que carrega `?src=`; só então deployar. Código produzido no workflow `wqkcbsgp4`, **não deployado**.
3. **[Revisão adversarial]** O par revisor Fable ficou **sem crédito** — rodou só o **gate objetivo** (tsc baseline, grep não-regressão, computed==REF). Falta a revisão de julgamento tela-a-tela (L3 + Rosé) — rodar quando o crédito voltar, ou com braços Opus-only.

---

## 4 · Status no sistema (produção)

| Item | Valor |
|---|---|
| **Bundle no ar** | `DcPLkMzY` — DEPLOY-VERDE (gate anti-phantom: hash servido == hash da imagem) |
| **Container** | `nexvy-beauty` (svc `nexvy-beauty-svc`) — **1 container serve os 3 hosts** |
| **Hosts** | `app.nexvybeauty.com.br` (Rosé) · `gestao.nexvy.tech` (Lux, roteado por `/opt/stacks/traefik/dynamic/nexvy-gestao-grupo.yml`) · apex/LP |
| **Supabase** | projeto `fzhlbwhdejumkyqosuvq` · `platform_settings.primary_color='#C54B60'`, `accent_color='#F2DFD5'` |
| **Edge Function** | `platform-sales-brain` (sales autopilot) deployada |
| **Comando de deploy** | `rsync -az --delete --exclude node_modules --exclude .git --exclude dist --exclude '.env*' ./ vps-hostinger:/opt/stacks/saasplugin-vite/` → `ssh vps-hostinger "cd /opt/stacks/saasplugin-vite && bash infra/deploy-vps.sh NexvyBeauty nexvy-beauty nexvybeauty.com.br"` |
| **Prova (app)** | computed no ar: `primary #c54b60`, `sidebar #8c041d`, `bg #faf7f2`, `accent #f2dfd5`, inline vazio (CSS manda) |
| **Prova (gestao)** | tema LUX ativo, `--primary #213156` navy nas 5 telas P1 |

---

## 5 · Status no repositório

| Item | Valor |
|---|---|
| **HEAD** | `5e0e36c feat(beauty/redesign): Lux L3 no gestao + Beauty Rosé no app + fundo gestao limpo` |
| **Branch / árvore** | `main` · working tree **limpa** (nada por commitar) |
| **Commits recentes** | `5e0e36c` (L3+Rosé) · `125ebbe` (Lux L1/L2) · `ec8966c` (azul→superseded) · `b349da4` (go-live+preço+evals) |

### Arquivos-fonte canônicos (onde mexer na L4)

| Arquivo | Papel |
|---|---|
| `src/index.css` | 3 temas: `:root`/`.dark` (Rosé) · `:root.theme-nexvy-institucional`+`.dark` (Lux) · `.master-theme` (admin red) |
| `src/hooks/usePlatformBranding.ts` | Guards `isGestao` (não pinta gestao) e `isBrandDefault` (marca-padrão usa CSS exato). **Inline > CSS** |
| `src/main.tsx` | Aplica classe `theme-nexvy-institucional` antes do 1º paint |
| `src/lib/publicUrl.ts` | `isGestaoHostname()` = `hostname.startsWith('gestao.')` |
| `src/components/layout/FooterDecoration.tsx` | `return null` em gestao |
| `src/config/brand.ts` | `primaryColor #C54B60`, `primaryHsl 349.7 51.3% 53.3%` |
| `src/components/superadmin/crm/**` | Telas P1 já Lux (L3). P2/P3 são o alvo da L4 |

### Referências de design (verbatim — a fonte-de-verdade da cor)

| Arquivo | Origem Lovable |
|---|---|
| `tasks/lux-reference/lovable-styles-aprovado.css` | projeto `b703093e` @ commit `86d61a7` |
| `tasks/rose-reference/lovable-styles-aprovado.css` | projeto `46463c3b` @ commit `623c35f` (preview `id-preview--46463c3b-...lovable.app`) |
| `tasks/PLANO-REDESIGN-LUX-GESTAO-2026-07-06.md` (+.html) | plano das 4 ondas |
| `tasks/TEMPLATE-UI-GESTAO-2026-07-05.md` (+.html) | template de anatomia de tela (virar `_v2` na L4) |

### Memórias duráveis (em `~/.claude/projects/-Users-marcelosilva-Projects-GitHub/memory/`)

`decision_nexvy_lux_design_system_gestao_2026-07-06.md` · `decision_beauty_rose_app_2026-07-06.md` · `feedback_preco_fonte_unica_db_playbook_2026-07-05.md` · `feedback_tema_orfao_host_aware_gestao_azul_2026-07-05.md` · `feedback_roteamento_modelos_orquestrador_fable_2026-07-05.md` — todas indexadas em `MEMORY.md`.

---

## 6 · Regras de tradução Lovable → repo (crítico para não quebrar a cor)

- **Lovable = Tailwind 4 (oklch, `@theme`/`@utility`)**; **repo = Tailwind 3 + shadcn (HSL triplets `hsl(var(--primary))`)**.
- Tokens shadcn: converter oklch→HSL (roundtrip Δ≤1/255). Tokens custom (`--gold`, `--gradient-*`, `--shadow-*`): **manter oklch verbatim** (consumidos via `var()` direto). Utilities: `@layer components`.
- **Séries de gráfico:** só a série 0 vira `hsl(var(--primary))`; as demais mantêm cor-dado.
- **Nunca** aproximar cor a olho — sempre computed-style contra o REF.

---

## 7 · Como retomar (roteiro padrão)

1. **Plan Mode** — escrever plano da L4 em `tasks/todo.md` com checks binários por família de tela (P2, depois P3).
2. **Subagentes** (Opus executa, spec detalhada; teto 10–12 paralelos; 1 workflow por vez): 1 subagente por família de tela, cada um com o REF `lux-reference` + o arquivo-alvo.
3. **Verificação com prova** — após cada família: `tsc` limpo + `grep` sem `text-pink-500`/rosa hardcode + computed-style navy no ar. Marcar ✅ no `tasks/todo.md` só com a prova.
4. **Revisão** — Fable revisa/sintetiza (adversarial tela-a-tela). Se sem crédito, gate objetivo + revisão Opus-only.
5. **Deploy** — comando da §4; confirmar DEPLOY-VERDE (hash servido == imagem).
6. **Commit** — `feat(beauty/gestao-lux): L4 varredura P2/P3 ...`. Só em `main` (convenção do projeto), árvore já limpa.

---

## 8 · PROMPT DE LANÇAMENTO (colar na sessão nova, conta Fable 5)

```
Contexto: continuo o redesign do NexvyBeauty (repo github.com/mfalcao09/SaasPlugin_vite,
app apps/NexvyBeauty/, branch main, árvore limpa em 5e0e36c). Leia primeiro o handoff completo:
apps/NexvyBeauty/tasks/HANDOFF-REDESIGN-LUX-ROSE-2026-07-06.md — e as memórias
decision_nexvy_lux_design_system_gestao_2026-07-06 + decision_beauty_rose_app_2026-07-06.

Estado: gestao.nexvy.tech já está com o Nexvy Lux (ondas L1+L2+L3, 5 telas P1) e
app.nexvybeauty.com.br com Beauty Rosé — ambos NO AR e verificados (bundle DcPLkMzY).
Decisões travadas (D1 Lux "deve ficar igual", D2 Rosé "estrutura intocada", D3 preço=DB,
D4 host-aware/inline>CSS, D5 Fable orquestra/Opus executa, D6 teto 10-12 paralelos + 1 workflow,
D7 verificação com prova computed==REF) — NÃO reabrir.

Tarefa: executar a ONDA L4 do plano (tasks/PLANO-REDESIGN-LUX-GESTAO-2026-07-06.md):
varredura das telas P2 (18) + P3 (29) do gestao para o padrão Lux, usando como fonte-de-verdade
tasks/lux-reference/lovable-styles-aprovado.css; limpar text-pink-500 hardcoded no superadmin;
gerar TEMPLATE-UI-GESTAO_v2. Roteiro padrão: Plan Mode em tasks/todo.md com checks binários por
família → subagentes Opus (1 por família, teto 10-12) → verificação com prova (tsc limpo +
grep sem rosa hardcode + computed navy #213156 no ar) → Fable revisa adversarial → deploy
(rsync + ssh vps-hostinger + deploy-vps.sh) confirmando DEPLOY-VERDE → commit em main.

Em paralelo (se couber no teto): finalizar atribuição Cakto (reconciliar slug duda-sdr vs
ref duda; código no workflow wqkcbsgp4, não deployado; precisa de 1 pagamento-teste p/ confirmar
o campo). Regra: nada "pronto" sem prova de funcionamento.
```

---

## 9 · Ressalva honesta (o que NÃO foi feito)

- A **revisão adversarial** tela-a-tela (L3 Lux + Rosé) **não rodou** — o Fable ficou sem crédito. Rodou o **gate objetivo** (tsc baseline, grep não-regressão, computed==REF). Isso confirma *fidelidade de cor e ausência de regressão*, mas não substitui um olhar crítico de julgamento visual em cada tela. Recomendo rodá-la na conta Fable com crédito antes de considerar L1–L3 "auditadas".
- A **atribuição Cakto** tem código, mas **não foi provada end-to-end** (falta 1 pagamento-teste real). Não marcar como pronta.
