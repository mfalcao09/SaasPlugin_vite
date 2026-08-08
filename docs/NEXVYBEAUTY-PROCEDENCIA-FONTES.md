# NexvyBeauty — Dossiê de procedência das fontes

Gerado na consolidação 2026-08-08. Ports já absorvidos em `SaasPlugin_vite` — **não reimportar em massa**.

| Fonte (GitHub) | Papel | Port no canônico (evidência) | Destino |
|---|---|---|---|
| `sales-spark-ai-47` | CRM core | `b855300` cascateamento sales-spark | Arquivar |
| `novo-remix-vendus-v4` | Snapshot Vendus | linhagem → v5; referência `.vendus-src-reference/` local | Arquivar |
| `oficial-vendus-v5` | Referência Vendus mais completa | `0e43b6b` ImplantacaoWizard + porte CRM | Arquivar (referência canônica da linhagem) |
| `saas-gest-o-de-cobran-a-e-clientes` | Quase-idêntico a v5 (+11 arquivos) | extrair delta se necessário antes de qualquer uso | Arquivar |
| `cloud-beauty-ai` | UX/vertical salão (Lovable) | `bd62142` / `2556449` Track B | Arquivar |
| `clientes-de-volta` | LP Lovable | `029436d` / `7f48271` | Arquivar |
| `remix-nina-para-est-tica-e-beleza-19jun` | Nina / retenção | snapshot separado; não mergear | Arquivar |
| `mkt-ad-manager-hub-remix-20-04` | Ads hub | console Ads já em main (`d11bd82`) | Arquivar |
| `SaasPlugin_NEXT` | Monorepo Next legado | `apps/beauty-flow` placeholder; stack diferente | Arquivar |
| local `nexvy-beauty/` | Scaffold 26 arquivos, não-git | plano superseded em SaasPlugin | Zip/ignorar; não promover |

## Linhagem Vendus (blobs)

`sales-spark` → `novo-remix-v4` → `oficial-v5` ≈ `saas-gestao` (1541 blobs idênticos; 2 alterados; 11 extras em saas-gestao).

## Sprawl de processo (mesmo repo)

- Worktrees `SaasPlugin_vite-*` **não** são repos GitHub separados — são worktrees do mesmo `origin`.
- Standalones remotos vieram majoritariamente de `gpt-engineer-app[bot]` (Lovable), não de Claude Code.
- Claude Code explica principalmente a multiplicação de branches/worktrees **dentro** de `SaasPlugin_vite`.
