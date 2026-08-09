# Camila data compliance — identidade transparente

Data: 2026-08-09
Escopo: persona transparente + evidência operacional (sem apply em produção).

## Já em main (não reimplementado aqui)

- Aprovação por lead: colunas `approved_at`/`approved_by` (`20260716e`), UI de aprovar, view consolidada por-lead (`20260716f`), gates de enqueue/send (`approved-gate`, segment-gate) — PRs #82–#84.
- Opt-out PARE/SAIR: classificador em `_shared/cold-outreach/opt-out.ts`, gravação em `platform_crm_lead_optout`, supressão no enqueue/inbound — já em main.
- Seed antigo `20260804_seed_bdr_camila_prospector.sql` permanece em disco como NÃO APLICADA, com cláusula de identidade incompatível com transparência; cláusula supersedida por `20260809_…`.

## O que este PR muda

- Módulo puro `_shared/cold-outreach/camila-identity.ts` (+ testes): frases proibidas, fragmentos obrigatórios e `assertCamilaIdentityCompliant`.
- Migration `20260809_seed_bdr_camila_transparent_identity.sql`: UPDATE-by-id (`68aeece9-26f2-4f7b-a595-a6ea5e8acfa7`) reescrevendo `additional_prompt` com IDENTIDADE transparente (admite automação; não nega ser IA/bot); mantém nome/tipo/modelo/ativo Camila prospector; auditoria de unicidade com RAISE WARNING.
- Nota de supersede no cabeçalho de `20260804_…sql`.
- **Não** aplica SQL em produção. **Não** restaura canal. **Não** dispara piloto.

## Ops checklist — apply coordenado (NÃO feito nesta entrega)

Ordem sugerida, só após aprovação textual Marcelo (copy/legal + produção):

1. Confirmar UI de aprovação por-lead já em produção (VPS) antes do flip da view.
2. Aplicar `20260716e` (colunas) se ainda não estiver no banco live.
3. Aplicar `20260716f` (view por-lead) **junto** com front de aprovar-por-lead.
4. Aplicar `20260809_seed_bdr_camila_transparent_identity.sql` (UPDATE-by-id da Camila).
5. **Não** reaplicar `20260715_seed_bdr_prospector.sql` (armadilha de segundo prospector).
6. Conferir: único prospector ativo = Camila; zero leads sem `approved_at` na base de envio; opt-out PARE respeitado em dry-run.
7. Só então seguir E3/E4 (canal + piloto) com gates humanos separados.

## Gate Marcelo (explícito)

- Copy/legal da identidade transparente e qualquer apply em produção exigem aprovação textual de Marcelo.
- Esta entrega só coloca artefatos em disco + testes; silêncio ≠ aprovação.
