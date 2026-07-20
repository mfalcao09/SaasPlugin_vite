// ─── Contrato do front com a edge `demo-evolution` (Esteira F1/F3) ──────────
// A lead anônima autentica na edge com { token, session_token } do
// onboarding_submissions mode='demo'. A edge é PÚBLICA (verify_jwt=false) e faz
// os fetches do Evolution server-side com service_role.
//
// Este módulo só declara os TIPOS do contrato + a interface `DemoEvolutionApi`.
// A implementação real vive em `@/hooks/useDemoEvolution`; o preview DEV injeta
// um mock com o mesmo shape — por isso o wizard depende da INTERFACE, nunca do
// Supabase direto (testável + eyeball sem infra live).

/** Item do relatório do dinheiro (edge `report` já devolve neste shape). */
export interface DemoReportItem {
  name: string;
  phone: string | null;
  dealValue: number;
  reason: string;
}

/** Segmentação dos sumidos por tempo desde a última interação. */
export interface DemoReportFaixas {
  /** 2 a 6 meses sem falar. */
  m2_6: number;
  /** 6 a 12 meses sem falar. */
  m6_12: number;
  /** mais de 1 ano sem falar. */
  m12_plus: number;
}

export interface DemoReport {
  ok: boolean;
  /** nº de clientes que sumiram (ultima_interacao_wa entre 45 e 180 dias). */
  count: number;
  /** R$ deixado na mesa = count × ticket. */
  total: number;
  /** ticket médio usado no cálculo (payload da submission ou default). */
  ticket: number;
  items: DemoReportItem[];

  // ── Contrato NOVO ────────────────────────────────────────────────────────
  // Todos OPCIONAIS de propósito: a edge em cache ainda responde o shape antigo.
  // Sem eles a tela não consegue distinguir "base vazia" de "ainda ingerindo" de
  // "erro" — e acaba dizendo "sua base está em dia" sobre um R$ 0,00 que era
  // falha de leitura. Quem consome DEVE tratar `undefined` sem quebrar.
  /** DENOMINADOR: total de contatos ingeridos na varredura. */
  base_total?: number;
  /** ingeridos SEM data de interação — invisíveis ao cálculo da janela. */
  sem_data?: number;
  /** interagiram há menos de 45 dias (logo, não são "sumidos"). */
  ativos?: number;
  /** segmentação dos sumidos por tempo. */
  faixas?: DemoReportFaixas;
  /** a varredura ainda está rodando? ausente = contrato antigo (desconhecido). */
  scan_status?: 'ingerindo' | 'pronto';
}

export interface DemoConnectResult {
  ok: boolean;
  instance_id?: string;
  /** QR em base64 (data:image… ou base64 puro) — NUNCA um pairing-code cru. */
  qr_code: string | null;
}

export interface DemoStatusResult {
  ok: boolean;
  status: string;
  qr_code: string | null;
}

export interface DemoAcceptInput {
  /** texto VERBATIM exibido no checkbox (gravado como prova em lgpd_consents). */
  consent_text: string;
  terms_version: string;
  privacy_version: string;
}

/** Fachada que o DemoWizard consome. Real (`useDemoEvolution`) ou mock (preview). */
export interface DemoEvolutionApi {
  accept(input: DemoAcceptInput): Promise<{ ok: boolean }>;
  connect(): Promise<DemoConnectResult>;
  status(): Promise<DemoStatusResult>;
  report(): Promise<DemoReport>;
  sendReport(input: { text: string; report_url: string }): Promise<{ ok: boolean }>;
  requestDeletion(): Promise<{ ok: boolean }>;
}
