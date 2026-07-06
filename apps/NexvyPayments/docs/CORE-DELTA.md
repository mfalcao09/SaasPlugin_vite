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

_(vazio — nenhuma edição de core ainda. As entradas serão adicionadas pelo loop de implementação conforme o roadmap exigir tocar o core, ex.: `src/main.tsx` para o branding pré-paint da marca Payments, ou a correção de segurança de `admin-provision-users`/IDOR na Fase 0 de hardening.)_

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
