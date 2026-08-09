# E3 — Prova do caminho CONNECTION_UPDATE → DB (bug UI desconectada)

**Quando:** 2026-08-09 ~05:56 UTC  
**Deploy em prova:** `platform-evolution-webhook` v54 (2026-08-09 05:50:49), `platform-evolution-proxy` v49 (2026-08-09 05:50:53)

## Sintoma histórico

Evolution conectava (QR ok / state open), mas a UI continuava **Desconectado**.

## Causa raiz (medida)

A UI (`PlatformCrmEvolutionInstancesPanel`) **só lê** `platform_crm_evolution_instances.status` (poll 3s).  
O status `connected` só é escrito pelo webhook em `CONNECTION_UPDATE` / `Connected` / `PairSuccess`.

Se o callback chega **sem** `apikey` (ou token errado), o receptor responde **401** e **não escreve o DB** → UI fica desconectada mesmo com Evolution open.

## Prova live (probe `e3-conn-probe`, apagado depois)

| Caso | HTTP | status no DB depois |
|------|------|---------------------|
| A — sem token | **401** | `disconnected` (inalterado) |
| B — token errado | **401** | `disconnected` (inalterado) |
| C — header `apikey` = instance_token | **200** | **`connected`** + phone + `last_connected_at` |
| D — `apikey` só no body | **200** | **`connected`** |

## O que precisa estar certo no recreate

1. Linha em `platform_crm_evolution_instances` com `instance_token`.
2. `webhook/set` com `webhook.headers.apikey = instanceToken` (provisioner E1 — `configurePlatformEvolutionProxyWebhook`).
3. Eventos incluem `CONNECTION_UPDATE`.

`create_instance_self` e `subscribe_webhook` no proxy já chamam esse provisioner.

## Estado operacional no momento da prova

- `platform_crm_evolution_instances`: **0 linhas** (Camila removida do DB).
- Evolution server: **sem** `prospec-ativa-camila2` (só `fic-rematricula` open e `meuteste1-sal-o1` close).

Recreate via painel Platform (super_admin) → Connect QR. Não reaproveitar webhook antigo sem headers.
