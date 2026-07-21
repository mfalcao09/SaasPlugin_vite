-- B2 SEÇÃO 3a — A CURA DA RAIZ. APLICADA via apply_migration 2026-07-21.
-- pg_default_acl provou: {anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}.
-- O `postgres` concedia EXECUTE a anon/authenticated em TODA função nova de public por default.
-- Revogar as 93 sem isto = enxugar gelo: a função nº 94 nasceria com o mesmo buraco.
-- Efeito: função nova em public nasce executável só por service_role (e owner). RPC pública
-- exige GRANT EXPLÍCITO daqui pra frente (fail-closed: 404 diagnosticável, nunca vazamento mudo).
-- Só afeta objetos criados APÓS este comando; as 13 MANTER atuais permanecem intactas.
-- ⚠️ Guard-rail de CI (Seção 3b) deve rodar junto: query que retorna >0 quando uma SECURITY
--    DEFINER nova nasce anon-executável fora da allowlist das 13 MANTER documentadas.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
