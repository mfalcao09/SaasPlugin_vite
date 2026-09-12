# PRD-02 — CI e deploy parity

## Objetivo

Fazer o código da Camila compilar, testar e chegar ao ambiente como artefato
identificável, sempre inicialmente em estado `OFF`.

## Requisitos

- Corrigir os erros de tipo das quatro edges.
- Incluir no CI:
  - `deno check` das quatro edges;
  - testes de cold outreach, routing, channel stamp e Z-API;
  - lint das migrations;
  - `git diff --check`.
- Isolar os arquivos Camila do WIP e excluir mudanças alheias.
- Produzir manifesto com commit, migrations, funções, versões e hashes.
- Baixar o código implantado e verificar equivalência com o commit aprovado.

## Arquivos centrais

- `.github/workflows/nexvybeauty-cockpit.yml`
- `supabase/functions/platform-sales-brain/index.ts`
- `supabase/functions/platform-cold-outreach/index.ts`
- `supabase/functions/platform-whatsapp-qr-webhook/index.ts`
- `supabase/functions/platform-camila-conductor/index.ts`

## Check binário

PASS se:

1. `deno check` retorna zero erro;
2. suíte Camila completa está verde no CI;
3. migrations passam validação;
4. deployment está em `OFF`;
5. fontes implantadas equivalem ao SHA registrado.

## Rollback

Reverter a PR e restaurar as versões anteriores das funções. O conductor
permanece desligado durante toda a frente.
