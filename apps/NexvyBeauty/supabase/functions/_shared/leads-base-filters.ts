export const BASE_TRIAGES = [
  "principal",
  "semente",
  "nao_classificado",
  "remocao_confirmada",
] as const;

export const BASE_STAGES = [
  "db",
  "preselected",
  "contacted",
  "remarketing_pool",
  "service",
  "closing",
  "onboarding",
  "do_not_contact",
] as const;
export const BASE_DNC_REASONS = [
  "hard_stop",
  "cadence_exhausted",
  "closed_lost",
  "unknown",
] as const;

export type BaseTriage = typeof BASE_TRIAGES[number];
export type BaseStage = typeof BASE_STAGES[number];
export type BaseDncReason = typeof BASE_DNC_REASONS[number];

export type BaseLeadFilters = {
  triagem?: BaseTriage[];
  derived_stage?: BaseStage[];
  phone?: "with" | "without";
  dnc_reason?: BaseDncReason[];
  query?: string;
};

export type BaseLeadRow = {
  name: string;
  phone: string | null;
  phone_normalized?: string | null;
  profiles: Array<{ handle?: string | null; triagem?: string | null }>;
  triagem_summary: string;
  derived_stage: string | null;
  dnc_reason?: BaseDncReason | null;
  active_operation_count: number;
};

const digits = (value: string) => value.replace(/\D/g, "");

export function parseBaseLeadFilters(input: unknown): BaseLeadFilters {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("filtros invalidos");
  }
  const value = input as Record<string, unknown>;
  const parseList = <T extends string>(
    key: string,
    allowed: readonly T[],
  ): T[] | undefined => {
    if (value[key] === undefined) return undefined;
    if (
      !Array.isArray(value[key]) ||
      (value[key] as unknown[]).length > allowed.length
    ) {
      throw new Error(`lead_filters.${key} invalido`);
    }
    const list = value[key] as unknown[];
    if (
      list.some((item) =>
        typeof item !== "string" || !allowed.includes(item as T)
      )
    ) {
      throw new Error(`lead_filters.${key} invalido`);
    }
    return [...new Set(list as T[])];
  };

  const triagem = parseList("triagem", BASE_TRIAGES);
  const derived_stage = parseList("derived_stage", BASE_STAGES);
  const dnc_reason = parseList("dnc_reason", BASE_DNC_REASONS);
  if (
    value.phone !== undefined &&
    !["with", "without"].includes(String(value.phone))
  ) {
    throw new Error("lead_filters.phone invalido");
  }
  if (value.query !== undefined && typeof value.query !== "string") {
    throw new Error("lead_filters.query invalido");
  }

  return {
    ...(triagem?.length ? { triagem } : {}),
    ...(derived_stage?.length ? { derived_stage } : {}),
    ...(value.phone ? { phone: value.phone as "with" | "without" } : {}),
    ...(dnc_reason?.length ? { dnc_reason } : {}),
    ...(typeof value.query === "string" && value.query.trim()
      ? { query: value.query.trim().slice(0, 100) }
      : {}),
  };
}

export function matchesBaseLeadFilters(
  row: BaseLeadRow,
  filters: BaseLeadFilters,
): boolean {
  if (filters.triagem?.length) {
    // Um card pode reunir perfis com triagens diferentes. Filtrar pelo resumo
    // priorizado (principal > semente > ...) escondia os demais perfis; use
    // correspondência inclusiva para preservar sobreposições reais.
    const profileMatches = row.profiles.some((profile) =>
      filters.triagem!.includes(
        (profile.triagem ?? "nao_classificado") as BaseTriage,
      )
    );
    const fallbackMatches = row.profiles.length === 0 &&
      filters.triagem.includes(row.triagem_summary as BaseTriage);
    if (!profileMatches && !fallbackMatches) return false;
  }
  if (
    filters.derived_stage?.length &&
    !filters.derived_stage.includes((row.derived_stage ?? "db") as BaseStage)
  ) return false;
  if (filters.phone === "with" && !row.phone) return false;
  if (filters.phone === "without" && !!row.phone) return false;
  if (
    filters.dnc_reason?.length &&
    !filters.dnc_reason.includes((row.dnc_reason ?? "unknown") as BaseDncReason)
  ) return false;
  if (filters.query) {
    const search = filters.query.toLocaleLowerCase("pt-BR");
    const searchDigits = digits(filters.query);
    const values = [
      row.name,
      row.phone ?? "",
      ...row.profiles.map((profile) => profile.handle ?? ""),
    ];
    if (
      !values.some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(search)
      ) &&
      !(searchDigits && digits(row.phone ?? "").includes(searchDigits))
    ) return false;
  }
  return true;
}

export function normalizeBrazilianMobile(value: unknown): string | null {
  if (value == null) return null;
  let number = String(value).replace(/\D/g, "").replace(/^0+/, "");
  if (
    number.startsWith("55") && (number.length === 12 || number.length === 13)
  ) number = number.slice(2);
  if (number.length === 10 && /^[6-9]/.test(number.slice(2))) {
    number = `${number.slice(0, 2)}9${number.slice(2)}`;
  }
  if (number.length === 10 || number.length === 11) number = `55${number}`;
  return /^55\d{2}9\d{8}$/.test(number) ? number : null;
}
