import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePlatformCrmTags } from '../data/usePlatformCrmTags';
import type { PlatformActionsConfig, PlatformActionConfig } from '../data/usePlatformCrmRadar';

/**
 * Ações automáticas por classificação (HOT/WARM/COLD/LOST) do Radar IA.
 * PORTE 1:1 de `admin/radar/RadarActionsConfig.tsx` do CRM Vendus.
 * Etiquetas = `platform_crm_lead_tags` (hook existente).
 */

interface Props {
  value: PlatformActionsConfig;
  onChange: (v: PlatformActionsConfig) => void;
}

const CLASSES: { key: keyof PlatformActionsConfig; label: string; emoji: string; color: string }[] =
  [
    { key: 'hot', label: 'HOT — Quente', emoji: '🔥', color: 'text-red-500' },
    { key: 'warm', label: 'WARM — Morno', emoji: '🌤️', color: 'text-orange-500' },
    { key: 'cold', label: 'COLD — Frio', emoji: '❄️', color: 'text-blue-500' },
    { key: 'lost', label: 'LOST — Perdido', emoji: '💀', color: 'text-muted-foreground' },
  ];

export function RadarActionsConfig({ value, onChange }: Props) {
  const { data: tags } = usePlatformCrmTags();

  function update(key: keyof PlatformActionsConfig, patch: Partial<PlatformActionConfig>) {
    onChange({ ...value, [key]: { ...(value[key] || {}), ...patch } });
  }

  return (
    // Ações do Radar = surface-card lux (mesma anatomia do painel de filtros).
    <div className="surface-card p-4">
      <div className="pb-3">
        <h3 className="text-base font-semibold">Ações automáticas</h3>
        <p className="text-xs text-muted-foreground">
          O que fazer quando o radar classificar cada lead
        </p>
      </div>
      <div className="space-y-4">
        {CLASSES.map(({ key, label, emoji, color }) => {
          const cfg = value[key] || {};
          return (
            <div key={key} className="rounded-md border hairline p-3 space-y-2">
              <div className={`text-sm font-medium ${color}`}>
                {emoji} {label}
              </div>

              <div className="flex items-center justify-between text-sm">
                <Label className="cursor-pointer flex-1">Criar tarefa para o dono</Label>
                <Switch
                  checked={!!cfg.create_task?.enabled}
                  onCheckedChange={(v) =>
                    update(key, {
                      create_task: {
                        enabled: v,
                        due_in_hours: cfg.create_task?.due_in_hours ?? 24,
                      },
                    })
                  }
                />
              </div>

              {cfg.create_task?.enabled && (
                <div className="flex items-center gap-2 pl-2">
                  <Label className="text-xs text-muted-foreground">Prazo (h):</Label>
                  <Input
                    type="number"
                    className="h-7 w-16 text-xs"
                    value={cfg.create_task?.due_in_hours ?? 24}
                    onChange={(e) =>
                      update(key, {
                        create_task: { enabled: true, due_in_hours: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <Label className="cursor-pointer flex-1">Notificar dono do lead</Label>
                <Switch
                  checked={!!cfg.notify_owner}
                  onCheckedChange={(v) => update(key, { notify_owner: v })}
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <Label className="cursor-pointer flex-1">Aplicar etiqueta</Label>
                <Select
                  value={cfg.apply_tag_id || ''}
                  onValueChange={(v) =>
                    update(key, { apply_tag_id: v === '__none__' ? undefined : v })
                  }
                >
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {(tags || []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
