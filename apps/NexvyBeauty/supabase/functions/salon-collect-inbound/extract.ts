// ─── salon-collect-inbound / extract — núcleo DETERMINÍSTICO (TS puro, testável) ─
// Extrai o valor de um campo do cadastro a partir da resposta do cliente no
// WhatsApp. Regex primeiro (confiança 1.0 → grava direto); o que a regex não
// pega, o index.ts manda pro LLM (fallback, confiança < 1.0 → pede confirmação).
//
// SEM DB, SEM rede, SEM LLM aqui — só parsing puro, pra dar pra testar o loop
// fechado com dados semeados (deno test) sem tocar no banco live.

export type Campo = 'data_nascimento' | 'endereco' | 'email' | 'cpf_cnpj'

// Prioridade de coleta (Decisão 2 do blueprint): nascimento destrava o
// aniversário (maior ROI); cpf por último (dado sensível, não perseguir).
export const CAMPO_PRIORIDADE: Campo[] = ['data_nascimento', 'endereco', 'email', 'cpf_cnpj']

export interface ExtractResult {
  /** Valor pronto pra gravar em clientes.<campo> (ISO/canônico), ou null se não deu. */
  value: string | null
  /** 0..1. 1.0 = regex casou formato exato (grava direto). <1.0 = pede confirmação. */
  confidence: number
  /** endereco: quando a resposta é um CEP, o index expande via BrasilAPI. */
  cep?: string
}

const strip = (s: string) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// ── datas ────────────────────────────────────────────────────────────────────
const MESES: Record<string, number> = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4,
  maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8,
  setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12,
}
const pad2 = (n: number) => String(n).padStart(2, '0')

// Ano de 2 dígitos → século plausível pra NASCIMENTO: yy > ano-atual%100 vira 19yy.
function century(yy: number): number {
  const cur = new Date().getFullYear() % 100
  return yy > cur ? 1900 + yy : 2000 + yy
}
function validYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
function isoDate(y: number, m: number, d: number): string | null {
  return validYMD(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null
}

/** Data de nascimento → ISO YYYY-MM-DD. Só confiança 1.0 quando há ANO (a coluna
 *  é `date`; sem ano não dá pra gravar). DD/MM sem ano → confiança 0.5 (index
 *  pede o ano). */
function extractNascimento(text: string): ExtractResult {
  const t = strip(text)
  // DD/MM/YYYY | DD-MM-YYYY | DD.MM.YYYY (ano 2 ou 4 dígitos)
  const m1 = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})\b/)
  if (m1) {
    const d = +m1[1], mo = +m1[2]
    const y = m1[3].length === 2 ? century(+m1[3]) : +m1[3]
    const iso = isoDate(y, mo, d)
    if (iso) return { value: iso, confidence: 1.0 }
  }
  // "12 de março de 1990" | "12 de marco" (sem ano)
  const m2 = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,9})(?:\s*(?:de\s+)?(\d{4}))?\b/)
  if (m2 && MESES[m2[2]]) {
    const d = +m2[1], mo = MESES[m2[2]]
    if (m2[3]) {
      const iso = isoDate(+m2[3], mo, d)
      if (iso) return { value: iso, confidence: 1.0 }
    }
    // sem ano → não grava direto; sinaliza pro index pedir o ano
    if (validYMD(2000, mo, d)) return { value: `--${pad2(mo)}-${pad2(d)}`, confidence: 0.5 }
  }
  // DD/MM sem ano
  const m3 = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})\b/)
  if (m3) {
    const d = +m3[1], mo = +m3[2]
    if (validYMD(2000, mo, d)) return { value: `--${pad2(mo)}-${pad2(d)}`, confidence: 0.5 }
  }
  return { value: null, confidence: 0 }
}

// ── e-mail ───────────────────────────────────────────────────────────────────
function extractEmail(text: string): ExtractResult {
  const m = (text ?? '').match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i)
  return m ? { value: m[0].toLowerCase(), confidence: 1.0 } : { value: null, confidence: 0 }
}

// ── CPF/CNPJ (dígitos; validação de comprimento — não persegue por carona) ─────
function extractCpfCnpj(text: string): ExtractResult {
  const digits = (text ?? '').replace(/\D/g, '')
  if (digits.length === 11 || digits.length === 14) return { value: digits, confidence: 1.0 }
  return { value: null, confidence: 0 }
}

// ── endereço: prioriza CEP (1 pergunta, BrasilAPI deduz o resto — minimização) ─
function extractEndereco(text: string): ExtractResult {
  const cepM = (text ?? '').match(/\b(\d{5})[\-\s.]?(\d{3})\b/)
  if (cepM) return { value: null, confidence: 1.0, cep: cepM[1] + cepM[2] }
  // Texto livre com "rua/av/travessa/..." → confiança baixa, index confirma.
  if (/\b(rua|r\.|av\.?|avenida|travessa|alameda|rodovia|estrada|pra[cç]a)\b/i.test(text ?? '')) {
    const v = (text ?? '').trim()
    if (v.length >= 6) return { value: v, confidence: 0.5 }
  }
  return { value: null, confidence: 0 }
}

export function extractField(campo: Campo, text: string): ExtractResult {
  switch (campo) {
    case 'data_nascimento': return extractNascimento(text)
    case 'email': return extractEmail(text)
    case 'cpf_cnpj': return extractCpfCnpj(text)
    case 'endereco': return extractEndereco(text)
  }
}

// ── intenção do cliente (confirmação / recusa / opt-out) ───────────────────────
const AFFIRM = /\b(sim|isso|isso mesmo|exato|exatamente|correto|confirmo|confirmado|pode|pode ser|positivo|aham|ok|okay|isso ai|perfeito|certo)\b/
const NEGATE = /\b(nao|errado|negativo|incorreto|nada disso|nada a ver)\b/
// Recusa / não-perturbe (LGPD Art. 18 — oposição)
const DECLINE = /\b(nao quero|prefiro nao|para de|parem de|nao me manda|nao me mande|descadastr|me remove|remover|sair da lista|nao quero receber|me tira)\b/

export function isAffirmative(text: string): boolean {
  const t = strip(text)
  return AFFIRM.test(t) || /👍|✅|🙌|😊/.test(text ?? '')
}
export function isNegative(text: string): boolean {
  return NEGATE.test(strip(text)) || /👎|❌/.test(text ?? '')
}
export function isDecline(text: string): boolean {
  return DECLINE.test(strip(text))
}

/** Escolhe a pendência de MAIOR prioridade entre as abertas do cliente. */
export function pickTopRequest<T extends { campo: string }>(reqs: T[]): T | null {
  for (const campo of CAMPO_PRIORIDADE) {
    const hit = reqs.find((r) => r.campo === campo)
    if (hit) return hit
  }
  return reqs[0] ?? null
}
