# NexvyBeauty — Fonte Canônica (congelada 2026-08-08)

## Decisão

**Única fonte ativa:** `mfalcao09/SaasPlugin_vite` → `apps/NexvyBeauty` em `origin/main`.

- Deploy de produção: VPS `/opt/stacks/saasplugin-vite` puxa `origin/main` e builda `apps/NexvyBeauty`.
- Todo desenvolvimento novo de NexvyBeauty acontece **somente** nesse path.
- Standalones Lovable/Vendus/NEXT e scaffolds locais são **referência histórica** (read-only / arquivados).

## Arquivar ≠ deletar

Repositórios-fonte devem ser **arquivados** no GitHub (read-only); nada é deletado nesta rodada.
Na consolidação 2026-08-08 o archive remoto falhou por escopo do PAT (`Administration: Write` ausente) — mirrors locais + tags cobrem a salvaguarda até o archive na UI/token.
Elegibilidade a delete futuro exige: arquivado ≥90 dias + mirror `git fsck` verde + zero referências no canônico.

## Arquitetura

**Manter Opção A** (mono-bundle host-aware) até ≥2 gatilhos objetivos:

| Gatilho | Limiar |
|---|---|
| Apps com deploy recorrente | ≥2 |
| Duplicação por cópia | >15% e ≥3 correções multi-app/trimestre |
| Bundle de entrada | >350 KB gzip sustentado |
| Tempo de build | >3 min sustentado |
| Releases por host | gestao/app/apex exigem ciclos independentes |

Pré-requisitos duros para Opção B: deploy deixa de buildar working tree sujo + CI por app.

## Resgates desta consolidação

| Branch local | Conteúdo |
|---|---|
| `wip/rescue-ads-duda-inbound-2026-08-08` | Evolution webhook events, demo-evolution, whatsapp-health-alert |
| `wip/rescue-cakto-2026-08-08` | `deno.lock` da worktree cakto |
| `wip/rescue-zealous-criativos-2026-08-08` | edições PLANO-CRIATIVOS-META |

Mirrors frios: `/Users/marcelosilva/Projects/GitHub/_archive-mirrors/2026-08-08/`.

Ver também: `docs/NEXVYBEAUTY-PROCEDENCIA-FONTES.md`.
