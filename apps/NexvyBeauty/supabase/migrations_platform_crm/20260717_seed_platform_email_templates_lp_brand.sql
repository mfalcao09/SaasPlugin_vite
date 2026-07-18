-- Seed dos 3 templates Motor-B em platform_email_templates com a identidade da
-- LP "Clientes de Volta" (NexvyBeauty). html_content = CONTEÚDO INTERNO injetado
-- dentro do shell platform-generic.tsx (que já provê fundo marfim, card branco,
-- wordmark NexvyBeauty e footer). CSS 100% inline (clientes de e-mail removem
-- <style>/var()). Paleta: marfim #faf7f2 · tinta #2a2124 · muted #7d6d71 ·
-- borda #e5d9d0 · vinho #7c0f24. Serif Georgia p/ títulos; Arial p/ corpo.
-- Slugs verbatim que o código chama: team_invite / booking_confirmation /
-- admin_notification. Fragmentos crus (meet_link_block, action_block) NÃO são
-- escapados — renderTemplate faz replace direto de {{var}}.
-- Idempotente: ON CONFLICT (slug) atualiza visual/copy sem duplicar.

INSERT INTO public.platform_email_templates
  (slug, name, subject, category, description, html_content, is_active, is_system, variables)
VALUES
(
  'team_invite',
  'Convite de equipe',
  'Você foi convidada para a {{organization_name}}',
  'acesso',
  'Convite para novos membros da equipe (identidade LP "Clientes de Volta").',
  $ht$<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#2a2124;margin:0 0 16px">Você foi convidada ✨</h1>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#2a2124;margin:0 0 14px">{{invited_by_name}} convidou você para participar da <strong>{{organization_name}}</strong> no {{platform_name}} como <strong>{{role_name}}{{squad_text}}</strong>.</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#2a2124;margin:0 0 14px">Clique no botão abaixo para aceitar o convite e criar seu acesso.</p>
<div style="text-align:center;margin:24px 0 8px"><a href="{{invite_link}}" style="background-color:#7c0f24;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;border-radius:12px;padding:16px 30px;text-decoration:none;display:inline-block">Aceitar convite</a></div>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#7d6d71;margin:16px 0 0">Se você não esperava este convite, pode ignorar este e-mail com segurança.</p>$ht$,
  true,
  true,
  '["platform_name","organization_name","invited_by_name","role_name","squad_text","invite_link"]'::jsonb
),
(
  'booking_confirmation',
  'Confirmação de reunião',
  'Sua reunião está confirmada: {{event_name}}',
  'sistema',
  'Confirmação de reunião agendada (identidade LP "Clientes de Volta").',
  $ht$<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#2a2124;margin:0 0 16px">Sua reunião está confirmada ✅</h1>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#2a2124;margin:0 0 18px">Olá, {{guest_name}}! Confirmamos os detalhes da sua reunião com {{host_name}}.</p>
<div style="background-color:#faf7f2;border:1px solid #e5d9d0;border-radius:12px;padding:16px 18px;margin:0 0 18px">
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7d6d71;margin:0 0 4px">Assunto</p>
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#2a2124;margin:0 0 14px">{{event_name}}</p>
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#7d6d71;margin:0 0 4px">Quando</p>
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#2a2124;margin:0">{{date_time}}</p>
</div>
{{meet_link_block}}
<div style="text-align:center;margin:20px 0 8px"><a href="{{confirmation_url}}" style="background-color:#7c0f24;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;border-radius:12px;padding:16px 30px;text-decoration:none;display:inline-block">Ver detalhes da reunião</a></div>$ht$,
  true,
  true,
  '["guest_name","event_name","host_name","date_time","meet_link_block","confirmation_url"]'::jsonb
),
(
  'admin_notification',
  'Notificação administrativa',
  '{{title}}',
  'sistema',
  'Notificação administrativa da plataforma (identidade LP "Clientes de Volta").',
  $ht$<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#2a2124;margin:0 0 16px">{{title}}</h1>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#2a2124;margin:0 0 14px">Olá, {{user_name}}.</p>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#2a2124;margin:0 0 14px">{{message}}</p>
{{action_block}}
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#7d6d71;margin:16px 0 0">Você recebeu esta notificação do {{platform_name}}.</p>$ht$,
  true,
  true,
  '["platform_name","user_name","title","message","action_block"]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  html_content = EXCLUDED.html_content,
  is_active = EXCLUDED.is_active,
  is_system = EXCLUDED.is_system,
  variables = EXCLUDED.variables,
  updated_at = now();
