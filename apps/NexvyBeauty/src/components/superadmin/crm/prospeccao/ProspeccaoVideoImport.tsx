import { VideoImportBlock } from './VideoImportBlock';

/**
 * Tela "Importação por vídeo" (Prospecção Ativa) — hoje é só a CASCA de página do
 * `VideoImportBlock`, que passou a ser reusável para também ser montado como cartão
 * na página "Nova Importação".
 *
 * A rota continua registrada e a tela, idêntica ao que está no ar. Quando a "Nova
 * Importação" estiver validada, remover ESTE item do menu é decisão do Marcelo — não
 * do refactor; por isso nada foi removido aqui.
 */
export function ProspeccaoVideoImport() {
  return <VideoImportBlock variant="page" />;
}

export default ProspeccaoVideoImport;
