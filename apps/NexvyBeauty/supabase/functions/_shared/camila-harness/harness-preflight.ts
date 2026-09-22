// Última leitura antes do envio: essa bolha já saiu por outro caminho?
import { phoneVariantsWithPlusBR } from "../phone-e164-variants.ts";
import { extractWamid } from "./porta-juiz.ts";

type Sb = { from: (table: string) => any };

export async function outboundAlreadySent(
  sb: Sb,
  input: {
    productId: string;
    phone: string;
    idempotencyKey: string;
    text: string;
  },
): Promise<{ sent: boolean; wamid: string | null; error: string | null }> {
  const phones = phoneVariantsWithPlusBR(input.phone);
  if (!phones.length || !input.productId) {
    return { sent: false, wamid: null, error: "missing_phone_or_product" };
  }
  const base = () =>
    sb.from("platform_crm_messages")
      .select(
        "id, metadata, platform_crm_conversations!inner(product_id, visitor_phone)",
      )
      .eq("direction", "outbound")
      .eq("platform_crm_conversations.product_id", input.productId)
      .in("platform_crm_conversations.visitor_phone", phones)
      .limit(1);

  const byKey = await base().contains("metadata", {
    idempotency_key: input.idempotencyKey,
  });
  if (byKey.error) {
    return {
      sent: false,
      wamid: null,
      error: byKey.error.message ?? "lookup_failed",
    };
  }
  if ((byKey.data?.length ?? 0) > 0) {
    return {
      sent: true,
      wamid: extractWamid(byKey.data[0]?.metadata),
      error: null,
    };
  }

  const byText = await base().eq("content", input.text);
  if (byText.error) {
    return {
      sent: false,
      wamid: null,
      error: byText.error.message ?? "lookup_failed",
    };
  }
  const row = byText.data?.[0];
  return {
    sent: (byText.data?.length ?? 0) > 0,
    wamid: extractWamid(row?.metadata),
    error: null,
  };
}
