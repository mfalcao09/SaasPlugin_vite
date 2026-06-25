# Port Evolution API v2.3.7 → NexvyOficinas (2026-06-24)

Espelha o fix do NexvyBeauty (commit `325322c`). Servidor compartilhado `evolution.nexvy.tech`
(evoapicloud/evolution-api v2.3.7 OFICIAL). Código do Oficinas nasceu p/ "Evolution Go" →
`create` daria 400 "Invalid integration". App dormente (platform_settings vazio, 0 instâncias)
→ bug latente, ninguém bateu ainda.

## Critério de sucesso (binário)
- [x] Os 3 `index.ts` do Oficinas passam a ser **byte-idênticos** ao pós-fix do Beauty (`325322c`)
- [x] `_shared/phone.ts` e `_shared/presence.ts` existem no Oficinas (imports resolvem)
- [x] Nenhum import novo introduzido pelo fix
- [x] `deno check`: proxy/send limpos; webhook mantém os MESMOS 9 erros pré-existentes (não introduzidos)
- [x] Commit no main (`fecbba1`)
- [x] **GATE produção (dono aprovou):** deploy via Supabase CLI — 3 fns ACTIVE
- [ ] **GATE produção:** wiring `platform_settings` (url+global key) via bridge segura — SÓ se o dono pedir ativar (ainda vazio)

## Passos
1. [x] Verificar divergência: Oficinas atual == Beauty pré-fix (`325322c^`) → IDÊNTICOS
2. [x] Copiar pós-fix do Beauty → Oficinas (proxy/send/webhook)
3. [x] Verificar identidade pós-cópia + imports + type-check
4. [x] Commit no main (`fecbba1`)
5. [x] Perguntar ao dono → escolheu "deployar inerte agora"
6. [x] Deploy: 3 fns ACTIVE em `gpxmkximudukbljrvtxj` (proxy v7, send v7, webhook v13)
       verify_jwt verificado por HTTP: proxy/send=401 (true), webhook=200 (false) ✅
7. [ ] (gated) Wiring config de produção pela bridge segura (key NUNCA no chat) — pendente do dono

## Status final (2026-06-25)
- Código portado + commitado (`fecbba1`) + deployado (inerte). `platform_settings` VAZIO → nada conecta.
- Para ativar: dono pede → bridge segura grava url+global key + cria instância `<org-slug>-...` + webhook set.
- Débito herdado (fora de escopo): webhook tem 9 erros de tipo pré-existentes (iguais ao Beauty deployado),
  incl. 2x `TS2304 Cannot find name 'organizationId'` (linhas ~2053/2060) — bug latente nos DOIS apps, não bloqueia deploy.

## Notas
- API v2.3.7: create `{instanceName, integration:"WHATSAPP-BAILEYS", token}`; connect `GET /instance/connect/{instanceName}`;
  state `GET /instance/connectionState/{instanceName}`; webhook `POST /webhook/set/{instanceName} {webhook:{enabled,url,events}}`;
  send `POST /message/sendText|sendMedia/{instanceName}`. Endereçar por `instanceName`, não uuid.
- `evolution-webhook` DEVE ser deployado com `verify_jwt=FALSE` (webhook externo, sem JWT).
- Ref: memória `reference_evolution_server_compartilhado_2026-06-24`.
