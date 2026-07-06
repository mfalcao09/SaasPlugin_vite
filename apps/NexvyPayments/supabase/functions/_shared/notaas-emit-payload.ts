// _shared/notaas-emit-payload.ts
//
// Função PURA de montagem do payload de emissão NFS-e do NotaAS (Entregável C1).
// Isolada do handler (index.ts) e do cliente HTTP (notaas-emit-core.ts) para ser
// testável 100% offline: recebe linhas já carregadas (invoice + payer + contract)
// como objetos JS e devolve o item do payload `POST /api/v1/emitir[/batch]` — sem
// tocar rede, banco nem Deno.env.
//
// CHAMADORES (quem importa este arquivo):
//   - notaas-emit/index.ts        (edge C1): buildEmitItem por fatura + chunkItems.
//   - _shared/notaas-emit-core.ts (módulo puro de emissão): chunkItems p/ split ≤100.
//   - _shared/__tests__/notaas-emit-payload.test.ts: buildEmitItem/chunkItems/…
//
// Fonte do contrato de payload: docs/insumos/notaas-report.md §H.2 (API reference
// autenticada) + §32-38:
//   * tomador: cpf XOR cnpj (14/11 dígitos SEM formatação) obrigatório, `nome` req,
//     email/telefone/endereco opcionais (cidade resolve p/ IBGE automático).
//   * servico: `descricao` req; `codigo` (cTribNac LC116, 6 díg) — se omitido usa o
//     padrão do projeto NotaAS; `codigoServico`/`localPrestacao`/`nbs` opcionais.
//   * valores: `total` (BRL) req, `aliquotaIss` (%) req, `issRetido` (bool, default
//     false), retenções (retencaoIrrf/Cp/Csll + pisCofins) em R$.
//   * competencia: 'YYYY-MM' (default mês corrente do lado NotaAS — não forçamos).
//   * `referencia`: ID externo — AQUI É invoice.id. Única chave de correlação/dedup
//     (NotaAS não deduplica por conta própria: report §D/§97-98). É a âncora do
//     outbox de idempotência (B2) e a chave que o webhook C2 usa p/ religar a nota.
//
// LOTE (report §18/§95): `POST /api/v1/emitir/batch` aceita ≤100 itens. `chunkItems`
// parte a lista em lotes de no máximo 100 (101 -> 2 lotes; 250 -> 3). Zero I/O.

/** Endereço do tomador para a NFS-e (report §34). Só dígitos onde aplicável. */
export interface TomadorEndereco {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string; // NotaAS resolve o IBGE a partir do nome (report §H.2)
  uf?: string;
  cep?: string; // só dígitos
}

/** Item de emissão no formato NotaAS (mesmo shape para /emitir e /emitir/batch). */
export interface NotaasEmitItem {
  tomador: {
    cpf?: string; // 11 dígitos — XOR com cnpj
    cnpj?: string; // 14 dígitos — XOR com cpf
    nome: string;
    email?: string;
    telefone?: string;
    endereco?: TomadorEndereco;
  };
  servico: {
    descricao: string;
    codigo?: string; // cTribNac 6 díg (LC 116); omitido => padrão do projeto
    codigoServico?: string; // SP 4-5 díg
    localPrestacao?: string; // IBGE 7 díg
    nbs?: string; // 9 díg
  };
  valores: {
    total: number; // BRL
    aliquotaIss: number; // %
    issRetido?: boolean; // default false
    retencaoIrrf?: number; // R$
    retencaoCp?: number; // R$ (INSS/contribuição previdenciária)
    retencaoCsll?: number; // R$
    pisCofins?: Record<string, unknown>; // objeto pass-through (report §36)
  };
  competencia?: string; // 'YYYY-MM'
  referencia: string; // = invoice.id (idempotência/dedup)
}

/** Subconjunto de `invoices` que a emissão consome (o que o SELECT do worker traz). */
export interface InvoiceRow {
  id: string;
  organization_id: string;
  competencia?: string | null; // 'YYYY-MM'
  referencia?: string | null; // chave de idempotência (schema exige NOT NULL)
  valor_total: number | string;
  valor_original?: number | string | null;
  iss_retido?: boolean | null;
  // retencoes jsonb: {ir|irrf, cp|inss, csll, pis, cofins, pisCofins, ...}
  retencoes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** Subconjunto de `payers` (tomador). `documento` = só dígitos (CPF/CNPJ). */
export interface PayerRow {
  nome: string;
  tipo_documento?: 'cpf' | 'cnpj' | null;
  documento: string;
  email?: string | null;
  whatsapp?: string | null;
  endereco?: Record<string, unknown> | null;
}

/** Subconjunto de `contracts` (descrição do serviço + fiscais do contrato). */
export interface ContractRow {
  descricao: string;
  codigo_servico_nfse?: string | null; // cTribNac; null => padrão do projeto
  aliquota_iss?: number | string | null; // %
}

/** Remove tudo que não for dígito (CPF/CNPJ/CEP/telefone). */
function digits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D+/g, '');
}

/** Converte para número finito; null/vazio/NaN => undefined (não emite campo). */
function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Resolve o tomador com a invariante CPF XOR CNPJ (report §H.2: "cpf XOR cnpj
 * obrigatório"). Prioriza `tipo_documento` quando presente E consistente com o
 * comprimento; senão decide pelo comprimento do documento (11 => CPF, 14 => CNPJ).
 * Nunca emite os dois campos.
 *
 * @throws se não houver documento com 11 ou 14 dígitos (emissão sem tomador
 *         válido seria rejeitada com 422 pelo NotaAS — falhamos ANTES, claro).
 */
export function resolveTomadorDoc(payer: PayerRow): { cpf?: string; cnpj?: string } {
  const doc = digits(payer.documento);
  if (payer.tipo_documento === 'cpf' && doc.length === 11) return { cpf: doc };
  if (payer.tipo_documento === 'cnpj' && doc.length === 14) return { cnpj: doc };
  // Fallback puro pelo comprimento (tipo ausente ou divergente do documento real).
  if (doc.length === 11) return { cpf: doc };
  if (doc.length === 14) return { cnpj: doc };
  throw new Error(
    `notaas-emit: documento do tomador inválido (esperado CPF 11 ou CNPJ 14 dígitos, recebido ${doc.length}).`,
  );
}

/** Mapeia `payers.endereco` (jsonb) para o endereço do tomador NotaAS (campos conhecidos). */
function mapEndereco(src: Record<string, unknown> | null | undefined): TomadorEndereco | undefined {
  if (!src || typeof src !== 'object') return undefined;
  const e: TomadorEndereco = {};
  if (src['logradouro']) e.logradouro = String(src['logradouro']);
  if (src['numero']) e.numero = String(src['numero']);
  if (src['complemento']) e.complemento = String(src['complemento']);
  if (src['bairro']) e.bairro = String(src['bairro']);
  if (src['cidade']) e.cidade = String(src['cidade']);
  if (src['uf']) e.uf = String(src['uf']);
  if (src['cep']) e.cep = digits(String(src['cep']));
  return Object.keys(e).length ? e : undefined;
}

/**
 * Propaga as retenções da fatura para os campos NotaAS. `invoices.retencoes` é um
 * jsonb livre (billing_model.sql:292 — "{ir, pis, cofins, csll, inss, ...}"); aceitamos
 * as chaves usuais em PT-BR e as mapeamos para os campos do payload NotaAS (report §36):
 *   ir | irrf            -> retencaoIrrf
 *   cp | inss            -> retencaoCp   (contribuição previdenciária)
 *   csll                 -> retencaoCsll
 *   pisCofins (objeto)   -> pisCofins (pass-through)
 * Valores em R$. Chaves ausentes/zeradas não emitem o campo.
 */
export function mapRetencoes(
  retencoes: Record<string, unknown> | null | undefined,
): Pick<NotaasEmitItem['valores'], 'retencaoIrrf' | 'retencaoCp' | 'retencaoCsll' | 'pisCofins'> {
  const out: Pick<
    NotaasEmitItem['valores'],
    'retencaoIrrf' | 'retencaoCp' | 'retencaoCsll' | 'pisCofins'
  > = {};
  if (!retencoes || typeof retencoes !== 'object') return out;
  const irrf = num(retencoes['irrf'] ?? retencoes['ir']);
  const cp = num(retencoes['cp'] ?? retencoes['inss']);
  const csll = num(retencoes['csll']);
  if (irrf && irrf > 0) out.retencaoIrrf = irrf;
  if (cp && cp > 0) out.retencaoCp = cp;
  if (csll && csll > 0) out.retencaoCsll = csll;
  const pc = retencoes['pisCofins'];
  if (pc && typeof pc === 'object') out.pisCofins = pc as Record<string, unknown>;
  return out;
}

/**
 * Monta UM item de emissão NotaAS a partir de (invoice, payer, contract).
 *
 * Invariantes cravadas (critério binário C1):
 *   - tomador cpf XOR cnpj (resolveTomadorDoc);
 *   - `referencia` = invoice.referencia (ou invoice.id como fallback estável) —
 *     âncora de idempotência; nunca aleatória;
 *   - `valores.total` = valor_total da fatura (com encargos já embutidos no B/E);
 *   - `aliquotaIss` = contract.aliquota_iss (0 se null — NotaAS aceita 0 p/ imunes);
 *   - código de serviço = contract.codigo_servico_nfse (omitido => padrão do projeto);
 *   - issRetido = invoice.iss_retido; retenções propagadas de invoice.retencoes;
 *   - competencia = invoice.competencia (se ausente, omitida => NotaAS usa mês corrente).
 *
 * NÃO faz I/O. Determinística: mesma entrada => mesmo item.
 */
export function buildEmitItem(
  invoice: InvoiceRow,
  payer: PayerRow,
  contract: ContractRow,
): NotaasEmitItem {
  if (!payer?.nome) throw new Error('notaas-emit: tomador sem nome (obrigatório).');
  if (!contract?.descricao) {
    throw new Error(`notaas-emit: fatura ${invoice.id} sem descrição de serviço (contract.descricao).`);
  }
  const total = num(invoice.valor_total);
  if (total == null) {
    throw new Error(`notaas-emit: fatura ${invoice.id} sem valor_total numérico.`);
  }
  const doc = resolveTomadorDoc(payer);
  const endereco = mapEndereco(payer.endereco);

  const item: NotaasEmitItem = {
    tomador: {
      ...doc,
      nome: payer.nome,
      ...(payer.email ? { email: payer.email } : {}),
      ...(payer.whatsapp ? { telefone: digits(payer.whatsapp) } : {}),
      ...(endereco ? { endereco } : {}),
    },
    servico: {
      descricao: contract.descricao,
      // codigo omitido quando null => o projeto NotaAS aplica o padrão (report §35).
      ...(contract.codigo_servico_nfse ? { codigo: String(contract.codigo_servico_nfse) } : {}),
    },
    valores: {
      total,
      aliquotaIss: num(contract.aliquota_iss) ?? 0,
      issRetido: !!invoice.iss_retido,
      ...mapRetencoes(invoice.retencoes),
    },
    // referencia = chave de idempotência/dedup. Preferimos invoice.referencia (o
    // schema exige NOT NULL e única por org); id é o fallback estável se ausente.
    referencia: invoice.referencia ? String(invoice.referencia) : invoice.id,
  };
  if (invoice.competencia) item.competencia = String(invoice.competencia);
  return item;
}

/** Tamanho máximo de um lote no `POST /api/v1/emitir/batch` (report §18/§95). */
export const NOTAAS_BATCH_MAX = 100;

/**
 * Parte uma lista de itens em lotes de no máximo `size` (default 100). 101 -> [100, 1];
 * 250 -> [100, 100, 50]. Lista vazia -> []. Não muta a entrada. Puro.
 */
export function chunkItems<T>(items: readonly T[], size = NOTAAS_BATCH_MAX): T[][] {
  if (size <= 0) throw new Error('notaas-emit: tamanho de lote inválido (deve ser > 0).');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
