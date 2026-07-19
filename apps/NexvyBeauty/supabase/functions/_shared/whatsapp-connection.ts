// _shared/whatsapp-connection.ts — RESOLUÇÃO DETERMINÍSTICA da conexão WhatsApp
// Cloud API por onde uma resposta deve SAIR.
//
// PROBLEMA QUE ESTE MÓDULO RESOLVE (P0, 2026-07-19)
// -------------------------------------------------
// Todo caminho de entrega da plataforma foi escrito quando existia UMA única
// conexão Meta ativa ("mono-connection"): cada cópia do `deliverViaWhatsAppCloud`
// resolvia a conexão com
//     .eq('status','active').order('created_at',{ascending:false}).limit(1)
// ou seja, "a mais recente". Quando a 2ª conexão entrou (número de DEMO, criada
// 14/07, mais recente que o número de VENDAS, criado 05/07), o pressuposto
// quebrou EM SILÊNCIO: a lead escrevia para o número de VENDAS e recebia a
// resposta pelo número de DEMO — outra thread no aparelho dela, cara de golpe,
// lead perdida.
//
// O dado certo SEMPRE existiu: `platform_crm_conversations.meta_connection_id`
// guarda a conexão por onde a mensagem ENTROU (gravado pelo
// platform-meta-whatsapp-webhook no insert e no patch de canal A1.3). Ninguém
// lia esse campo na hora de responder. Este módulo é o leitor.
//
// PRECEDÊNCIA (determinística, nesta ordem)
//   a. conversation.meta_connection_id, se a conexão ainda estiver `active`
//      → responder pelo MESMO número que recebeu. É o caso normal.
//   b. conexão ativa cujo product_id == conversation.product_id (só quando o
//      product_id da conversa não é nulo E exatamente UMA conexão casa).
//   c. se existe exatamente UMA conexão ativa no total, usa ela (o mundo
//      mono-connection de antes continua funcionando sem mudança).
//   d. ambíguo (2+ ativas e nada acima resolveu) → NÃO ADIVINHA. Devolve
//      conn=null com reason='ambiguous'; o chamador loga e alerta
//      (reportUnresolvedConnection). Falhar visível é melhor do que responder
//      pelo número errado.
//
// NÃO É ESCOPO DESTE MÓDULO: disparos PROATIVOS sem conversa de origem
// (welcome pós-compra, cron da Nina, notificação interna ao vendedor, 1ª
// mensagem de flow de revival). Lá não existe "número que recebeu" a honrar —
// esses caminhos seguem com a resolução legada e estão fora do P0.

import { sendTelegramAlert } from './platform-alerts.ts';
import { phoneVariantsBR } from './phone.ts';

/** Cliente Supabase — tipo estrutural mínimo (as edges usam `any` no client). */
// deno-lint-ignore no-explicit-any
type SB = any;

export type ConnectionResolutionReason =
  /** a — meta_connection_id da conversa (o número que recebeu). */
  | 'conversation'
  /** a — meta_connection_id da conversa achada pelo telefone do destinatário. */
  | 'conversation_by_phone'
  /** b — única conexão ativa do mesmo product_id da conversa. */
  | 'product'
  /** c — só existe uma conexão ativa; mundo mono-connection. */
  | 'single_active'
  /** d — 2+ ativas e nenhum sinal resolveu. NUNCA chutar. */
  | 'ambiguous'
  /** Nenhuma conexão ativa cadastrada. */
  | 'no_active_connection'
  /** Falha ao consultar a tabela de conexões. */
  | 'lookup_failed';

/** Conexão pronta para enviar (campos que o POST no Graph exige). */
export interface SendableMetaConnection {
  id: string;
  phone_number_id: string;
  access_token_encrypted: string;
  product_id: string | null;
  display_name: string | null;
}

export interface ResolvedConnection {
  /** null quando não deu para resolver com segurança — o chamador NÃO deve enviar. */
  conn: SendableMetaConnection | null;
  reason: ConnectionResolutionReason;
  /** Quantas conexões ativas existem (contexto para o alerta). */
  activeCount: number;
}

/** Shape mínimo lido da conversa. Aceita a row inteira (Record) sem tipagem. */
export interface ConversationConnectionHints {
  id?: unknown;
  meta_connection_id?: unknown;
  product_id?: unknown;
}

const CONNECTION_COLUMNS =
  'id, phone_number_id, access_token_encrypted, status, product_id, display_name, created_at';

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Conexão só é enviável com phone_number_id E token — senão é sucata ativa. */
function toSendable(row: Record<string, unknown>): SendableMetaConnection | null {
  const id = str(row['id']);
  const phoneNumberId = str(row['phone_number_id']);
  const token = str(row['access_token_encrypted']);
  if (!id || !phoneNumberId || !token) return null;
  return {
    id,
    phone_number_id: phoneNumberId,
    access_token_encrypted: token,
    product_id: str(row['product_id']),
    display_name: str(row['display_name']),
  };
}

/**
 * Todas as conexões `active` numa consulta só (a resolução acontece em memória:
 * determinística, sem depender da ordem que o Postgres devolve).
 */
async function listActiveConnections(
  supabase: SB,
): Promise<{ rows: Record<string, unknown>[] | null }> {
  const { data, error } = await supabase
    .from('platform_crm_whatsapp_meta_connections')
    .select(CONNECTION_COLUMNS)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[whatsapp-connection] falha ao listar conexões ativas:', error.message);
    return { rows: null };
  }
  return { rows: (data as Record<string, unknown>[] | null) ?? [] };
}

/**
 * Resolve a conexão de SAÍDA para uma conversa. Ver a precedência no topo do
 * arquivo. Nunca lança: erro vira `reason`.
 *
 * @param conversation row da conversa (ou null quando não há conversa conhecida)
 */
export async function resolveConnectionForConversation(
  supabase: SB,
  conversation: ConversationConnectionHints | null,
): Promise<ResolvedConnection> {
  const { rows } = await listActiveConnections(supabase);
  if (rows === null) return { conn: null, reason: 'lookup_failed', activeCount: 0 };

  const sendable = rows
    .map(toSendable)
    .filter((c): c is SendableMetaConnection => c !== null);
  const activeCount = sendable.length;
  if (activeCount === 0) return { conn: null, reason: 'no_active_connection', activeCount: 0 };

  // (a) o número que recebeu a mensagem.
  const pinned = str(conversation?.meta_connection_id);
  if (pinned) {
    const hit = sendable.find((c) => c.id === pinned);
    if (hit) return { conn: hit, reason: 'conversation', activeCount };
    // Pinada mas inativa/incompleta: cai para os próximos critérios (não é
    // motivo para deixar a lead sem resposta), mas fica registrado no log.
    console.warn(
      `[whatsapp-connection] meta_connection_id ${pinned} da conversa não está ativa/enviável — seguindo para product/single`,
    );
  }

  // (b) mesma linha de produto da conversa, se resolver sem ambiguidade.
  const productId = str(conversation?.product_id);
  if (productId) {
    const matches = sendable.filter((c) => c.product_id === productId);
    if (matches.length === 1) return { conn: matches[0], reason: 'product', activeCount };
  }

  // (c) mundo mono-connection: uma ativa só, sem escolha a fazer.
  if (activeCount === 1) return { conn: sendable[0], reason: 'single_active', activeCount };

  // (d) 2+ ativas e nada resolveu — falha visível, nunca chute.
  return { conn: null, reason: 'ambiguous', activeCount };
}

/**
 * Variante para chamadores que só têm o TELEFONE do destinatário (ex.: aviso de
 * agendamento): acha a conversa de WhatsApp mais recente daquele número e usa o
 * meta_connection_id dela. Sem conversa, cai na resolução sem conversa (c)/(d).
 */
export async function resolveConnectionForPhone(
  supabase: SB,
  phone: unknown,
): Promise<ResolvedConnection> {
  const variants = new Set<string>(phoneVariantsBR(phone));
  for (const v of Array.from(variants)) variants.add(`+${v}`);
  const list = Array.from(variants);

  let conversation: ConversationConnectionHints | null = null;
  if (list.length > 0) {
    const quoted = list.map((v) => `"${v}"`).join(',');
    const orFilter = `visitor_whatsapp.in.(${quoted}),visitor_phone.in.(${quoted})`;
    const { data, error } = await supabase
      .from('platform_crm_conversations')
      .select('id, meta_connection_id, product_id')
      .eq('channel', 'whatsapp')
      .not('meta_connection_id', 'is', null)
      .or(orFilter)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) {
      console.warn('[whatsapp-connection] lookup de conversa por telefone falhou:', error.message);
    } else {
      conversation = ((data as ConversationConnectionHints[] | null)?.[0]) ?? null;
    }
  }

  const resolved = await resolveConnectionForConversation(supabase, conversation);
  if (resolved.conn && resolved.reason === 'conversation') {
    return { ...resolved, reason: 'conversation_by_phone' };
  }
  return resolved;
}

/**
 * Loga e ALERTA (Telegram) que uma entrega não saiu por falta de conexão
 * resolvível. Non-fatal por design — o alerta nunca derruba o chamador.
 * Use SEMPRE que `conn` vier null num caminho que responde a uma lead.
 */
export async function reportUnresolvedConnection(
  source: string,
  resolved: ResolvedConnection,
  context: Record<string, unknown> = {},
): Promise<void> {
  console.error(
    `[${source}] entrega WhatsApp ABORTADA — conexão não resolvida (${resolved.reason}, ${resolved.activeCount} ativa(s))`,
    JSON.stringify(context),
  );
  // Só a AMBIGUIDADE é anomalia nova e silenciosa (o P0). 'no_active_connection'
  // e 'lookup_failed' já eram observáveis pelo campo `error` de cada deliverer.
  if (resolved.reason !== 'ambiguous') return;
  await sendTelegramAlert(
    `🚨 WhatsApp: resposta NÃO enviada — ${resolved.activeCount} conexões ativas e a conversa não indica por qual número responder.\n` +
      `Origem: ${source}\n` +
      `Contexto: ${JSON.stringify(context)}\n` +
      `Ação: preencher meta_connection_id na conversa (ou desativar a conexão que não deve responder).`,
  );
}

/** Código de erro curto e estável para o campo `error` dos deliverers. */
export function connectionErrorCode(resolved: ResolvedConnection): string {
  return resolved.reason === 'ambiguous' ? 'ambiguous_connection' : resolved.reason;
}
