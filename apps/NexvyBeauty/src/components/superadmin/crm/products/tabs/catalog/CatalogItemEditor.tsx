// Porte de `.vendus-src-reference/src/components/admin/products/tabs/catalog/CatalogItemEditor.tsx`
// Sem organization_id. Persistência: TODO(table: platform_crm_product_catalog_items).
// Mídia: o CatalogMediaUploader da fonte (331 l., bucket `catalog-media` org-scoped)
// foi portado inline aqui como uploader real — sobe fotos/vídeos/documentos para o
// bucket público product-scoped `product-documents` (mesmo do Cérebro do Produto /
// BrainTab), em path `platform/catalog/<productId>/<kind>/...`, pega a publicUrl e
// grava nas listas do item. A opção de colar URL fica como fallback.
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Image as ImageIcon, Video, FileText, Upload, Loader2 } from 'lucide-react';
import { useCreateProductCatalogItem, useUpdateProductCatalogItem, type ProductCatalogItem } from '../../hooks/useProductHubStubs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Bucket product-scoped público (mesmo do BrainTab/Cérebro). RLS: leitura pública,
// INSERT exclusivo super_admin (este editor vive sob /superadmin/). Ver migration
// supabase/migrations_platform_crm/20260711_product_documents_bucket.sql.
const CATALOG_BUCKET = 'product-documents' as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

type CatalogFileKind = 'image' | 'video' | 'document';

function classifyCatalogFile(file: File): CatalogFileKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'document';
  // DOC/DOCX/TXT e afins também entram como documento.
  if (/\.(pdf|docx?|txt|rtf|xlsx?|pptx?|csv)$/i.test(file.name)) return 'document';
  return null;
}

function catalogMediaPath(productId: string, kind: CatalogFileKind, file: File): string {
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return `platform/catalog/${productId}/${kind}/${ts}-${rnd}-${safeName}`;
}

interface Props {
  productId: string;
  item?: ProductCatalogItem | null;
  open: boolean;
  onClose: () => void;
}

export function CatalogItemEditor({ productId, item, open, onClose }: Props) {
  const createItem = useCreateProductCatalogItem();
  const updateItem = useUpdateProductCatalogItem();
  const save = item ? updateItem : createItem;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Array<{ url: string; name: string; type?: string }>>([]);
  const [mediaInput, setMediaInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [attrPairs, setAttrPairs] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);
  const [isActive, setIsActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description || '');
      setPrice(item.price?.toString() || '');
      setUrl(item.url || '');
      setThumbnailUrl(item.thumbnail_url || '');
      setImages(item.images || []);
      setVideos(item.videos || []);
      setDocuments(item.documents || []);
      setTags(item.tags || []);
      const pairs = Object.entries(item.attributes || {}).map(([k, v]) => ({ key: k, value: String(v) }));
      setAttrPairs(pairs.length ? pairs : [{ key: '', value: '' }]);
      setIsActive(item.is_active);
    } else {
      setTitle('');
      setDescription('');
      setPrice('');
      setUrl('');
      setThumbnailUrl('');
      setImages([]);
      setVideos([]);
      setDocuments([]);
      setTags([]);
      setAttrPairs([{ key: '', value: '' }]);
      setIsActive(true);
    }
    setMediaInput('');
  }, [item, open]);

  const addTag = () => {
    const t = tagsInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagsInput('');
  };

  const addMediaUrl = () => {
    const u = mediaInput.trim();
    if (!u) return;
    if (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(u)) setImages([...images, u]);
    else if (/(youtube\.com|youtu\.be|vimeo\.com|\.mp4)/i.test(u)) setVideos([...videos, u]);
    else setDocuments([...documents, { url: u, name: u.split('/').pop() || 'documento' }]);
    setMediaInput('');
  };

  // Upload real: sobe cada arquivo para o bucket product-scoped e grava a publicUrl
  // na lista certa (fotos/vídeos/documentos). Vários arquivos por vez são suportados.
  const handleUploadFiles = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    if (!productId) {
      toast.error('Produto inválido para upload.');
      return;
    }
    setUploading(true);
    const nextImages = [...images];
    const nextVideos = [...videos];
    const nextDocs = [...documents];
    try {
      for (const file of files) {
        const kind = classifyCatalogFile(file);
        if (!kind) {
          toast.error(`Formato não suportado: ${file.name}`);
          continue;
        }
        const limit =
          kind === 'image' ? MAX_IMAGE_BYTES : kind === 'video' ? MAX_VIDEO_BYTES : MAX_DOC_BYTES;
        if (file.size > limit) {
          toast.error(
            `Arquivo muito grande (${file.name}): máx ${Math.round(limit / 1024 / 1024)}MB.`,
          );
          continue;
        }

        const path = catalogMediaPath(productId, kind, file);
        const { error: upErr } = await supabase.storage
          .from(CATALOG_BUCKET)
          .upload(path, file, {
            upsert: false,
            contentType: file.type || 'application/octet-stream',
            cacheControl: '3600',
          });
        if (upErr) {
          console.error('[CatalogItemEditor] upload falhou:', upErr);
          toast.error(`Erro ao enviar ${file.name}: ${upErr.message || 'desconhecido'}`);
          continue;
        }

        const { data: pub } = supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path);
        const publicUrl = pub.publicUrl;
        if (kind === 'image') nextImages.push(publicUrl);
        else if (kind === 'video') nextVideos.push(publicUrl);
        else nextDocs.push({ url: publicUrl, name: file.name, type: file.type || undefined });
      }
      setImages(nextImages);
      setVideos(nextVideos);
      setDocuments(nextDocs);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const attributes: Record<string, any> = {};
    attrPairs.forEach((p) => {
      if (p.key.trim()) {
        const num = Number(p.value);
        attributes[p.key.trim()] = !isNaN(num) && p.value.trim() !== '' ? num : p.value;
      }
    });
    const finalThumb = thumbnailUrl.trim() || images[0] || null;

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      price: price ? Number(price) : null,
      url: url.trim() || null,
      thumbnail_url: finalThumb,
      images,
      videos,
      documents,
      tags,
      attributes,
      is_active: isActive,
      product_id: productId,
    };

    try {
      if (item) {
        await updateItem.mutateAsync({ id: item.id, ...payload });
        toast.success('Item atualizado');
      } else {
        await createItem.mutateAsync(payload);
        toast.success('Item adicionado ao catálogo');
      }
      onClose();
    } catch (e: any) {
      console.error('[CatalogItemEditor] salvar falhou:', e);
      toast.error('Erro ao salvar item: ' + (e?.message ?? 'desconhecido'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar item' : 'Novo item do catálogo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Apartamento 2Q Batel" />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Sacada, 1 vaga, 65m²..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Preço (BRL)</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="580000" />
            </div>
            <div>
              <Label>Link público</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>📦 Mídia do item (fotos, vídeos, documentos)</Label>
            {/* Uploader real → bucket product-scoped (product-documents). */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx,.csv"
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
              disabled={uploading}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {uploading ? 'Enviando...' : 'Enviar arquivo (foto, vídeo ou documento)'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Imagem até 5MB · vídeo até 25MB · documento até 10MB.
            </p>
            {/* Fallback: colar a URL de uma mídia já hospedada. */}
            <div className="flex gap-2">
              <Input
                value={mediaInput}
                onChange={(e) => setMediaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMediaUrl(); } }}
                placeholder="Ou cole a URL da foto, vídeo ou documento"
                disabled={uploading}
              />
              <Button type="button" variant="outline" onClick={addMediaUrl} disabled={uploading}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {images.map((u, i) => (
                <Badge key={`img-${i}`} variant="secondary" className="gap-1">
                  <ImageIcon className="h-3 w-3" /> foto {i + 1}
                  <button onClick={() => setImages(images.filter((_, x) => x !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {videos.map((u, i) => (
                <Badge key={`vid-${i}`} variant="secondary" className="gap-1">
                  <Video className="h-3 w-3" /> vídeo {i + 1}
                  <button onClick={() => setVideos(videos.filter((_, x) => x !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {documents.map((d, i) => (
                <Badge key={`doc-${i}`} variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" /> {d.name}
                  <button onClick={() => setDocuments(documents.filter((_, x) => x !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="pt-2">
              <Label className="text-xs text-muted-foreground">Ou cole URL da capa manualmente</Label>
              <Input
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://...jpg"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <Label>Etiquetas</Label>
            <div className="flex gap-2">
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="destaque, novo, promoção"
              />
              <Button type="button" variant="outline" onClick={addTag}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button onClick={() => setTags(tags.filter((x) => x !== t))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Atributos (filtro de busca)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAttrPairs([...attrPairs, { key: '', value: '' }])}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {attrPairs.map((pair, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="bairro"
                    value={pair.key}
                    onChange={(e) => {
                      const a = [...attrPairs]; a[i] = { ...a[i], key: e.target.value }; setAttrPairs(a);
                    }}
                  />
                  <Input
                    placeholder="Batel"
                    value={pair.value}
                    onChange={(e) => {
                      const a = [...attrPairs]; a[i] = { ...a[i], value: e.target.value }; setAttrPairs(a);
                    }}
                  />
                  <Button
                    type="button" size="icon" variant="ghost"
                    onClick={() => setAttrPairs(attrPairs.filter((_, x) => x !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ex: bairro=Batel · cidade=Curitiba · quartos=2 · area=65
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label>Ativo (visível para a IA)</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!title.trim() || save.isPending}>
            {item ? 'Salvar' : 'Criar item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
