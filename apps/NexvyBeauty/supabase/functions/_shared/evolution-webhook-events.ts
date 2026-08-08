// ─── Eventos de webhook da Evolution — FONTE ÚNICA ──────────────────────────
//
// POR QUE ESTE ARQUIVO EXISTE (incidente 2026-08-07)
// A lista de eventos estava duplicada em três lugares (evolution-proxy,
// platform-evolution-proxy, demo-evolution). Em 20/07 a cópia da demo ganhou
// `MESSAGING_HISTORY_SET` — nome de evento do **Baileys** (`messaging-history.set`),
// a biblioteca por baixo. A Evolution NÃO tem esse nome no enum dela: ela reexpõe
// aquele evento como MESSAGES_SET / CONTACTS_SET / CHATS_SET.
//
// A API valida a lista INTEIRA: um nome inválido em treze faz o POST /webhook/set
// devolver 400 e **nenhum** evento é registrado. Não é degradação parcial — é zero.
// Ficou 18 dias assim porque o chamador guardava só `webhook_subscribed: wh.ok`,
// jogando fora o status e a mensagem que nomeavam o culpado.
//
// REGRA: nenhuma lista de eventos literal fora daqui. Quem precisar de um conjunto
// diferente exporta uma constante NOVA neste arquivo — assim a divergência fica
// visível num diff, em vez de crescer escondida numa terceira cópia.

/**
 * Enum aceito pelo servidor, copiado VERBATIM da resposta 400 da própria Evolution
 * em 2026-08-07 (`webhook.events[9] is not one of enum values: ...`). É a fonte
 * autoritativa: não foi deduzido de documentação nem de memória.
 *
 * Se a Evolution for atualizada, este enum pode mudar. O jeito de reconferir é
 * mandar um evento propositalmente inválido e ler a lista que ela devolve no erro.
 */
export const EVOLUTION_EVENT_ENUM = [
  "APPLICATION_STARTUP",
  "QRCODE_UPDATED",
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_EDITED",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "SEND_MESSAGE",
  "SEND_MESSAGE_UPDATE",
  "CONTACTS_SET",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "PRESENCE_UPDATE",
  "CHATS_SET",
  "CHATS_UPSERT",
  "CHATS_UPDATE",
  "CHATS_DELETE",
  "GROUPS_UPSERT",
  "GROUP_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
  "CONNECTION_UPDATE",
  "LABELS_EDIT",
  "LABELS_ASSOCIATION",
  "CALL",
  "TYPEBOT_START",
  "TYPEBOT_CHANGE_STATUS",
  "REMOVE_INSTANCE",
  "LOGOUT_INSTANCE",
  "INSTANCE_CREATE",
  "INSTANCE_DELETE",
  "STATUS_INSTANCE",
] as const;

export type EvolutionEvent = (typeof EVOLUTION_EVENT_ENUM)[number];

/**
 * O que assinamos ao criar/registrar uma instância.
 *
 * Cobre os eixos de que a ingestão depende:
 *   - mensagens (histórico e novas) .. MESSAGES_SET/UPSERT/UPDATE/DELETE
 *   - carteira (quem é a cliente) .... CONTACTS_SET/UPSERT/UPDATE
 *   - conversas (quando falou) ....... CHATS_SET/UPSERT
 *   - operação da conexão ............ CONNECTION_UPDATE, QRCODE_UPDATED, SEND_MESSAGE
 *
 * Tipado como EvolutionEvent[]: um nome fora do enum acima quebra o typecheck
 * ANTES de virar um 400 em produção.
 */
export const EVOLUTION_WEBHOOK_EVENTS: EvolutionEvent[] = [
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "CHATS_SET",
  "CHATS_UPSERT",
  "CONTACTS_SET",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "SEND_MESSAGE",
];

/** Contrato histórico do CRM tenant e do onboarding pago. */
export const TENANT_EVOLUTION_WEBHOOK_EVENTS: EvolutionEvent[] = [
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "CHATS_SET",
  "CONTACTS_SET",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "SEND_MESSAGE",
];

/** Contrato enxuto do CRM de plataforma. */
export const PLATFORM_EVOLUTION_WEBHOOK_EVENTS: EvolutionEvent[] = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "SEND_MESSAGE",
];

/**
 * Guarda de execução: devolve os nomes que a Evolution vai rejeitar.
 *
 * O tipo acima só protege quem escreve a lista como literal em TypeScript. Isto
 * protege o resto — lista vinda de config, de banco ou concatenada em runtime.
 * Barato, e transforma um 400 opaco do servidor num erro local que diz o nome.
 */
export function invalidEvents(events: readonly string[]): string[] {
  const validos = new Set<string>(EVOLUTION_EVENT_ENUM);
  return events.filter((e) => !validos.has(e));
}
