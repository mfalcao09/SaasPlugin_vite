// Adapter de PIX-out provider-agnóstico para payout de comissões de afiliado (Fase 5).
// Consumido por: supabase/functions/affiliate-payout/index.ts (getPixAdapter).
// Mantém o motor de payout desacoplado do meio de pagamento — hoje 'manual'
// (super admin transfere por fora e confirma), futuro PSP automatizado (Asaas/Efi).

export interface PayoutRequest {
  affiliateId: string;
  amountCents: number;
  pixKey: string | null;
  reference: string; // ex: batch_id:item_id
}
export interface PayoutResult {
  ok: boolean;
  providerRef?: string; // id da transação (ou marcador manual)
  error?: string;
}
export interface PixOutAdapter {
  readonly provider: string; // 'manual' | 'asaas' | ...
  pay(req: PayoutRequest): Promise<PayoutResult>;
}

// Adapter MANUAL (default): NÃO move dinheiro. Marca como confirmado manualmente.
// O super admin transfere o PIX por fora e confirma na tela; este adapter só
// devolve ok com um providerRef de confirmação manual.
export class ManualPixAdapter implements PixOutAdapter {
  readonly provider = 'manual';
  // deno-lint-ignore require-await
  async pay(req: PayoutRequest): Promise<PayoutResult> {
    if (!req.pixKey) return { ok: false, error: 'sem chave PIX cadastrada' };
    return { ok: true, providerRef: `manual:${req.reference}` };
  }
}

// STUB documentado do adapter automatizado (Asaas/Efi/banco).
// NÃO chama API real. Lança propositalmente para evitar uso acidental em prod.
// Quando ativarmos, implementar aqui a transferência PIX (transfer/pix) com
// idempotência via Idempotency-Key = req.reference. Ver doc do PSP.
export class AsaasPixAdapterStub implements PixOutAdapter {
  readonly provider = 'asaas';
  // deno-lint-ignore require-await
  async pay(_req: PayoutRequest): Promise<PayoutResult> {
    throw new Error(
      'AsaasPixAdapterStub: adapter automatizado ainda não habilitado (use provider=manual)',
    );
  }
}

export function getPixAdapter(provider: string): PixOutAdapter {
  switch (provider) {
    case 'asaas':
      return new AsaasPixAdapterStub();
    case 'manual':
    default:
      return new ManualPixAdapter();
  }
}
