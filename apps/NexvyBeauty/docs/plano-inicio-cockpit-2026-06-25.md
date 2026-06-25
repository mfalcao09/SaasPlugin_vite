# Plano — Início (Cockpit de Ação) · NexvyBeauty

> **Status:** aprovado em conceito (2026-06-25). Conceito = **Cockpit de ação**; blocos da v1 = **A, B, C, D**.
> **Não implementar até o "go".** Este doc é a spec de construção.

## 1. Princípio (o que a Início É e o que NÃO é)

A Início **não é outra página de análise** — Relatórios & Gestão, Financeiro, AI Growth, Radar e Painel já têm os gráficos profundos. Copiar o dashboard da CBA (faturamento/dia + top serviços + top profissionais) **duplicaria** Relatórios & Gestão.

A Início é o **cockpit de ação diário**: responde 3 perguntas em <10s e **aponta** (deep-link) para a página-dona de cada tema.

1. **Tô ganhando dinheiro?** (melhor ou pior que antes?)
2. **Como tá meu dia?** (quem vem, cheia ou vazia?)
3. **Onde tem dinheiro fácil + o que preciso fazer agora?**

**Regra de ouro (anti-Frankenstein):** cada bloco mostra **número + 1 CTA**, nunca o gráfico inteiro. O gráfico vive na página-dona.

## 2. Os 4 blocos da v1

### Bloco A — "Como vai o salão" (KPIs com comparação)
- **Objetivo:** responder "tô ganhando?". O diferencial estratégico é a **comparação temporal** (↑/↓ vs período anterior).
- **KPIs (3 cards):**
  1. **Faturamento do mês** + variação % vs mês anterior.
  2. **Ticket médio** + variação %.
  3. **Atendimentos no mês** (concluídos) + variação %.
- **Fonte / cálculo:**
  - Faturamento → **`lancamentos`** (tipo='entrada', status='confirmado', `data` no mês corrente) — *fonte de caixa, consistente com Financeiro + já populada pelo seed*. (Ver §6, decisão aberta.)
  - Ticket médio = faturamento ÷ nº de atendimentos concluídos (`agendamentos` status='concluido' no mês).
  - Atendimentos = COUNT `agendamentos` status='concluido' no mês.
  - Comparação = mesmo cálculo no mês anterior → `((atual-anterior)/anterior)*100` (guard anterior>0).
- **Deep-link:** card → **Financeiro** (faturamento/ticket) e **Relatórios & Gestão**.
- **Empty state:** "Sem movimento ainda neste mês."

### Bloco B — "Seu dia" (agenda + ocupação)
- **Objetivo:** "como tá meu dia?".
- **Conteúdo:** lista dos **próximos atendimentos de hoje** (hora · cliente · serviço · profissional) + **contador "X atendimentos hoje"**.
- **Fonte:** `agendamentos` WHERE `data`=hoje AND status IN ('agendado','confirmado','chegou') ORDER BY hora.
- **Ocupação %** (cheia/vazia): v2 — exige modelo de capacidade (profissionais × `dias_atendimento`/`hora_inicio`/`hora_fim`). Na v1, mostrar só a contagem + lista.
- **Deep-link:** → **Minha Agenda**.
- **Empty state:** "Nenhum atendimento marcado pra hoje. 🎉 Que tal puxar clientes em AI Growth?" (CTA → AI Growth).

### Bloco C — "Onde tem dinheiro" (AI Growth highlight)
- **Objetivo:** "dinheiro fácil?".
- **Conteúdo:** **R$ recuperável** (soma das alavancas) + a **alavanca top** numa linha ("8 clientes sumidas há +45d = R$ 2.800") + CTA.
- **Fonte:** reusa a computação de alavancas do **AI Growth** (hoje em `AiGrowth.tsx` via `buildLevers`). → **Extrair `buildLevers` para `src/cockpit/aiGrowthLevers.ts`** (DRY: AI Growth + Início consomem o mesmo util).
- **Deep-link:** → **AI Growth**.
- **Empty state:** "Sua base está em dia — sem dinheiro parado no momento."

### Bloco D — "Precisa de você" (ações de hoje)
- **Objetivo:** "o que faço agora?".
- **Conteúdo:** contadores + topo de: **leads aguardando resposta** + **IA travada** (do Radar "Precisa de você") + **tarefas com prazo hoje**.
- **Fonte:** `webchat_conversations` (status waiting_human / bot_active travada — já existe em `PrecisaDeVoce.tsx`) + `tasks` (via `useTasks`, due hoje). → **Extrair a lógica de PrecisaDeVoce para um hook reusável** ou renderizar uma versão compacta.
- **Deep-link:** conversas → **Radar IA** / **Conversas**; tarefas → **Tarefas**.
- **Empty state:** "Nada esperando você agora. ✅"

## 3. Layout (ordem = dinheiro e ação primeiro)
```
Olá, {nome} — saudação curta + data
┌─────────────────────────────────────────────┐
│ Bloco A — 3 KPIs com ↑/↓ (faturamento·ticket·atend.) │
├─────────────────────────────────────────────┤
│ Bloco C — "Onde tem dinheiro" (R$ recuperável + CTA) │  ← destaque (money-first)
├──────────────────────┬──────────────────────┤
│ Bloco B — Seu dia    │ Bloco D — Precisa de você │  ← 2 colunas
└──────────────────────┴──────────────────────┘
```
Responsivo: 2 colunas viram 1 no mobile. Tema dark/pink, padrão do Cockpit (`p-6 space-y-6`).

## 4. O que fica de FORA da v1 (e por quê)
- **Bloco E (Destaques: top serviço/profissional, pacotes a renovar)** — não selecionado; já está em Relatórios & Gestão. Pode entrar numa v2 como 1-liners.
- **Gráficos** (faturamento/dia, distribuições) — vivem nas páginas-dona. Home só aponta.
- **Ocupação %** — v2 (precisa de modelo de capacidade).

## 5. Construção (reuso > reescrita)
- **Novo:** `src/cockpit/Inicio.tsx` (substitui o placeholder atual da rota `/`).
- **Extrair p/ reuso:** `buildLevers` → `src/cockpit/aiGrowthLevers.ts` (AI Growth passa a importar de lá); lógica do "Precisa de você" → hook `useAtencaoConversas` (Radar + Início consomem).
- **Reusar:** `useOrganizationId`/`formatCurrency` (`_shared`), `useTasks`, queries de `agendamentos`/`lancamentos` (padrão Dashboard/Relatorios), tokens shadcn.
- **Sem novo backend** — tudo client-side sobre tabelas que já existem.

## 6. Decisão aberta (1) — fonte do "Faturamento do mês"
- **(a) `lancamentos` (caixa)** — recomendado: consistente com Financeiro, já populado pelo seed. "Faturamento" = dinheiro que entrou.
- **(b) `agendamentos` concluídos (serviços)** — consistente com Relatórios & Gestão, mas hoje ~vazio (org sem agendamentos concluídos) → home apareceria zerada até haver agenda real.
- **Recomendação:** (a) para o card de faturamento/resultado; ticket médio e atendimentos vêm de `agendamentos` (operacional). Para demo 100% populada, **semear alguns `agendamentos` concluídos** também.

## 7. Critérios de sucesso (verificáveis — §8.3)
1. Home renderiza os 4 blocos com **dado real** + empty states discretos quando vazio (sem NaN).
2. Comparação % calculada certa (mês vs mês anterior; guard anterior>0).
3. Cada bloco tem **deep-link** funcional pra página-dona.
4. `npm run build` verde + deploy anti-phantom (string nova no bundle servido + HTTP 200).
5. Prova visual: com o seed (e agendamentos semeados), a home aparece populada.

## 8. Próximo passo
Confirmar a **decisão §6** (fonte do faturamento) + dar o **"go"** → construo `Inicio.tsx` + extrações, build, deploy, prova.
