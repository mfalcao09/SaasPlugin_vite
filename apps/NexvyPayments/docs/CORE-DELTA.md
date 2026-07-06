# CORE-DELTA — NexvyPayments

> **O que é:** registro vivo de TODA edição feita em arquivos do **core Vendus** (herdado do fork do NexvyBeauty). Governado pela [ADR-001](../../../docs/ADR-001-estrategia-fork.md) — Disciplina 2.
> **Por que existe:** quando o upstream Vendus lançar V6/V7, um diff só distingue "mudança do dev" de "mudança nossa" se o nosso delta estiver listado aqui. Sem este arquivo, atualizar vira arqueologia.
> **Regra de ouro:** o módulo de cobrança (fatura, boleto C6, PIX, NFS-e NotaAS, régua-por-vencimento, conciliação) é **aditivo e isolado** — vive em arquivos/migrations próprios e NÃO entra aqui. Só entra aqui a edição de um arquivo que **já existia no core Vendus** e que foi **inevitável** tocar.

---

## Como registrar uma entrada

Antes de editar qualquer arquivo do core, pergunte: **dá para fazer isso num arquivo novo em vez de editar o core?** Se sim, faça no arquivo novo (não registra aqui). Se a edição do core for inevitável, registre:

```
### <caminho/do/arquivo> — <data ISO>
- **Motivo:** por que foi inevitável (não deu para isolar).
- **Mudança:** o que mudou, em 1–2 linhas (diff conceitual).
- **Reversível?** a mudança some se o core for re-substituído por um snapshot novo? (sim = re-aplicar; não = permanente)
- **Entregável/commit:** ID do entregável do spec + SHA do commit.
```

---

## Delta registrado

### `src/config/brand.ts` — 2026-07-06
- **Motivo:** ponto único de cascade por design — identidade do produto.
- **Mudança:** `BRAND_CONFIG` → key `nexvypayments`, nome/tagline/sector de cobrança, `primaryColor #213156` (navy Lux, premissa — paleta estática `index.css` fica p/ re-skin Fase D), `defaultModules` com `cobranca`; `PRODUCT_BRAND.metrics/bgHint`.
- **Reversível?** não — re-aplicar se o core for re-substituído por snapshot novo.
- **Entregável/commit:** PASSO-0-APP · `22170d1`.

### `src/lib/publicUrl.ts` — 2026-07-06
- **Motivo:** host-confinement é por família de domínio; constante é do core.
- **Mudança:** `APEX_BASE` e comentários-exemplo `nexvybeauty.com.br` → `nexvypayments.com.br` (replace-all, 0 mudança de lógica).
- **Reversível?** não — re-aplicar em snapshot novo.
- **Entregável/commit:** PASSO-0-APP · `22170d1`.

### `src/config/modules.ts` — 2026-07-06
- **Motivo:** hub de módulos é config do core; troca do módulo vertical.
- **Mudança:** card `erp_salao` → card `cobranca` (rota `/cobranca`); union `ModuleId` ganha `'cobranca'` e MANTÉM `'erp_salao'` comentado como legado (remoção na limpeza A1, preserva compilação das refs do fork); `PRODUCT_MODULES` atualizado.
- **Reversível?** não — re-aplicar em snapshot novo.
- **Entregável/commit:** PASSO-0-APP · `22170d1`.

### `package.json` + `index.html` + `public/manifest.json` — 2026-07-06
- **Motivo:** identidade do app (npm name, PWA title/theme-color/manifest).
- **Mudança:** `nexvy-beauty`→`nexvy-payments`; title/description/apple-title/theme-color `#213156`; manifest name/short_name/description/theme_color.
- **Reversível?** não — re-aplicar em snapshot novo.
- **Entregável/commit:** PASSO-0-APP · `22170d1`.

### `docker-compose.yml` + `Makefile` (raiz do monorepo) — 2026-07-06
- **Motivo:** registro do app no monorepo (previsto plano §3.13 como inevitável).
- **Mudança:** ADITIVO — serviço `nexvy-payments` (molde GYM, sem ports/labels) e `.PHONY`+`DOMAIN_PAYMENTS`+alvo `deploy-payments` (fora do `deploy-all` até Marco 0 validado).
- **Reversível?** sim (blocos aditivos independentes).
- **Entregável/commit:** PASSO-0-APP · `22170d1`.

### Decisões de NÃO-edição (auditoria)
- `src/main.tsx` — **não editado**: o tema institucional host-aware (`.theme-nexvy-institucional`, Lux navy+dourado em `gestao.*`) já é genérico no core; nada Beauty-específico a trocar.
- `src/hooks/usePlatformBranding.ts` — **não editado**: o check de cor-default `#c54b60` (linha ~151) protege a paleta estática Beauty Rosé do `index.css`; trocar o check sem re-skin da paleta criaria estado visual incoerente. Fica para o re-skin de branding (roadmap 0.5.12/Fase D).

---

## Deltas ANTECIPADOS (previstos pelo plano — confirmar ao implementar)

| Arquivo do core | Motivo previsto | Isolável? |
|-----------------|-----------------|-----------|
| `src/main.tsx` | classe de tema pré-paint da marca NexvyPayments (gestao.*) | Parcial — a classe é config, mas o ponto de injeção é no core |
| `src/config/brand.ts` | `BRAND_CONFIG` key → `nexvypayments` + cor-default | É o ponto único de cascade por design (edição esperada, baixo risco) |
| `src/lib/publicUrl.ts` | `APEX_BASE` → `nexvypayments.com.br` | 1 constante — trivial, mas é core |
| `supabase/functions/admin-provision-users` | remoção/hardening (bug de segurança herdado do Vendus) — Fase 0 | Correção de segurança: registrar e, se possível, propor upstream |
| Funções `_shared/` com IDOR (`organization_id` no body) | hardening Fase 0 (as-is R1/D-3) | Registrar cada uma tocada; preferir wrapper novo (`require-caller-org`) a editar inline |

> Estes são **previsões**, não fatos — cada um vira entrada real acima somente quando efetivamente editado, com SHA do commit.
