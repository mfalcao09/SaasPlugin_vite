import { ComingSoonSection } from '@/components/admin/ComingSoonSection';

/**
 * STUB HONESTO — Importação por vídeo (Prospecção Ativa).
 *
 * Ideia: subir um vídeo (ex.: gravação de tela rolando um perfil/feed) → Gemini
 * extrai os @handles → entram na base. ⚠️ O BACKEND NÃO EXISTE: foi verificado que
 * NENHUMA edge function faz vídeo→Gemini→handles hoje (só `manual-outreach`, que é
 * para a futura tela de Campanhas). Este stub deixa isso explícito para não vender
 * uma capacidade inexistente. Requer construir a edge de extração antes de qualquer
 * UI de upload.
 */
export function ProspeccaoVideoImportStub() {
  return (
    <ComingSoonSection
      title="Importação por vídeo"
      description="Backend ainda não existe. A ideia (subir vídeo → Gemini extrai @handles → entram na base) precisa de uma edge function de extração que ainda não foi construída — nenhuma existe hoje. Sem backend, não há upload real."
    />
  );
}

export default ProspeccaoVideoImportStub;
