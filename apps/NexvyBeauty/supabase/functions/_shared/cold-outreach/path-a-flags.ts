// Path A feature flags (pure + Deno.env reader).
// Defaults: both OFF. F3 uses REOPEN_INTENT_V1_MODE=shadow locally / evidence only.

export type PathAMode = "off" | "shadow" | "enforce";

export function parsePathAMode(raw: string | null | undefined): PathAMode {
  const v = String(raw ?? "off").trim().toLowerCase();
  if (v === "shadow" || v === "enforce") return v;
  return "off";
}

export function getReopenIntentMode(
  envGet: (k: string) => string | undefined = (k) =>
    typeof Deno !== "undefined" ? Deno.env.get(k) : undefined,
): PathAMode {
  return parsePathAMode(envGet("REOPEN_INTENT_V1_MODE"));
}

export function getR2AutoMode(
  envGet: (k: string) => string | undefined = (k) =>
    typeof Deno !== "undefined" ? Deno.env.get(k) : undefined,
): PathAMode {
  return parsePathAMode(envGet("R2_AUTO_V1_MODE"));
}

/** Comma-separated E.164 digits (no +) or conversation ids. Empty = no allowlist match. */
export function parseAllowlist(raw: string | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of String(raw ?? "").split(",")) {
    const t = part.trim().replace(/^\+/, "").replace(/\D/g, "") || part.trim();
    if (t) set.add(t);
  }
  return set;
}

export function isPathAAllowlisted(input: {
  phoneDigits?: string | null;
  conversationId?: string | null;
  allowlistRaw?: string | null;
}): boolean {
  let raw = input.allowlistRaw;
  if (raw === undefined) {
    try {
      raw = typeof Deno !== "undefined"
        ? Deno.env.get("REOPEN_INTENT_V1_ALLOWLIST")
        : undefined;
    } catch {
      // Tests without --allow-env: empty allowlist (fail-closed).
      raw = undefined;
    }
  }
  const list = parseAllowlist(raw);
  if (list.size === 0) return false;
  const phone = String(input.phoneDigits ?? "").replace(/\D/g, "");
  if (phone && list.has(phone)) return true;
  const cid = String(input.conversationId ?? "").trim();
  if (cid && list.has(cid)) return true;
  return false;
}

function readEnvAllowlist(key: string): Set<string> {
  try {
    return parseAllowlist(
      typeof Deno !== "undefined" ? Deno.env.get(key) : undefined,
    );
  } catch {
    return new Set();
  }
}

/** R2 canary: union of R2_AUTO_V1_ALLOWLIST and REOPEN_INTENT_V1_ALLOWLIST. Empty → fail-closed. */
export function isR2Allowlisted(input: {
  phoneDigits?: string | null;
  conversationId?: string | null;
  r2AllowlistRaw?: string | null;
  reopenAllowlistRaw?: string | null;
}): boolean {
  const r2List = input.r2AllowlistRaw !== undefined
    ? parseAllowlist(input.r2AllowlistRaw)
    : readEnvAllowlist("R2_AUTO_V1_ALLOWLIST");
  const reopenList = input.reopenAllowlistRaw !== undefined
    ? parseAllowlist(input.reopenAllowlistRaw)
    : readEnvAllowlist("REOPEN_INTENT_V1_ALLOWLIST");
  if (r2List.size === 0 && reopenList.size === 0) return false;
  const phone = String(input.phoneDigits ?? "").replace(/\D/g, "");
  if (phone && (r2List.has(phone) || reopenList.has(phone))) return true;
  const cid = String(input.conversationId ?? "").trim();
  if (cid && (r2List.has(cid) || reopenList.has(cid))) return true;
  return false;
}

