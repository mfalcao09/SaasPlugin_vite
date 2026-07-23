-- ============================================================================
-- Resolução de identidade no login
--
-- `usuarios` tem RLS por tenant (instituicao_id = instituicao_do_usuario()),
-- que por sua vez depende de auth.uid(). No momento do login ainda não existe
-- auth.uid() — é justamente o que se quer descobrir. Circularidade clássica:
-- para saber quem é, seria preciso já saber quem é.
--
-- SECURITY DEFINER quebra o ciclo, do mesmo jeito que o GoTrue do Supabase faz
-- ao consultar auth.users antes de emitir o JWT.
--
-- ⚠️  ESTA FUNÇÃO NÃO AUTENTICA. Ela RESOLVE identidade a partir de um e-mail.
--     Não há senha, não há verificação. Em produção quem autentica é o Supabase
--     Auth (JWT de 15-60 min, §11.1 do CLAUDE.md do grupo) e esta função deixa
--     de ser chamada no login — o JWT já traz o `sub`.
--     O sufixo `_dev` no nome existe para que usá-la em produção seja uma
--     escolha visível no diff, nunca um descuido.
-- ============================================================================

create or replace function public.resolver_identidade_dev(p_email text)
returns table (
  auth_id           uuid,
  nome              text,
  email             text,
  instituicao_id    uuid,
  instituicao_nome  text,
  perfil            text
)
language sql
security definer
-- search_path fixo: sem isto, um schema no caminho do chamador poderia
-- sequestrar `usuarios` dentro de uma função com privilégio de dono.
set search_path = public, pg_temp
stable
as $$
  select u.auth_id, u.nome, u.email, u.instituicao_id, i.nome, u.perfil
    from public.usuarios u
    join public.instituicoes i on i.id = u.instituicao_id
   where lower(u.email) = lower(trim(p_email))
   limit 1;
$$;

comment on function public.resolver_identidade_dev(text) is
  'Login de DESENVOLVIMENTO: resolve identidade por e-mail, sem senha. Producao usa Supabase Auth.';

-- Lista de quem pode entrar, para a tela de acesso oferecer as opções em vez
-- de exigir que a pessoa adivinhe um e-mail. Também só faz sentido em dev.
create or replace function public.identidades_disponiveis_dev()
returns table (email text, nome text, instituicao_nome text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select u.email, u.nome, i.nome
    from public.usuarios u
    join public.instituicoes i on i.id = u.instituicao_id
   order by i.nome, u.nome;
$$;

-- SECURITY DEFINER roda com privilégio do dono: deixar o EXECUTE aberto ao
-- mundo daria a qualquer conexão o poder de listar usuários por cima da RLS.
revoke all on function public.resolver_identidade_dev(text) from public;
revoke all on function public.identidades_disponiveis_dev() from public;

-- O role `authenticated` sempre existe no Supabase, mas os gates sobem um
-- Postgres cru sem ele. Conceder incondicionalmente abortava a migration e
-- derrubava a suíte inteira — o grant é acessório, o schema é o essencial.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.resolver_identidade_dev(text) to authenticated;
    grant execute on function public.identidades_disponiveis_dev() to authenticated;
  end if;
end $$;
