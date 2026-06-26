# Plano de Compatibilização — CBA → NexvyBeauty (salão)

> Como trazer **tudo** do concorrente CBA, mas **traduzido pro salão** (não como CRM de equipe de vendas).
> Fonte: fan-out de 10 designers (1 por módulo) garimpando o código do NX. · 2026-06-26 · **plano, sem código.**

---

## 1. A virada: o NX já tem quase tudo — dormente

Meu mapeamento anterior só olhou `src/` e **perdeu as migrations**. A maioria desses "gaps" tem **infra pronta** (herdada do CRM-mãe), só não surfaçada/reframada pro salão:

| Módulo CBA | Infra que JÁ existe no NX |
|---|---|
| Metas & Quotas | `sales_goals` (tabela) · `useSalesGoals` · `useSquadPerformance` · `GoalProgress` (componente) |
| NBA IA | `lead_nba_sugestao` (tabela) · edge `lead-nba` (LLM+tool_call) · `LeadNbaCard` (gera+dispara WhatsApp) |
| Scoring | `lead_scoring_with_decay` (`recompute_lead_scores` fn) · `LeadScoreBadge` |
| Workflows | `tag_automations` (event→ação) · `TagAutomationsPanel` · `AutomationDialog` · `useTagAutomations` |
| Playbook | `PlaybookView` (componente de abas) |
| Higiene | `detectDuplicates` + `normalizeBrPhone` (já em `Clientes.tsx`) |
| Materiais | abas por-oferta (`MaterialsTab`/`PlaybookTab` no ProductDetail) |
| AI Growth (E1) | `levers.ts` (agregação de oportunidades) · `sendReactivation` · `BulkReactivationDialog` |

**Conclusão:** o trabalho é **surfacing + reframe**, não build-from-scratch. Esforço dominante = **M** (médio), reuso 80–90%.

## 2. A decisão de arquitetura: 10 módulos → 4 features de salão

Construir 10 telas separadas = **re-inchar** o produto que acabamos de enxugar. Os 10 designers convergiram nas **mesmas 4 primitivas** — os módulos do CBA colapsam nelas:

| Feature de salão | Absorve (do CBA) | O que é (pra cabeleireira) | Reusa do NX | Esforço |
|---|---|---|---|---|
| **A) Ações com Clientes** | NBA IA · Scoring · (Squad) · (E1) | Fila "**o que fazer com cada cliente AGORA**" (reativar / oferecer pacote / aniversário / upsell) + selo do cliente (**VIP / em risco / nova**) + botão **WhatsApp pronto** | `lead_nba_sugestao`, edge `lead-nba`, `lead_scoring`, `LeadNbaCard`, `LeadScoreBadge`, `sendReactivation` | **M** (≈80% existe) |
| **B) Receitas de Automação** | Workflows · Playbook · Materiais · Landings | **Receitas prontas de salão** (aniversário · retorno em N dias · pacote acabando · lembrete 24h) — *não builder vazio* + templates de WhatsApp por serviço | `tag_automations`, `TagAutomationsPanel`, `AutomationDialog`, `PlaybookView`, `useTaskAutomation` | **M** |
| **C) Meta do Mês** | Metas&Quotas · (Squad) | Meta de **faturamento** + **ocupação** (% agenda cheia) + receita por profissional | `sales_goals`, `GoalProgress`, `useSquadPerformance`, agg do Dashboard | **M** (reusa 80%) |
| **D) Limpeza de Base** | Higiene | **Duplicatas** + normalização de telefone + **inativos 60d** + enriquecimento de dados | `detectDuplicates`, `normalizeBrPhone`, `tag_automations` | **M** |
| **E1) AI Growth turbinado** | (enhancement) | Cards com **lista nomeada** dos clientes + **ação por tipo** + "Gerar com IA" + "Executar todas" → **alimenta a feature A** | `levers.ts`, `OpportunityCardData`, `sendReactivation` | **M** (extensão) |

## 3. Princípio de design (consenso dos 10 designers)

- **Receita, não builder.** A cabeleireira quer **resposta pronta**, não canvas "if A then B". Toda automação nasce de um template pré-configurado (6 receitas de salão).
- **Cliente, não lead.** O eixo é o **cliente real** (histórico de agendamento/pacote/aniversário), não o lead de pipeline.
- **Ação = 1 clique → WhatsApp.** Toda sugestão termina num disparo real via Evolution (já existe).
- **Meta do salão, não quota de SDR.** Sem leaderboard de vendedor; meta é do salão / do profissional.
- **Linguagem de salão.** "Clientes sumidas" (não "inativas"), "Onde está o dinheiro parado?" (não "pipeline value").

## 4. Ordem recomendada (valor × reuso)

1. **E1 (AI Growth turbinado) + A (Ações com Clientes)** — fazem par (A consome os cards do E1). **Coração da retenção**, maior valor, maior reuso. Começa aqui.
2. **D (Limpeza de Base)** — rápido; base limpa destrava WhatsApp/automação de todo o resto.
3. **B (Receitas de Automação)** — escala o A de manual → automático.
4. **C (Meta do Mês)** — fecha o loop gerencial.

## 5. Riscos & decisões

- **Não duplicar tabelas.** NBA/Scoring já têm `lead_nba_sugestao` / `lead_scoring` (pensados pra *lead*). Decisão: **estender com contexto de cliente** (`servico_catalogo.categoria` + `agendamentos`) em vez de criar `cliente_proxima_acao` espelhada — evita table-explosion. Se precisar fila unificada, usar view/union depois.
- **`tag_automations` tem eventos de pagamento** (`compra_aprovada`, `pix_gerado`). Estender o enum com **eventos de salão** (`aniversario_cliente`, `pacote_expirando`, `retorno_Nd`, `agendamento_confirmado_24h`) — *não* criar tabela nova. Feature-flag por org se preciso.
- **Higiene: merge nunca automático.** Sempre mostrar diff + pedir confirmação (alguns "duplicados" são parentes com mesmo telefone).
- **Automação opt-in.** Preview + contagem de destinatários antes de disparar; "Enviar agora / Agendar / Salvar receita". Nunca dispara sozinho sem o 1º opt-in (cliente recebendo WhatsApp à meia-noite = péssimo).

---

### Próximo passo
Aprovar o desenho → implementar na ordem acima, **uma feature por vez** (cada uma reusa infra dormente, então é mais surfacing que build). Cada feature: migration leve (estender enums) → UI reframada → build → deploy → click-test. Começo pelo par **E1 + A** quando você der o GO.
