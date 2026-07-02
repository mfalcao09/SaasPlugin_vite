import { ImageUpload } from '@/components/ui/image-upload';

interface PlatformCrmSquadIconUploadProps {
  currentIcon?: string | null;
  onIconChange: (url: string | null) => void;
  squadName?: string;
  color?: string;
}

/**
 * Upload de ícone do squad no CRM de PLATAFORMA (super_admin). Port 1:1 do
 * `SquadIconUpload` do CRM Vendus — reutiliza o mesmo bucket público
 * `squad-icons` já existente no projeto. Sem escopo de tenant.
 */
export function PlatformCrmSquadIconUpload({
  currentIcon,
  onIconChange,
}: PlatformCrmSquadIconUploadProps) {
  return (
    <ImageUpload
      value={currentIcon || ''}
      onChange={(url) => onIconChange(url || null)}
      onRemove={() => onIconChange(null)}
      bucket="squad-icons"
      folder="icons"
      label="Ícone do Time"
      description="PNG, JPG ou WEBP. Máx 1MB."
      aspectRatio="square"
      maxSizeMB={1}
      showUrlInput={false}
    />
  );
}

export default PlatformCrmSquadIconUpload;
