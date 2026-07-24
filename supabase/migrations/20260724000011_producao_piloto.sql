-- ===== PRODUÇÃO (piloto Tribunais) =====
-- Login-piloto usa resolver_identidade_dev (sem senha, atrás de basicAuth no
-- Traefik); auth.users do Supabase é gerenciado — solta o FK até o Supabase
-- Auth assumir (aí o FK volta e esta migration ganha sucessora).
alter table public.usuarios drop constraint if exists usuarios_auth_id_fkey;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke update, delete on public.atos, public.edicoes, public.auditoria from authenticated;
grant execute on function public.resolver_identidade_dev(text), public.identidades_disponiveis_dev() to authenticated;
insert into public.usuarios (auth_id, instituicao_id, nome, email, perfil) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Gestor A','gestor.a@teste.local','gestor'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Gestor B','gestor.b@teste.local','gestor')
on conflict do nothing;
