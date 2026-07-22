// Aplica o payload da submission nas tabelas reais. Idempotente via applied_refs.
// Autenticado via token público + session_token (para empresas externas) OU usuário admin logado.
//
// CONTRATO NOVO (wizard NexvyBeauty — espelha ImplantacaoPayload de src/hooks/useImplantacao.ts):
//   empresa      → organizations (name/cnpj/phone/instagram/website/logo_url/address/slug/settings.primary_color)
//   horarios     → business_hours (timezone + schedule)
//   servicos     → products tipo='servico' (servico_catalogo é VIEW sobre products; grava-se DIRETO
//                  em products com settings.preco_base/duracao_minutos — NUNCA sem tipo, senão o
//                  default do banco ('oferta') torna o serviço invisível pra Agenda/Booking/IA)
//   profissionais→ profissionais (shape de SalaoProfissionaisStep/Profissionais.tsx)
//   equipia      → product_agents (recepcionista IA; shape de useCreateAgent em useProductAgents.ts)
//   usuarios     → create-team-member (tolerante; Administrador/Gestor/Atendente → admin/manager/seller)
// Os blocos antigos do Vendus (negocios/agentes/setores/equipes) foram REMOVIDOS deste contrato.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

type Payload = {
  empresa?: {
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
    telefone?: string;
    instagram?: string;
    site?: string;
    logo_url?: string;
    slug?: string;
    cor_principal?: string;
    endereco?: any;
  };
  horarios?: { timezone?: string; schedule?: any };
  servicos?: Array<{ nome?: string; categoria?: string; duracao_min?: number; preco?: number }>;
  profissionais?: Array<{ nome?: string; especialidade?: string }>;
  equipia?: {
    nome?: string;
    tom?: string;
    /** Shape novo (wizard rodada 2): múltiplos agentes. Tem precedência sobre nome/tom legados. */
    agentes?: Array<{ nome?: string; tom?: string; papel?: string }>;
  };
  usuarios?: Array<{ nome?: string; email?: string; perfil?: string }>;
};

const DEFAULT_SCHEDULE = {
  monday: { enabled: true, start: "08:00", end: "18:00" },
  tuesday: { enabled: true, start: "08:00", end: "18:00" },
  wednesday: { enabled: true, start: "08:00", end: "18:00" },
  thursday: { enabled: true, start: "08:00", end: "18:00" },
  friday: { enabled: true, start: "08:00", end: "18:00" },
  saturday: { enabled: false, start: "08:00", end: "12:00" },
  sunday: { enabled: false, start: "08:00", end: "12:00" },
};

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Mesmo sanitizeSlug do GuidedOnboarding.tsx:253-255 (campo, preview e valor salvo idênticos).
function sanitizeSlug(v: string): string {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

// Normalização acento-insensível pra mapas PT→EN (tom do agente, perfil de usuário).
function normalizeKey(v: string): string {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Espelha TONE_MAP de src/components/admin/agents/AgentImportModal.tsx:47-52 (vocabulário
// canônico ToneStyle de src/types/agents.ts: formal|consultive|friendly|technical).
const TONE_MAP: Record<string, string> = {
  amigavel: "friendly", friendly: "friendly",
  formal: "formal",
  consultivo: "consultive", consultive: "consultive",
  tecnico: "technical", technical: "technical",
};

// Perfis do wizard → roles reais do create-team-member.
const PERFIL_MAP: Record<string, string> = {
  administrador: "admin", admin: "admin",
  gestor: "manager", manager: "manager",
  atendente: "seller", seller: "seller", vendedor: "seller",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const body = await req.json();
    const { submission_id, token, session_token } = body ?? {};

    let actorUserId: string | null = null;
    let sub: any = null;

    // ===== Fluxo público: token + session_token =====
    if (token && session_token) {
      const tokenHash = await sha256Hex(token);
      const { data: row, error: rErr } = await admin
        .from("onboarding_submissions").select("*").eq("token_hash", tokenHash).maybeSingle();
      if (rErr || !row) return json({ error: "invalid_token" }, 400);
      if (row.revoked_at) return json({ error: "link_revoked" }, 400);
      if (row.expires_at && new Date(row.expires_at) < new Date()) return json({ error: "expired_token" }, 400);
      if (row.session_token !== session_token) return json({ error: "link_already_in_use" }, 400);
      if (row.status === "applied") return json({ ok: true, already_applied: true });
      if (row.status !== "submitted") return json({ error: "not_submitted" }, 400);

      const { data: org } = await admin.from("organizations")
        .select("onboarding_completed_at, onboarding_locked").eq("id", row.organization_id).maybeSingle();
      if (org?.onboarding_completed_at || org?.onboarding_locked) {
        return json({ error: "already_applied" }, 400);
      }
      sub = row;
    } else {
      // ===== Fluxo autenticado (legado) =====
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await userClient.auth.getUser();
      const userId = u.user?.id;
      if (!userId) return json({ error: "Unauthorized" }, 401);
      actorUserId = userId;

      if (!submission_id) return json({ error: "submission_id required" }, 400);
      const { data: subRow, error: subErr } = await admin
        .from("onboarding_submissions").select("*").eq("id", submission_id).maybeSingle();
      if (subErr || !subRow) return json({ error: "not_found" }, 404);
      if (subRow.status === "applied") return json({ ok: true, already_applied: true });

      const { data: prof } = await admin.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
      const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
      if (!isSuper && prof?.organization_id !== subRow.organization_id) return json({ error: "forbidden" }, 403);

      const { data: org } = await admin.from("organizations")
        .select("onboarding_completed_at, onboarding_locked").eq("id", subRow.organization_id).maybeSingle();
      if (org?.onboarding_completed_at || org?.onboarding_locked) {
        return json({ error: "already_applied" }, 400);
      }
      sub = subRow;
    }

    const payload: Payload = sub.payload ?? {};
    const orgId = sub.organization_id;
    const refs: any = sub.applied_refs ?? {};
    const errors: string[] = [];
    // [B6] Falhas de LIMITE DE PLANO (agente/usuário além da quota) NÃO podem virar
    // "aviso" vago: a dona pagou por N e recebeu menos. Surfaçadas explicitamente.
    const quotaBlocks: string[] = [];
    const createdBy = actorUserId ?? sub.created_by ?? null;

    // ===== 1. EMPRESA =====
    try {
      const e = payload.empresa ?? {};

      // Read-merge das settings (padrão GuidedOnboarding.tsx:351-359): NÃO
      // sobrescreve outras chaves — só grava primary_color por cima.
      const { data: orgRow } = await admin.from("organizations")
        .select("settings, slug").eq("id", orgId).maybeSingle();

      const orgUpdate: any = {};
      if (e.nome_fantasia || e.razao_social) orgUpdate.name = e.nome_fantasia || e.razao_social;
      if (e.cnpj) orgUpdate.cnpj = e.cnpj;
      if (e.telefone) orgUpdate.phone = e.telefone;
      if (e.instagram) orgUpdate.instagram = e.instagram;
      if (e.site) orgUpdate.website = e.site;
      if (e.logo_url) orgUpdate.logo_url = e.logo_url;
      if (e.endereco) {
        const en: any = e.endereco;
        orgUpdate.address = {
          cep: en.cep ?? undefined,
          street: en.street ?? en.rua ?? undefined,
          number: en.number ?? en.numero ?? undefined,
          complement: en.complement ?? en.complemento ?? undefined,
          neighborhood: en.neighborhood ?? en.bairro ?? undefined,
          city: en.city ?? en.cidade ?? undefined,
          state: en.state ?? en.uf ?? undefined,
        };
      }
      if (e.cor_principal) {
        orgUpdate.settings = { ...(orgRow?.settings ?? {}), primary_color: e.cor_principal };
      }
      orgUpdate.onboarding_completed_at = new Date().toISOString();
      orgUpdate.onboarding_locked = true;
      const { error: upErr } = await admin.from("organizations").update(orgUpdate).eq("id", orgId);
      if (upErr) errors.push(`empresa: ${upErr.message}`);

      // Slug em escrita separada, com tratamento de colisão (porte do saveSlug de
      // GuidedOnboarding.tsx:316-337): tenta o slug pedido; se unique violation
      // (23505), anexa sufixo curto e tenta 1x mais. Colisão persistente vira aviso.
      const desired = sanitizeSlug(e.slug ?? "");
      if (desired && desired !== orgRow?.slug) {
        const first = await admin.from("organizations").update({ slug: desired }).eq("id", orgId);
        if (first.error) {
          if (first.error.code !== "23505") {
            errors.push(`empresa (slug): ${first.error.message}`);
          } else {
            const retrySlug = `${desired}-${Date.now().toString(36).slice(-4)}`;
            const second = await admin.from("organizations").update({ slug: retrySlug }).eq("id", orgId);
            if (second.error) {
              errors.push(second.error.code === "23505"
                ? `empresa (slug): o link "${desired}" já está em uso e não foi possível reservar uma variação`
                : `empresa (slug): ${second.error.message}`);
            }
          }
        }
      }
    } catch (err: any) { errors.push(`empresa: ${err.message}`); }

    // ===== 2. HORÁRIOS =====
    try {
      const h = payload.horarios ?? {};
      const tz = h.timezone || "America/Sao_Paulo";
      const schedule = h.schedule || DEFAULT_SCHEDULE;
      const { data: existing } = await admin.from("business_hours").select("id").eq("organization_id", orgId).maybeSingle();
      if (existing?.id) {
        await admin.from("business_hours").update({ timezone: tz, schedule }).eq("id", existing.id);
      } else {
        await admin.from("business_hours").insert({ organization_id: orgId, timezone: tz, schedule, out_of_hours_enabled: false, out_of_hours_message: "" });
      }
      // [BEAUTY] organizations NÃO tem coluna `timezone` — o fuso vive só em business_hours.timezone.
    } catch (err: any) { errors.push(`horarios: ${err.message}`); }

    // ===== 3. SERVIÇOS =====
    // servico_catalogo é uma VIEW sobre products (não versionada; só existe no banco).
    // Grava-se DIRETO em products com tipo='servico' — sem `tipo` o default do banco
    // ('oferta') deixa o serviço invisível pra Agenda/Booking/IA (bug histórico).
    // DEDUPE por organization_id + lower(name) + tipo='servico': o provisioning já
    // seeda 10 serviços-template (cakto-plan-provisioning.ts:443) e o wizard NÃO pode
    // duplicá-los — match existente vira UPDATE de settings/category.
    refs.servicos = refs.servicos ?? [];
    try {
      const { data: existingRows } = await admin.from("products")
        .select("id, name, category, settings")
        .eq("organization_id", orgId).eq("tipo", "servico");
      const byName = new Map<string, any>();
      for (const row of existingRows ?? []) {
        if (row?.name) byName.set(String(row.name).trim().toLowerCase(), row);
      }

      for (const s of payload.servicos ?? []) {
        const nome = s?.nome?.trim();
        if (!nome) continue;
        const key = nome.toLowerCase();
        const found = byName.get(key);

        if (found) {
          // Já existe (template do provisioning ou repetição no payload):
          // atualiza só o que o wizard trouxe, preservando as demais settings.
          const newSettings: any = { ...(found.settings ?? {}) };
          if (s.preco != null) newSettings.preco_base = s.preco;
          if (newSettings.preco_base == null) newSettings.preco_base = 0;
          if (s.duracao_min != null) newSettings.duracao_minutos = s.duracao_min;
          if (newSettings.duracao_minutos == null) newSettings.duracao_minutos = 30;
          const upd: any = { settings: newSettings, status: "published" };
          if (s.categoria) upd.category = s.categoria;
          const { error: uErr } = await admin.from("products").update(upd).eq("id", found.id);
          if (uErr) { errors.push(`servico ${nome}: ${uErr.message}`); continue; }
          found.settings = newSettings;
          if (!refs.servicos.includes(found.id)) refs.servicos.push(found.id);
          continue;
        }

        const { data: ins, error: iErr } = await admin.from("products").insert({
          organization_id: orgId,
          name: nome,
          tipo: "servico",
          status: "published",
          category: s.categoria ?? null,
          settings: { preco_base: s.preco ?? 0, duracao_minutos: s.duracao_min ?? 30 },
          created_by: createdBy,
        }).select("id").maybeSingle();
        if (iErr) { errors.push(`servico ${nome}: ${iErr.message}`); continue; }
        if (ins?.id) {
          refs.servicos.push(ins.id);
          byName.set(key, {
            id: ins.id, name: nome, category: s.categoria ?? null,
            settings: { preco_base: s.preco ?? 0, duracao_minutos: s.duracao_min ?? 30 },
          });
        }
      }
    } catch (err: any) { errors.push(`servicos: ${err.message}`); }

    // ===== 4. PROFISSIONAIS =====
    // Shape das telas reais: SalaoProfissionaisStep.tsx:38 ({organization_id, nome,
    // ativo}) + Profissionais.tsx:115 (especialidades: string[]). Dedupe por
    // (organization_id, lower(nome)).
    refs.profissionais = refs.profissionais ?? [];
    try {
      const { data: existingProfs } = await admin.from("profissionais")
        .select("id, nome").eq("organization_id", orgId);
      const profByName = new Map<string, string>();
      for (const row of existingProfs ?? []) {
        if (row?.nome) profByName.set(String(row.nome).trim().toLowerCase(), row.id);
      }

      for (const p of payload.profissionais ?? []) {
        const nome = p?.nome?.trim();
        if (!nome) continue;
        const key = nome.toLowerCase();
        const existingId = profByName.get(key);
        if (existingId) {
          if (!refs.profissionais.includes(existingId)) refs.profissionais.push(existingId);
          continue;
        }
        const { data: ins, error: iErr } = await admin.from("profissionais").insert({
          organization_id: orgId,
          nome,
          ativo: true,
          especialidades: p.especialidade?.trim() ? [p.especialidade.trim()] : [],
        }).select("id").maybeSingle();
        if (iErr) { errors.push(`profissional ${nome}: ${iErr.message}`); continue; }
        if (ins?.id) {
          refs.profissionais.push(ins.id);
          profByName.set(key, ins.id);
        }
      }
    } catch (err: any) { errors.push(`profissionais: ${err.message}`); }

    // ===== 5. EQUIPE IA (recepcionista) =====
    // Segue o shape de criação do tenant (useCreateAgent em src/hooks/useProductAgents.ts:90-196:
    // defaults explícitos + is_default automático no 1º agente do produto). O AgentEditor do
    // tenant (src/components/admin/agents/AgentEditor.tsx:142,171) exige produto-âncora pra
    // tipos não-globais → ancora no 1º product tipo='servico' da org (inclui os do bloco 3;
    // se não houver nenhum, product_id=null — o schema aceita, é como useCreateAgent grava
    // agentes globais). Idempotente: se a org já tem agente ATIVO com o mesmo nome, só
    // atualiza o tom.
    refs.agents = refs.agents ?? [];
    try {
      const eq = payload.equipia ?? {};
      // Shape novo (agentes[]) tem precedência; sem ele, cai no legado {nome, tom}
      // — submissions em voo continuam aplicáveis. Sempre ≥1 item no loop.
      const agentList = (Array.isArray(eq.agentes) && eq.agentes.length > 0
        ? eq.agentes
        : [{ nome: eq.nome, tom: eq.tom, papel: "" }])
        .map((a) => ({
          nome: a?.nome?.trim() || "Lia",
          tom: a?.tom || "amigavel",
          papel: (a?.papel ?? "").trim(),
        }));

      // Produto-âncora resolvido UMA vez (1º serviço da org).
      const { data: anchor } = await admin.from("products")
        .select("id").eq("organization_id", orgId).eq("tipo", "servico")
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      const anchorId = anchor?.id ?? null;

      for (const a of agentList) {
        const agentName = a.nome;
        const tone = TONE_MAP[normalizeKey(a.tom)] ?? "friendly";

        const { data: existingAgent } = await admin.from("product_agents")
          .select("id").eq("organization_id", orgId).eq("is_active", true)
          .ilike("name", agentName).maybeSingle();

        if (existingAgent?.id) {
          const { error: uErr } = await admin.from("product_agents")
            .update({ tone_style: tone, ...(a.papel ? { primary_objective: a.papel } : {}) })
            .eq("id", existingAgent.id);
          if (uErr) errors.push(`equipe IA ${agentName}: ${uErr.message}`);
          if (!refs.agents.includes(existingAgent.id)) refs.agents.push(existingAgent.id);
          continue;
        }

        // is_default automático no 1º agente do produto (espelha useCreateAgent);
        // recontado a cada inserção — só o 1º da lista o recebe num produto vazio.
        let isDefault = false;
        if (anchorId) {
          const { count } = await admin.from("product_agents")
            .select("id", { count: "exact", head: true }).eq("product_id", anchorId);
          isDefault = (count ?? 0) === 0;
        }

        const { data: ag, error: aErr } = await admin.from("product_agents").insert({
          name: agentName,
          product_id: anchorId,
          organization_id: orgId,
          created_by: createdBy,
          // primary_objective é NOT NULL; o `papel` do wizard (o que a agente
          // faz) vira a missão; sem papel, fallback '' (padrão do useCreateAgent).
          primary_objective: a.papel || "",
          agent_type: "custom",
          can_do: [],
          cannot_do: [],
          // [B5] Agente nascia sem rota de escalonamento (triggers vazios + can_transfer=false)
          // → a cliente que pedia "quero falar com uma pessoa" falava com o robô pra sempre.
          // Defaults sãos para salão; a dona pode ajustar/remover depois.
          handoff_triggers: [
            "A cliente pede explicitamente para falar com uma pessoa, atendente ou humano",
            "A cliente reclama, está insatisfeita, irritada ou ameaça cancelar",
            "Cobrança errada, reembolso ou problema de pagamento que você não resolve",
            "Você não consegue responder mesmo consultando a base de conhecimento",
          ],
          end_conversation_triggers: [],
          tone_style: tone,
          message_style: "balanced",
          always_end_with_question: true,
          required_phrases: [],
          prohibited_phrases: [],
          auto_tag_leads: true,
          default_tags: [],
          can_update_pipeline: true,
          can_create_tasks: true,
          can_schedule_meetings: true,
          can_apply_tags: false,
          can_update_lead: false,
          can_send_emails: false,
          can_send_materials: false,
          can_trigger_flows: false,
          can_transfer: true, // [B5] liga a tool transfer_to_human (gated por can_transfer em webchat-bot:2659)
          can_notify: false,
          can_add_notes: false,
          can_start_cadence: false,
          can_qualify: false,
          tool_configs: {},
          active_in_funnels: true,
          active_in_chat: true,
          active_in_widget: true,
          active_in_inbox: true,
          active_in_copilot: false,
          active_in_whatsapp: true,
          active_in_instagram: true,
          active_in_facebook: true,
          is_active: true,
          is_default: isDefault,
          activation_keywords: [],
          activation_phrases: [],
          activation_priority: 0,
          activation_scope: "all",
          takeover_on_match: true,
          evolution_instance_id: null,
          humanization: {},
        }).select("id").maybeSingle();
        if (aErr) {
          // [B6] Falha por LIMITE do plano (trigger enforce_max_ai_agents) vira bloco
          // EXPLÍCITO — a dona precisa saber que o agente não entrou por causa da quota,
          // não por um "aviso" genérico. Outras falhas seguem como warning técnico.
          if (/limite|plano|m[aá]ximo|\bmax\b|excede|quota|agentes/i.test(aErr.message)) {
            quotaBlocks.push(`O agente "${agentName}" não foi criado: o limite de agentes de IA do seu plano foi atingido. Faça upgrade para ativá-lo.`);
          } else {
            errors.push(`equipe IA ${agentName}: ${aErr.message}`);
          }
        }
        if (ag?.id) refs.agents.push(ag.id);
      }
    } catch (err: any) { errors.push(`equipe IA: ${err.message}`); }

    // ===== 6. USUÁRIOS =====
    // Bloco tolerante via create-team-member. [BEAUTY] O contrato dessa EF exige
    // `password` (o onboarding não coleta senha) e autentica o CHAMADOR via getUser()
    // — no fluxo público não há chamador. Na prática este bloco NÃO provisiona membros
    // no fluxo público; as falhas ficam em errors[] pro admin completar depois pela
    // tela de equipe. Mantido 1:1 com o comportamento anterior, só remapeando o
    // contrato novo (nome/email/perfil).
    refs.invitations = refs.invitations ?? [];
    try {
      for (const m of payload.usuarios ?? []) {
        if (!m?.email) continue;
        const role = PERFIL_MAP[normalizeKey(m.perfil || "")] ?? "seller";
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-team-member`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
            body: JSON.stringify({
              email: m.email,
              full_name: m.nome ?? m.email,
              role,
              organization_id: orgId,
            }),
          });
          if (resp.ok) {
            const j = await resp.json().catch(() => ({}));
            const memberRef = j?.invitation_id ?? j?.user_id;
            if (memberRef) refs.invitations.push(memberRef);
          } else {
            const t = await resp.text().catch(() => "");
            errors.push(`usuario ${m.email}: create-team-member ${resp.status} ${t}`);
          }
        } catch (e: any) { errors.push(`usuario ${m.email}: ${e.message}`); }
      }
    } catch (err: any) { errors.push(`usuarios: ${err.message}`); }

    // ===== Finaliza =====
    await admin.from("onboarding_submissions").update({
      status: "applied",
      applied_at: new Date().toISOString(),
      applied_by: actorUserId,
      applied_refs: refs,
      error_message: errors.length ? errors.join(" | ") : null,
    }).eq("id", sub.id);

    // Garante que a org fique travada
    await admin.from("organizations").update({
      onboarding_locked: true,
      onboarding_completed_at: new Date().toISOString(),
    }).eq("id", orgId);

    // Audit
    // [BEAUTY] platform_audit_logs NÃO tem coluna organization_id; o vínculo se dá por
    // entity_type/entity_id. Mapeado organization_id -> { entity_type: "organization", entity_id }.
    try {
      await admin.from("platform_audit_logs").insert({
        action: "onboarding_applied",
        actor_id: actorUserId,
        entity_type: "organization",
        entity_id: orgId,
        metadata: { submission_id: sub.id, warnings: errors.length },
      });
    } catch { /* ignore */ }

    // [BEAUTY] admin_notifications no Beauty não tem severity/category/is_read (omitidos) e `type` é
    // enum notification_type (cadence|urgency|opportunity|audit|system) — usa-se "system".
    try {
      await admin.from("admin_notifications").insert({
        organization_id: orgId,
        type: "system",
        title: "Implantação concluída",
        message: `Empresa concluiu o onboarding.${errors.length ? ` Com ${errors.length} aviso(s).` : ""}`,
      });
    } catch { /* ignore */ }

    return json({ ok: true, refs, warnings: errors, quota_blocks: quotaBlocks });
  } catch (e: any) {
    console.error("[apply-onboarding]", e);
    return json({ error: e.message ?? String(e) }, 500);
  }
});
