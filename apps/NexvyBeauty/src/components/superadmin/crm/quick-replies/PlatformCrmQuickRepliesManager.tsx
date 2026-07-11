import { useMemo, useState, useEffect } from 'react';
import { Plus, MessageSquare, Pencil, Trash2, Search, Loader2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  usePlatformCrmQuickReplies,
  useCreatePlatformCrmQuickReply,
  useUpdatePlatformCrmQuickReply,
  useDeletePlatformCrmQuickReply,
  type PlatformCrmQuickReply,
} from '@/components/superadmin/crm/data/usePlatformCrmQuickReplies';

const SUGGESTED_CATEGORIES = [
  'Saudações',
  'Vendas',
  'Suporte',
  'Agendamento',
  'Pagamento',
  'Encerramento',
];

/**
 * Seção "Respostas Rápidas" do CRM de PLATAFORMA (super_admin). CRUD de atalhos
 * de mensagens prontas do pipeline único — só tabela platform_crm_quick_replies.
 * Desacoplado do tenant (sem organization_id / product_id).
 */
export function PlatformCrmQuickRepliesManager() {
  const { data: replies = [], isLoading } = usePlatformCrmQuickReplies();
  const createReply = useCreatePlatformCrmQuickReply();
  const updateReply = useUpdatePlatformCrmQuickReply();
  const deleteReply = useDeletePlatformCrmQuickReply();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PlatformCrmQuickReply | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isSaving = createReply.isPending || updateReply.isPending;

  const filtered = useMemo(
    () =>
      replies.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.content.toLowerCase().includes(search.toLowerCase()) ||
          r.shortcut?.toLowerCase().includes(search.toLowerCase()) ||
          r.category.toLowerCase().includes(search.toLowerCase()),
      ),
    [replies, search],
  );

  const grouped = useMemo(
    () =>
      filtered.reduce((acc, r) => {
        (acc[r.category] = acc[r.category] || []).push(r);
        return acc;
      }, {} as Record<string, PlatformCrmQuickReply[]>),
    [filtered],
  );

  const handleSave = (data: {
    category: string;
    title: string;
    content: string;
    shortcut: string | null;
  }) => {
    if (editing) {
      updateReply.mutate(
        { id: editing.id, ...data },
        {
          onSuccess: () => {
            setEditing(null);
            setCreating(false);
          },
        },
      );
    } else {
      createReply.mutate(
        { ...data, is_active: true },
        {
          onSuccess: () => {
            setEditing(null);
            setCreating(false);
          },
        },
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Respostas Rápidas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie atalhos para o time enviar mensagens prontas no chat. Use{' '}
            <code className="px-1 bg-muted rounded text-xs">{'{{nome}}'}</code> e{' '}
            <code className="px-1 bg-muted rounded text-xs">{'{{produto}}'}</code> como variáveis.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova resposta
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por título, conteúdo, atalho ou categoria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma resposta cadastrada</p>
            <p className="text-sm mt-1">
              Crie sua primeira resposta rápida para acelerar o atendimento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {category}
                </h3>
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {items.length}
                </Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((reply) => (
                  <Card
                    key={reply.id}
                    className="group hover:border-primary/50 transition-colors"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-sm truncate">{reply.title}</span>
                          {reply.shortcut && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 font-mono shrink-0"
                            >
                              {reply.shortcut}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditing(reply)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteId(reply.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        {reply.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ReplyFormDialog
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        initial={editing}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta rápida?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A resposta deixará de aparecer no chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteId &&
                deleteReply.mutate(deleteId, { onSuccess: () => setDeleteId(null) })
              }
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface FormProps {
  open: boolean;
  onClose: () => void;
  initial: PlatformCrmQuickReply | null;
  onSave: (data: {
    category: string;
    title: string;
    content: string;
    shortcut: string | null;
  }) => void;
  isSaving: boolean;
}

function ReplyFormDialog({ open, onClose, initial, onSave, isSaving }: FormProps) {
  const [category, setCategory] = useState(initial?.category || 'Geral');
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [shortcut, setShortcut] = useState(initial?.shortcut || '');

  // Reset form when the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setCategory(initial?.category || 'Geral');
      setTitle(initial?.title || '');
      setContent(initial?.content || '');
      setShortcut(initial?.shortcut || '');
    }
  }, [open, initial]);

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return;
    let normalizedShortcut = shortcut.trim();
    if (normalizedShortcut && !normalizedShortcut.startsWith('/')) {
      normalizedShortcut = '/' + normalizedShortcut;
    }
    onSave({
      category: category.trim() || 'Geral',
      title: title.trim(),
      content: content.trim(),
      shortcut: normalizedShortcut || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar resposta rápida' : 'Nova resposta rápida'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input
                list="platform-crm-quick-reply-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Vendas, Saudações..."
              />
              <datalist id="platform-crm-quick-reply-categories">
                {SUGGESTED_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>Atalho (opcional)</Label>
              <Input
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="/preco"
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Apresentação do produto"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label>Conteúdo</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Olá {{nome}}! O {{produto}} é a solução..."
              rows={6}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="px-1 bg-muted rounded">{'{{nome}}'}</code> e{' '}
              <code className="px-1 bg-muted rounded">{'{{produto}}'}</code> como variáveis dinâmicas.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || !content.trim() || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PlatformCrmQuickRepliesManager;
