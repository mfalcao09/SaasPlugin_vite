import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useInstagramLoginConnections } from '@/hooks/useInstagramLoginConnection';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, MessageCircle, User, Phone, Instagram } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StartConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
}

type ChannelChoice = 'whatsapp' | 'instagram';

export function StartConversationDialog({
  open,
  onOpenChange,
  onConversationCreated,
}: StartConversationDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { data: igConnections = [] } = useInstagramLoginConnections();
  const hasInstagram = igConnections.some((c) => c.status === 'active');

  const [channel, setChannel] = useState<ChannelChoice>('whatsapp');
  const [search, setSearch] = useState('');
  const [phone, setPhone] = useState('');
  const [igUserId, setIgUserId] = useState('');
  const [igUsername, setIgUsername] = useState('');
  const [message, setMessage] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const effectiveChannel: ChannelChoice = hasInstagram ? channel : 'whatsapp';

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-search', search, profile?.organization_id],
    queryFn: async () => {
      if (!search || search.length < 2 || !profile?.organization_id) return [];
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, company')
        .eq('organization_id', profile.organization_id)
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10);
      return data || [];
    },
    enabled: open && search.length >= 2,
  });

  const handleSelectLead = (lead: any) => {
    setSelectedLead(lead);
    if (lead.phone) {
      setPhone(lead.phone);
    }
    setSearch('');
  };

  const canSubmitWhatsApp = Boolean(phone.replace(/\D/g, ''));
  const canSubmitInstagram = Boolean(igUserId.trim() || igUsername.trim());
  const canSubmit = effectiveChannel === 'instagram' ? canSubmitInstagram : canSubmitWhatsApp;

  const handleCreateWhatsApp = async () => {
    const targetPhone = phone.replace(/\D/g, '');
    if (!targetPhone) {
      toast({ title: 'Informe um telefone', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('start-whatsapp-conversation', {
        body: {
          phone: targetPhone,
          lead_id: selectedLead?.id || null,
          lead_name: selectedLead?.name || null,
          initial_message: message || null,
        },
      });

      if (error) throw error;

      if (data?.ok === false || data?.created === false) {
        toast({
          title: 'Conversa não criada',
          description: data?.error || 'A mensagem não pôde ser enviada. Conecte seu WhatsApp e tente novamente.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: data.is_new ? 'Conversa criada' : 'Conversa encontrada',
        description: data.is_new
          ? 'Nova conversa WhatsApp iniciada.'
          : 'Conversa existente selecionada.',
      });

      onConversationCreated(data.conversation_id);
      handleClose();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateInstagram = async () => {
    if (!igUserId.trim() && !igUsername.trim()) {
      toast({ title: 'Informe o Instagram user id ou o @username', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('start-instagram-conversation', {
        body: {
          ig_user_id: igUserId.trim() || null,
          username: igUsername.trim() || null,
          lead_id: selectedLead?.id || null,
          lead_name: selectedLead?.name || null,
          initial_message: message || null,
        },
      });

      if (error) throw error;

      if (data?.ok === false || data?.created === false) {
        toast({
          title: 'Conversa não criada',
          description: data?.error || 'Não foi possível iniciar a conversa Instagram.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: data.is_new ? 'Conversa criada' : 'Conversa encontrada',
        description: data.is_new
          ? 'Nova conversa Instagram iniciada.'
          : 'Conversa existente selecionada.',
      });

      onConversationCreated(data.conversation_id);
      handleClose();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreate = () => {
    if (effectiveChannel === 'instagram') return handleCreateInstagram();
    return handleCreateWhatsApp();
  };

  const handleClose = () => {
    setSearch('');
    setPhone('');
    setIgUserId('');
    setIgUsername('');
    setMessage('');
    setSelectedLead(null);
    setChannel('whatsapp');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {effectiveChannel === 'instagram' ? (
              <Instagram className="h-5 w-5 text-pink-500" />
            ) : (
              <MessageCircle className="h-5 w-5 text-primary" />
            )}
            {effectiveChannel === 'instagram' ? 'Nova conversa Instagram' : 'Nova Conversa WhatsApp'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasInstagram && (
            <div>
              <Label>Canal</Label>
              <div className="mt-1 grid grid-cols-2 gap-1 p-1 bg-muted/40 rounded-lg">
                <button
                  type="button"
                  onClick={() => setChannel('whatsapp')}
                  className={cn(
                    'h-8 rounded-md text-sm font-medium',
                    channel === 'whatsapp' ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('instagram')}
                  className={cn(
                    'h-8 rounded-md text-sm font-medium',
                    channel === 'instagram' ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  Instagram
                </button>
              </div>
            </div>
          )}

          <div>
            <Label>Buscar Lead (opcional)</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome, telefone ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {leads.length > 0 && (
              <ScrollArea className="mt-2 max-h-40 border rounded-md">
                {leads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 text-sm border-b last:border-0"
                  >
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.phone || lead.email}
                      </p>
                    </div>
                  </button>
                ))}
              </ScrollArea>
            )}
          </div>

          {selectedLead && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 text-sm">
              <User className="h-4 w-4 text-primary" />
              <span className="font-medium">{selectedLead.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={() => { setSelectedLead(null); setPhone(''); }}
              >
                Remover
              </Button>
            </div>
          )}

          {effectiveChannel === 'whatsapp' ? (
            <div>
              <Label>Telefone WhatsApp</Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="5511999999999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Instagram user id</Label>
                <Input
                  className="mt-1"
                  placeholder="IGSID (ex.: 1784140…)"
                  value={igUserId}
                  onChange={(e) => setIgUserId(e.target.value)}
                />
              </div>
              <div>
                <Label>@username</Label>
                <Input
                  className="mt-1"
                  placeholder="@cliente"
                  value={igUsername}
                  onChange={(e) => setIgUsername(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Basta um dos dois. Direct de saída exige o user id.
                </p>
              </div>
            </div>
          )}

          <div>
            <Label>Primeira mensagem (opcional)</Label>
            <Textarea
              placeholder="Olá! Tudo bem?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !canSubmit}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Criando...
              </>
            ) : (
              'Iniciar Conversa'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
