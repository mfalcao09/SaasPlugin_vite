// ÚNICA definição de "o self-service da Meta está habilitado neste build".
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE — invariante herdado do nó 1, em
// `EvolutionInstancesPanel.tsx`, e violado por mim ao portar a UI do Intentus:
//
//   "um estado, um dono. Se você sentir vontade de condicionar texto DESTE
//    arquivo às VITE_META_*, pare — é a causa raiz voltando com outra roupa."
//
// A causa raiz foi a tela afirmar duas coisas ao mesmo tempo (um botão de
// auto-conexão e, logo abaixo, "para conectar, fale com o suporte"), porque dois
// componentes decidiam sobre o MESMO estado sem se falarem.
//
// A distinção que faz o desenho funcionar: o invariante é violado por duas
// DEFINIÇÕES, não por dois LEITORES. Uma definição com N leitores não pode
// divergir; duas definições divergem em silêncio, cada uma internamente correta.
// Então a condição mora aqui, e quem precisar dela IMPORTA — nunca reescreve.
//
// O Vite inlina `import.meta.env.VITE_*` como literal em BUILD-TIME, e o build
// roda DENTRO do container: variável exportada no shell do VPS não chega lá. O
// caminho é `apps/NexvyBeauty/.env.production`, versionado de propósito
// (`.gitignore` des-ignora) e copiado pelo `Dockerfile.app`.
export const META_APP_ID = import.meta.env.VITE_META_WHATSAPP_APP_ID as string | undefined;
export const META_CONFIG_ID = import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID as
  | string
  | undefined;
export const META_GRAPH_VERSION =
  (import.meta.env.VITE_META_GRAPH_VERSION as string | undefined) ?? 'v21.0';

/** true quando o build tem as duas variáveis. Fonte única — não reescreva. */
export const SELF_SERVICE_ENABLED = Boolean(META_APP_ID && META_CONFIG_ID);
