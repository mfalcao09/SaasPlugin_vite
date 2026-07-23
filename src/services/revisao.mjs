// ============================================================================
// Serviço da fila de revisão — card C1.3 (PRD §6.2, princípio "IA propõe,
// humano dispõe")
//
// CRITÉRIO BINÁRIO DO CARD (PRD): "Ato com numero nulo NÃO aparece em nenhuma
// lista de disparo." Este arquivo é a camada que GARANTE isso — não apenas
// documenta a intenção.
//
// POR QUE A EXCLUSÃO DE status='revisao' EXISTE
// -----------------------------------------------------------------------
// O trigger `atos_indexar_e_triar` (migration 20260723000001) marca
// status='revisao' quando origem_extracao='ia' e falta numero/tipo/data_ato.
// Isso garante que o dado NASCE marcado como duvidoso. Mas marcar não basta:
// se qualquer query de produção esquecer o filtro de status, o ato duvidoso
// vaza pro boletim como se fosse fato — exatamente o que o PRD proíbe.
// Por isso `atosElegiveisParaDisparo` (a função que qualquer lista de disparo
// DEVE usar) usa uma ALLOWLIST (`status = 'ok'`), não uma denylist
// (`status <> 'revisao'`): se o schema ganhar um novo status no futuro (ex.:
// 'arquivado'), a denylist deixaria vazar por omissão; a allowlist não.
//
// BRECHA ENCONTRADA E MITIGADA AQUI (achado do card, fora do território de
// migration — reportado, não corrigido na migration):
// -----------------------------------------------------------------------
// A view `public.fila_revisao_relacoes` (migration §5) é dona de quem rodou
// a migration (tipicamente um role privilegiado/superuser). Testado
// empiricamente neste projeto: quando um role comum (`authenticated`) faz
// SELECT em uma view cuja query interna toca uma tabela com RLS, o Postgres
// avalia a policy usando o CONTEXTO DO DONO DA VIEW, não o do usuário que
// consultou — se o dono bypassa RLS (superuser, ou table owner sem
// FORCE ROW LEVEL SECURITY), a view devolve linhas de TODOS os tenants,
// mesmo com RLS habilitado na tabela base. É o "Security Definer View" que o
// linter do Supabase sinaliza (correção real seria
// `alter view ... set (security_invoker = on)` — mudança de migration, fora
// deste território).
//
// Por isso NENHUMA função abaixo faz `select * from fila_revisao_relacoes`
// sem filtro. Toda consulta de relações propostas aqui é feita DIRETO em
// `norma_relacoes`, com `instituicao_id = $1` explícito na query — que
// funciona corretamente porque RLS em tabela (não em view) é avaliada pelo
// role que está de fato conectado. Duas camadas: filtro explícito na query +
// RLS como defesa em profundidade, nunca apenas uma.
//
// ATOS NÃO SÃO TENANT-SCOPED (§2 da migration: acervo público, compartilhado
// entre instituições — o diário é público). `instituicaoId` é aceito e
// validado nas funções abaixo por simetria de API e porque as relações
// (norma_relacoes) SÃO tenant-scoped, mas nenhuma função aqui filtra `atos`
// por instituicao_id — não existe essa coluna. Se o produto ganhar "fontes
// assinadas por tenant", isto precisa mudar; hoje seria filtro fantasma.
//
// GOVERNANÇA DE APROVAÇÃO (PRD §4.3: "nenhum caminho de código altera
// normas.situacao sem aprovação registrada"): `aprovarRelacao` e
// `rejeitarRelacao` geram um único statement (CTE) que faz o UPDATE em
// norma_relacoes e o INSERT em auditoria ATOMICAMENTE — não existe caminho
// para o UPDATE committar sem o registro de quem/quando. Note também que
// `auditoria` tem RLS habilitado SEM policy de INSERT para `authenticated`
// (migration §6) — isso é uma trava estrutural correta: aprovar/rejeitar só
// pode rodar sob um contexto privilegiado (Edge Function com service_role),
// nunca direto do client autenticado. tests/fila-revisao.test.sql prova as
// duas pontas: bloqueado sob 'authenticated', permitido sob o role
// privilegiado.
// ============================================================================

/**
 * Lista a fila de revisão de uma instituição: atos duvidosos (globais, sem
 * tenant) + relações normativas propostas (tenant-scoped, filtradas
 * explicitamente — nunca via a view crua, ver nota de segurança acima).
 *
 * @param {{instituicaoId: string}} args
 * @returns {{atosEmRevisao: {text:string, values:any[]},
 *            relacoesPropostas: {text:string, values:any[]}}}
 */
export function listarFilaRevisao({ instituicaoId } = {}) {
  if (!instituicaoId) {
    throw new Error('listarFilaRevisao: instituicaoId é obrigatório');
  }

  // Atos duvidosos são globais (acervo público) — todo tenant vê a mesma
  // fila de atos, coerente com o comentário da migration §5.
  const atosEmRevisao = {
    text: `
      select a.id, a.fonte_id, a.tipo, a.numero, a.ano, a.orgao_emissor,
             a.ementa, a.data_ato, a.data_publicacao, a.origem_extracao,
             a.confianca_extracao, a.created_at
        from public.atos a
       where a.status = 'revisao'
       order by a.data_publicacao desc, a.created_at desc
    `,
    values: [],
  };

  // Direto na tabela + filtro explícito de instituicao_id — NÃO usar
  // `fila_revisao_relacoes` aqui (ver nota de segurança no topo do arquivo).
  const relacoesPropostas = {
    text: `
      select r.id, r.instituicao_id, r.tipo, r.dispositivo, r.confianca,
             r.proposta_por, r.ato_origem_id, r.norma_destino_id, r.created_at,
             n.tipo   as norma_tipo, n.numero as norma_numero, n.ano as norma_ano,
             a.numero as ato_numero, a.status as ato_status
        from public.norma_relacoes r
        join public.normas n on n.id = r.norma_destino_id
        join public.atos   a on a.id = r.ato_origem_id
       where r.instituicao_id = $1
         and r.status = 'proposta'
       order by r.created_at asc
    `,
    values: [instituicaoId],
  };

  return { atosEmRevisao, relacoesPropostas };
}

/**
 * Conta as pendências da fila de revisão (badge de UI).
 * @param {{instituicaoId: string}} args
 * @returns {{text:string, values:any[]}}
 */
export function contarPendencias({ instituicaoId } = {}) {
  if (!instituicaoId) {
    throw new Error('contarPendencias: instituicaoId é obrigatório');
  }
  return {
    text: `
      select
        (select count(*) from public.atos where status = 'revisao')
          as atos_em_revisao,
        (select count(*) from public.norma_relacoes
          where instituicao_id = $1 and status = 'proposta')
          as relacoes_propostas
    `,
    values: [instituicaoId],
  };
}

/**
 * Aprova uma relação normativa proposta pela IA. Gera UM statement atômico:
 * só atualiza (e só audita) relações que ainda estão em 'proposta' — reaprovar
 * uma já decidida é um no-op silencioso (0 linhas), nunca um audit falso.
 *
 * Requer contexto privilegiado (service_role/Edge Function): `auditoria` não
 * tem policy de INSERT para `authenticated` (trava estrutural, ver nota acima).
 *
 * @param {{relacaoId: string, usuarioId: string}} args
 * @returns {{text:string, values:any[]}}
 */
export function aprovarRelacao({ relacaoId, usuarioId } = {}) {
  if (!relacaoId || !usuarioId) {
    throw new Error('aprovarRelacao: relacaoId e usuarioId são obrigatórios');
  }
  return {
    text: `
      with antes as (
        select id, instituicao_id, status
          from public.norma_relacoes
         where id = $1 and status = 'proposta'
         for update
      ),
      atualizado as (
        update public.norma_relacoes r
           set status = 'aprovada',
               revisada_por = $2,
               revisada_em = now()
          from antes
         where r.id = antes.id
        returning r.id, r.instituicao_id, r.status, r.revisada_por, r.revisada_em,
                  antes.status as status_anterior
      )
      insert into public.auditoria
        (instituicao_id, usuario_id, entidade, entidade_id, acao,
         valor_anterior, valor_novo, em)
      select instituicao_id, $2, 'norma_relacoes', id::text, 'aprovar_relacao',
             jsonb_build_object('status', status_anterior),
             jsonb_build_object('status', status,
                                 'revisada_por', revisada_por,
                                 'revisada_em', revisada_em),
             now()
        from atualizado
      returning entidade_id, acao, em
    `,
    values: [relacaoId, usuarioId],
  };
}

/**
 * Rejeita uma relação normativa proposta pela IA — mesma garantia atômica de
 * `aprovarRelacao`, exige `motivo` (nunca rejeição muda e sem rastro).
 *
 * @param {{relacaoId: string, usuarioId: string, motivo: string}} args
 * @returns {{text:string, values:any[]}}
 */
export function rejeitarRelacao({ relacaoId, usuarioId, motivo } = {}) {
  if (!relacaoId || !usuarioId || !motivo) {
    throw new Error('rejeitarRelacao: relacaoId, usuarioId e motivo são obrigatórios');
  }
  return {
    text: `
      with antes as (
        select id, instituicao_id, status
          from public.norma_relacoes
         where id = $1 and status = 'proposta'
         for update
      ),
      atualizado as (
        update public.norma_relacoes r
           set status = 'rejeitada',
               revisada_por = $2,
               revisada_em = now(),
               observacao = $3
          from antes
         where r.id = antes.id
        returning r.id, r.instituicao_id, r.status, r.revisada_por, r.revisada_em,
                  r.observacao, antes.status as status_anterior
      )
      insert into public.auditoria
        (instituicao_id, usuario_id, entidade, entidade_id, acao,
         valor_anterior, valor_novo, em)
      select instituicao_id, $2, 'norma_relacoes', id::text, 'rejeitar_relacao',
             jsonb_build_object('status', status_anterior),
             jsonb_build_object('status', status,
                                 'revisada_por', revisada_por,
                                 'revisada_em', revisada_em,
                                 'observacao', observacao),
             now()
        from atualizado
      returning entidade_id, acao, em
    `,
    values: [relacaoId, usuarioId, motivo],
  };
}

/**
 * A QUERY DE PRODUÇÃO: monta a lista de atos elegíveis para disparo.
 * Critério binário do PRD: "ato com numero nulo NÃO aparece em nenhuma lista
 * de disparo." `status = 'ok'` é allowlist deliberada (ver nota no topo).
 *
 * @param {{instituicaoId: string,
 *          filtros?: {fonteId?: string, tipo?: string, dataDe?: string,
 *                     dataAte?: string, texto?: string}}} args
 * @returns {{text:string, values:any[]}}
 */
export function atosElegiveisParaDisparo({ instituicaoId, filtros = {} } = {}) {
  if (!instituicaoId) {
    throw new Error('atosElegiveisParaDisparo: instituicaoId é obrigatório');
  }

  // Allowlist, não denylist — ver nota no topo do arquivo. NUNCA removível
  // por `filtros`: não há como um filtro do chamador reintroduzir 'revisao'.
  const condicoes = [`a.status = 'ok'`];
  const valores = [];

  const comParametro = (clausula, valor) => {
    valores.push(valor);
    condicoes.push(clausula.replace('?', `$${valores.length}`));
  };

  if (filtros.fonteId) comParametro('a.fonte_id = ?', filtros.fonteId);
  if (filtros.tipo) comParametro('a.tipo = ?', filtros.tipo);
  if (filtros.dataDe) comParametro('a.data_publicacao >= ?', filtros.dataDe);
  if (filtros.dataAte) comParametro('a.data_publicacao <= ?', filtros.dataAte);
  if (filtros.texto) {
    comParametro("a.conteudo_ts @@ plainto_tsquery('portuguese', ?)", filtros.texto);
  }

  return {
    text: `
      select a.id, a.fonte_id, a.tipo, a.numero, a.ano, a.orgao_emissor,
             a.ementa, a.data_ato, a.data_publicacao, a.origem_extracao,
             a.confianca_extracao
        from public.atos a
       where ${condicoes.join('\n         and ')}
       order by a.data_publicacao desc, a.numero
    `,
    values: valores,
  };
}

export default {
  listarFilaRevisao,
  contarPendencias,
  aprovarRelacao,
  rejeitarRelacao,
  atosElegiveisParaDisparo,
};
