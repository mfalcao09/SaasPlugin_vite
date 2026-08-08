# NexvyBeauty — Dossiê de procedência das fontes

Gerado na consolidação 2026-08-08. Ports já absorvidos em `SaasPlugin_vite` — **não reimportar em massa**.

| Fonte (GitHub) | Papel | Port no canônico (evidência) | Papel pós-unificação |
|---|---|---|---|
| `sales-spark-ai-47` | CRM core | `b855300` cascateamento sales-spark | Referência; não desenvolver Beauty aqui |
| `novo-remix-vendus-v4` | Snapshot Vendus | linhagem → v5; referência `.vendus-src-reference/` local | Referência histórica |
| `oficial-vendus-v5` | Referência Vendus mais completa | `0e43b6b` ImplantacaoWizard + porte CRM | Referência da linhagem Vendus |
| `saas-gest-o-de-cobran-a-e-clientes` | Quase-idêntico a v5 (+11 arquivos) | extrair delta se necessário antes de qualquer uso | Referência; delta sob demanda |
| `cloud-beauty-ai` | UX/vertical salão (Lovable) | `bd62142` / `2556449` Track B | Referência; ports já em Beauty |
| `clientes-de-volta` | LP Lovable | `029436d` / `7f48271` | Referência; ports já em Beauty |
| `remix-nina-para-est-tica-e-beleza-19jun` | Nina / retenção | snapshot separado; não mergear | Snapshot; não mergear em massa |
| `mkt-ad-manager-hub-remix-20-04` | Ads hub | console Ads já em main (`d11bd82`) | Referência; Ads vive no canônico |
| `SaasPlugin_NEXT` | Monorepo Next legado | `apps/beauty-flow` placeholder; stack diferente | Fora do caminho Beauty (stack diferente) |
| local `nexvy-beauty/` | Scaffold 26 arquivos, não-git | plano superseded em SaasPlugin | Ignorar; não promover |

Archive/delete de cada fonte remota é decisão **separada** da unificação do path canônico.

## Linhagem Vendus (blobs)

`sales-spark` → `novo-remix-v4` → `oficial-v5` ≈ `saas-gestao` (1541 blobs idênticos; 2 alterados; 11 extras em saas-gestao).

## Sprawl de processo (mesmo repo)

- Worktrees `SaasPlugin_vite-*` **não** são repos GitHub separados — são worktrees do mesmo `origin`.
- Standalones remotos vieram majoritariamente de `gpt-engineer-app[bot]` (Lovable), não de Claude Code.
- Claude Code explica principalmente a multiplicação de branches/worktrees **dentro** de `SaasPlugin_vite`.
