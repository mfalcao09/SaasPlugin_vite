import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Gera senha aleatória forte de 12 caracteres
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$%&*!';
  const all = upper + lower + digits + special;
  let pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 4; i < 12; i++) {
    pwd.push(all[Math.floor(Math.random() * all.length)]);
  }
  // shuffle
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
}

// Bcrypt simples via crypto (Web Crypto API - SHA-256 hash com salt)
// Nota: para produção real usaríamos npm:bcryptjs, aqui usamos SHA-256 + salt
async function hashPassword(password) {
  const salt = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256$${salt}$${hashHex}`;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const {
    // Dados da barbearia
    name, nome_fantasia, razao_social, cnpj, inscricao_estadual,
    email_contato, telefone_comercial, whatsapp, slug,
    endereco,
    // Responsável
    owner_nome, owner_cpf, owner_email, owner_telefone, owner_data_nascimento,
    // Plano
    plano, ciclo, valor, data_inicio, proximo_vencimento,
    status_cobranca, trial_ate, forma_pagamento, observacoes_internas, limite_usuarios,
    // Acesso
    gerar_senha_automatica = true,
    enviar_credenciais_email = true,
  } = body;

  if (!owner_email) return Response.json({ error: 'owner_email obrigatório' }, { status: 400 });
  if (!slug) return Response.json({ error: 'slug obrigatório' }, { status: 400 });

  // Validar slug único
  const existingSlug = await base44.asServiceRole.entities.Company.filter({ slug });
  if (existingSlug.length > 0) {
    return Response.json({ error: 'Slug já está em uso por outra barbearia.' }, { status: 400 });
  }

  // Validar email único em BarbeariaUser
  const existingUser = await base44.asServiceRole.entities.BarbeariaUser.filter({ email: owner_email });
  if (existingUser.length > 0) {
    return Response.json({ error: 'E-mail já cadastrado como usuário de outra barbearia.' }, { status: 400 });
  }

  // Criar Company
  const company = await base44.asServiceRole.entities.Company.create({
    name: nome_fantasia || name,
    nome_fantasia, razao_social, cnpj, inscricao_estadual,
    email_contato, telefone_comercial, whatsapp, slug,
    endereco,
    owner_nome, owner_cpf, owner_email, owner_telefone, owner_data_nascimento,
    plano: plano || 'starter',
    ciclo: ciclo || 'mensal',
    valor, data_inicio, proximo_vencimento,
    status_cobranca: status_cobranca || 'trial',
    trial_ate, forma_pagamento, observacoes_internas,
    limite_usuarios: limite_usuarios || 3,
    status: 'active',
    onboarding_completed: false,
    onboarding_step: 1,
  });

  // Gerar senha e criar BarbeariaUser
  let senha_gerada = null;
  if (gerar_senha_automatica) {
    senha_gerada = generatePassword();
    const senha_hash = await hashPassword(senha_gerada);
    await base44.asServiceRole.entities.BarbeariaUser.create({
      barbearia_id: company.id,
      email: owner_email,
      senha_hash,
      role: 'owner',
      ativo: true,
      forcar_troca_senha: true,
    });
  }

  // Enviar e-mail de boas-vindas (best-effort: não quebra o fluxo se falhar)
  let email_enviado = false;
  if (enviar_credenciais_email && senha_gerada) {
    try {
      const adminUrl = `${req.headers.get('origin') || 'https://app.barbeiropro.ai'}/admin/login`;
      const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #F8F7F3; padding: 32px; border-radius: 12px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #1B3A4B; font-size: 24px; margin: 0;">Boas-vindas ao BarbeiroPro AI! ✂️</h1>
  </div>
  <p style="color: #333; font-size: 15px;">Olá, <strong>${owner_nome || 'responsável'}</strong>!</p>
  <p style="color: #333; font-size: 15px;">Sua barbearia <strong>${nome_fantasia || name}</strong> foi cadastrada com sucesso na plataforma BarbeiroPro AI.</p>
  <p style="color: #333; font-size: 15px;">Aqui estão suas credenciais de acesso:</p>
  <div style="background: #1B3A4B; color: white; padding: 20px; border-radius: 8px; margin: 24px 0;">
    <p style="margin: 0 0 8px 0; font-size: 13px; opacity: 0.7;">Link de acesso</p>
    <p style="margin: 0 0 16px 0; font-size: 14px;"><a href="${adminUrl}" style="color: #7CB9D4;">${adminUrl}</a></p>
    <p style="margin: 0 0 8px 0; font-size: 13px; opacity: 0.7;">Login (e-mail)</p>
    <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: bold;">${owner_email}</p>
    <p style="margin: 0 0 8px 0; font-size: 13px; opacity: 0.7;">Senha temporária</p>
    <p style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 2px;">${senha_gerada}</p>
  </div>
  <p style="color: #666; font-size: 13px;">⚠️ Por segurança, você será solicitado a trocar sua senha no primeiro acesso.</p>
  <p style="color: #666; font-size: 13px;">Esta senha é exibida apenas uma vez. Guarde-a com segurança.</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="color: #999; font-size: 12px; text-align: center;">BarbeiroPro AI — Gestão inteligente para barbearias</p>
</div>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: owner_email,
        subject: 'Boas-vindas ao BarbeiroPro AI — Suas credenciais de acesso',
        body: emailBody,
      });
      email_enviado = true;
    } catch (emailErr) {
      console.warn('E-mail não enviado (destinatário fora do app):', emailErr.message);
    }
  }

  return Response.json({
    success: true,
    company_id: company.id,
    senha_gerada: gerar_senha_automatica ? senha_gerada : null,
    email_enviado,
  });
});