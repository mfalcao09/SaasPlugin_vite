// Scripts + copy do first-contact. A LISTA de leads NÃO mora aqui —
// vive em platform_crm_lead_state.derived_stage = 'preselected'.

/** Texto aprovado Marcelo (exceção manual — sem ontem/anteontem). */
export const RENATA_RESUME_TEXT =
  "Oi, Renata! Desculpe, não consegui te responder na minha janela de atendimento. Mas vamos retomar por aqui!";

export const RENATA_PHONE = "5581993552037";

export type PilotLead = {
  order: number;
  phone: string;
  greeting: string;
  handle: string;
  /** true = já teve bolha 1; piloto manda retomada + 2–4. */
  resumeException: boolean;
  /** UUID canônico quando veio do DB. */
  leadId?: string;
};

/** Script bolhas 2–4 (mesmo roteiro APRESENTAR). */
export function apresentarBubbles234(handleBare: string): [string, string, string] {
  const at = handleBare.startsWith("@") ? handleBare : `@${handleBare}`;
  return [
    `Achei o seu número no Instagram ${at}, e vim me apresentar.`,
    "A NexvyBeauty é um sistema pra espaços de beleza feminina que responde suas clientes no WhatsApp, organiza a agenda e resgata clientes que não marcaram mais nenhum atendimento. Tudo automático, com atendimento por inteligência artificial de verdade — não chatbot de menuzinho.",
    "Você acha que faria diferença ter uma equipe de IA que atende os clientes, marca horário, confirma presença, encontra clientes que não voltaram, trabalhando para você, todos os dias?",
  ];
}

export function apresentarBubble1(greeting: string): string {
  return `Oi, ${greeting}! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️`;
}

export function pilotManualList(roster: readonly PilotLead[]): string[] {
  return roster.map((l) => l.phone);
}

export function findPilotLead(
  phone: string,
  roster: readonly PilotLead[],
): PilotLead | null {
  const d = phone.replace(/\D/g, "");
  return roster.find((l) => l.phone === d) ?? null;
}
