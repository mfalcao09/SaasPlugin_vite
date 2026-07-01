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
import { Button } from '@/components/ui/button';
import { Loader2, User, Building, Mail, Phone } from 'lucide-react';
import type { PlatformCrmStage } from '../data/usePlatformCrmStages';

/**
 * Criação de lead no CRM de PLATAFORMA (super_admin) — pipeline único, desacoplado
 * do tenant. Campos suportados por `platform_crm_leads`: nome, empresa, email,
 * telefone, estágio (current_stage_id), temperatura, deal_value. Zero campo de salão.
 */
const NONE = '__none';

const formSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  company: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  stageId: z.string().optional(),
  temperature: z.enum(['hot', 'warm', 'cold']).default('warm'),
  dealValue: z.string().optional(),
});

export type CreatePlatformCrmLeadFormData = z.infer<typeof formSchema>;

/** Payload já normalizado para `useCreatePlatformCrmLead`. */
export interface CreatePlatformCrmLeadValues {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  current_stage_id: string | null;
  temperature: 'hot' | 'warm' | 'cold';
  deal_value: number | null;
}

interface CreatePlatformCrmLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreatePlatformCrmLeadValues) => void;
  isLoading?: boolean;
  stages: PlatformCrmStage[];
}

export function CreatePlatformCrmLeadDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  stages,
}: CreatePlatformCrmLeadDialogProps) {
  const form = useForm<CreatePlatformCrmLeadFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      company: '',
      email: '',
      phone: '',
      stageId: NONE,
      temperature: 'warm',
      dealValue: '',
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
      current_stage_id: data.stageId && data.stageId !== NONE ? data.stageId : null,
      temperature: data.temperature,
      deal_value: parsedValue != null && !Number.isNaN(parsedValue) ? parsedValue : null,
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
            {/* Nome + Empresa */}
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

            {/* Estágio + Temperatura + Valor */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
