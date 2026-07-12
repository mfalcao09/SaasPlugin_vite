import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — IA + mídia das Automações do Instagram.
 * Porte 1:1 de `useInstagramFlowAI.ts` do CRM Vendus, mas:
 *   • Edges com prefixo `platform-` (padrão de `platform-instagram-{draft,connect,test}`).
 *   • `product_id` em vez de `organization_id`.
 *
 * NOTA (backend NÃO verificado): as Edge Functions abaixo
 * (`platform-instagram-list-media`, `platform-instagram-subscribe-fields`,
 * `platform-instagram-flow-generate-ai`, `platform-ig-flow-executor`) ainda NÃO
 * foram encontradas no repo. O frontend está portado, mas o fluxo só funciona
 * quando essas funções server-side existirem.
 */

export interface IGMedia {
  id: string;
  caption: string;
  media_type: string;
  thumbnail_url: string | null;
  permalink: string;
  timestamp: string;
}

export function useInstagramMedia(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['platform-crm-instagram-media', connectionId],
    enabled: !!connectionId,
    staleTime: 60_000,
    queryFn: async (): Promise<IGMedia[]> => {
      const { data, error } = await supabase.functions.invoke('platform-instagram-list-media', {
        body: { connection_id: connectionId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.media ?? []) as IGMedia[];
    },
  });
}

export function useReSubscribeInstagram() {
  return useMutation({
    mutationFn: async (connection_id: string) => {
      const { data, error } = await supabase.functions.invoke('platform-instagram-subscribe-fields', {
        body: { connection_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => toast.success('Campos re-inscritos na Meta — automações de comentários/menções agora rodam.'),
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao reassinar'),
  });
}

export interface GenerateFlowInput {
  prompt: string;
  product_id?: string;
  connection_id?: string | null;
  existing_flow_id?: string;
}

export function useGenerateInstagramFlowAI() {
  return useMutation({
    mutationFn: async (input: GenerateFlowInput) => {
      const { data, error } = await supabase.functions.invoke('platform-instagram-flow-generate-ai', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { ok: true; flow_id: string; name: string; trigger_type: string; blocks: any[]; warnings: string[] };
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao gerar com IA'),
  });
}

export interface FlowDryRunPlan {
  block_id: string;
  type: string;
  action: string;
  preview?: string;
}

export function useDryRunInstagramFlow() {
  return useMutation({
    mutationFn: async (input: { flow_id: string; trigger_text?: string; trigger_source?: string }) => {
      const { data, error } = await supabase.functions.invoke('platform-ig-flow-executor', {
        body: {
          flow_id: input.flow_id,
          trigger_source: input.trigger_source ?? 'manual',
          trigger_text: input.trigger_text ?? '',
          sender_ig_id: 'preview_sender',
          comment_id: 'preview_comment',
          dry_run: true,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any) as { ok: true; dry_run: true; plan: FlowDryRunPlan[]; executed: string[] };
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha no preview'),
  });
}
