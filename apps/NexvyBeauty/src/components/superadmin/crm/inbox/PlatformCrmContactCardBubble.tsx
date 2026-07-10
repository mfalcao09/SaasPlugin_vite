import { useState } from "react";
import { User, MessageCircle, UserPlus, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Card de contato compartilhado dentro da bolha — porte fiel A1.2 de
 * `src/components/chat/ContactCardBubble.tsx` (Vendus v5 original).
 *
 * Adaptações de dados:
 * - "Salvar lead": `leads` (tenant, org-scoped) → `platform_crm_leads`
 *   (sem organization_id — adaptação d);
 * - "Conversar": edge `start-whatsapp-conversation` (tenant) → INSERT
 *   client-side em `platform_crm_conversations` (canal whatsapp) +
 *   TODO(A1.2-backend) para o edge de start com entrega real.
 */
export interface SharedContact {
  name: string;
  phone: string;
  raw_vcard?: string | null;
}

interface Props {
  contacts: SharedContact[];
  isOwn?: boolean;
  conversationId?: string;
}

function normalizePhoneBR(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

export function PlatformCrmContactCardBubble({ contacts, conversationId }: Props) {
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);


  const handleSaveLead = async (c: SharedContact, idx: number) => {
    try {
      setLoadingIdx(idx);
      const phone = normalizePhoneBR(c.phone);
      if (!phone) {
        toast.error("Contato sem telefone válido");
        return;
      }
      const { data: existing } = await supabase
        .from("platform_crm_leads")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      if (existing?.id) {
        toast.success("Lead já existe");
        return;
      }
      const { error } = await supabase.from("platform_crm_leads").insert({
        name: c.name,
        phone,
        source: "whatsapp_contact_shared",
      } as any);
      if (error) throw error;
      toast.success("Lead criado");
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar lead");
    } finally {
      setLoadingIdx(null);
    }
  };

  const handleStartChat = async (c: SharedContact, idx: number) => {
    try {
      setLoadingIdx(idx);
      const phone = normalizePhoneBR(c.phone);
      if (!phone) {
        toast.error("Contato sem telefone válido");
        return;
      }
      // TODO(A1.2-backend): edge `platform-start-whatsapp-conversation` (start com
      // entrega real pelo canal). Enquanto isso, cria a conversa client-side —
      // mesma mecânica do useCreatePlatformCrmConversation.
      const { data, error } = await supabase
        .from("platform_crm_conversations")
        .insert({
          visitor_id: phone,
          visitor_name: c.name,
          visitor_phone: phone,
          channel: "whatsapp",
          status: "human_active",
        } as any)
        .select()
        .single();
      if (error) throw error;
      const newId = (data as any)?.id;
      toast.success("Conversa iniciada");
      if (newId) {
        try { sessionStorage.setItem('platformCrmInbox:pendingConversationId', newId); } catch {}
      }
      void conversationId;
    } catch (e: any) {
      toast.error(e.message || "Falha ao iniciar conversa");
    } finally {
      setLoadingIdx(null);
    }
  };

  return (
    <div className="space-y-2">
      {contacts.map((c, idx) => (
        <div
          key={idx}
          className="rounded-lg border bg-background/60 p-3 min-w-[220px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{c.name}</div>
              {c.phone && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {c.phone}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-xs flex-1"
              onClick={() => handleSaveLead(c, idx)}
              disabled={loadingIdx === idx}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Salvar lead
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 text-xs flex-1"
              onClick={() => handleStartChat(c, idx)}
              disabled={loadingIdx === idx || !c.phone}
            >
              <MessageCircle className="h-3 w-3 mr-1" />
              Conversar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
