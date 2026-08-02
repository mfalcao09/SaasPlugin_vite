// _shared/channel-limit.ts
//
// Cliente ÚNICO da contagem de canais de WhatsApp por organização, para as edges.
//
// REGRA DE NEGÓCIO QUE ISTO SERVE (decisão Marcelo Silva, 2026-08-01, verbatim:
// "Consome o mesmo slot"): `max_connections` do plano conta CANAIS, somando
// Evolution (QR) + Meta Cloud (Oficial). Org com limite 1 escolhe um dos dois,
// nunca os dois. Não é limite por tipo — é slot compartilhado.
//
// ⚠️ A ARITMÉTICA NÃO MORA AQUI. Mora na função SQL `get_org_channel_usage`.
// Este módulo é só o cliente tipado dela. Se a contagem fosse reimplementada em
// TypeScript existiriam DUAS definições da mesma regra — uma no SQL, outra aqui
// — e a próxima tabela de canal seria somada numa e esquecida na outra.
// Foi exatamente assim que o defeito de 2026-08-01 nasceu: três gates contando
// só `evolution_instances`, cada um internamente correto, nenhum somando a
// tabela nova. O front chama a MESMA função SQL (hook `useOrgChannelUsage`).
// O que é compartilhado é o NÚMERO; o texto exibido é presentação e pode variar.

export interface ChannelUsage {
  /** limite de canais do plano efetivo da org */
  limit: number;
  /** total já usado, somando os dois tipos */
  used: number;
  by_type: { evolution: number; meta: number };
}

export class ChannelUsageError extends Error {}

/**
 * Lê o uso de canais da org. Chame com um client SERVICE_ROLE.
 *
 * ⚠️ NÃO TEM FALLBACK, DE PROPÓSITO. `get_org_channel_usage` devolve NULL em
 * dois casos opostos — "org não existe" e "você não pode ler esta org" — e um
 * `?? 1` aqui converteria os dois em "o plano dele é 1", capando silenciosamente
 * um cliente Ultra em uma conexão. Falha de leitura sobe como erro; nunca vira
 * política de negócio. (Era exatamente esse `?? 1` que fazia o painel exibir
 * "atingiu o limite de 1 conexão" para quem tem 4.)
 */
export async function fetchChannelUsage(sb: any, orgId: string): Promise<ChannelUsage> {
  const { data, error } = await sb.rpc('get_org_channel_usage', { p_org_id: orgId });
  if (error) throw new ChannelUsageError(`falha ao carregar limites do plano: ${error.message}`);
  if (!data) throw new ChannelUsageError('limites do plano indisponiveis para esta organizacao');

  const usage = data as ChannelUsage;
  if (typeof usage.limit !== 'number' || typeof usage.used !== 'number') {
    throw new ChannelUsageError('limite do plano nao resolvido');
  }
  return usage;
}

/**
 * Mensagem de recusa quando o limite foi atingido.
 *
 * "Limite de conexões atingido" sozinho faz a dona do salão achar que o produto
 * quebrou — ela não sabe que o canal que ela JÁ tem é o que ocupa a vaga, e com
 * slot compartilhado o canal que ocupa pode ser de um tipo diferente do que ela
 * está tentando conectar. Limite atingido é situação PREVISTA: é UX, não erro.
 * A frase diz as três coisas necessárias para agir: o que ela tem, o que
 * liberar, e a alternativa.
 */
export function channelLimitMessage(usage: ChannelUsage, wanting: 'evolution' | 'meta'): string {
  const emUso: string[] = [];
  if (usage.by_type.evolution > 0) emUso.push(`${usage.by_type.evolution} via QR Code`);
  if (usage.by_type.meta > 0) emUso.push(`${usage.by_type.meta} via WhatsApp Oficial`);

  const usando = emUso.length ? ` e você já usa ${emUso.join(' e ')}` : '';
  const alvo = wanting === 'meta' ? 'o WhatsApp Oficial' : 'um número por QR Code';

  return `Seu plano inclui ${usage.limit} conexão(ões) de WhatsApp${usando}. ` +
    `Para conectar ${alvo}, desconecte uma das conexões atuais ou faça upgrade do plano.`;
}
