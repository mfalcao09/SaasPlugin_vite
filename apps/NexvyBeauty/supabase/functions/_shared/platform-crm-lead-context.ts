// platform-crm-lead-context.ts — PRD-03 canonical lead context
//
// Módulo compartilhado: parsing/building/loading do contexto canônico de lead
// (`platform_crm_lead_state`). Expõe apenas funções PURAS aqui; operações de
// DB ficam em platform-crm-find-create-lead.ts e nos RPCs SECURITY DEFINER.
//
// Fail-closed: qualquer caminho sem estado retorna isReady=false. O brain NÃO
// pode ter acesso ao estado de outro produto (context isolation por product_id).
//
// CAS (Compare-And-Swap): verifyCasVersion impede que duas turns concorrentes
// sobrescrevam mutuamente o estado. O RPC `platform_crm_lead_state_cas_patch`
// no banco repete essa checagem atomicamente.

import {
  foldName,
  isGenericGreetingName,
  looksLikePhoneDigits,
} from "./cold-outreach/camila-display-name.ts";

// Tokens de negócio — subconjunto estável do GENERIC do camila-display-name.
// Mantido aqui para o check multi-token de buildLeadName sem duplicar o SET completo.
const GENERIC_BUSINESS_TOKENS = new Set([
  "lash",
  "lashes",
  "expert",
  "studio",
  "nail",
  "nails",
  "beauty",
  "make",
  "maquiagem",
  "sobrancelha",
  "sobrancelhas",
  "designer",
  "clinica",
  "clínica",
  "spa",
  "estetica",
  "estética",
  "beleza",
  "cílios",
  "cilios",
  "extensão",
  "extensao",
  "extensoes",
  "extensões",
  "noiva",
  "noivas",
  "micro",
  "makeup",
  "make",
  "penteado",
  "salao",
  "salão",
  "unhas",
  "unha",
  "saude",
  "saúde",
]);

/**
 * Retorna true quando TODOS os tokens significativos (tamanho ≥ 3, fora de
 * preposições e siglas de estados) são palavras de categoria de negócio.
 * Distingue "Lash Expert" (genérico) de "Jeissiane Castro Nail" (nome real).
 */
function isAllTokensGeneric(raw: string): boolean {
  const folded = foldName(raw);
  const tokens = folded.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  return tokens.every((t) => GENERIC_BUSINESS_TOKENS.has(t));
}

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface LeadStateRow {
  id: string;
  lead_id: string;
  product_id: string;
  version: number;
  summary: string | null;
  derived_stage: string | null;
  next_action: string | null;
  facts: Record<string, unknown>;
  objections: unknown[];
  commitments: unknown[];
  consents: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LeadContext {
  leadId: string;
  productId: string;
  state: LeadStateRow | null;
  isReady: boolean;
  safeGreetingName: string | null;
}

export interface LeadMemoryRow {
  lead_id: string;
  product_id: string;
  content: string;
  memory_type: string;
  is_active: boolean;
  confidence: number;
}

// Sentinela fail-closed: qualquer código que receba este objeto sabe que o
// estado não está disponível e deve abortar ou degradar graciosamente.
export const FAIL_CLOSED_CONTEXT = {
  isReady: false,
  state: null,
} as const;

// ── Funções puras ─────────────────────────────────────────────────────────────

/**
 * Verifica se o estado existe e está pronto para ser consumido.
 * Fail-closed: null → false. Nunca lança.
 */
export function isContextReady(state: LeadStateRow | null): boolean {
  return state !== null;
}

/**
 * Assertion: lança quando o estado é null/inválido.
 * Use antes de qualquer operação que dependa do estado.
 */
export function assertContextReady(
  state: LeadStateRow | null,
): asserts state is LeadStateRow {
  if (!state) {
    throw new Error(
      "lead_state not found — contexto não está pronto (fail-closed)",
    );
  }
}

/**
 * Constrói o LeadContext completo. Nunca lança; retorna fail-closed se state
 * é null ou se product_id não combina.
 */
export function buildLeadContextFromState(
  state: LeadStateRow | null,
  leadId: string,
  productId: string,
): LeadContext {
  if (!state || state.product_id !== productId) {
    return {
      leadId,
      productId,
      state: null,
      isReady: false,
      safeGreetingName: null,
    };
  }
  return {
    leadId,
    productId,
    state,
    isReady: true,
    safeGreetingName: null, // será preenchido pelo caller com pickCamilaGreetingName
  };
}

/**
 * CAS version check (pure). Lança com mensagem greppável se versões não batem.
 * O RPC no banco replica esta lógica atomicamente — esta função é usada em testes
 * e para validação prévia antes da call ao RPC.
 */
export function verifyCasVersion(
  currentVersion: number,
  expectedVersion: number,
): void {
  if (currentVersion !== expectedVersion) {
    throw new Error(
      `version mismatch: current=${currentVersion} expected=${expectedVersion} — ` +
        `estado foi modificado por outra turn; recarregue antes de atualizar`,
    );
  }
}

/**
 * Chave de idempotência determinística para uma memória derivada de mensagem.
 * Formato: `msg:<conversationId>:<messageId>` — único por mensagem.
 * Duas calls com mesmos parâmetros sempre produzem a mesma string.
 */
export function makeIdempotencyKey(
  conversationId: string,
  messageId: string,
): string {
  return `msg:${conversationId}:${messageId}`;
}

/**
 * Nome seguro para o lead a partir do push_name do WhatsApp.
 * Rejeita: nomes genéricos de salão ("Studio", "Lash", "Nail"), strings
 * que parecem telefones, vazios. Fallback: "WhatsApp <phone>".
 */
export function buildLeadName(
  pushName: string | null | undefined,
  phonePlus: string,
): string {
  const raw = String(pushName ?? "").trim();
  if (!raw) return `WhatsApp ${phonePlus}`;
  if (looksLikePhoneDigits(raw)) return `WhatsApp ${phonePlus}`;
  // Single-token generic check (existing behaviour: "Studio", "Lash", etc.)
  if (isGenericGreetingName(raw)) return `WhatsApp ${phonePlus}`;
  // Multi-token: ALL tokens are business category words → still generic
  // e.g. "Lash Expert", "nail nails", "Sobrancelha Designer"
  if (isAllTokensGeneric(raw)) return `WhatsApp ${phonePlus}`;
  return raw;
}

/**
 * Parseia e valida a shape de um raw DB row para LeadStateRow.
 * Retorna null se o objeto estiver malformado ou com campos obrigatórios faltando.
 * Tolerante a campos JSONB null → coerce para arrays/objetos vazios.
 */
export function parseLeadState(raw: unknown): LeadStateRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.lead_id !== "string" ||
    typeof r.product_id !== "string"
  ) {
    return null;
  }

  return {
    id: r.id as string,
    lead_id: r.lead_id as string,
    product_id: r.product_id as string,
    version: typeof r.version === "number" ? r.version : 0,
    summary: typeof r.summary === "string" ? r.summary : null,
    derived_stage: typeof r.derived_stage === "string" ? r.derived_stage : null,
    next_action: typeof r.next_action === "string" ? r.next_action : null,
    facts: r.facts && typeof r.facts === "object" && !Array.isArray(r.facts)
      ? (r.facts as Record<string, unknown>)
      : {},
    objections: Array.isArray(r.objections) ? r.objections : [],
    commitments: Array.isArray(r.commitments) ? r.commitments : [],
    consents: r.consents && typeof r.consents === "object" &&
        !Array.isArray(r.consents)
      ? (r.consents as Record<string, unknown>)
      : {},
    created_at: typeof r.created_at === "string" ? r.created_at : "",
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };
}

function renderJson(value: unknown): string {
  if (value == null) return "";
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  ) return "";
  if (Array.isArray(value) && value.length === 0) return "";
  return JSON.stringify(value);
}

/**
 * Ficha canônica pronta para prompt. Memórias inativas, de outra lead ou de
 * outro produto são eliminadas antes da renderização.
 */
export function formatCanonicalLeadContext(input: {
  state: LeadStateRow;
  leadId: string;
  productId: string;
  memories: LeadMemoryRow[];
}): string {
  if (
    input.state.lead_id !== input.leadId ||
    input.state.product_id !== input.productId
  ) {
    return "";
  }
  const memories = input.memories.filter((memory) =>
    memory.is_active &&
    memory.lead_id === input.leadId &&
    memory.product_id === input.productId &&
    memory.content.trim().length > 0
  );
  const lines = [
    input.state.summary ? `Resumo: ${input.state.summary}` : "",
    input.state.derived_stage
      ? `Estágio derivado: ${input.state.derived_stage}`
      : "",
    input.state.next_action
      ? `Próxima ação autorizada: ${input.state.next_action}`
      : "",
    renderJson(input.state.facts)
      ? `Fatos: ${renderJson(input.state.facts)}`
      : "",
    renderJson(input.state.objections)
      ? `Objeções: ${renderJson(input.state.objections)}`
      : "",
    renderJson(input.state.commitments)
      ? `Compromissos: ${renderJson(input.state.commitments)}`
      : "",
    renderJson(input.state.consents)
      ? `Consentimentos: ${renderJson(input.state.consents)}`
      : "",
    ...memories.map((memory) =>
      `Memória (${memory.memory_type}, confiança ${memory.confidence}): ${memory.content}`
    ),
  ].filter(Boolean);
  // Estado válido sempre rende ficha versionada — mesmo vazia (lead nova).
  return [
    "FICHA CANÔNICA DESTA LEAD",
    `lead_id=${input.leadId}`,
    `product_id=${input.productId}`,
    `version=${input.state.version}`,
    "Use somente nesta conversa. Nunca generalize para outra lead.",
    ...(lines.length
      ? lines
      : ["(ficha ainda sem fatos — conduza descoberta; não invente dados da lead)"]),
  ].join("\n");
}

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

/** Cria o estado vazio uma vez; conflito significa que o estado já existe. */
export async function ensureCanonicalLeadState(
  supabase: RpcClient,
  leadId: string,
  productId: string,
): Promise<boolean> {
  if (!leadId || !productId) return false;
  const { data, error } = await supabase.rpc(
    "platform_crm_lead_state_cas_patch",
    {
      p_lead_id: leadId,
      p_product_id: productId,
      p_expected_version: 0,
      p_patch: {},
    },
  );
  if (error) {
    console.error(
      "[canonical-lead-state] ensure failed:",
      error.message ?? "unknown",
    );
    return false;
  }
  const result = asRecord(data);
  return result.ok === true ||
    (result.conflict === true && Number(result.current_version) >= 1);
}

export interface LoadedCanonicalLeadContext {
  isReady: boolean;
  state: LeadStateRow | null;
  memories: LeadMemoryRow[];
  prompt: string;
  error: string | null;
}

function parseLeadMemory(raw: unknown): LeadMemoryRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.lead_id !== "string" ||
    typeof row.product_id !== "string" ||
    typeof row.content !== "string" ||
    typeof row.memory_type !== "string"
  ) return null;
  return {
    lead_id: row.lead_id,
    product_id: row.product_id,
    content: row.content,
    memory_type: row.memory_type,
    is_active: row.is_active !== false,
    confidence: typeof row.confidence === "number" ? row.confidence : 0,
  };
}

/** Carrega a ficha via RPC service-role e falha fechado se o estado não existe. */
export async function loadCanonicalLeadContext(
  supabase: RpcClient,
  leadId: string,
  productId: string,
): Promise<LoadedCanonicalLeadContext> {
  const fail = (error: string | null): LoadedCanonicalLeadContext => ({
    isReady: false,
    state: null,
    memories: [],
    prompt: "",
    error,
  });
  if (!leadId || !productId) return fail("missing_lead_or_product");
  const { data, error } = await supabase.rpc(
    "platform_crm_lead_context_read",
    { p_lead_id: leadId, p_product_id: productId, p_limit: 20 },
  );
  if (error) return fail(error.message ?? "context_read_failed");
  const result = asRecord(data);
  const state = parseLeadState(result.state);
  const context = buildLeadContextFromState(state, leadId, productId);
  if (!context.isReady || !state) return fail("canonical_state_not_ready");
  const memories = Array.isArray(result.memories)
    ? result.memories.map(parseLeadMemory).filter(
      (memory: LeadMemoryRow | null): memory is LeadMemoryRow =>
        memory !== null,
    )
    : [];
  return {
    isReady: true,
    state,
    memories,
    prompt: formatCanonicalLeadContext({
      state,
      memories,
      leadId,
      productId,
    }),
    error: null,
  };
}

export async function appendCanonicalLeadMemory(
  supabase: RpcClient,
  input: {
    leadId: string;
    productId: string;
    conversationId: string;
    messageId: string;
    content: string;
    memoryType?: string;
    confidence?: number;
  },
): Promise<boolean> {
  const content = input.content.trim();
  if (
    !input.leadId || !input.productId || !input.conversationId ||
    !input.messageId || !content
  ) return false;
  const { data, error } = await supabase.rpc(
    "platform_crm_lead_memory_append",
    {
      p_lead_id: input.leadId,
      p_product_id: input.productId,
      p_idempotency_key: makeIdempotencyKey(
        input.conversationId,
        input.messageId,
      ),
      p_source_message_id: input.messageId,
      p_conversation_id: input.conversationId,
      p_source_type: "message",
      p_memory_type: input.memoryType ?? "context",
      p_content: content,
      p_confidence: input.confidence ?? 1,
      p_valid_until: null,
      p_supersede_ids: null,
      p_embedding: null,
    },
  );
  if (error) {
    console.error(
      "[canonical-lead-memory] append failed:",
      error.message ?? "unknown",
    );
    return false;
  }
  return asRecord(data).ok === true;
}
