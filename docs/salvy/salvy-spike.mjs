#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// SPIKE (throwaway) — prova de fluxo da API Salvy · 2026-07-06
// Objetivo: provar auth + leitura de números/SMS (OTP) SEM provisionar linha.
// Produção = portar para Supabase Edge Function (ver PARECER §7).
//
// A key NUNCA é impressa. Leia de env (docs/salvy/.env.local, gitignored):
//   set -a; source docs/salvy/.env.local; set +a; node docs/salvy/salvy-spike.mjs list
//
// Comandos SEGUROS (read-only, custo zero):
//   list                 GET  /api/v2/virtual-phone-accounts
//   ddd                  GET  /api/v2/virtual-phone-accounts/area-codes
//   get   <id>           GET  /api/v2/virtual-phone-accounts/{id}
//   sms   <id>           GET  /api/v2/virtual-phone-accounts/{id}/sms-messages
//
// Comandos BILLABLE (travados — exigem SALVY_ALLOW_CREATE=1):
//   create <areaCode> [name]   POST   /api/v2/virtual-phone-accounts   (provisiona linha real!)
//   cancel <id>                DELETE /api/v2/virtual-phone-accounts/{id}
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://api.salvy.com.br";
const KEY = process.env.SALVY_API_KEY;
const ALLOW_WRITE = process.env.SALVY_ALLOW_CREATE === "1";

const [cmd, ...args] = process.argv.slice(2);

function usage(msg) {
  if (msg) console.error(`\n⚠️  ${msg}\n`);
  console.log(`salvy-spike — prova de fluxo Salvy (read-only por padrão)

Uso:  node docs/salvy/salvy-spike.mjs <comando> [args]

  list                 lista todos os números virtuais
  ddd                  lista DDDs disponíveis em estoque
  get   <id>           detalhe de um número
  sms   <id>           lê SMS recebidos (é aqui que sai o OTP)
  create <ddd> [name]  🔒 provisiona linha (billable) — exige SALVY_ALLOW_CREATE=1
  cancel <id>          🔒 cancela linha            — exige SALVY_ALLOW_CREATE=1

Env: SALVY_API_KEY (obrigatória) · SALVY_ALLOW_CREATE=1 (só p/ create/cancel)`);
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → HTTP ${res.status} ${res.statusText}`);
  console.log(typeof json === "string" ? json : JSON.stringify(json, null, 2));
  if (!res.ok) process.exitCode = 1;
  return { status: res.status, json };
}

async function main() {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return usage();
  if (!KEY) return usage("SALVY_API_KEY ausente — crie a key no painel e grave em docs/salvy/.env.local");

  switch (cmd) {
    case "list": return void (await call("GET", "/api/v2/virtual-phone-accounts"));
    case "ddd":  return void (await call("GET", "/api/v2/virtual-phone-accounts/area-codes"));
    case "get":
      if (!args[0]) return usage("get exige <id>");
      return void (await call("GET", `/api/v2/virtual-phone-accounts/${args[0]}`));
    case "sms":
      if (!args[0]) return usage("sms exige <id>");
      return void (await call("GET", `/api/v2/virtual-phone-accounts/${args[0]}/sms-messages`));
    case "create": {
      if (!ALLOW_WRITE) return usage("create é BILLABLE e está travado. Rode com SALVY_ALLOW_CREATE=1 só quando decidir provisionar.");
      const ddd = Number(args[0]);
      if (!ddd) return usage("create exige <areaCode> numérico (ex: 11)");
      const payload = { areaCode: ddd };
      if (args[1]) payload.name = args.slice(1).join(" ");
      console.log(`\n🔒 PROVISIONANDO linha real no DDD ${ddd} (isto gera cobrança)…`);
      return void (await call("POST", "/api/v2/virtual-phone-accounts", payload));
    }
    case "cancel": {
      if (!ALLOW_WRITE) return usage("cancel está travado. Rode com SALVY_ALLOW_CREATE=1.");
      if (!args[0]) return usage("cancel exige <id>");
      console.log(`\n🔒 CANCELANDO linha ${args[0]}…`);
      return void (await call("DELETE", `/api/v2/virtual-phone-accounts/${args[0]}`));
    }
    default: return usage(`comando desconhecido: ${cmd}`);
  }
}

main().catch((e) => { console.error("erro:", e.message); process.exit(1); });
