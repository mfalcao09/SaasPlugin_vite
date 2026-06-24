import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PayoutBatchStatus = 'draft' | 'processing' | 'completed' | 'failed';
export type PayoutItemStatus = 'pending' | 'paid' | 'failed';

export interface ApprovedPayoutGroup {
  affiliate_id: string;
  affiliate_name: string;
  pix_key: string | null;
  amount_cents: number;
  commissions_count: number;
  commission_ids: string[];
}

export interface PayoutItem {
  id: string;
  batch_id: string;
  affiliate_id: string;
  affiliate_name?: string;
  amount_cents: number;
  pix_key: string | null;
  commission_ids: string[];
  status: PayoutItemStatus;
  provider_ref: string | null;
  paid_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutBatch {
  id: string;
  status: PayoutBatchStatus;
  provider: string;
  total_cents: number;
  items_count: number;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: PayoutItem[];
}

async function invoke<T = any>(action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('affiliate-payout', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useApprovedPayouts() {
  return useQuery({
    queryKey: ['payout', 'approved'],
    queryFn: async () => {
      const data = await invoke<{
        groups: ApprovedPayoutGroup[];
        total_cents: number;
        affiliates_count: number;
      }>('list_approved');
      return data;
    },
  });
}

export function usePayoutBatches(params: { limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: ['payout', 'batches', params],
    queryFn: async () => {
      const data = await invoke<{ batches: PayoutBatch[]; total: number }>('list_batches', params);
      return data;
    },
  });
}

interface CreateBatchInput {
  provider?: string;
  affiliate_ids?: string[];
  notes?: string;
}

export function useCreatePayoutBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBatchInput) =>
      invoke<{ batch: PayoutBatch; items: PayoutItem[] }>('create_batch', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payout', 'approved'] });
      qc.invalidateQueries({ queryKey: ['payout', 'batches'] });
    },
  });
}

export function useProcessPayoutBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) =>
      invoke<{ batch: PayoutBatch; items: PayoutItem[]; paid_count: number; failed_count: number }>(
        'process_batch',
        { batch_id: batchId },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payout', 'batches'] }),
  });
}

export function useConfirmPayoutItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { item_id: string; provider_ref?: string }) =>
      invoke<{ item: PayoutItem }>('confirm_item', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payout', 'batches'] }),
  });
}
