// cakto-zero-trial — WRITE. Zera o trial (trial_days=0) de TODAS as ofertas
// ATIVAS com trial>0 dos produtos reais, via API Cakto. Decisão do Marcelo
// (2026-07-23): sem trial; caixa entra na hora. Arrependimento CDC ≠ trial.
//
// SEGURO: só toca ofertas status='active' com trial_days>0. Preserva TODOS os
// campos da oferta (retrieve → PUT), muda só trial_days. Não afeta assinantes
// já ativos (o trial deles já passou); só vale para novas compras. Idempotente:
// rodar de novo em oferta já com trial 0 = no-op (ela nem entra no filtro).
//
// Invocação: service_role (via vault). Aceita ?dry_run=1 para simular sem gravar.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { ensureCaktoToken, caktoGet, caktoPut } from '../_shared/cakto-client.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function authOk(auth: string | null, serviceKey: string): boolean {
  if (!auth?.startsWith('Bearer ')) return false;
  const tok = auth.slice(7).trim();
  if (serviceKey && tok === serviceKey) return true;
  try {
    return JSON.parse(atob(tok.split('.')[1]))?.role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!authOk(req.headers.get('Authorization'), SERVICE_KEY)) return json({ error: 'service_role required' }, 401);

  const dryRun = new URL(req.url).searchParams.get('dry_run') === '1';
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: cred } = await admin.from('cakto_credentials').select('*').eq('scope', 'platform').maybeSingle();
    if (!cred?.client_secret) return json({ error: 'sem credencial platform utilizável' }, 400);

    const token = await ensureCaktoToken(admin, cred);

    const { data: planos } = await admin
      .from('platform_plans')
      .select('slug, cakto_product_id')
      .not('cakto_product_id', 'is', null);

    const resultados: any[] = [];

    for (const pl of planos ?? []) {
      let lista: any;
      try {
        lista = await caktoGet(token, `/public_api/offers/?product=${encodeURIComponent(pl.cakto_product_id)}`);
      } catch (e) {
        resultados.push({ plano: pl.slug, erro_listagem: String(e).slice(0, 150) });
        continue;
      }
      const ofertas = Array.isArray(lista?.results) ? lista.results : Array.isArray(lista) ? lista : [];

      for (const o of ofertas) {
        const trial = Number(o.trial_days ?? 0);
        // SÓ ativas com trial>0. O resto é ignorado (idempotência natural).
        if (String(o.status).toLowerCase() !== 'active' || trial <= 0) continue;

        const item: any = { plano: pl.slug, oferta_slug: o.id, nome: o.name, trial_antes: trial };

        if (dryRun) {
          item.acao = 'DRY-RUN (nada gravado)';
          resultados.push(item);
          continue;
        }

        // Retrieve completo para preservar todos os campos requeridos no PUT.
        let full: any;
        try {
          full = await caktoGet(token, `/public_api/offers/${o.id}/`);
        } catch {
          full = o; // fallback: usa o que veio da lista
        }

        const body: any = {
          name: full.name,
          price: Number(full.price),
          product: String(full.product ?? pl.cakto_product_id),
          status: 'active',
          trial_days: 0,
        };
        if (full.type) body.type = full.type;
        if (full.intervalType) body.intervalType = full.intervalType;
        if (full.interval != null) body.interval = Number(full.interval);
        if (full.recurrence_period != null) body.recurrence_period = Number(full.recurrence_period);
        if (full.quantity_recurrences != null) body.quantity_recurrences = Number(full.quantity_recurrences);

        try {
          const updated = await caktoPut(token, `/public_api/offers/${o.id}/`, body);
          item.trial_depois = updated?.trial_days ?? 0;
          item.ok = Number(updated?.trial_days ?? 0) === 0;
        } catch (e) {
          item.ok = false;
          item.erro = String(e).slice(0, 200);
        }
        resultados.push(item);
      }
    }

    const alteradas = resultados.filter((r) => r.ok === true).length;
    const falhas = resultados.filter((r) => r.ok === false).length;

    return json({
      ok: falhas === 0,
      dry_run: dryRun,
      total_alvos: resultados.length,
      alteradas,
      falhas,
      resultados,
    });
  } catch (e) {
    return json({ error: String(e).slice(0, 400) }, 500);
  }
});
