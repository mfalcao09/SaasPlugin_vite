# Plano de Organização dos Menus — NexvyBeauty (sidebar do cockpit)

> **Status:** proposta para validação. **Nenhum código será escrito antes do aceite.**
> **Data:** 2026-06-27 · **Escopo:** `src/cockpit/nav.tsx` (35 itens) + `src/components/layout/UnifiedShell.tsx` (a casca) + hubs de aba existentes.
> **Princípio-guia:** o menu deve espelhar a **rotina da cabeleireira leiga**, não a arquitetura do software.

---

## 0. TL;DR (a resposta desconfortável primeiro)

O problema **não é "faltam seções"** — é que a sidebar tem **35 itens em 4 grupos**, mistura o que ela usa todo dia com features raras, repete a mesma ideia em itens diferentes, e fala **jargão de CRM** (`Pipeline`, `Leads`, `Radar IA`, `Webhooks`, `Setores`, `AI Growth`) que a dona de salão não entende. Reorganizar caixas sem **mesclar redundâncias e traduzir nomes** só rearruma a bagunça.

**Recomendo o Esquema B+ (híbrido):** sidebar de **4–5 itens de uso diário no topo (planos) + 3 grupos colapsáveis** por domínio, com os clusters de IA, Configurações e Relatórios virando **hubs de aba endereçados por rota**. Custo de shell: **pequeno** (estender `ShellNavItem` com `children` + 1 wrapper `Collapsible`/`SidebarMenuSub` da própria shadcn + persistência em `localStorage`).

---

## 1. Diagnóstico — o que está mal hoje

A sidebar (`COCKPIT_NAV` em `nav.tsx`) tem **4 grupos / ~35 itens**:

| Grupo | Itens | Problema |
|---|---|---|
| _(topo solto)_ | Início | ok |
| **Meu salão** | **12 itens** (Clientes, Agenda, Serviços, Pacotes, Produtos, AI Growth, Ações com Clientes, Saúde da Base, Automações, Meta do Mês, Relatórios & Gestão, Financeiro) | **Bloat** (7±2 estourado). Mistura uso diário com features de IA raras. |
| **Comercial** | 8 itens (Painel, Conversas, Pipeline, Leads, Radar IA, Tarefas, Relatórios, Atrair Clientes) | Jargão de CRM B2B; 2º "Relatórios"; 3 portas pro atendimento. |
| **Gestão** | **14 itens** (quase todos admin) | Configurações técnicas (Webhooks, Campos, Etiquetas) no mesmo nível visual de Plano/Suporte. Maior seção, menos usada. |

### Problemas confirmados (auditoria de UX no código)

1. **`AI Growth` e `Ações com Clientes` = a MESMA ideia** (alta). Leem os mesmos sinais (agendamentos/pacotes/clientes) e geram a mesma saída (mensagem de WhatsApp). Um é o total agregado, o outro é por-cliente. **Dois itens de menu para uma decisão só.**
2. **`Produtos` vs `Ofertas` — rótulos quase iguais, rotas cruzadas** (alta). O item _"Produtos"_ aponta pra `/loja` (revenda física) e _"Ofertas"_ aponta pra `/produtos` (cérebro de oferta da IA). Confusão garantida + armadilha de manutenção.
3. **Dois "Relatórios"** (alta). `Relatórios & Gestão` (`/relatorios`, números do salão) e `Relatórios` (`/relatorios-comerciais`, atendimento/captação). Pra ela é tudo "meus números".
4. **Dois dashboards de abertura** (média). `Início` (`/`) e `Painel` (`/painel`) com KPIs sobrepostos — e ainda há `HomeDeValor.tsx` órfão no código. Ela só quer **uma** tela inicial.
5. **IA espalhada em 4 lugares** (média). `Minha IA` (Gestão), `AI Growth` + `Automações` (Meu salão), `Radar IA` (Comercial). Sem um hub único.
6. **Jargão de CRM** (alta/média). `Pipeline`, `Leads`, `Radar IA`, `Setores`, `Webhooks`, `Campos Personalizados`, `AI Growth` — vocabulário que ela não pede.
7. **`Saúde da Base`** (média) = diagnóstico de qualidade de cadastro. É ferramenta rara → cabe como **aviso dentro de Clientes** (onde o merge já vive), não item permanente.

---

## 2. O mecanismo — o que o código já permite (e o gap)

### 2.1 Sidebar colapsável — estado atual e gap
`UnifiedShell.tsx` usa a primitiva **shadcn `Sidebar collapsible="icon"`**: renderiza `SidebarGroup` (grupos **flat**, sempre abertos, com label) → `SidebarMenu` → itens (`NavLink`). **Hoje:**
- ✅ O **rail inteiro** colapsa pra ícones (`collapsible="icon"`).
- ❌ **Não** há accordion **por seção** (abrir/fechar um grupo).
- ❌ **Não** há **subitens aninhados** (`ShellNavItem` é flat: `to/label/icon/end/visibility`).

**Gap (pequeno):** a própria shadcn já exporta `Collapsible`, `SidebarMenuSub`, `SidebarMenuSubItem`. Falta só:
1. Estender `ShellNavItem` com `children?: ShellNavItem[]`.
2. No loop de render, quando o item tem `children`, envolver em `<Collapsible>` + `<SidebarMenuSub>`.
3. Persistir aberto/fechado por grupo em `localStorage` (ex.: `nav:open:<grupo>`).
4. Auto-abrir o grupo que contém a rota ativa.

→ É uma extensão **aditiva** do shell, sem tocar rota nem lógica.

### 2.2 Tab por rota — dois padrões já existem
- **(A) `?tab=` na mesma rota (Admin legado).** `Admin.tsx` ainda tem o esqueleto intacto: `useSearchParams` ↔ `useState(activeSection)` + `switch` + keep-alive (`visitedRef` + `hidden`) + lazy/prefetch. Hoje está "dissolvido" (quase tudo virou `<Navigate>` pra rotas individuais). **Bom quando** as sub-telas compartilham contexto e você quer **estado vivo** entre abas.
- **(B) Rotas-filhas reais + abas internas (padrão vigente).** `CaptacaoHub` (`/atrair`), `MinhaIAHub` (`/minha-ia`) e `RelatoriosComercial` (`/relatorios-comerciais`) **já agrupam** seções soltas do admin em **abas dentro de uma página**. Deep-link limpo, code-split por rota.

**Veredito:** pra agrupar clusters (IA, Configurações, Relatórios) reaproveitamos **(B)** — o cockpit já faz isso. O `?tab=` de (A) só entra se quisermos abas com estado vivo simultâneo (não é o caso aqui).

---

## 3. Três esquemas (todas as sugestões) + trade-offs

### Esquema A — "Mínima fricção" (só renomear + reagrupar)
Mantém a sidebar **flat** (sem colapsável). Só: traduz nomes (mata jargão), funde os 2 "Relatórios", funde AI Growth+Ações, corrige Produtos/Ofertas, move Saúde da Base pra dentro de Clientes.
- ✅ Mais barato; zero mudança de shell; entrega 70% do ganho de clareza.
- ❌ Ainda ~18–20 itens visíveis; não resolve o bloat estrutural; não atende seu pedido explícito de colapsável.

### Esquema B — "Sidebar colapsável por domínio" (o que você descreveu)
4–5 itens de uso diário no topo (flat) + **3 grupos colapsáveis** (Crescer / Catálogo / Configurações). Estende o shell com `children` + `Collapsible`.
- ✅ Atende o pedido literal; dia-a-dia sempre à mão; o resto recolhido; estado aberto/fechado persistido.
- ❌ Exige a extensão do shell (pequena) + decidir o que é "diário" vs "recolhido".

### Esquema C — "Hubs + sidebar enxuta" (persona-first, agressivo)
Sidebar minúscula (~6 itens flat), e **cada cluster vira um hub de abas** (rota-pai + abas internas, padrão B do §2.2). A profundidade migra pra dentro das páginas-hub.
- ✅ A sidebar mais limpa possível; reaproveita o padrão de hub que já existe; ótimo no mobile.
- ❌ "Esconde" funções dentro de abas (menos descobrível); mais telas-hub novas a construir; reorganização maior.

### ⭐ Recomendado — **B+ (híbrido B com hubs do C nos clusters certos)**
Sidebar colapsável (B) **+** os 3 clusters problemáticos (IA, Relatórios, Configurações) viram **hubs de aba** (C). Pega o melhor dos dois: estrutura clara na sidebar, profundidade organizada dentro dos hubs que **já existem ou são triviais**.

---

## 4. Arquitetura de informação recomendada (o desenho)

> Convenção: **▸ = grupo colapsável**; `· item`; _(abas)_ = página-hub com abas internas endereçadas por rota.

```
🏠 Início                     (UMA tela inicial — funde Painel + Home de Valor)
📅 Minha Agenda
👥 Meus Clientes              (Saúde da Base vira AVISO aqui dentro, não item)
💬 Conversas                  (Radar IA vira aba/filtro "Precisa de você" aqui)

▸ 💰 Crescer (a IA trabalha pra você)
   · Oportunidades            (FUNDE AI Growth + Ações com Clientes em 1)
   · Meta do Mês
   · Automações               (receitas que enviam sozinhas)
   · Minha IA                 (agentes — hoje /minha-ia)

▸ 🗂️ Meu Catálogo
   · Serviços
   · Pacotes
   · Produtos (revenda)       (corrige o cruzamento /loja↔/produtos)

▸ 📊 Meus Números _(abas)_     (FUNDE os 2 "Relatórios": Salão / Atendimento / Captação)
   · Financeiro

▸ 📣 Atrair Clientes _(abas)_  (já é hub /atrair: quiz, formulários, WhatsApp)

▸ ⚙️ Configurações _(abas, admin)_
   · Empresa · Plano · Horários · Conexões (WhatsApp) · Minha equipe
   · Avançado: Webhooks · Campos · Etiquetas · Respostas rápidas · Notificações · Setores
   · Suporte
```

**Fusões/traduções na base disso:**
- `AI Growth` + `Ações com Clientes` → **"Oportunidades"** (1 tela: visão geral + fila por cliente).
- `Relatórios & Gestão` + `Relatórios comerciais` → **"Meus Números"** (1 hub, abas).
- `Painel` + `Home de Valor` (órfã) → dobram no **"Início"**.
- `Radar IA` → vira a aba "Precisa de você" **dentro de Conversas** (de onde foi extraído).
- `Saúde da Base` → **banner/aviso dentro de Clientes**.
- `Setores`/`Equipes`/`Profissionais` → unificar em **"Minha equipe"**.
- `Ofertas` (cérebro de CRM) → sai da sidebar de salão; vira config avançada de "Minha IA".

---

## 5. Decisões em aberto (preciso de você antes de codar)

1. **Jargão de vendas (`Pipeline`/`Leads`):** são features reais migradas do admin. Esconder do salão? Renomear ("Funil"/"Contatos")? Ou jogar num grupo colapsável "Vendas (avançado)"?
2. **Profundidade do colapsável:** grupos abrem **1 por vez** (accordion puro) ou **vários abertos** (independentes, estado salvo)?
3. **Esquema:** A (rápido/flat), **B+ (recomendado)**, ou C (hubs agressivo)?
4. **Fusões fortes** (AI Growth+Ações; os 2 Relatórios; Painel→Início): aprova as fusões ou prefere manter telas separadas e só reagrupar?

---

## 6. Plano de execução (quando aprovado) — verificável

> Cada passo com critério binário. **Nada de código antes do aceite do desenho acima.**

1. **Shell colapsável** → estender `ShellNavItem` (`children?`) + render `Collapsible`/`SidebarMenuSub` + persistência. _Verifica:_ um grupo com filhos abre/fecha, estado sobrevive a reload, grupo da rota ativa auto-abre.
2. **Reescrever `nav.tsx`** pra IA do §4 (nomes + grupos + flags admin). _Verifica:_ sidebar mostra ≤5 itens diários + grupos recolhidos; zero jargão banido.
3. **Hub "Meus Números"** funde os 2 relatórios em abas. _Verifica:_ `/relatorios` e `/relatorios-comerciais` acessíveis por abas; deep-link funciona.
4. **"Oportunidades"** funde AI Growth+Ações. _Verifica:_ 1 rota, visão geral + fila por cliente; demos seguem.
5. **Saúde da Base → aviso em Clientes**; **Radar → aba em Conversas**. _Verifica:_ itens somem da sidebar, função preservada.
6. **Hub "Configurações"** recolhe as ~10 telas técnicas. _Verifica:_ admin acessa tudo por abas; não-admin não vê.
7. **Build + deploy anti-phantom + teste no Chrome real logado.** _Verifica:_ string única no bundle servido + screenshot da sidebar nova.

---

_Próximo passo: você responde as 4 decisões do §5 (ou só "aprovo B+") e eu sigo pro código._
