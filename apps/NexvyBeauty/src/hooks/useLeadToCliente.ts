import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ─── Conversão Lead → Cliente ──────────────────────────────────────────────
// Ciclo de vida do NexvyBeauty: o LEAD (prospecção no CRM) vira CLIENTE (base do
// salão) ao agendar/contratar. Aqui mora a lógica reutilizável — usada pelo
// botão "Converter em cliente" (detalhe do lead) e pela conversão automática no
// agendamento. Anti-duplicata: vincula a um cliente existente em vez de criar.
// `clientes` está fora do types.ts gerado → cast `as any`.

const db = supabase as any;

export interface LeadToClienteInput {
  leadId: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  organizationId: string;
}

export interface LeadToClienteResult {
  clienteId: string;
  created: boolean;
}

export async function convertLeadToCliente(input: LeadToClienteInput): Promise<LeadToClienteResult> {
  const { leadId, nome, email, telefone, organizationId } = input;

  // 1) Já convertido? (cliente já vinculado a esse lead)
  const { data: byLead } = await db
    .from('clientes')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (byLead?.id) return { clienteId: byLead.id, created: false };

  // 2) Já existe cliente com mesmo telefone OU email? Vincula em vez de duplicar.
  let existing: { id: string; lead_id: string | null } | null = null;
  if (telefone) {
    const { data } = await db
      .from('clientes')
      .select('id, lead_id')
      .eq('organization_id', organizationId)
      .eq('telefone', telefone)
      .limit(1);
    existing = data?.[0] ?? null;
  }
  if (!existing && email) {
    const { data } = await db
      .from('clientes')
      .select('id, lead_id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .limit(1);
    existing = data?.[0] ?? null;
  }
  if (existing) {
    if (!existing.lead_id) {
      await db.from('clientes').update({ lead_id: leadId }).eq('id', existing.id);
    }
    return { clienteId: existing.id, created: false };
  }

  // 3) Cria o cliente a partir do lead.
  const { data: created, error } = await db
    .from('clientes')
    .insert({
      organization_id: organizationId,
      nome,
      email: email ?? null,
      telefone: telefone ?? null,
      status: 'ativo',
      lead_id: leadId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { clienteId: created.id, created: true };
}

export function useConvertLeadToCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: convertLeadToCliente,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast.success(
        res.created ? 'Lead convertido em cliente!' : 'Lead já vinculado a um cliente do salão.',
      );
    },
    onError: () => toast.error('Erro ao converter o lead em cliente.'),
  });
}
