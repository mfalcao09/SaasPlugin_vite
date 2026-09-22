# Solicitação — segunda opinião GPT-5.6-Sol / Codex no Caminho A

**Não implementar código.** Produzir plano de implementação detalhado (markdown) e salvar em:
`tasks/camila-autonomy/evidence/PRD-09/sol-plan-reopen-path-A.md`

Repo: `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty`

## Contexto (Joice 2026-09-15)
- Opt-out soft → deveria R2 (texto + site) + remarketing + fechar.
- `silence` → `closed` + DNC.
- Inbound “Pode deixar” / “Obrigada” → `ensureConversation` reabria `closed→bot_active` (risco spam / incidente 5).
- Patch emergencial: **nunca** reabrir se DNC/remarketing (regra dura).
- Marcelo rejeitou regra dura: lead pode mudar de ideia; farewell ack não deve reabrir.
- Caminho A aprovado em direção: classificador `farewell_ack | reopen_intent | ambiguous | opt_out_again`.

Plano local de trabalho (não Sol): `codex-plan-reopen-path-A.md`.

## Decisões Marcelo já fechadas
1. **Ambiguous → 1 clarificação** (cap 1/dia; conversa permanece closed se não houver reopen_intent).
3. **Reopen libera opt-out de cold** (não só `reply`): ao `reopen_intent`, pode limpar/relaxar soft opt-out e `cold_suppressed` — **sem** reabrir blast/opening imediato; kernel/caps continuam.
5. Esperar esta segunda opinião antes de codar.

## Ainda em aberto (peça recomendação explícita)
2. **Janela farewell pós-R2:** 24h / 48h / 7d — bias forte a `farewell_ack` para msgs curtas/polidas. Trade-off: janela curta = mais falso reopen; longa = mais “obrigada quero ver” classificado errado como farewell.
4. **R2 automático no runtime:** incluir na Fase 4 do mesmo rollout do classificador, ou só depois do canário de reopen? Trade-off: R2 cedo completa o playbook; R2 cedo com detector de opt-out frouxo = farewell+site indevido.

## Pedido ao Sol/Codex
1. Criticar o plano local e propor estrutura de harness **mais efetiva e segura**.
2. Ordem de decisão runtime (webhook → classificador → status → kernel → brain).
3. Modelo de estado: `cold_suppressed` vs `dnc_hard` vs `reopen_allowed_*` sob a decisão #3 (liberar cold no reopen).
4. Caps anti-spam (incidente 5) compatíveis com liberar cold.
5. Fases, checks binários B1–B7 (ajustar se #3 mudar B3/B5), feature flag + rollback.
6. Recomendação fechada para Q2 e Q4 com rationale.

## Ordem de tentativa nesta wake
1. Cursor Task / subagent `gpt-5.6-sol-max-fast` (se franquia OK).
2. Senão: `codex exec` / `codex` CLI com model `gpt-5.6-sol`, prompt = este arquivo.
3. Gravar saída em `sol-plan-reopen-path-A.md` + `sol-wake-status.json`.
4. **Dedupe:** se `sol-wake-lock` existir com `status=ok`, não reexecutar (segundo fuso).
