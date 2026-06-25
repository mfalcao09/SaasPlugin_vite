# Plano — Início (Cockpit de Ação) · NexvyBeauty · **v2**

> **v2 (2026-06-25):** incorpora feedback do Marcelo — Bloco E (desde já), Bloco F (Insights de Crescimento), Bloco G (Ocupação %), métrica agendado×faturado, e faturamento = lançamentos (caixa). Tudo **grounded** numa investigação do schema real (não suposição).
> Supersede [plano-inicio-cockpit-2026-06-25.md](plano-inicio-cockpit-2026-06-25.md).

## 1. Princípio (inalterado — o que o Marcelo aprovou)

Cockpit de **ação diário**, não outra página de análise. Responde 3 perguntas em <10s e aponta (deep-link) pra página-dona.

> 🔒 **Regra de ouro (anti-Frankenstein):** cada bloco mostra **número + 1 CTA**, nunca o gráfico inteiro. O gráfico vive na página-dona. *(Marcelo: "isso é importante estar presente.")*

## 2. Decisão de fonte — Faturamento = lançamentos (caixa) ✅
Faturamento do mês = `lancamentos` (tipo='entrada', status='confirmado', mês corrente). Consistente com Financeiro + já populado pelo seed.

## 3. Os 7 blocos

### Bloco A — Como vai o salão (KPIs + comparação + perda de agenda)
3 KPIs com ↑/↓ vs mês anterior + 1 KPI de gestão:
1. **Faturamento do mês** (`lancamentos` entrada) + variação %.
2. **Ticket médio** = faturamento ÷ atendimentos concluídos + variação %.
3. **Atendimentos concluídos** no mês + variação %.
4. **🆕 Perda de agenda** (métrica agendado×faturado — ver §4) — R$ em desmarcações/no-show + % de desmarcação.
- Deep-link: Financeiro / Agenda. Comparação: `((atual−anterior)/anterior)×100`, guard anterior>0.

### Bloco B — Seu dia (agenda + ocupação do dia)
- Próximos atendimentos de hoje: `agendamentos` status IN (agendado,confirmado,chegou), data=hoje, ORDER BY hora (hora·cliente·serviço·profissional).
- **Ocupação de HOJE** (% — usa o motor do Bloco G).
- Deep-link: Minha Agenda.

### Bloco C — Onde tem dinheiro (AI Growth)
- **R$ recuperável** = soma das 5 alavancas do AI Growth + alavanca top numa linha + CTA → AI Growth.
- **Reuso:** `buildLevers` hoje é privado em `AiGrowth.tsx` → **extrair para `src/cockpit/levers.ts`** (exportado) e consumir nos dois. Alavancas: inativos, pacotes, ocupação, upsell, vips. Shape: `{ id, title, description, estimated, count, ctaLabel, ctaTo, icon }`.

### Bloco D — Precisa de você (ações de hoje)
- Conversas aguardando/IA travada (reusa `PrecisaDeVoce.tsx`: `webchat_conversations` status waiting_human/bot_active) + **tarefas de hoje** (`useTodaysTasks(userId)`).
- Deep-link: Radar / Tarefas.

### Bloco E — Destaques do mês (1-liners) 🆕 desde a v1
3 linhas (não gráficos):
- 🏆 **Serviço campeão:** {nome} ({R$}) — `agendamentos` GROUP BY servico, status=concluido.
- 💇 **Profissional destaque:** {nome} ({R$} faturado) — SUM(valor) GROUP BY profissional, status=concluido.
- 📦 **Pacotes a renovar:** {N} vencem em ≤30 dias ({R$}) — `pacote_clientes` (data_validade entre hoje e +30d, status ativo/pendente) → CTA.

### Bloco F — Insights de Crescimento (1-liners de gestão PME) 🆕
Na home: **2–3 insights-1-liner** de maior impacto (rotativos/priorizados), cada um amarrado a uma técnica de gestão + CTA. A suíte completa (8 técnicas) vai pra uma view "Insights" dedicada (deep-link) — anti-Frankenstein.

Top para a home (computáveis **já**, do schema atual):
- 📉 **Churn do mês:** {X}% das clientes ativas pararam de vir *(técnica: churn rate)* → reativar.
- 🎯 **Concentração (Pareto/ABC):** seus top 20% de clientes = {Z}% da receita *(curva ABC)* → risco/diversificar.
- 🔁 **Frequência de retorno:** cada cliente volta a cada {N} dias *(RFM-frequência)* → lembrete automático.

Roadmap F (deep-view, computáveis já — 8/10): Churn, RFM, Curva ABC, LTV, Frequência, Ticket/profissional, Mix de serviços, Sazonalidade. *(Capacidade ociosa = vira o Bloco G; Lead→Cliente exige checar confiabilidade de `leads.status`.)*

### Bloco G — Ocupação % 🆕 (capacidade = profissionais × horários × dias)
- Home: **"Ocupação da semana: {X}%"** = minutos agendados ÷ minutos de capacidade, + barra + CTA → detalhe por profissional (Relatórios & Gestão).
- **Achado:** a infra **já existe** — `profissionais.hora_inicio`/`hora_fim`/`dias_atendimento` (default 09:00–18:00, seg–sáb) + `servico_catalogo.duracao_minutos` + `agendamentos.duracao_minutos` (default 30). Edge `salao-availability` já calcula slots livres.
- **Falta (plumbing, ~3h):**
  1. Expor `hora_inicio`/`hora_fim`/`dias_atendimento` no **cadastro de Profissionais** (`Profissionais.tsx` hoje não tem esses campos).
  2. Garantir `agendamentos.duracao_minutos` populado no INSERT (`Agenda.tsx` não envia hoje → cai no default 30) — enviar `servico.duracao_minutos`.
  3. Regen `types.ts` (desatualizado: faltam as 3 colunas).
  4. Cálculo: `ocupacao% = SUM(duracao_minutos agendados) ÷ ((hora_fim−hora_inicio) × nº dias trabalhados × nº profissionais)`.
- **Faseável:** dá pra ligar a ocupação **já com os defaults** (09–18, seg–sáb); o cadastro UI deixa preciso por profissional.

## 4. Métrica "agendado × faturado" (perda de agenda) 🆕
**Definição honesta** (auto-contida em `agendamentos`, defensável):
- **Taxa de desmarcação** = (cancelado + no_show) ÷ total de agendamentos no período.
- **R$ perdido** = SUM(`agendamentos.valor`) onde status IN (cancelado, no_show).
- **Comparecimento** = concluído ÷ total.

**Leitura adicional (direcional, NÃO contábil):** total agendado (SUM `agendamentos.valor` agendado/confirmado/concluído) × faturado em caixa (SUM `lancamentos` entrada). ⚠️ São tabelas diferentes — nem todo concluído vira lançamento — então é **indicador direcional**, não reconciliação. Vou rotular como tal pra não enganar.

## 5. Layout (dinheiro e ação primeiro)
```
Olá, {nome} — saudação + data
┌──────────────────────────────────────────────┐
│ A — KPIs ↑/↓ (faturamento·ticket·atend.·perda de agenda)│
├───────────────────────┬──────────────────────┤
│ C — Onde tem dinheiro │ G — Ocupação da semana   │
├───────────────────────┼──────────────────────┤
│ B — Seu dia           │ D — Precisa de você      │
├───────────────────────┴──────────────────────┤
│ E — Destaques (3 1-liners)  ·  F — Insights (2-3)   │
└──────────────────────────────────────────────┘
```

## 6. Reuso (grounded na investigação)
- **Início:** `src/cockpit/Inicio.tsx` (placeholder na rota `/`, App.tsx:25,237) — substituir.
- **_shared.tsx:** `useOrganizationId`, `formatCurrency`, `formatDate`.
- **Tarefas:** `useTodaysTasks(userId)` (`src/hooks/useTasks.ts`).
- **Precisa de você:** `PrecisaDeVoce.tsx` (queries de webchat_conversations).
- **Levers:** extrair `buildLevers` p/ `src/cockpit/levers.ts`.
- **Ocupação:** lógica do `salao-availability` (capacidade) como referência de cálculo.

## 7. Faseamento recomendado (decisão de escopo)
- **Fase 1 — Início v1 (1 push):** A (com perda de agenda) + B + C + D + E + F (2-3 1-liners). **Tudo computável já**, zero migration. Extrai buildLevers.
- **Fase 2 — Bloco G (Ocupação %):** cadastro de profissionais (3 campos) + fix duracao_minutos + regen types + cálculo + cards (home + detalhe). ~3h. Pode ir **junto** (push maior) ou logo após.
- **Roadmap — view de Insights (Bloco F completo, 8 técnicas):** depois.

## 8. Critérios de sucesso (§8.3)
1. 7 blocos com dado real + empty states (sem NaN); comparações com guard.
2. Métrica perda de agenda rotulada honestamente (desmarcação real vs leitura direcional).
3. Ocupação % com denominador de capacidade correto (defaults ou cadastro).
4. Deep-links funcionais.
5. Build verde + deploy anti-phantom + prova (home populada com seed + agendamentos semeados).

## 9. Próximo passo
Confirmar o **faseamento (§7)** — G junto no v1 ou como fase 2 — e dar o **"go"**.
