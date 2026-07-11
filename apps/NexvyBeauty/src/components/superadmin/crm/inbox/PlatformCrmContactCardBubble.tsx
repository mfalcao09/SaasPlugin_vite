import { useState } from "react";
import { User, MessageCircle, UserPlus, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parsePlatformCrmFnError } from "../data/usePlatformCrmConversations";

/**
 * Card de contato compartilhado dentro da bolha — porte fiel A1.2 de
 * `src/components/chat/ContactCardBubble.tsx` (Vendus v5 original).
 *
 * Adaptações de dados:
 * - "Salvar lead": `leads` (tenant, org-scoped) → `platform_crm_leads`
 *   (sem organization_id — adaptação d);
 * - "Conversar" — A1.2-FRONT (contrato 1): edge
 *   `platform-start-whatsapp-conversation` POST { phone, message } →
 *   { ok, conversation_id, message_id }; erro `needs_template` orienta a usar
 *   o fluxo de template HSM (a bolha não conhece a conexão Meta — o
 *   SendTemplateDialog fica na "Nova Conversa" e no banner da janela 24h).
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
      // A1.2-FRONT (contrato 1): start real pelo edge (dedupe + entrega pelo canal).
      const { data, error } = await supabase.functions.invoke(
        "platform-start-whatsapp-conversation",
        { body: { phone, message: "" } },
      );

      const needsTemplateToast = () =>
        toast.warning("Este número exige um template aprovado", {
          description:
            "Fora da janela de 24h a conversa só abre com template HSM — use a Nova Conversa (conexão Meta) para enviar o template.",
        });

      if (error) {
        const { body } = await parsePlatformCrmFnError(error);
        if (body?.needs_template) {
          needsTemplateToast();
          return;
        }
        throw new Error(body?.error || error.message || "Falha ao iniciar conversa");
      }

      const resp = data as {
        ok?: boolean;
        conversation_id?: string;
        error?: string;
        needs_template?: boolean;
      } | null;
      if (resp?.needs_template) {
        needsTemplateToast();
        return;
      }
      if (resp?.error || resp?.ok === false) {
        throw new Error(resp?.error || "Falha ao iniciar conversa");
      }

      toast.success("Conversa iniciada");
      if (resp?.conversation_id) {
        try {
          sessionStorage.setItem('platformCrmInbox:pendingConversationId', resp.conversation_id);
        } catch {}
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
