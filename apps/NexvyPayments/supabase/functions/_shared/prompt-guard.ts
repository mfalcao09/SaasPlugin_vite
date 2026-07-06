// _shared/prompt-guard.ts
//
// Prompt-Injection Shield — Entregável D5 / Seção 11.3 do CLAUDE.md.
// Todo endpoint (ou tool) que recebe input livre e o repassa a um LLM DEVE
// passar por `guardPromptInput()` ANTES de montar o prompt.
// Callers: impl/renegociar.ts (input.motivo/observacao), impl/consultar_fatura.ts
// (input.pergunta) e __tests__/prompt-guard.test.ts.
//
// Contrato (Seção 11.3, três controles obrigatórios):
//   1) Limite de caracteres (default 8.000) — anti token-flood.
//   2) Blocklist de padrões de injeção — instruction_override / jailbreak /
//      exfil / recon. Detecção por regex robusta a espaço/case/pontuação.
//   3) Log estruturado SEM expor a query completa — só um preview truncado +
//      hash de correlação (SHA-256), para permitir investigação sem vazar PII
//      nem o payload de ataque em claro nos logs.
//
// NÃO é um sanitizer que "limpa" o texto e segue — é um GATE binário: bloqueia
// e sinaliza. O caller decide o handoff/erro. Isso segue a nota da Seção 11.3:
// comentários-isca contra IA têm eficácia baixa; o controle eficaz é detectar +
// alertar (aqui: bloquear + logar com hash de correlação).
//
// ISOLAMENTO: puro (zero rede, zero import de supabase). Testável com
// `deno test --no-check` sem stub de fetch. O log usa console.warn — o caller
// pode, adicionalmente, persistir em platform_audit_logs / billing_events.

export const PROMPT_INPUT_MAX_CHARS = 8000;

export type InjectionCategory =
  | 'instruction_override'
  | 'jailbreak'
  | 'exfil'
  | 'recon';

export interface PromptGuardResult {
  /** true = input seguro para repassar ao LLM. */
  ok: boolean;
  /** Preenchido quando ok === false. */
  reason?: 'too_long' | 'injection' | 'empty';
  /** Categoria de injeção detectada (só quando reason === 'injection'). */
  category?: InjectionCategory;
  /** Padrão que casou (para o log; nunca o input inteiro). */
  matchedPattern?: string;
  /** Tamanho do input em chars. */
  length: number;
  /** Hash de correlação (SHA-256 hex) — liga o log ao input sem expô-lo. */
  correlationHash: string;
}

// ---------------------------------------------------------------------------
// Blocklist. Cada entrada tem categoria + regex. As regexes toleram espaços,
// hífens e pontuação entre tokens para não serem burladas com "ig-nore" /
// "system prompt". Flag `iu`: case-insensitive + Unicode — IMPORTANTE porque
// `\w` do JS NÃO casa acentos (ç/õ/ú...), então "instruções" quebraria `instru\w+`.
// Usamos `[\p{L}]*` (qualquer letra Unicode) no lugar de `\w` onde há PT-BR.
// Ordem importa: a PRIMEIRA regra que casa define a categoria — por isso o probe
// SQL (recon) vem ANTES de dump_secrets (exfil), senão "SELECT * FROM
// billing_credentials" cairia em exfil pelo "credential" no nome da tabela.
// ---------------------------------------------------------------------------
interface InjectionRule {
  category: InjectionCategory;
  label: string;
  re: RegExp;
}

const INJECTION_RULES: InjectionRule[] = [
  // 1) instruction_override — tenta descartar/sobrescrever as instruções.
  //    Duas ordens de tokens: EN "ignore previous instructions" e PT
  //    "ignore as instruções anteriores" (instruções vem ANTES de anteriores).
  { category: 'instruction_override', label: 'ignore_previous_en',
    re: /ignor[\p{L}]*[\s\S]{0,20}(previous|prior|above|acima|anterior[\p{L}]*|todas?\s+as)[\s\S]{0,20}(instru[\p{L}]*|prompt|regras?|rules?)/iu },
  { category: 'instruction_override', label: 'ignore_previous_pt',
    re: /ignor[\p{L}]*[\s\S]{0,25}(instru[\p{L}]*|prompt|regras?|rules?|mensage[\p{L}]*)[\s\S]{0,20}(previous|prior|above|acima|anterior[\p{L}]*|todas?)/iu },
  { category: 'instruction_override', label: 'disregard_instructions',
    re: /(disregard|forget|esque[çc]a|desconsidere)[\s\S]{0,20}(instru[\p{L}]*|prompt|rules?|regras?|contexto)/iu },
  { category: 'instruction_override', label: 'override_system',
    re: /(override|overwrite|substitua|sobrescrev[\p{L}]*|reset)[\s\S]{0,15}(system|instru[\p{L}]*|prompt|comportamento)/iu },
  { category: 'instruction_override', label: 'new_instructions',
    re: /(new|novas?)[\s\S]{0,10}(instru[\p{L}]*|rules?|regras?)[\s\S]{0,10}(:|são|are|follow|siga)/iu },

  // 2) jailbreak — assume persona sem restrições / modo DAN / role fake.
  { category: 'jailbreak', label: 'system_role_inject',
    re: /(system|developer)[\s_-]*(prompt|message|role)[\s\S]{0,10}[:=]/iu },
  { category: 'jailbreak', label: 'you_are_now',
    re: /(you\s+are\s+now|voc[êe]\s+(agora\s+)?é|a\s+partir\s+de\s+agora\s+voc[êe])[\s\S]{0,45}(dan|jailbroken|sem\s+restri[\p{L}]*|no\s+restrictions|unfiltered|admin|root)/iu },
  { category: 'jailbreak', label: 'dan_mode',
    re: /\b(dan\s+mode|modo\s+dan|do\s+anything\s+now|jailbreak[\p{L}]*)\b/iu },
  { category: 'jailbreak', label: 'pretend_bypass',
    re: /(pretend|finja|imagine|act\s+as|atue\s+como)[\s\S]{0,25}(no\s+rules|sem\s+regras|no\s+restrictions|sem\s+restri[\p{L}]*|unrestricted)/iu },

  // 3) recon — mapeia a infra / tabelas / tools (probe SQL vem PRIMEIRO;
  //    ver nota de ordem acima).
  { category: 'recon', label: 'sql_probe',
    re: /(select\s+[\s\S]{0,40}\s+from|drop\s+table|union\s+select|information_schema|pg_catalog|;\s*--)/iu },
  { category: 'recon', label: 'list_tools_tables',
    re: /(list|liste|enumerate|enumere|quais\s+(são\s+)?(as\s+)?)[\s\S]{0,15}(tools?|ferramentas?|tables?|tabelas?|endpoints?|schemas?|colunas?)/iu },

  // 4) exfil — tenta extrair o prompt de sistema / segredos / credenciais.
  { category: 'exfil', label: 'reveal_prompt',
    re: /(reveal|print|repeat|show|mostre|revele|imprima|repita|exiba)[\s\S]{0,25}(system\s*prompt|prompt\s+de\s+sistema|your\s+instru[\p{L}]*|suas?\s+instru[\p{L}]*|initial\s+prompt|instru[\p{L}]*\s+iniciais)/iu },
  { category: 'exfil', label: 'dump_secrets',
    re: /(api[\s_-]*key|api[\s_-]*secret|service[\s_-]*role|senha|password|token|credencial|credential|client[\s_-]*secret|env(ironment)?\s*var[\p{L}]*)/iu },
  { category: 'exfil', label: 'exfiltrate',
    re: /(exfiltr[\p{L}]*|send\s+(all\s+)?(the\s+)?(data|everything|it)|envie\s+(tudo|os?\s+dados))[\s\S]{0,25}(http|url|webhook|externo|external|para\s+o?\s*e-?mail)/iu },
];

// ---------------------------------------------------------------------------
// Hash de correlação (SHA-256 hex). WebCrypto está disponível no runtime Deno/
// Edge sem permissões extras. Assíncrono, mas barato.
// ---------------------------------------------------------------------------
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Preview seguro: primeiros 80 chars, sem quebras de linha, nunca o payload todo. */
function safePreview(input: string): string {
  return input.slice(0, 80).replace(/\s+/g, ' ').trim();
}

/**
 * Gate principal. Retorna `ok:false` + motivo quando o input deve ser BLOQUEADO.
 * Loga (console.warn) de forma estruturada com hash de correlação — NUNCA o
 * input inteiro. O caller é responsável por transformar isso em erro/handoff e,
 * se quiser, persistir num audit log de plataforma.
 *
 * @param input      texto livre vindo do usuário/lead
 * @param opts.maxChars  override do teto (default 8000)
 * @param opts.context   rótulo curto p/ o log (ex.: 'tool:renegociar')
 */
export async function guardPromptInput(
  input: string,
  opts?: { maxChars?: number; context?: string },
): Promise<PromptGuardResult> {
  const maxChars = opts?.maxChars ?? PROMPT_INPUT_MAX_CHARS;
  const context = opts?.context ?? 'prompt-guard';
  const text = input ?? '';
  const length = text.length;
  const correlationHash = await sha256Hex(text);

  if (length === 0) {
    logBlocked(context, 'empty', correlationHash, length, '');
    return { ok: false, reason: 'empty', length, correlationHash };
  }

  if (length > maxChars) {
    logBlocked(context, 'too_long', correlationHash, length, safePreview(text));
    return { ok: false, reason: 'too_long', length, correlationHash };
  }

  for (const rule of INJECTION_RULES) {
    if (rule.re.test(text)) {
      logBlocked(
        context,
        `injection:${rule.category}:${rule.label}`,
        correlationHash,
        length,
        safePreview(text),
      );
      return {
        ok: false,
        reason: 'injection',
        category: rule.category,
        matchedPattern: rule.label,
        length,
        correlationHash,
      };
    }
  }

  return { ok: true, length, correlationHash };
}

function logBlocked(
  context: string,
  verdict: string,
  hash: string,
  length: number,
  preview: string,
) {
  // Estruturado, sem query completa. `preview` já é truncado+achatado.
  console.warn(
    `[prompt-guard] BLOCKED context=${context} verdict=${verdict} ` +
      `len=${length} corr=${hash.slice(0, 16)} preview=${JSON.stringify(preview)}`,
  );
}
