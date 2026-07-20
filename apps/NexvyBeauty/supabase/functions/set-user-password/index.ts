// Troca a senha de um usuário — FERRAMENTA ADMINISTRATIVA, restrita a super_admin.
//
// ⚠️ HISTÓRICO (P0 corrigido em 2026-07-20): esta função aceitava {email, password}
// SEM verificar quem chamava. O gateway do Supabase aceita a anon key (pública,
// vai no bundle do front) como credencial válida, então qualquer pessoa na
// internet podia trocar a senha de QUALQUER conta — inclusive a do super_admin.
// Provado com curl + anon key: a função executava e respondia 404 só porque o
// e-mail da sonda não existia. Nunca remover a checagem abaixo.
//
// Quem precisa definir a própria senha no fim do onboarding usa
// `onboarding-set-password` (prova de posse = token do link de implantação).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── AUTORIZAÇÃO: só super_admin ────────────────────────────────────────
    // O header precisa ser um JWT de USUÁRIO. A anon key passa pelo gateway
    // mas não resolve getUser() → cai em 401 aqui, como deve.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);

    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: caller.id });
    if (!isSuper) {
      console.warn(`[set-user-password] NEGADO para ${caller.email ?? caller.id} (não super_admin)`);
      return json({ error: "forbidden" }, 403);
    }

    const { email, password } = await req.json().catch(() => ({}));
    if (!email || !password) return json({ error: "Email e senha obrigatórios" }, 400);
    if (String(password).length < 10) return json({ error: "weak_password" }, 400);

    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;

    const user = users.find((u) => (u.email || "").toLowerCase() === String(email).toLowerCase());
    if (!user) return json({ error: "Usuário não encontrado" }, 404);

    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password });
    if (updateErr) throw updateErr;

    console.log(`[set-user-password] senha trocada por super_admin ${caller.email} para ${email}`);
    return json({ ok: true, user_id: user.id });
  } catch (err: any) {
    console.error("[set-user-password] error:", err);
    return json({ ok: false, error: err.message || "Erro interno" }, 500);
  }
});
