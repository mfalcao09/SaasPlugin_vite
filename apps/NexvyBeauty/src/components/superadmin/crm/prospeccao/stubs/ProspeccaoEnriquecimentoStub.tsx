import { ComingSoonSection } from '@/components/admin/ComingSoonSection';

/**
 * STUB — Enriquecimento pela UI (Prospecção Ativa).
 *
 * Futuro: rodar o Apify SÓ nos leads faltantes (sem telefone/e-mail) direto pela
 * tela, respeitando a regra-mãe do Marcelo — nunca re-enriquecer quem já tem o
 * dado, e quem seguir sem telefone vira `acionamento_via_instagram` (DM). Estrutura
 * no menu já garantida; a orquestração a fundo fica para a próxima fase.
 */
export function ProspeccaoEnriquecimentoStub() {
  return (
    <ComingSoonSection
      title="Enriquecimento (UI)"
      description="Em construção — rodar o Apify só nos leads faltantes (sem telefone/e-mail) pela tela; quem seguir sem telefone é marcado como acionamento via Instagram (DM)."
    />
  );
}

export default ProspeccaoEnriquecimentoStub;
