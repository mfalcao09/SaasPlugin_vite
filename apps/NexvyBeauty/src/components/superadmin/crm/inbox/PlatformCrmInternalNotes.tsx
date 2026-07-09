import { useState } from 'react';
import { Plus, StickyNote, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Notas internas da CONVERSA na inbox do CRM de PLATAFORMA.
 * PORTE de `seller/inbox/InternalNotes.tsx` (CRM Vendus) — trocas: dado (tabela
 * tenant `conversation_notes` → `platform_crm_conversation_notes`, mesmo shape
 * SEM organization_id — a RLS super_admin isola); autor via `supabase.auth.getUser()`
 * e resolução `user_id → profiles` num passo separado (não há FK declarada, igual
 * ao padrão de `usePlatformCrmLeadNotes`); toast via `sonner` (convenção do platform
 * CRM). Tema já em tokens; desacoplamento: interno, sem canal externo. UI 1:1.
 */

interface PlatformCrmConversationNote {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  user?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface PlatformCrmInternalNotesProps {
  conversationId: string;
  className?: string;
}

const PLATFORM_CRM_KEY = 'platform-crm';

export function PlatformCrmInternalNotes({ conversationId, className }: PlatformCrmInternalNotesProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Lista de notas + resolução dos autores (profiles) num passo separado.
  const { data: notes = [], isLoading } = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'conversation-notes', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<PlatformCrmConversationNote[]> => {
      const { data, error } = await supabase
        .from('platform_crm_conversation_notes')
        .select('id, content, created_at, user_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Omit<PlatformCrmConversationNote, 'user'>[];
      const userIds = [...new Set(rows.map((n) => n.user_id).filter(Boolean))];
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);

        profilesMap = (profilesData ?? []).reduce(
          (acc, p) => ({ ...acc, [p.id]: { full_name: p.full_name, avatar_url: p.avatar_url } }),
          {},
        );
      }

      return rows.map((n) => ({ ...n, user: profilesMap[n.user_id] ?? null }));
    },
  });

  // Adiciona nota
  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('platform_crm_conversation_notes')
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          content,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'conversation-notes', conversationId],
      });
      setNoteText('');
      setIsAdding(false);
      toast.success('Nota adicionada', { description: 'A nota foi salva com sucesso.' });
    },
    onError: () => {
      toast.error('Erro', { description: 'Não foi possível adicionar a nota.' });
    },
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNoteMutation.mutate(noteText.trim());
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Notas Internas
        </h4>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Adicionar
          </Button>
        )}
      </div>

      {/* Formulário de nova nota */}
      {isAdding && (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
          <Textarea
            placeholder="Escreva uma nota interna..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-[60px] text-sm bg-background"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setNoteText('');
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              className="flex-1"
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Lista de notas */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Nenhuma nota ainda
        </p>
      ) : (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                <Separator className="my-2" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[9px]">
                      {note.user?.full_name?.charAt(0) || <User className="h-3 w-3" />}
                    </AvatarFallback>
                  </Avatar>
                  <span>{note.user?.full_name || 'Usuário'}</span>
                  <span>•</span>
                  <span>
                    {format(new Date(note.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
