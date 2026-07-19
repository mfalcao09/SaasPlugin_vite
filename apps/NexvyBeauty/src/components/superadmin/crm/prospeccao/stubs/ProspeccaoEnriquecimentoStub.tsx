import { ComingSoonSection } from '@/components/admin/ComingSoonSection';

/**
 * STUB — Enriquecimento pela UI (Prospecção Ativa).
 *
 * Futuro: rodar o Apify SÓ nos leads faltantes (aba "Sem WhatsApp" = fila de
 * enriquecimento) direto pela tela, respeitando a regra-mãe do Marcelo — nunca
 * re-enriquecer quem já tem o dado. O salão sem telefone CONTINUA Cliente (segmento =
 * posicionamento); o telefone define a ABA WhatsApp, não o segmento — ao preencher, o
 * lead migra de aba sozinho. Estrutura no menu já garantida; a orquestração a fundo
 * fica para a próxima fase.
 */
export function ProspeccaoEnriquecimentoStub() {
  return (
    <ComingSoonSection
      title="Enriquecimento (UI)"
      description="Em construção — rodar o Apify só nos leads faltantes pela tela (aba 'Sem WhatsApp' = fila de enriquecimento); ao preencher o telefone, o lead migra de aba sozinho."
    />
  );
}

export default ProspeccaoEnriquecimentoStub;
