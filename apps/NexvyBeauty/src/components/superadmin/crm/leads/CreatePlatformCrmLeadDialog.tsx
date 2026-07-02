import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, User, Building, Mail, Phone, FileText } from 'lucide-react';
import { LEAD_ORIGINS, LEAD_CHANNELS } from '@/hooks/useLeadTracking';
import type { PlatformCrmStage } from '../data/usePlatformCrmStages';

/**
 * Criação de lead no CRM de PLATAFORMA (super_admin) — pipeline único, desacoplado do
 * tenant. Porte 1:1 do CreateLeadDialog: nome, empresa, email, telefone, cargo,
 * temperatura, origem, canal, estágio, valor, vendedor (rep da plataforma), squad,
 * observações. "Produto" DROPADO (plataforma sem catálogo). Zero organization_id.
 */
const NONE = '__none';

const formSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  company: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  position: z.string().optional(),
  temperature: z.enum(['hot', 'warm', 'cold']).default('warm'),
  lead_origin: z.string().optional(),
  lead_channel: z.string().optional(),
  stageId: z.string().optional(),
  dealValue: z.string().optional(),
  assigned_to: z.string().optional(),
  squad_id: z.string().optional(),
  notes: z.string().optional(),
});

export type CreatePlatformCrmLeadFormData = z.infer<typeof formSchema>;

/** Payload já normalizado para a mutation de criação de `platform_crm_leads`. */
export interface CreatePlatformCrmLeadValues {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  temperature: 'hot' | 'warm' | 'cold';
  lead_origin: string | null;
  lead_channel: string | null;
  current_stage_id: string | null;
  deal_value: number | null;
  assigned_to: string | null;
  squad_id: string | null;
  notes: string | null;
}

interface CreatePlatformCrmLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreatePlatformCrmLeadValues) => void;
  isLoading?: boolean;
  stages: PlatformCrmStage[];
  sellers: { id: string; full_name: string }[];
  squads: { id: string; name: string }[];
}

export function CreatePlatformCrmLeadDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  stages,
  sellers,
  squads,
}: CreatePlatformCrmLeadDialogProps) {
  const form = useForm<CreatePlatformCrmLeadFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      company: '',
      email: '',
      phone: '',
      position: '',
      temperature: 'warm',
      lead_origin: '',
      lead_channel: '',
      stageId: NONE,
      dealValue: '',
      assigned_to: '',
      squad_id: '',
      notes: '',
    },
  });

  const handleSubmit = (data: CreatePlatformCrmLeadFormData) => {
    const parsedValue =
      data.dealValue && data.dealValue.trim() !== ''
        ? Number(data.dealValue.replace(/[^\d.,-]/g, '').replace(',', '.'))
        : null;

    onSubmit({
      name: data.name,
      company: data.company?.trim() ? data.company.trim() : null,
      email: data.email?.trim() ? data.email.trim() : null,
      phone: data.phone?.trim() ? data.phone.trim() : null,
      position: data.position?.trim() ? data.position.trim() : null,
      temperature: data.temperature,
      lead_origin: data.lead_origin || null,
      lead_channel: data.lead_channel || null,
      current_stage_id: data.stageId && data.stageId !== NONE ? data.stageId : null,
      deal_value: parsedValue != null && !Number.isNaN(parsedValue) ? parsedValue : null,
      assigned_to: data.assigned_to || null,
      squad_id: data.squad_id || null,
      notes: data.notes?.trim() ? data.notes.trim() : null,
    });
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Novo Lead
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Nome + Temperatura */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do lead" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperatura</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="hot">🔥 Quente</SelectItem>
                        <SelectItem value="warm">🌡️ Morno</SelectItem>
                        <SelectItem value="cold">❄️ Frio</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Email + Telefone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Telefone
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="(11) 99999-9999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Empresa + Cargo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Building className="h-3 w-3" /> Empresa
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Nome da empresa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl>
                      <Input placeholder="Cargo/Função" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Origem + Canal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lead_origin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origem</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a origem" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAD_ORIGINS.map((origin) => (
                          <SelectItem key={origin.value} value={origin.value}>
                            {origin.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lead_channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Canal</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o canal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAD_CHANNELS.map((channel) => (
                          <SelectItem key={channel.value} value={channel.value}>
                            {channel.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Estágio + Valor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="stageId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estágio</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem estágio</SelectItem>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dealValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (R$)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="0,00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Vendedor + Squad */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assigned_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sellers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="squad_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Squad</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {squads.map((squad) => (
                          <SelectItem key={squad.id} value={squad.id}>
                            {squad.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Observações */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Observações
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Notas iniciais sobre o lead..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Lead
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
