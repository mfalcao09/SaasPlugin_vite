import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PlatformCrmImageUploadFieldProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  label: string;
  helper?: string;
  folder?: string; // ex: 'avatars', 'logos', 'backgrounds'
  /**
   * Escopo do path no Storage. Sem organization_id (CRM de plataforma), o path é
   * prefixado por `platform/{funnelId}/...` — espelhando o padrão já usado em
   * `PlatformCrmFormBlockEditor` (bucket `form-media`).
   */
  funnelId?: string;
}

// Mesmo bucket usado pelo restante da captação super-admin (ver PlatformCrmFormBlockEditor).
// ⚠️ Storage: o bucket `form-media` + policy podem precisar de config de plataforma
// (upload sem organization_id). Não é criado aqui — reusa o mesmo do modelo.
const BUCKET = 'form-media';
const MAX = 5 * 1024 * 1024;

export function PlatformCrmImageUploadField({
  value,
  onChange,
  label,
  helper,
  folder = 'general',
  funnelId,
}: PlatformCrmImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > MAX) { toast.error('Máx. 5MB'); return; }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      // Sem organization_id: path prefixado por `platform/{funnelId}`.
      const scope = funnelId || 'general';
      const path = `platform/${scope}/${folder}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, cacheControl: '3600' });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success('Imagem enviada');
    } catch (e: any) {
      toast.error(e.message || 'Falha no upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative h-16 w-16 rounded-md overflow-hidden border bg-muted">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="h-16 w-16 rounded-md border-2 border-dashed border-border bg-muted/30" />
        )}

        <div className="flex-1 space-y-1.5">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Upload className="h-3 w-3 mr-1.5" />}
              {value ? 'Trocar' : 'Enviar'}
            </Button>
            <Input
              type="url"
              placeholder="ou cole uma URL"
              value={value || ''}
              onChange={(e) => onChange(e.target.value || null)}
              className="h-8 text-xs flex-1"
            />
          </div>
          {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
