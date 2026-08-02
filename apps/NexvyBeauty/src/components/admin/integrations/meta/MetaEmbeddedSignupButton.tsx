// ⚠️ STUB — NÃO É A IMPLEMENTAÇÃO REAL.
//
// A implementação de verdade vive na branch da TRILHA S
// (worktree `priceless-neumann-63c32d` / branch `claude/priceless-neumann-63c32d`),
// já escrita e verificada por ela: `deno check` limpo na edge function,
// `tsc --noEmit` e `eslint` limpos no componente.
//
// POR QUE ESTE ARQUIVO EXISTE AQUI: o painel de conexões (EvolutionInstancesPanel)
// importa este componente de forma ESTÁTICA. Import estático de arquivo inexistente
// quebra o BUILD do Vite — não é erro de runtime que dê para tolerar. O slot precisa
// de um arquivo presente dos dois lados do merge.
//
// NO MERGE: a versão da Trilha S DEVE sobrescrever esta. Se houver conflito, a
// resolução é sempre "fica a dela" — este arquivo não tem nada a preservar.
//
// Enquanto o stub estiver no lugar, a aba "WhatsApp Oficial" renderiza apenas o
// caminho manual. É exatamente o comportamento desejado: nunca um botão quebrado
// na cara do tenant.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ARMADILHA DESTE ARQUIVO — leia antes de debugar "o botão não aparece"
//
// O componente REAL retorna `null` quando falta env var (decisão deliberada da
// Trilha S: nunca botão quebrado). Este stub TAMBÉM retorna `null`. Os dois
// estados são clinicamente INDISTINGUÍVEIS em produção:
//
//   stub venceu o merge          → aba sem botão, console limpo, build verde
//   real + env faltando          → aba sem botão, console limpo, build verde
//
// E a hipótese plausível ("faltou configurar a env") ENCOBRE a real. Quem for
// investigar vai conferir as env vars, achá-las corretas, e ficar sem próxima
// hipótese — porque tudo que um verificador olharia (arquivo existe, caminho
// certo, símbolo exportado, tipo certo, build verde) está correto.
//
// CHECK BINÁRIO — rode DEPOIS do merge e ANTES de qualquer deploy:
//
//   grep -q "NEXVY_STUB_SENTINEL_META_SIGNUP" \
//     apps/NexvyBeauty/src/components/admin/integrations/meta/MetaEmbeddedSignupButton.tsx \
//     && echo "FAIL — STUB VENCEU O MERGE" || echo "PASS — implementacao real"
//
// POR QUE O MARCADOR É DO STUB, E NÃO DA IMPLEMENTAÇÃO REAL:
// a primeira versão deste check procurava `WA_EMBEDDED_SIGNUP` (string que só a
// implementação real teria). Ao escrever a instrução AQUI DENTRO, a string passou
// a existir no stub — e o check começou a dar PASS no próprio stub. O antídoto se
// autoenvenenou no ato de ser documentado.
// Marcador que vive no STUB não tem esse problema: ele some junto com o arquivo
// quando a versão real vencer o merge. Documentá-lo não o falsifica.
// ─────────────────────────────────────────────────────────────────────────────
//
// NEXVY_STUB_SENTINEL_META_SIGNUP — não remova esta linha sem remover o arquivo.

/** Props do slot — contrato acordado com a Trilha S por mensagem triangulada. */
export interface MetaEmbeddedSignupButtonProps {
  /** Chamado após conectar com sucesso, para o painel recarregar a lista. */
  onConnected?: () => void;
}

export function MetaEmbeddedSignupButton(_props: MetaEmbeddedSignupButtonProps) {
  return null;
}

export default MetaEmbeddedSignupButton;
