// ============================================================================
// EXEMPLOS CANÔNICOS — Camada B do ensino da IA extratora
//
// Cada exemplo é um par (texto de entrada → julgamento correto), incluindo os
// NEGATIVOS: casos que PARECEM ato e não são — é neles que o modelo erra e é
// neles que a validação humana ensina. Fonte dos negativos: erros REAIS
// encontrados na validação (ex.: o caso FESA/666 achado pelo Marcelo em
// 2026-07-24 na edição DOMS 12230, pág. 12).
//
// Curadoria: entra aqui o exemplo CURTO e inequívoco. Casos longos/ambíguos
// vivem no eval (Camada C), não no prompt.
// ============================================================================

export const EXEMPLOS_TRIAGEM = [
  // ---- POSITIVOS -----------------------------------------------------------
  {
    entrada:
`PORTARIA Nº 065/2026, DE 22 DE JULHO DE 2026.
A DIRETORA-PRESIDENTE DA COMPANHIA DE GÁS DO ESTADO DE MATO GROSSO DO SUL - MSGÁS no uso de
suas atribuições legais e conforme o disposto no item 6, do Manual de Fiscalização de Contratos desta Companhia
resolve:
1º Revogar a Portaria nº 090/2025, de 28 de novembro de 2025, publicada no Diário Oficial do Estado nº 12.011,
pág.49, de 2 de dezembro de 2025.`,
    saida: {
      classe: 'ato_publicado',
      justificativa: 'Cabeçalho próprio em caixa alta + texto integral com dispositivo (resolve).',
      cabecalho: 'PORTARIA Nº 065/2026, DE 22 DE JULHO DE 2026.',
    },
  },
  {
    entrada:
`Conceder a FÁBIO POSSIK SALAMENE, Juiz de Direito Substituto em Segundo Grau, 3 (três) dias de afastamento
compensatório, no período de 12 a 14/8/2026, referente aos plantões do recesso forense de 2018/2019, nos termos
do artigo 268, § 2º, do CODJ/MS. P. R. C. (Port. n.º 2262/2026)`,
    saida: {
      classe: 'ato_publicado',
      justificativa: 'Parágrafo dispositivo do DJMS fechado pela marca (Port. n.º 2262/2026) — padrão do Diário da Justiça.',
      cabecalho: '(Port. n.º 2262/2026)',
    },
  },
  // ---- NEGATIVOS (erros reais de extração) ---------------------------------
  {
    // O caso encontrado pelo Marcelo: citação dentro de listagem FESA
    // promovida a "RESOLUÇÃO 666" pela heurística. NÃO é ato publicado.
    entrada:
`PROCESSO: 270126492023 NE: 007687
FONTE: 160500001 - FESA - Piso Salarial Enfermagem AMPARO LEGAL/FUNDAMENTAÇÃO LEGAL: PORTARIAS
8.565 E 8.935 - PISO SALARIAL ENFERMAGEM ORDENADOR DE DESPESA: ANTONIO CESAR NAGLIS
OBJETO: TRANSFERENCIA DE RECURSOS REFERENTE ASSISTENCIA FINANCEIRA COMPLEMENTAR DA UNIÃO -
PISO NACIONAL DE ENFERMAGEM, COMPETÊNCIAS MAIO/2026. CONFORME PORTARIAS 8.565 E 8.935,
RESOLUÇÃO SES/MS Nº 666, DE 18 DE JUNHO DE 2026.`,
    saida: {
      classe: 'lista_empenho',
      justificativa: 'Bloco financeiro (PROCESSO/NE/FONTE/ORDENADOR). A RESOLUÇÃO 666 é apenas CITADA ("CONFORME…") — o texto integral dela não está aqui.',
      cabecalho: null,
    },
  },
  {
    entrada:
`2º Designar os seguintes empregados para compor a Equipe de Fiscalização do contrato de adesão AD-006/2025.
Revogar a Portaria nº 090/2025, de 28 de novembro de 2025, publicada no Diário Oficial do Estado nº 12.011.`,
    saida: {
      classe: 'citacao',
      justificativa: 'A Portaria 090/2025 é o ALVO da revogação (citada com "publicada no D.O. nº…"); o ato publicado é o que revoga, não ela.',
      cabecalho: null,
    },
  },
  {
    entrada:
`EXTRATO DE SEGUNDO ADITAMENTO Nº CT-020/2024 - Processo Administrativo Nº 185/2023-D
-CONTRATADO: GASCAT INDUSTRIA E COMERCIO LTDA. OBJETO: Alteração da Cláusula Sétima – Prazos
(item 7.1.1), visando à prorrogação do prazo de vigência. DATA DA ASSINATURA: instrumento emitido em 17/07/2026.`,
    saida: {
      classe: 'nao_normativo',
      justificativa: 'Extrato de aditamento contratual — publicidade de contrato, não ato normativo.',
      cabecalho: null,
    },
  },
  {
    entrada: `(a) Desembargador DORIVAL RENATO PAVAN Presidente`,
    saida: {
      classe: 'nao_normativo',
      justificativa: 'Assinatura isolada do ato anterior, não um ato.',
      cabecalho: null,
    },
  },
];

export const EXEMPLOS_CAMPOS = [
  {
    entrada:
`PORTARIA Nº 065/2026, DE 22 DE JULHO DE 2026.
A DIRETORA-PRESIDENTE DA COMPANHIA DE GÁS DO ESTADO DE MATO GROSSO DO SUL - MSGÁS no uso de
suas atribuições legais resolve:
1º Revogar a Portaria nº 090/2025, de 28 de novembro de 2025, publicada no Diário Oficial do Estado nº 12.011.
2º Designar os seguintes empregados para compor a Equipe de Fiscalização do contrato de adesão AD-006/2025.`,
    saida: {
      tipo: 'Portaria',
      tipo_completo: 'PORTARIA',
      numero: '065',
      ano: 2026,
      data_ato: '2026-07-22',
      orgao_emissor: 'Companhia de Gás do Estado de Mato Grosso do Sul - MSGÁS',
      ementa: 'Revogar a Portaria nº 090/2025 e designar empregados para compor a Equipe de Fiscalização do contrato de adesão AD-006/2025.',
      ancora_inicio: 'PORTARIA Nº 065/2026, DE 22 DE JULHO DE 2026',
      ancora_fim: 'contrato de adesão AD-006/2025',
    },
  },
];

export const EXEMPLOS_RELACOES = [
  {
    entrada:
`1º Revogar a Portaria nº 090/2025, de 28 de novembro de 2025, publicada no Diário Oficial do Estado nº 12.011.`,
    saida: [{
      verbo: 'revoga',
      destino: { tipo: 'Portaria', numero: '090', ano: 2025 },
      evidencia: 'Revogar a Portaria nº 090/2025, de 28 de novembro de 2025',
    }],
  },
];
