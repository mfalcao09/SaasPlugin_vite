import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, MoreVertical, Pencil, Trash2, FileText } from 'lucide-react';
import {
  usePlatformCrmCustomFields,
  useCreatePlatformCrmCustomField,
  useUpdatePlatformCrmCustomField,
  useDeletePlatformCrmCustomField,
  type PlatformCrmCustomField,
  type PlatformCrmCustomFieldType,
} from '@/components/superadmin/crm/data/usePlatformCrmCustomFields';

const FIELD_TYPE_LABELS: Record<PlatformCrmCustomFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  select: 'Seleção',
  boolean: 'Sim/Não',
  date: 'Data',
};

interface CustomFieldForm {
  name: string;
  field_key: string;
  field_type: PlatformCrmCustomFieldType;
  description: string;
  options: string[];
  is_active: boolean;
}

const emptyForm: CustomFieldForm = {
  name: '',
  field_key: '',
  field_type: 'text',
  description: '',
  options: [],
  is_active: true,
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** Converte o campo `options` (Json) da tabela em array de strings. */
function optionsToStrings(options: PlatformCrmCustomField['options']): string[] {
  if (Array.isArray(options)) {
    return options.filter((o): o is string => typeof o === 'string');
  }
  return [];
}

/**
 * Seção "Campos" do CRM de PLATAFORMA (super_admin). CRUD de campos
 * personalizados do pipeline único — só tabela platform_crm_custom_fields.
 */
export function PlatformCrmCustomFieldsManager() {
  const { data: fields = [], isLoading } = usePlatformCrmCustomFields();
  const createField = useCreatePlatformCrmCustomField();
  const updateField = useUpdatePlatformCrmCustomField();
  const deleteField = useDeletePlatformCrmCustomField();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomFieldForm>(emptyForm);
  const [optionInput, setOptionInput] = useState('');

  const filteredFields = useMemo(
    () => fields.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())),
    [fields, search],
  );

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOptionInput('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (field: PlatformCrmCustomField) => {
    setEditingId(field.id);
    setForm({
      name: field.name,
      field_key: field.field_key,
      field_type: field.field_type as PlatformCrmCustomFieldType,
      description: field.description ?? '',
      options: optionsToStrings(field.options),
      is_active: field.is_active,
    });
    setOptionInput('');
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.field_key.trim()) return;

    const payload = {
      name: form.name.trim(),
      field_key: form.field_key.trim(),
      field_type: form.field_type,
      description: form.description.trim() || null,
      options: form.field_type === 'select' ? form.options : [],
      is_active: form.is_active,
    };

    if (editingId) {
      updateField.mutate(
        { id: editingId, ...payload },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      createField.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const addOption = () => {
    const value = optionInput.trim();
    if (!value) return;
    setForm((prev) => ({ ...prev, options: [...prev.options, value] }));
    setOptionInput('');
  };

  const removeOption = (idx: number) => {
    setForm((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Campos Personalizados</h2>
          <p className="text-muted-foreground">
            Crie campos extras para armazenar dados nos contatos do funil da plataforma
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Criar Campo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar campo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filteredFields.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhum campo personalizado criado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredFields.map((field) => (
            <Card key={field.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium">{field.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {field.description || field.field_key}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {FIELD_TYPE_LABELS[field.field_type as PlatformCrmCustomFieldType] ??
                      field.field_type}
                  </Badge>
                  {!field.is_active && <Badge variant="outline">Inativo</Badge>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleOpenEdit(field)}>
                      <Pencil className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteField.mutate(field.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar Campo' : 'Novo Campo Personalizado'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Campo</Label>
              <Input
                placeholder="Ex: Faturamento mensal"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name,
                    field_key: editingId ? prev.field_key : slugify(name),
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Chave (slug)</Label>
              <Input
                value={form.field_key}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, field_key: e.target.value }))
                }
                disabled={!!editingId}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.field_type}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, field_type: v as PlatformCrmCustomFieldType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="select">Seleção</SelectItem>
                  <SelectItem value="boolean">Sim/Não</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.field_type === 'select' && (
              <div className="space-y-2">
                <Label>Opções</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar opção..."
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addOption}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.options.map((opt, i) => (
                    <Badge key={`${opt}-${i}`} variant="secondary" className="gap-1">
                      {opt}
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Campos inativos não aparecem nos formulários
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, is_active: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Para que serve este campo?"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !form.name.trim() ||
                !form.field_key.trim() ||
                createField.isPending ||
                updateField.isPending
              }
            >
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PlatformCrmCustomFieldsManager;
