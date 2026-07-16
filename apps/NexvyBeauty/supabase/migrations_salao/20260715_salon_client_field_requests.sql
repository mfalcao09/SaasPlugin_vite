-- ============================================================================
-- P9 / CART — Agente de Gestão de Carteira (auditor de cadastro + captura).
--
-- Uma linha = "falta o campo X do cliente Y, e é isto que já fizemos a respeito".
-- É o CADERNINHO do Auditor E o ESTADO do follow-up na mesma tabela (princípio
-- "um registro só"). Mecanismo DEDICADO, isolado do fluxo de dinheiro.
--
-- Fluxo:
--   salon-audit-run  → detecta buraco → upsert status='pending'
--   salon-automation-run (carona)     → anexa 1 pergunta → status='asked'
--   salon-collect-inbound (webhook)   → extrai a resposta → grava clientes.<campo>
--                                       → status='answered' (+ source_message_id)
--
-- NÃO APLICADA no banco live — aplicar via MCP apply_migration só com GO explícito
-- do Marcelo (padrão "código 100% pronto, deploy com dedo no gatilho").
-- migrations_salao/ fica FORA do path do `supabase db push`.
-- ============================================================================

create table if not exists public.salon_client_field_requests (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  cliente_id            uuid not null references public.clientes(id) on delete cascade,
  campo                 text not null check (campo in
                          ('data_nascimento','endereco','email','cpf_cnpj')),
  status                text not null default 'pending' check (status in
                          ('pending',       -- Auditor detectou o buraco
                           'asked',         -- follow-up perguntou (carona saiu)
                           'answered',      -- cliente respondeu, valor extraído e GRAVADO
                           'declined',      -- cliente recusou / opt-out → não pergunta mais
                           'unreachable',   -- sem telefone válido / telefone ambíguo
                           'skipped')),     -- resolvido por outra via (form manual)
  valor_pendente        text,              -- valor extraído aguardando confirmação/gravação
  asked_at              timestamptz,
  answered_at           timestamptz,
  ask_count             int  not null default 0,   -- nº de vezes que perguntamos (cap p/ não insistir)
  last_channel          text,              -- 'whatsapp' etc.
  source_message_id     uuid,              -- webchat_messages.id que trouxe a resposta (trilha LGPD)
  extraction_confidence numeric,           -- 0..1 (regex=1.0; LLM=score) → gate de confirmação
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- IDEMPOTÊNCIA: 1 pendência viva por (cliente, campo). Não pergunta o mesmo 2×,
  -- não reabre o que já foi answered/declined.
  unique (organization_id, cliente_id, campo)
);

create index if not exists idx_scfr_org_status on public.salon_client_field_requests(organization_id, status);
create index if not exists idx_scfr_cliente     on public.salon_client_field_requests(cliente_id);

alter table public.salon_client_field_requests enable row level security;

-- Dono LÊ as próprias pendências (dashboard do Auditor). A ESCRITA é do cron/edge
-- (service_role, bypassa RLS) — o front nunca grava aqui.
drop policy if exists "org reads scfr" on public.salon_client_field_requests;
create policy "org reads scfr" on public.salon_client_field_requests
  for select using (organization_id = get_user_organization(auth.uid()));

-- ── LGPD (Art. 18 — direito de oposição): "não perturbe" GLOBAL do cliente. ──
-- O status='declined' na tabela acima cobre a recusa POR CAMPO; esta coluna é o
-- opt-out do cliente pra TODA coleta/abordagem por carona. O salão é o controlador;
-- a NexvyBeauty é operadora. Aditiva e default false → não muda comportamento
-- de nenhuma linha existente.
alter table public.clientes
  add column if not exists marketing_opt_out boolean not null default false;

comment on column public.clientes.marketing_opt_out is
  'LGPD Art.18: opt-out global do cliente. Quando true, o Auditor não cria pendências e a carona não faz perguntas de coleta a este cliente.';
