/**
 * C9 — Motor de extração de leads Instagram-first
 * SPIKE: "Actor de query" — busca DENTRO dos seguidores por palavra-chave.
 *
 * Objetivo: replicar o que o app do IG faz quando você abre os seguidores de
 * um perfil e digita "manicure" na caixa de busca — o servidor devolve SÓ os
 * seguidores que casam, sem baixar a lista inteira ("pagar só pelo rio, não
 * pelo oceano").
 *
 * Endpoint confirmado (2026-07-13) — fontes no relatório PROTOTIPO-ACTOR-QUERY-IG:
 *   1. Resolução username -> user_id:
 *      GET https://i.instagram.com/api/v1/users/web_profile_info/?username=<u>
 *      Header obrigatório: x-ig-app-id: 936619743392459  (web app id)
 *      -> guest-acessível (sem login), mas frágil a partir de IP datacenter.
 *
 *   2. Busca dentro dos seguidores (o "rio"):
 *      GET https://www.instagram.com/api/v1/friendships/<user_id>/followers/
 *          ?count=<n>&search_surface=follow_list_page&query=<kw>&enable_groups=true
 *          [&max_id=<cursor>]
 *      Header: x-ig-app-id: 936619743392459 + x-csrftoken + cookie sessionid.
 *      -> ATENÇÃO: este endpoint exige SESSÃO AUTENTICADA (private_request no
 *         instagrapi). Logout/guest bate em login-wall (401/403/redirect).
 *         O filtro `query` é aplicado SERVER-SIDE — é isso que economiza banda.
 *
 * Runtime: escrito para rodar direto no Node 24 (type-stripping nativo) OU Deno.
 * Sem dependências. Para virar Apify Actor: trocar o parse de args por
 * Actor.getInput(), plugar o proxy residencial em `fetch` (Actor.createProxyConfiguration)
 * e injetar sessionid de um pool de contas.
 *
 * NUNCA hardcode sessionid. Este script lê de env (IG_SESSIONID / IG_CSRFTOKEN).
 * Sem env => roda em modo GUEST (serve para PROVAR o login-wall empiricamente).
 *
 * Uso:
 *   node c9-follower-query-prototype.ts <username> <keyword> [maxPages]
 *   IG_SESSIONID=... IG_CSRFTOKEN=... node c9-follower-query-prototype.ts unhass.decoradas manicure 2
 */

// ----------------------------------------------------------------------------
// Config / constantes
// ----------------------------------------------------------------------------

const IG_APP_ID = "936619743392459"; // x-ig-app-id do web app do Instagram (público, não é segredo)
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// Cursor de paginação do IG: max_id retornado no corpo. String opaca.
type Cursor = string | null;

interface MatchedFollower {
  pk: string;
  username: string;
  full_name: string;
  is_private: boolean;
  is_verified: boolean;
}

interface FollowerSearchPage {
  matches: MatchedFollower[];
  nextCursor: Cursor;
  rawCount: number;
}

// ----------------------------------------------------------------------------
// Runtime shim (Node <-> Deno) — apenas args e env
// ----------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
const g: any = globalThis as any;
function argv(): string[] {
  if (g.Deno?.args) return g.Deno.args as string[];
  return g.process?.argv?.slice(2) ?? [];
}
function env(key: string): string | undefined {
  if (g.Deno?.env) return g.Deno.env.get(key) ?? undefined;
  return g.process?.env?.[key];
}

// ----------------------------------------------------------------------------
// HTTP helpers
// ----------------------------------------------------------------------------

/** Monta o header Cookie a partir dos segredos de env (nunca logamos o valor). */
function buildCookie(): string | null {
  const sid = env("IG_SESSIONID");
  const csrf = env("IG_CSRFTOKEN");
  if (!sid) return null; // modo guest
  const parts = [`sessionid=${sid}`];
  if (csrf) parts.push(`csrftoken=${csrf}`);
  return parts.join("; ");
}

function baseHeaders(referer: string): Record<string, string> {
  const h: Record<string, string> = {
    "x-ig-app-id": IG_APP_ID,
    "x-requested-with": "XMLHttpRequest",
    "user-agent": UA,
    "accept": "*/*",
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    "referer": referer,
  };
  const csrf = env("IG_CSRFTOKEN");
  if (csrf) h["x-csrftoken"] = csrf;
  const cookie = buildCookie();
  if (cookie) h["cookie"] = cookie;
  return h;
}

/** Detecta login-wall / challenge a partir do status + corpo. */
function detectBlock(status: number, bodyText: string): string | null {
  if (status === 401) return "401 Unauthorized (login-wall: endpoint exige sessão)";
  if (status === 403) return "403 Forbidden (bloqueio/login-wall ou IP reprovado)";
  if (status === 429) return "429 Too Many Requests (rate limit)";
  const lower = bodyText.slice(0, 2000).toLowerCase();
  if (lower.includes("challenge_required")) return "challenge_required (checkpoint)";
  if (lower.includes("login_required")) return "login_required";
  if (lower.includes("please wait a few minutes")) return "soft-block: 'please wait a few minutes'";
  if (lower.includes("<!doctype html") && status === 200) return "HTML login-wall (não-JSON)";
  return null;
}

// ----------------------------------------------------------------------------
// Passo 1 — resolver username -> user_id (guest, x-ig-app-id)
// ----------------------------------------------------------------------------

async function resolveUserId(
  username: string,
): Promise<{ userId: string; followerCount: number | null }> {
  const url =
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: baseHeaders(`https://www.instagram.com/${username}/`),
  });
  const text = await res.text();
  const block = detectBlock(res.status, text);
  if (block) {
    throw new Error(`web_profile_info bloqueado: HTTP ${res.status} — ${block}`);
  }
  if (!res.ok) {
    throw new Error(`web_profile_info HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`web_profile_info devolveu não-JSON (provável login-wall): ${text.slice(0, 200)}`);
  }
  const user = json?.data?.user;
  if (!user?.id) throw new Error("web_profile_info sem data.user.id (schema mudou?)");
  return {
    userId: String(user.id),
    followerCount: user?.edge_followed_by?.count ?? null,
  };
}

// ----------------------------------------------------------------------------
// Passo 2 — buscar dentro dos seguidores por keyword (server-side query)
// ----------------------------------------------------------------------------

async function searchFollowersPage(
  userId: string,
  username: string,
  keyword: string,
  count: number,
  cursor: Cursor,
): Promise<FollowerSearchPage> {
  const params = new URLSearchParams({
    count: String(count),
    search_surface: "follow_list_page", // superfície = caixa de busca da lista de seguidores
    query: keyword, // <-- FILTRO server-side: só volta quem casa
    enable_groups: "true",
  });
  if (cursor) params.set("max_id", cursor);

  const url =
    `https://www.instagram.com/api/v1/friendships/${userId}/followers/?${params.toString()}`;
  const res = await fetch(url, {
    headers: baseHeaders(`https://www.instagram.com/${username}/followers/`),
  });
  const text = await res.text();
  const block = detectBlock(res.status, text);
  if (block) {
    throw new Error(`follower-search bloqueado: HTTP ${res.status} — ${block}`);
  }
  if (!res.ok) {
    throw new Error(`follower-search HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`follower-search devolveu não-JSON (login-wall?): ${text.slice(0, 200)}`);
  }
  const users: any[] = Array.isArray(json?.users) ? json.users : [];
  const matches: MatchedFollower[] = users.map((u) => ({
    pk: String(u.pk ?? u.pk_id ?? ""),
    username: u.username ?? "",
    full_name: u.full_name ?? "",
    is_private: !!u.is_private,
    is_verified: !!u.is_verified,
  }));
  // O IG devolve next_max_id só quando há mais páginas.
  const nextCursor: Cursor = json?.next_max_id ? String(json.next_max_id) : null;
  return { matches, nextCursor, rawCount: users.length };
}

// ----------------------------------------------------------------------------
// Orquestração
// ----------------------------------------------------------------------------

async function main() {
  const [username, keyword, maxPagesRaw] = argv();
  if (!username || !keyword) {
    console.error(
      "uso: node c9-follower-query-prototype.ts <username> <keyword> [maxPages]",
    );
    (g.process?.exit ?? g.Deno?.exit)?.(2);
    return;
  }
  const maxPages = Math.max(1, Math.min(Number(maxPagesRaw) || 1, 5)); // trava de segurança: <=5 páginas
  const mode = env("IG_SESSIONID") ? "AUTENTICADO (sessionid via env)" : "GUEST (sem login)";

  console.error(`[spike] alvo=@${username} keyword="${keyword}" maxPages=${maxPages} modo=${mode}`);

  // Passo 1
  const { userId, followerCount } = await resolveUserId(username);
  console.error(`[spike] user_id=${userId} followers_total=${followerCount ?? "?"}`);

  // Passo 2 — paginação básica com trava
  const all: MatchedFollower[] = [];
  let cursor: Cursor = null;
  let requests = 0;
  for (let page = 0; page < maxPages; page++) {
    const p: FollowerSearchPage = await searchFollowersPage(
      userId,
      username,
      keyword,
      50,
      cursor,
    );
    requests++;
    all.push(...p.matches);
    console.error(
      `[spike] page ${page + 1}: ${p.matches.length} matches (raw ${p.rawCount}) cursor=${p.nextCursor ? "sim" : "fim"}`,
    );
    cursor = p.nextCursor;
    if (!cursor) break;
  }

  // Saída: só handles públicos (username, full_name) — sem PII sensível.
  const out = {
    target: username,
    keyword,
    user_id: userId,
    follower_count: followerCount,
    requests_to_followers_endpoint: requests,
    matched: all.length,
    results: all.map((m) => ({
      username: m.username,
      full_name: m.full_name,
      is_verified: m.is_verified,
      is_private: m.is_private,
    })),
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(`[spike][ERRO] ${err?.message ?? err}`);
  (g.process?.exit ?? g.Deno?.exit)?.(1);
});
