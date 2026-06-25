# Port Evolution API v2.3.7 → NexvyOficinas (2026-06-24)

Espelha o fix do NexvyBeauty (commit `325322c`). Servidor compartilhado `evolution.nexvy.tech`
(evoapicloud/evolution-api v2.3.7 OFICIAL). Código do Oficinas nasceu p/ "Evolution Go" →
`create` daria 400 "Invalid integration". App dormente (platform_settings vazio, 0 instâncias)
→ bug latente, ninguém bateu ainda.

## Critério de sucesso (binário)
- [ ] Os 3 `index.ts` do Oficinas passam a ser **byte-idênticos** ao pós-fix do Beauty (`325322c`)
- [ ] `_shared/phone.ts` e `_shared/presence.ts` existem no Oficinas (imports resolvem)
- [ ] Nenhum import novo introduzido pelo fix
- [ ] `deno check` / sanity nas 3 fns sem erro novo
- [ ] Commit no main (mesmo padrão do commit do Beauty)
- [ ] **GATE produção:** deploy via Supabase CLI — confirmar com o dono antes (ação outward-facing)
- [ ] **GATE produção:** wiring `platform_settings` (url+global key) via bridge segura — SÓ se o dono pedir ativar

## Passos
1. [x] Verificar divergência: Oficinas atual == Beauty pré-fix (`325322c^`) → IDÊNTICOS
2. [ ] Copiar pós-fix do Beauty → Oficinas (proxy/send/webhook)
3. [ ] Verificar identidade pós-cópia + imports + type-check
4. [ ] Commit no main
5. [ ] Perguntar ao dono: deployar fns inertes agora vs. segurar até ativar
6. [ ] (gated) Deploy: `supabase functions deploy <name> --project-ref gpxmkximudukbljrvtxj`
       (`evolution-webhook` com `--no-verify-jwt`)
7. [ ] (gated) Wiring config de produção pela bridge segura (key NUNCA no chat)

## Notas
- API v2.3.7: create `{instanceName, integration:"WHATSAPP-BAILEYS", token}`; connect `GET /instance/connect/{instanceName}`;
  state `GET /instance/connectionState/{instanceName}`; webhook `POST /webhook/set/{instanceName} {webhook:{enabled,url,events}}`;
  send `POST /message/sendText|sendMedia/{instanceName}`. Endereçar por `instanceName`, não uuid.
- `evolution-webhook` DEVE ser deployado com `verify_jwt=FALSE` (webhook externo, sem JWT).
- Ref: memória `reference_evolution_server_compartilhado_2026-06-24`.
