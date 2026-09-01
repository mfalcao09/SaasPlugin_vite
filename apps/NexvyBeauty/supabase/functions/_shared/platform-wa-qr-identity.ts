// Identidade WhatsApp-via-QR (platform / Camila).
// Tabela física = platform_crm_wa_qr_instances (view compat removida no residual C).
// Write canônico; read aceita legado + canônico (dual-read de canal/visitor).

export const WA_QR_INSTANCES_TABLE = "platform_crm_wa_qr_instances";

/** Canal legado (Option A / pré C-hard-1). */
export const WA_QR_CHANNEL_LEGACY = "whatsapp_evolution";
/** Canal canônico — write path a partir de C-hard-1. */
export const WA_QR_CHANNEL_CANONICAL = "whatsapp_qr";

export const WA_QR_CHANNELS: readonly string[] = [
  WA_QR_CHANNEL_LEGACY,
  WA_QR_CHANNEL_CANONICAL,
];

export const WA_QR_VISITOR_PREFIX_LEGACY = "wa_evo:";
export const WA_QR_VISITOR_PREFIX_CANONICAL = "wa_qr:";

/** Write: visitor_id canônico. */
export function waQrVisitorId(digits: string): string {
  return `${WA_QR_VISITOR_PREFIX_CANONICAL}${String(digits).replace(/\D/g, "")}`;
}

/** Lookup: ambos os prefixos (pré/pós backfill). */
export function waQrVisitorIdsForLookup(digits: string): string[] {
  const d = String(digits).replace(/\D/g, "");
  return [
    `${WA_QR_VISITOR_PREFIX_CANONICAL}${d}`,
    `${WA_QR_VISITOR_PREFIX_LEGACY}${d}`,
  ];
}

export function isWaQrChannel(channel: string | null | undefined): boolean {
  return WA_QR_CHANNELS.includes(String(channel ?? ""));
}
