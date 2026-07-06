// Port do CBA (src/components/PageHeader.tsx) — header de página padronizado +
// FormDialog + NewButton. Shadcn puro (Dialog/Button), compatível 1:1 com o NX.
// Onda 1: padroniza o topo das telas tenant-facing (consumido no re-skin).
import { type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function PageHeader({
  title, description, action,
}: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function FormDialog({
  open, onOpenChange, title, trigger, children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  trigger?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function NewButton({ label = 'Novo', onClick }: { label?: string; onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus className="mr-2 h-4 w-4" /> {label}
    </Button>
  );
}
