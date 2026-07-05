# TEMPLATE-UI-GESTAO — Design system operacional do gestao.* (54 telas)
> 2026-07-05 · Braço TEMPLATE-UI-GESTAO. Propaga o modelo calibrado (inbox Vendus v4, rubric GAN **86/100** no Pele Viva) a TODAS as telas do registry (`src/components/superadmin/platform-shell/registry.tsx`, 54 itens: 20 ERP + 34 Vendas).
> Fontes: `REF-VENDUS-INBOX.md` (spec 86/100) · exemplar real `src/components/superadmin/crm/inbox/*` · tokens `src/index.css` (`.theme-nexvy-institucional`) + `tailwind.config.ts` · `.vendus-src-reference/` (estrutura, só leitura).
> **Como usar:** pegar a tela → achar a FAMÍLIA na §5 → aplicar a receita da §2 + transversais da §3 → pontuar pela RUBRIC da §4 → gate ≥85 (máx 4 iterações).

---

## 1 · Tokens canônicos

**Regra nº 1:** cor de marca SÓ via token semântico (`bg-primary`, `text-muted-foreground`, `hsl(var(--primary))` em style inline). O azul institucional entra pela classe `.theme-nexvy-institucional` no `<html>` (host `gestao.*`) — **componente nunca sabe o hue**. O mesmo componente no `app.*` renderiza rosa Beauty sem mudar 1 linha.

### 1.1 Paleta efetiva no gestao.* (tema claro)

| Token | HSL | Uso |
|---|---|---|
| `--background` | `0 0% 99%` | fundo de página |
| `--foreground` | `222 47% 11%` | texto principal |
| `--card` / `--popover` | `0 0% 100%` | superfícies |
| `--primary` / `--accent` / `--ring` | `218 91% 43%` (#0A52D1) | ação, seleção, foco — azul Nexvy |
| `--primary-foreground` | `0 0% 100%` | texto sobre primary |
| `--muted` | `220 14% 96%` | fundos secundários (`bg-muted/40` em inputs, `/20` em áreas) |
| `--muted-foreground` | `220 8% 46%` | texto secundário |
| `--border` / `--input` | `220 13% 91%` | bordas (variação suave: `border-border/30`) |
| `--destructive` | `0 72% 51%` | perigo |
| `--success` | `142 71% 40%` | sucesso semântico |
| `--warning` | `38 92% 50%` | atenção |
| `--surface` | `40 23% 96%` | off-white quente (áreas amplas) |
| `--chart-1..5` | `218 91% 43%` · `191 100% 45%` (cyan) · `250 60% 58%` · `38 92% 55%` · `145 55% 45%` | gráficos — SEMPRE por token |
| `--radius` | `0.75rem` | `rounded-lg`=radius, `md`=−2px, `sm`=−4px |
| `--gradient-primary` | azul→cyan 135° | hero/CTA raros |

### 1.2 PROIBIÇÕES (reprova direto na rubric)

1. **Verde-lima Vendus** (`#84CC16`, `bg-vendus-gradient` que sobrou no `tailwind.config.ts` — legado, NÃO usar em tela nenhuma do gestao.*).
2. **Dark nativo do Remix** (guardrail #5 da sessão 986d864f): o gestao.* é desenhado e calibrado no tema CLARO. Não desenhar dark-first, não criar overrides `dark:` por tela — os tokens globais seguram o `.dark` se um dia ligar.
3. **Hex/hsl hardcoded de marca** (`text-blue-600` para ação, `#0A52D1` literal etc.) → sempre `primary`.
4. **Rosa Beauty (hue 330) direto** em tela de gestão — ele é o default do tenant; no gestao o token troca sozinho.

### 1.3 Cores fixas de SIGNIFICADO (as únicas literais permitidas)

Codificam semântica de domínio, não marca — mapa extraído do exemplar calibrado:

| Significado | Classe canônica |
|---|---|
| Canal WhatsApp | `bg-emerald-500 text-white` |
| Canal Instagram | `bg-pink-500 text-white` |
| Canal Site/WebChat | `bg-primary text-primary-foreground` |
| Canal desconhecido | `bg-muted text-muted-foreground` |
| Não-lidas / atividade viva | `bg-emerald-500 text-white` (badge) · `text-emerald-600` (texto) |
| Badge IA atendendo | `bg-emerald-500/10 text-emerald-600 border-emerald-500/30` |
| Fila / urgência (contador) | `bg-red-500 text-white` |
| Status: humano ativo | dot `bg-green-500` |
| Status: aguardando humano | dot `bg-yellow-500` |
| Status: IA/bot ativo | dot `bg-blue-500` |
| Status: encerrada | dot `bg-muted` |
| Temperatura quente | `bg-red-500/10 text-red-600 border-red-500/30` |
| Temperatura morna | `bg-orange-500/10 text-orange-600 border-orange-500/30` |
| Temperatura fria | `bg-sky-500/10 text-sky-600 border-sky-500/30` |
| Seleção de item de lista | barra `before:` `bg-emerald-500` (herança Vendus) |

### 1.4 Tipografia

- **Inter** única (weights 400–800). `html { font-size: 90% }` = densidade global — **não compensar** com fontes maiores. Inputs travados em 16px (anti-zoom iOS, regra `!important` no index.css).
- Escala do modelo calibrado:

| Papel | Classe |
|---|---|
| Micro-label de seção | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Metadado/timestamp | `text-[11px]` (+ `tabular-nums` em datas/números) |
| Preview/secundário | `text-[13px]` |
| Título de item de lista | `text-[14px] font-semibold leading-tight truncate` |
| Corpo | `text-xs` / `text-sm` |
| Título de painel | `text-sm font-semibold` |
| Título de página | `text-lg font-semibold` (+ subtítulo `text-sm text-muted-foreground`) |
| KPI | `text-2xl font-bold tabular-nums` |

### 1.5 Spacing / densidade (receita 86/100)

| Elemento | Medida canônica |
|---|---|
| Toolbar de painel | `px-3 py-2.5 border-b` · controles `h-9` |
| Header de painel de contexto | `h-14 px-4 border-b` |
| Header de chat/detalhe | `h-16 px-3 sm:px-4 border-b` + barra accent `w-1` à esquerda |
| Item de lista | `px-3 py-3 border-b border-border/30` |
| Corpo de painel | `p-4`, seções `space-y-5`, subitens `space-y-2.5` |
| Ícones | `h-4 w-4` (botão) · `h-3.5 w-3.5` (inline) · `h-2.5 w-2.5` (micro-badge) |
| Botões | icon `h-8 w-8`/`h-9 w-9` · ação de header `h-7 text-xs gap-1` |
| Avatares | `h-11 w-11` (lista/chat) · `h-16 w-16` (perfil) · `h-5 w-5`/`h-8 w-8` (mini) |
| Radius | `rounded-lg` containers · `rounded-2xl` bolhas/composer · `rounded-full` pills/badges/avatares |

---

## 2 · Receitas por FAMÍLIA de tela

Toda tela do registry pertence a 1 de 6 famílias (variantes anotadas na §5). Componentes shadcn da casa (`src/components/ui/*`): Button, Input, Textarea, Badge, Avatar, Card, Table, Tabs, ScrollArea, Separator, Tooltip, Popover, DropdownMenu, Dialog, Sheet, Switch, Select, Skeleton, sonner.

### F1 — Lista + Detalhe (padrão inbox 3 painéis) · referência CALIBRADA
Exemplar: `PlatformCrmInbox` + `PlatformCrmConversationList` + `PlatformCrmChatArea` + `PlatformCrmLeadContextPanel`.

```
┌ h-[calc(100dvh-10rem)] flex flex-col rounded-lg border overflow-hidden bg-background
│ ┌ flex-1 flex min-w-0 overflow-hidden
│ │ [LISTA w-[340px] flex-shrink-0]  [DETALHE flex-1 min-w-0]  [CONTEXTO hidden lg:block w-80 border-l]
└ + <Sheet side="right" w-[340px] p-0> para o contexto em <lg
```

- **Lista (esq.):** toolbar (`Filter` c/ badge de contagem · busca `pl-8 h-9 bg-muted/40 border-0` com `data-*-search` p/ Ctrl+K · extras · `+` primary) → tabs pílula (`grid p-1 bg-muted/40 rounded-lg`, ver §3.4) → `ScrollArea flex-1 bg-muted/20` com cards: avatar `h-11` + badge de canal no canto (§3.2), 3 linhas (título → preview truncate → badges de contexto), coluna direita (data relativa + badge não-lidas `h-5 min-w-[22px] rounded-full`), seleção = `bg-accent/40` + barra `before:` emerald.
- **Detalhe (centro):** header `h-16` (barra accent `w-1` · avatar `h-11 ring-2` · nome + sublinha `#código · dot status · texto`) · ações: primárias contextuais como `Button outline h-7 text-xs` (Reabrir/Retomar), secundárias icon `h-8 w-8` c/ Tooltip, o resto em `DropdownMenu` (destrutiva `text-destructive`) · corpo `ScrollArea bg-muted/20` com fundo pontilhado (`radial-gradient(hsl(var(--muted-foreground)/0.06) 1px, transparent 1px)`, 18px) e separadores de dia sticky · footer = composer (`Textarea bg-muted/40 border-0 rounded-2xl` + enviar `rounded-full h-10 w-10`) OU faixa de estado (encerrada + CTA reabrir). Botão IA (`Sparkles text-primary`) SEMPRE presente.
- **Contexto (dir.):** header `h-14` + `ScrollArea p-4 space-y-5`: identidade central (avatar `h-16` + nome + canal) · seções `SectionTitle`/`InfoRow` (Contato → Pipeline: estágio c/ dot de cor do banco + temperatura + valor em `bg-muted/50 rounded-lg` → Origem/UTM → Notas) · `Separator` entre seções · CTA `outline w-full` no fim ("Abrir X completo").
- Persistência do colapso + decisão docked×Sheet: §3.5/§3.6.

Aplica-se a: Chat (feito), Mia, Suporte (tickets), Agenda (variante calendário: lista de dias/recursos à esquerda, dia/evento no centro, contexto à direita).

### F2 — Kanban (Pipeline)
Sem exemplar calibrado ainda — derivação direta do modelo:

- Container = mesmo card-page da F1. Corpo: `flex-1 overflow-x-auto` → `flex gap-3 p-4 min-h-full` com colunas `w-[300px] flex-shrink-0 flex flex-col bg-muted/20 rounded-lg`.
- **Header de coluna** (`px-3 py-2.5 border-b flex items-center gap-2`): dot `h-2 w-2 rounded-full` com a cor do estágio vinda do banco (`style={{backgroundColor: stage.color}}` — único literal permitido, é dado) + nome `text-[11px] font-semibold uppercase tracking-wide` + contador (pílula do §3.4) + soma `text-[11px] text-muted-foreground tabular-nums` (R$).
- **Card de deal:** `bg-card border rounded-lg p-3 shadow-sm hover:shadow-md space-y-1.5` — linha 1 identidade via `resolveVisitorIdentity` (§3.3); linha 2 valor `text-sm font-semibold tabular-nums`; linha 3 badges (canal §3.2 + temperatura §1.3 + `IA`); rodapé data relativa `text-[11px]` + mini-avatar do responsável `h-5 w-5`.
- **Drag:** `cursor-grab active:cursor-grabbing`; coluna alvo ganha `ring-2 ring-primary/40`; mutação otimista + rollback com `toast.error`. Coluna vazia = mini empty (ícone + "Arraste um lead").
- Mobile: scroll horizontal com `snap-x`; detalhe do deal em Sheet; NUNCA empilhar colunas verticalmente.

### F3 — Dashboard / KPIs
- **Header de página:** título `text-lg font-semibold` + subtítulo `text-sm text-muted-foreground` + à direita `Select` de período `h-9` + refresh icon.
- **Grid KPI:** `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`. Card KPI = `Card p-4`: label `text-[11px] uppercase text-muted-foreground` · valor `text-2xl font-bold tabular-nums` · delta como badge (`text-emerald-600`/`text-red-600` + seta) · ícone em `h-9 w-9 rounded-lg bg-primary/10 text-primary`.
- **Charts:** cores SEMPRE `hsl(var(--chart-1..5))` (1=azul, 2=cyan); tooltip `bg-popover border rounded-lg shadow-md`; skeleton com a MESMA altura do chart (anti-layout-shift).
- **Listas embutidas** ("últimas conversas", "top produtos"): linhas `px-3 py-2 border-b border-border/30` com identidade §3.3 — clicáveis levando à tela-fonte (`setActiveSection`).
- Tempo real (Painel): dot pulsante §3.4 no título + timestamp "atualizado às HH:mm" `text-[11px]`.

### F4 — Editor / Wizard
- Layout: `max-w-3xl mx-auto space-y-4` (form puro) ou split lista+editor (builder). Wizard = stepper horizontal no topo: círculos `h-7 w-7 rounded-full text-xs` — ativo `bg-primary text-primary-foreground`, concluído `bg-primary/10 text-primary` + check, futuro `bg-muted text-muted-foreground` — conectados por `h-px bg-border flex-1`.
- Seções em `Card` (header: título `text-sm font-semibold` + descrição `text-[11px] text-muted-foreground`; corpo `p-4 space-y-4`). Campo = `Label text-xs font-medium` + controle `h-9` + ajuda `text-[11px] text-muted-foreground` + erro `text-xs text-destructive`.
- **Footer sticky:** `border-t bg-background p-3 flex items-center justify-between` — Voltar/Cancelar `ghost` à esquerda; Salvar/Avançar `primary` à direita, `disabled` até validar, `Loader2 animate-spin` durante `isPending` (nunca overlay de tela inteira).
- Dirty state: confirmar descarte ao sair (Dialog). Salvo = `toast.success` + permanecer na tela (não navegar sozinho).

### F5 — Tabela de gestão
- **Toolbar:** busca (idêntica à F1) + `Filter` popover c/ badge de contagem ativa + ações em massa (aparecem só com seleção) + `Nova …` primary com `Plus`.
- **Tabela:** shadcn `Table` dentro de `rounded-lg border overflow-x-auto`; `th` = `text-[11px] uppercase tracking-wide text-muted-foreground`; `td` = `text-sm py-2.5`; célula de pessoa = avatar `h-8 w-8` + identidade §3.3 (primary + secondary `text-[11px] muted`); status = `Badge variant="outline"` com dot §1.3; **ações por linha = `DropdownMenu` no `MoreVertical h-8 w-8`** — nunca fileira de ícones soltos; destrutiva em `text-destructive` após `DropdownMenuSeparator`.
- Rodapé: `text-[11px] text-muted-foreground` "N de M" + paginação OU scroll infinito com sentinel (padrão do exemplar).
- Ordenação clicável no `th` (seta); filtros ativos viram chips removíveis abaixo da toolbar.
- Mobile: manter só colunas essenciais (identidade + status + 1 métrica); linha abre Sheet com o restante.

### F6 — Configurações
- Layout: `max-w-3xl space-y-4`. Cada grupo = `Card` (header: título + descrição). Linha de setting = `flex items-center justify-between gap-4 py-2.5` (label `text-sm font-medium` + descrição `text-[11px] muted` à esquerda; `Switch`/`Select`/`Input w-…` à direita), separadas por `border-b border-border/30` (última sem).
- **Zona de perigo:** Card separado `border-destructive/30`, ações `Button variant="outline"` com `text-destructive`, confirmação via Dialog.
- **Segredos/keys:** exibir mascarado (`••••` + últimos 4) + botão copiar c/ Tooltip; NUNCA plaintext em toast/log (regra global de segredos).
- Salvar: por Card (botão no rodapé do card) ou auto-save com toast — nunca um "Salvar" global fora da viewport.

---

## 3 · Padrões transversais (valem para as 6 famílias)

### 3.1 Estados obrigatórios (15 pts da rubric)
- **Vazio:** ícone `h-12 w-12 opacity-30` + título `text-sm font-medium` + dica `text-xs` contextual à aba/filtro + CTA quando existe ação. Vazio de tela inteira = padrão `PlatformCrmEmptyInboxState` (círculo `h-20 bg-primary/10` + 3 cards `bg-muted/50` de dicas/atalhos/`<kbd>`).
- **Carregando:** skeleton com a MESMA anatomia do conteúdo real (`animate-pulse bg-muted` reproduzindo avatar+linhas) — nunca spinner central em lista. Spinner (`Loader2 animate-spin`) só dentro de botões/contadores.
- **Erro:** banner com retry (query) ou `toast.error` + estado preservado (mutation). Nunca silenciar.
- **Sucesso otimista:** mutação aparece na hora e reconcilia via invalidate/realtime (React Query).
- **Stub-com-TODO:** feature futura mantém o BOTÃO visível + `toast.info('… em breve', { description })` — nunca esconder a affordance (lei do porte 1:1).

### 3.2 Badge de canal (no avatar)
`absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full border-2 border-background flex items-center justify-center` + ícone `h-2.5 w-2.5` + cor do §1.3 + `Tooltip` com o nome do canal. Resolver canal com o mapa `resolveProvider` do exemplar (webchat/whatsapp/instagram/unknown) — reusar, não recriar.

### 3.3 Identidade nome→telefone (U3)
**Importar SEMPRE de `src/components/superadmin/crm/inbox/platformCrmIdentity.ts`** — `resolveVisitorIdentity` (nome inútil "~"/1-2 chars → telefone formatado vira primário, nome cru vira secundário), `formatVisitorPhone` (e164→`(11) 95502-1205`), `visitorInitials` (2 iniciais ou 2 últimos dígitos). Todo lugar que exibe pessoa vinda de WhatsApp (lista, kanban, tabela, header, painel) usa `primary` + `secondary` (`text-[11px] muted`). PROIBIDO reimplementar.

### 3.4 Contadores, tooltips e novidade em abas
Padrão `TabButton` do exemplar: pílula `text-[11px] font-semibold uppercase tracking-wide` em trilho `bg-muted/40 rounded-lg p-1`; ativo `bg-background shadow-sm`. **Contador SEMPRE visível** (0 em `bg-muted text-muted-foreground`; >0 nas variantes success=emerald / danger=red / muted). `Tooltip` com descrição da aba ("IA atendendo", "Aguardando humano"). Novidade desde a última visualização = ponto pulsante `animate-ping bg-primary` no canto (hook de atividade por aba).

### 3.5 Persistência localStorage
Chave: `nexvybeauty_platform_<área>_<coisa>` (ex.: `nexvybeauty_platform_crm_inbox_context_panel`). Sempre par de helpers `load`/`save` com `try/catch` (indisponível ⇒ só não persiste). Persistir: colapso de painéis, largura redimensionável, preferências de som, visão ativa quando fizer sentido. Nunca dados de negócio.

### 3.6 Mobile (<lg)
- Painel lateral → `Sheet side="right" className="w-[340px] sm:max-w-sm p-0"` + `SheetHeader` com `sr-only` (a11y).
- Decisão docked×sheet no handler: `window.matchMedia('(min-width: 1024px)').matches`.
- Lista e detalhe mutuamente exclusivos: tap → detalhe fullscreen com botão back.
- Touch targets ≥44px (`.touch-target`), `safe-area-top/bottom`, kanban com snap horizontal, tabela reduzida a colunas essenciais + Sheet.

### 3.7 A11y + higiene
`aria-label` em TODO botão-ícone · `Tooltip` em toda ação de ícone · `title=` em todo texto truncado · 0 erro de console · foco visível (`ring` já tokenizado). Confirmação destrutiva via Dialog (padrão `PlatformCrmArchiveDialog`), com o nome do alvo no texto.

### 3.8 Datas e números
Data relativa canônica: hoje `HH:mm` · ontem `Ontem` · <7d `EEE HH:mm` (ptBR) · resto `dd/MM/yyyy` (função `formatDate` do exemplar). Dinheiro: `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`. Números alinhados: `tabular-nums`.

---

## 4 · RUBRIC de aprovação (0–100) — gate ≥ 85

Calcada na rubric GAN do Pele Viva (que aprovou a inbox com 86), recalibrada para propagação: a "fidelidade ao Vendus" vira fidelidade à FAMÍLIA deste doc (o Vendus já está destilado aqui).

| # | Critério | O que mede | Peso |
|---|---|---|---|
| 1 | **Hierarquia visual** | 1 ação primária clara por tela; títulos na escala §1.4; anatomia idêntica à receita da família (§2); ordem/disposição fiéis ao modelo | 25 |
| 2 | **Densidade & usabilidade** | densidade Vendus (§1.5 — compacta sem apertar, zero ar desperdiçado); heurísticas de Nielsen; atalhos (Ctrl+K etc.) | 20 |
| 3 | **Affordance** | toda ação visível/descobrível: tooltips, hovers, contadores sempre visíveis, stub-com-TODO em vez de botão sumido | 15 |
| 4 | **Consistência de token** | zero hex de marca; zero verde-lima/dark (§1.2); literais SÓ da tabela §1.3; Inter/escala/radius/spacing canônicos | 15 |
| 5 | **Estados** | vazio/carregando/erro/sucesso-otimista completos, skeleton anatômico (§3.1) | 15 |
| 6 | **Mobile + higiene** | <lg funcional (Sheet/back/44px §3.6); a11y básica §3.7; 0 erro console; responsivo sem scroll horizontal acidental | 10 |

**Processo (loop GAN):** gerador aplica a receita → avaliador pontua critério a critério com evidência (print via preview/Telegram) → **< 85 itera (máx 4)** → não bateu em 4 = registrar EXCEÇÃO com motivo no tracker (§5.3), sem gambiarra, e seguir.

**Checklist binário pré-score** (reprovou 1 ⇒ nem pontua, volta):
- [ ] Nenhum `#hex`/cor Tailwind de MARCA fora dos tokens (grep na tela)
- [ ] Nenhum uso de `vendus-gradient` / verde-lima / design dark-first
- [ ] Pessoa de WhatsApp renderiza via `platformCrmIdentity` (nunca "~" cru)
- [ ] Estado vazio + skeleton anatômico + erro com retry presentes
- [ ] Botões-ícone com `aria-label` + Tooltip
- [ ] <lg testado (painéis viram Sheet; nada corta)
- [ ] `npx tsc --noEmit -p tsconfig.app.json` verde nos arquivos da tela
- [ ] 0 erro novo no console

---

## 5 · Mapa dos 54 itens do registry → família + prioridade

**P1** = telas que o Marcelo mais opera (ordem de ataque) · **P2** = operação recorrente/infra crítica · **P3** = cauda. `✅` = já calibrada (referência viva).

### 5.1 Módulo VENDAS (34 itens)

| Item (id) | Label | Família | Prioridade | Nota |
|---|---|---|---|---|
| v-pipeline | Pipeline | **F2 Kanban** | **P1** | primeira propagação da F2 |
| v-leads | Leads | **F5 Tabela** (+ detalhe em Sheet/painel) | **P1** | identidade §3.3 obrigatória |
| v-painel | Painel | **F3 Dashboard** (tempo real) | **P1** | dot pulsante + auto-refresh |
| v-radar-ia | Radar IA | **F3 Dashboard** + bloco F5 | **P1** | cards de risco/oportunidade → conversa |
| v-follow-up | Follow-Up | **F5 Tabela** | **P1** | colunas: identidade, último contato, próximo passo, responsável |
| v-dashboard | Dashboard | **F3 Dashboard** | **P1** | mesmo componente de v-operacao (OperationCenter) — calibra 1x |
| v-chat | Chat | **F1 Lista+Detalhe** | ✅ 86/100 | EXEMPLAR — não retocar sem rubric |
| v-mia | Mia | F1 Lista+Detalhe (chat IA) | P2 | thread central, contexto = memória/ações da Mia |
| v-agenda | Agenda | F1 (variante calendário) | P2 | |
| v-relatorios | Relatórios | F3 Dashboard | P2 | chart-1..5 only |
| v-agentes-ia | Agentes IA | F4 Editor/Wizard | P2 | cruza com D6b/F2 autopilot |
| v-campanhas | Campanhas | F5 Tabela + F4 (criação) | P2 | |
| v-cadencias | Cadências | F4 Editor/Wizard | P2 | steps = passos da cadência |
| v-negocios | Negócios (Produtos) | F5 Tabela + hub de abas | P2 | casa do multiproduto D3 |
| v-financeiro | Financeiro | F3 + F5 | P2 | inclui Comissões/Metas internas |
| v-respostas | Respostas Rápidas | F5 Tabela | P2 | alimenta o composer `/` do Chat |
| v-conexoes | Conexões | F6 Configurações | P2 | segredos mascarados §F6 |
| v-webhooks | Webhooks | F5 Tabela | P3 | |
| v-quiz | Quiz | F4 (builder) | P3 | |
| v-formularios | Formulários | F4 (builder) | P3 | |
| v-form-vendedores | Form Vendedores | F4 | P3 | |
| v-chatbot | ChatBot | F4 (builder) | P3 | |
| v-widget | Widget | F4 + F6 | P3 | |
| v-whatsapp | WhatsApp (captação) | F6 Configurações | P3 | |
| v-templates | Templates | F5 Tabela (galeria) | P3 | |
| v-resultados | Resultados | F5 Tabela | P3 | |
| v-analytics | Analytics | F3 Dashboard | P3 | |
| v-setores | Setores | F5 Tabela | P3 | |
| v-equipes | Equipes | F5 Tabela | P3 | |
| v-operacao | Central de Operação | F3 Dashboard | — | = v-dashboard (mesmo componente) |
| v-campos | Campos personalizados | F5 + F6 | P3 | |
| v-etiquetas | Etiquetas | F5 Tabela | P3 | |
| v-notificacoes | Notificações | F6 Configurações | P3 | |
| v-horarios | Horários | F6 Configurações | P3 | |

### 5.2 Módulo ERP/Gestão (20 itens)

| Item (id) | Label | Família | Prioridade | Nota |
|---|---|---|---|---|
| dashboard | Dashboard da Plataforma | F3 Dashboard | P2 | |
| organizations | Empresas | F5 Tabela | P2 | drill-down de org pendente (no-op hoje) |
| users | Usuários | F5 Tabela | P2 | |
| subscriptions | Assinaturas | F5 Tabela | P2 | |
| billing | Faturamento | F5 Tabela | P2 | |
| payments | Pagamentos (Cakto) | F3 + F5 | P2 | |
| whatsapp | WhatsApp / Evolution | F6 Configurações | P2 | infra crítica; segredos mascarados |
| support | Suporte | F1 Lista+Detalhe | P2 | tickets = mesma anatomia da inbox |
| ai-quality | Qualidade da IA | F3 Dashboard | P2 | |
| health | Saúde | F3 Dashboard | P2 | |
| plans | Planos | F5 + F4 | P3 | |
| affiliates | Afiliados | F5 Tabela | P3 | ⚠️ sessão CONJUNTA (guardrail never-touch-alone) |
| sales-payments | Pagamentos (Vendas) | F5 Tabela | P3 | |
| integrations | Integrações | F6 Configurações | P3 | |
| branding | Identidade Visual | F6 Configurações | P3 | |
| email | E-mail | F6 Configurações | P3 | |
| help | Central de Ajuda | F4 Editor | P3 | |
| agent-tools | Ações dos Agentes | F5 Tabela | P3 | |
| releases | Atualizações | F5 + F4 | P3 | |
| audit | Logs | F5 Tabela | P3 | filtros + `font-mono` p/ payloads |

### 5.3 Tracker de calibração (P1 — preencher a cada aprovação)

| Tela | Família | Score | Iterações | Status |
|---|---|---|---|---|
| Chat (v-chat) | F1 | 86 | 3/4 | ✅ referência |
| Pipeline (v-pipeline) | F2 | — | 0/4 | ⏳ |
| Leads (v-leads) | F5 | — | 0/4 | ⏳ |
| Painel (v-painel) | F3 | — | 0/4 | ⏳ |
| Radar IA (v-radar-ia) | F3 | — | 0/4 | ⏳ |
| Follow-Up (v-follow-up) | F5 | — | 0/4 | ⏳ |
| Dashboard (v-dashboard/v-operacao) | F3 | — | 0/4 | ⏳ |

---

## 6 · Decisões, limites e riscos deste template

1. **[Certo]** Tokens/medidas extraídos verbatim do código real (index.css, tailwind.config, exemplar inbox) — não são proposta, são o que está em produção no gestao.*.
2. **[Provável]** F2/F3/F4/F5/F6 são derivação (o calibrado 86/100 cobre só F1) — a 1ª tela de cada família nova deve rodar o loop GAN completo e, se a receita divergir do aprovado, ATUALIZAR este doc (versão `_v2`), não forkar padrão por tela.
3. **Risco — dupla fonte:** `REF-VENDUS-INBOX.md` mora no repo do FIC. Este doc destila o que o gestao.* precisa; se a spec do FIC evoluir, sincronizar manualmente.
4. **Risco — v-operacao = v-dashboard:** o registry aponta o MESMO componente 2x; calibrar uma calibra a outra, mas mudanças de contexto (título/período) precisam ser prop-driven, não fork.
5. **Guardrails herdados:** never-touch-alone no AffiliatesPanel/ERP; porte 1:1 (nunca "simplificar"); eyeball do re-skin azul segue pendente do Marcelo (U4).
