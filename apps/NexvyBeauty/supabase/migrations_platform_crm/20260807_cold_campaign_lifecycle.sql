-- ═══════════════════════════════════════════════════════════════════════════
-- CICLO DE VIDA DA CAMPANHA DE COLD OUTREACH — autorização + vigência
-- 2026-08-07
--
-- ── O DEFEITO ─────────────────────────────────────────────────────────────
-- `platform_crm_cold_campaigns.status` já declarava seis estados no CHECK
-- (draft|warming|active|paused|killed|completed), mas o motor nunca os tratou
-- como máquina: a query filtrava `in (active, warming)` e o portão anti-ban
-- recebia `campaignPaused: status === "paused"` — comparação que jamais podia
-- ser verdadeira, porque `paused` já fora removido pelo filtro.
--
-- Resultado medido em 2026-08-07: a campanha `TESTE Gate G` estava `active` com
-- `dry_run=false`, janela 0h-24h todos os dias e jitter 1-3s. Um lead entrando na
-- fila viraria disparo em menos de um minuto (cron `* * * * *`). Ela virou
-- `active` por um UPDATE — não houve ato de autorização, porque não existia
-- coluna onde registrar um.
--
-- ── A INVERSÃO ────────────────────────────────────────────────────────────
-- Antes: dispara-se na AUSÊNCIA DE IMPEDIMENTO ("está active, logo pode").
-- Agora: dispara-se apenas mediante ATO REGISTRADO (`activated_at`).
--
-- `status='active'` sem `activated_at` NÃO dispara. Salvar a configuração — ou
-- rodar um UPDATE direto — deixa de armar o gatilho.
--
-- ── POR QUE NÃO HÁ ESTADO `scheduled` ─────────────────────────────────────
-- Agendamento não é estado, é VIGÊNCIA: eixo ortogonal. O Meta Ads faz assim —
-- um anúncio ACTIVE com `start_time` futuro não roda, e não existe SCHEDULED.
-- Um estado exigiria a transição `scheduled → active`, mais um passo implícito
-- que alguém teria de executar — a mesma classe de omissão que gerou o defeito.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colunas ─────────────────────────────────────────────────────────────
alter table public.platform_crm_cold_campaigns
  add column if not exists activated_at       timestamptz,
  add column if not exists activated_by       uuid,
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at   timestamptz;

comment on column public.platform_crm_cold_campaigns.activated_at is
  'Carimbo do ATO de autorização. NULL = ninguém autorizou = não dispara, mesmo com status=active. Só pcrm_cold_arm_campaign/disarm escrevem aqui.';
comment on column public.platform_crm_cold_campaigns.activated_by is
  'auth.uid() de quem autorizou. Sem FK para auth.users de propósito: a auditoria de QUEM armou não pode sumir se o usuário for removido.';
comment on column public.platform_crm_cold_campaigns.scheduled_start_at is
  'Início da vigência. NULL = vale desde o carimbo. Comparação INCLUSIVA: no instante exato já vale.';
comment on column public.platform_crm_cold_campaigns.scheduled_end_at is
  'Fim da vigência. NULL = sem prazo. Comparação EXCLUSIVA, igual a withinWindow (hour < endHour) — duas convenções de horário opostas no mesmo motor seriam armadilha.';

-- Janela invertida é erro de digitação do operador, não intenção. Barrar na
-- escrita evita uma campanha que nunca dispara e ninguém entende por quê.
alter table public.platform_crm_cold_campaigns
  drop constraint if exists platform_crm_cold_campaigns_vigencia_coerente;
alter table public.platform_crm_cold_campaigns
  add constraint platform_crm_cold_campaigns_vigencia_coerente
  check (
    scheduled_start_at is null
    or scheduled_end_at is null
    or scheduled_end_at > scheduled_start_at
  );

-- ── 2. ARMAR — o ato de autorização ────────────────────────────────────────
-- Existe como FUNÇÃO, e não como UPDATE feito pela UI, porque um UPDATE pode
-- esquecer o carimbo; uma função não pode. Aqui, mudar o status e registrar quem
-- autorizou são o MESMO ato, indivisível.
create or replace function public.pcrm_cold_arm_campaign(
  p_campaign     uuid,
  p_start        timestamptz default null,
  p_end          timestamptz default null,
  p_revive_morta boolean     default false
)
returns public.platform_crm_cold_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campanha public.platform_crm_cold_campaigns;
begin
  -- SECURITY DEFINER contorna RLS, então o gate tem de ser explícito.
  -- `IS NOT TRUE` e não `= false`: com auth.uid() nulo (service_role, anon), a
  -- função devolve NULL, e `NULL = false` é NULL — que NÃO barra num `if`.
  -- Fail-closed é obrigatório aqui: esta função arma disparos reais.
  if public.has_role(auth.uid(), 'super_admin'::app_role) is not true then
    raise exception 'apenas super_admin pode armar uma campanha';
  end if;

  select * into v_campanha from public.platform_crm_cold_campaigns where id = p_campaign;
  if not found then
    raise exception 'campanha % não existe', p_campaign;
  end if;

  -- `killed` é terminal por decisão: o anti-ban não se auto-reverte, e quem
  -- ressuscita precisa ter LIDO o motivo da morte. O parâmetro explícito é o
  -- ponto onde essa leitura acontece.
  if v_campanha.status in ('killed', 'completed') and p_revive_morta is not true then
    raise exception
      'campanha está % (motivo: %) — para reviver, chame com p_revive_morta := true',
      v_campanha.status, coalesce(v_campanha.paused_reason, 'sem motivo registrado');
  end if;

  update public.platform_crm_cold_campaigns
     set status             = 'active',
         activated_at       = now(),
         activated_by       = auth.uid(),
         scheduled_start_at = p_start,
         scheduled_end_at   = p_end,
         paused_reason      = null,
         updated_at         = now()
   where id = p_campaign
  returning * into v_campanha;

  return v_campanha;
end;
$$;

comment on function public.pcrm_cold_arm_campaign is
  'ARMA a campanha: status=active + carimbo de autorização, indivisíveis. p_start/p_end definem a vigência (agendamento). Sem este carimbo o motor NÃO dispara, mesmo com status=active.';

-- ── 3. DESARMAR — o botão de desligar ──────────────────────────────────────
-- Limpa o carimbo junto com o status. Se limpasse só o status, um UPDATE
-- devolvendo `active` rearmaria a campanha sem qualquer ato humano.
create or replace function public.pcrm_cold_disarm_campaign(
  p_campaign uuid,
  p_motivo   text default 'desarmada pelo operador'
)
returns public.platform_crm_cold_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campanha public.platform_crm_cold_campaigns;
begin
  if public.has_role(auth.uid(), 'super_admin'::app_role) is not true then
    raise exception 'apenas super_admin pode desarmar uma campanha';
  end if;

  update public.platform_crm_cold_campaigns
     set status        = 'paused',
         activated_at  = null,
         activated_by  = null,
         paused_reason = p_motivo,
         updated_at    = now()
   where id = p_campaign
  returning * into v_campanha;

  if not found then
    raise exception 'campanha % não existe', p_campaign;
  end if;
  return v_campanha;
end;
$$;

comment on function public.pcrm_cold_disarm_campaign is
  'DESARMA a campanha: status=paused e carimbo APAGADO. Rearmar exige passar por pcrm_cold_arm_campaign de novo.';

-- ── 4. Permissões ──────────────────────────────────────────────────────────
-- O gate interno já barra não-super_admin, mas revogar de anon/public é a
-- segunda camada: função de disparo não deve nem ser CHAMÁVEL sem sessão.
revoke all on function public.pcrm_cold_arm_campaign(uuid, timestamptz, timestamptz, boolean) from public, anon;
revoke all on function public.pcrm_cold_disarm_campaign(uuid, text) from public, anon;
grant execute on function public.pcrm_cold_arm_campaign(uuid, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.pcrm_cold_disarm_campaign(uuid, text) to authenticated;

-- ── 5. NÃO EXISTE AUTORIZAÇÃO RETROATIVA ───────────────────────────────────
-- Toda campanha que já estava disparando volta para `paused`. Nenhuma delas
-- passou por um ato de autorização — a coluna acabou de nascer. Presumir
-- consentimento aqui seria repetir, na migration, exatamente o erro que ela
-- corrige: tratar "estava ligado" como "alguém decidiu ligar".
--
-- Sem WHERE por id: o critério é a AUSÊNCIA de carimbo, não uma campanha
-- específica. Se amanhã surgir outra `active` sem autorização, a mesma regra a
-- pega. (Hoje, 2026-08-07, isso atinge uma única linha: `TESTE Gate G`.)
update public.platform_crm_cold_campaigns
   set status        = 'paused',
       paused_reason = 'desarmada pela migration 20260807: autorização retroativa não existe — rearme com pcrm_cold_arm_campaign',
       updated_at    = now()
 where status in ('active', 'warming')
   and activated_at is null;
