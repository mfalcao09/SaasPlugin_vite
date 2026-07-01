import { ComingSoonSection } from '@/components/admin/ComingSoonSection';

interface EmBreveProps {
  /** Título da seção que ainda não foi importada. */
  titulo: string;
  /** Texto complementar opcional (default menciona o CRM Vendus). */
  descricao?: string;
}

/**
 * Stub das seções do módulo Vendas ainda não portadas.
 *
 * Wrapper fino sobre `ComingSoonSection` (anti-NIH): reusa o card visual
 * existente e apenas fixa a mensagem canônica "importado do CRM Vendus".
 * Mantém o desacoplamento — zero dependência do cockpit do tenant.
 */
export function EmBreve({ titulo, descricao }: EmBreveProps) {
  return (
    <ComingSoonSection
      title={titulo}
      description={descricao ?? 'Em breve — importado do CRM Vendus.'}
    />
  );
}

export default EmBreve;
