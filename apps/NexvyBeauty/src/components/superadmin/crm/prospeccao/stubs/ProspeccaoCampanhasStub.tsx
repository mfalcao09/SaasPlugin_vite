import { ComingSoonSection } from '@/components/admin/ComingSoonSection';

/**
 * STUB — Campanhas de disparo / marketing (Prospecção Ativa).
 *
 * Futuro: selecionar um segmento/lista da Base consolidada → disparar mensagem em
 * massa via a edge `manual-outreach` (que JÁ existe no projeto). Backend de disparo
 * pronto; falta a UI de seleção + composição + agendamento. Estrutura no menu já
 * garantida; implementação a fundo fica para a próxima fase.
 */
export function ProspeccaoCampanhasStub() {
  return (
    <ComingSoonSection
      title="Campanhas de disparo"
      description="Em construção — selecionar segmento/lista da Base consolidada e disparar em massa via WhatsApp (edge manual-outreach já existe; falta a UI de composição e agendamento)."
    />
  );
}

export default ProspeccaoCampanhasStub;
