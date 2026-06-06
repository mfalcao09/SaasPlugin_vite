import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
  for (let i = 4; i < 12; i++) pwd.push(all[Math.floor(Math.random() * all.length)]);
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
}

async function hashPassword(password) {
  const salt = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256$${salt}$${hashHex}`;
}

async function verifyPassword(password, hash) {
  const parts = hash.split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256') return false;
  const [, salt, storedHash] = parts;
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === storedHash;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { action } = body;

  // ── LOGIN ──
  if (action === 'login') {
    const { email, senha } = body;
    const users = await base44.asServiceRole.entities.BarbeariaUser.filter({ email });
    if (!users.length) return Response.json({ error: 'Credenciais inválidas' }, { status: 401 });
    const bu = users[0];
    if (!bu.ativo) return Response.json({ error: 'Usuário inativo' }, { status: 403 });

    const valid = await verifyPassword(senha, bu.senha_hash);
    if (!valid) return Response.json({ error: 'Credenciais inválidas' }, { status: 401 });

    // Verificar status da barbearia
    const companies = await base44.asServiceRole.entities.Company.filter({ id: bu.barbearia_id });
    const company = companies[0];
    if (company && (company.status === 'blocked' || company.status_cobranca === 'suspenso' || company.status_cobranca === 'cancelado')) {
      return Response.json({ error: 'acesso_suspenso', company_status: company.status_cobranca || company.status }, { status: 403 });
    }

    // Atualizar último login
    await base44.asServiceRole.entities.BarbeariaUser.update(bu.id, { ultimo_login: new Date().toISOString() });

    return Response.json({
      success: true,
      user: { id: bu.id, email: bu.email, role: bu.role, barbearia_id: bu.barbearia_id, forcar_troca_senha: bu.forcar_troca_senha },
      company: company ? { id: company.id, name: company.name, slug: company.slug } : null,
    });
  }

  // ── FORGOT PASSWORD ──
  if (action === 'forgot_password') {
    const { email } = body;
    const users = await base44.asServiceRole.entities.BarbeariaUser.filter({ email });
    if (!users.length) return Response.json({ success: true }); // não revelar se existe

    const bu = users[0];
    const token = crypto.randomUUID().replace(/-/g, '');
    const expira = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h
    await base44.asServiceRole.entities.BarbeariaUser.update(bu.id, { token_reset: token, token_reset_expira_em: expira });

    const resetUrl = `${body.origin || 'https://app.barbeiropro.ai'}/admin/reset-senha?token=${token}`;
    const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #F8F7F3; padding: 32px; border-radius: 12px;">
  <h2 style="color: #1B3A4B;">Redefinição de senha</h2>
  <p>Clique no link abaixo para redefinir sua senha. O link expira em 2 horas.</p>
  <a href="${resetUrl}" style="display: inline-block; background: #1B3A4B; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">Redefinir senha</a>
  <p style="color: #999; font-size: 12px;">Se você não solicitou isso, ignore este e-mail.</p>
</div>`;

    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: 'BarbeiroPro AI — Redefinição de senha',
        body: emailBody,
      });
    } catch (emailErr) {
      console.warn('E-mail não enviado:', emailErr.message);
    }

    return Response.json({ success: true });
  }

  // ── RESET PASSWORD ──
  if (action === 'reset_password') {
    const { token, nova_senha } = body;
    const users = await base44.asServiceRole.entities.BarbeariaUser.filter({ token_reset: token });
    if (!users.length) return Response.json({ error: 'Token inválido' }, { status: 400 });
    const bu = users[0];
    if (new Date(bu.token_reset_expira_em) < new Date()) {
      return Response.json({ error: 'Token expirado' }, { status: 400 });
    }
    const senha_hash = await hashPassword(nova_senha);
    await base44.asServiceRole.entities.BarbeariaUser.update(bu.id, {
      senha_hash, token_reset: null, token_reset_expira_em: null, forcar_troca_senha: false
    });
    return Response.json({ success: true });
  }

  // ── CHANGE PASSWORD (primeiro acesso) ──
  if (action === 'change_password') {
    const { user_id, nova_senha } = body;
    const senha_hash = await hashPassword(nova_senha);
    await base44.asServiceRole.entities.BarbeariaUser.update(user_id, {
      senha_hash, forcar_troca_senha: false
    });
    return Response.json({ success: true });
  }

  // ── REENVIAR CREDENCIAIS (master admin) ──
  if (action === 'reenviar_credenciais') {
    const base44auth = createClientFromRequest(req);
    const masterUser = await base44auth.auth.me();
    if (!masterUser || masterUser.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { company_id } = body;
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id });
    if (!companies.length) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    const company = companies[0];

    const users = await base44.asServiceRole.entities.BarbeariaUser.filter({ barbearia_id: company_id, role: 'owner' });
    if (!users.length) return Response.json({ error: 'Owner não encontrado' }, { status: 404 });
    const bu = users[0];

    const nova_senha = generatePassword();
    const senha_hash = await hashPassword(nova_senha);
    await base44.asServiceRole.entities.BarbeariaUser.update(bu.id, { senha_hash, forcar_troca_senha: true });

    const adminUrl = `${body.origin || 'https://app.barbeiropro.ai'}/admin/login`;
    const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #F8F7F3; padding: 32px; border-radius: 12px;">
  <h2 style="color: #1B3A4B;">Credenciais reenviadas — BarbeiroPro AI</h2>
  <p>Aqui estão suas novas credenciais de acesso:</p>
  <div style="background: #1B3A4B; color: white; padding: 20px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 0 0 8px 0; font-size: 13px; opacity: 0.7;">Link</p>
    <p style="margin: 0 0 12px 0;"><a href="${adminUrl}" style="color: #7CB9D4;">${adminUrl}</a></p>
    <p style="margin: 0 0 8px 0; font-size: 13px; opacity: 0.7;">Login</p>
    <p style="margin: 0 0 12px 0; font-weight: bold;">${bu.email}</p>
    <p style="margin: 0 0 8px 0; font-size: 13px; opacity: 0.7;">Nova senha temporária</p>
    <p style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 2px;">${nova_senha}</p>
  </div>
  <p style="color: #666; font-size: 13px;">⚠️ Você será solicitado a trocar sua senha no próximo acesso.</p>
</div>`;

    let email_enviado = false;
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: bu.email,
        subject: 'BarbeiroPro AI — Credenciais reenviadas',
        body: emailBody,
      });
      email_enviado = true;
    } catch (emailErr) {
      console.warn('E-mail não enviado:', emailErr.message);
    }

    return Response.json({ success: true, nova_senha, email_enviado });
  }

  // ── FORÇAR RESET DE SENHA (master admin) ──
  if (action === 'forcar_reset_senha') {
    const masterUser = await base44.auth.me();
    if (!masterUser || masterUser.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { user_id } = body;
    await base44.asServiceRole.entities.BarbeariaUser.update(user_id, { forcar_troca_senha: true });
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Ação desconhecida' }, { status: 400 });
});