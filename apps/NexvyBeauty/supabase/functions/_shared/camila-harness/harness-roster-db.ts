// Roster do piloto = leads com derived_stage = preselected no DB (não constante TS).
import {
  parseHarnessFacts,
  PILOT_COHORT_ID,
  type HarnessLeadFacts,
} from "./harness-stage.ts";
import type { PilotLead } from "./pilot-roster.ts";

export type PreselectedLeadRow = PilotLead & {
  leadId: string;
  productId: string;
  stateVersion: number;
  derivedStage: "preselected";
};

type SbQuery = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          limit: (n: number) => PromiseLike<{
            data: unknown[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
};

type LeadJoinRow = {
  id: string;
  phone: string | null;
  name: string | null;
  product_id: string;
  platform_crm_lead_state?: Array<{
    derived_stage: string | null;
    version: number;
    facts: Record<string, unknown> | null;
  }> | {
    derived_stage: string | null;
    version: number;
    facts: Record<string, unknown> | null;
  } | null;
};

function digits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function stateOf(row: LeadJoinRow) {
  const s = row.platform_crm_lead_state;
  if (Array.isArray(s)) return s[0] ?? null;
  return s ?? null;
}

/** Carrega pré-selecionados do produto (estágio canônico no DB). */
export async function loadPreselectedPilotLeads(
  sb: SbQuery,
  productId: string,
  opts?: { cohort?: string; limit?: number },
): Promise<{ leads: PreselectedLeadRow[]; error: string | null }> {
  const cohort = opts?.cohort ?? PILOT_COHORT_ID;
  const limit = opts?.limit ?? 50;
  // PostgREST: filter state via inner embed
  const { data, error } = await (sb as any)
    .from("platform_crm_leads")
    .select(
      "id, phone, name, product_id, platform_crm_lead_state!inner(derived_stage, version, facts)",
    )
    .eq("product_id", productId)
    .eq("platform_crm_lead_state.derived_stage", "preselected")
    .limit(limit);

  if (error) {
    return { leads: [], error: error.message ?? "load_preselected_failed" };
  }

  const out: PreselectedLeadRow[] = [];
  for (const raw of data ?? []) {
    const row = raw as LeadJoinRow;
    const st = stateOf(row);
    if (!st || st.derived_stage !== "preselected") continue;
    const facts = parseHarnessFacts(
      st.facts && typeof st.facts === "object"
        ? st.facts as Record<string, unknown>
        : {},
    );
    if (!facts) continue;
    if (facts.cohort !== cohort) continue;
    const phone = digits(row.phone ?? "");
    if (!phone) continue;
    out.push({
      leadId: row.id,
      productId: row.product_id,
      stateVersion: Number(st.version) || 0,
      derivedStage: "preselected",
      order: facts.pilot_order,
      phone,
      greeting: facts.greeting,
      handle: facts.instagram_handle,
      resumeException: facts.resume_exception,
    });
  }
  out.sort((a, b) => a.order - b.order || a.phone.localeCompare(b.phone));
  return { leads: out, error: null };
}

export function manualListFromPreselected(
  leads: readonly PreselectedLeadRow[],
): string[] {
  return leads.map((l) => l.phone);
}

export function findPreselectedByPhone(
  phone: string,
  leads: readonly PreselectedLeadRow[],
): PreselectedLeadRow | null {
  const d = digits(phone);
  return leads.find((l) => l.phone === d) ?? null;
}

/** Lê o roteiro da lead mesmo que ela já tenha saído de preselected. */
export async function loadHarnessLeadByPhone(
  sb: SbQuery,
  productId: string,
  phone: string,
): Promise<PilotLead | null> {
  const variants = [digits(phone), `+${digits(phone)}`].filter(Boolean);
  const { data, error } = await (sb as any)
    .from("platform_crm_leads")
    .select(
      "id, phone, name, product_id, platform_crm_lead_state(derived_stage, version, facts)",
    )
    .eq("product_id", productId)
    .in("phone", variants)
    .limit(1);
  if (error || !data?.length) return null;
  const row = data[0] as LeadJoinRow;
  const st = stateOf(row);
  const facts = parseHarnessFacts(
    st?.facts && typeof st.facts === "object"
      ? st.facts as Record<string, unknown>
      : {},
  );
  if (!facts) return null;
  return {
    order: facts.pilot_order,
    phone: digits(row.phone ?? phone),
    greeting: facts.greeting,
    handle: facts.instagram_handle,
    resumeException: facts.resume_exception,
    leadId: row.id,
  };
}

/** Spec usada APENAS para seed SQL / testes — não é runtime do tick. */
export const SEED_PILOT_PRESELECTED: readonly HarnessLeadFacts[] = [
  {
    greeting: "Renata",
    instagram_handle: "renatanaildesingner",
    resume_exception: true,
    pilot_order: 1,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Aliny",
    instagram_handle: "alinyjaciaraesmalteria",
    resume_exception: false,
    pilot_order: 2,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Victória",
    instagram_handle: "studio_victoriamendes",
    resume_exception: false,
    pilot_order: 3,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Lídia",
    instagram_handle: "lidiacastro_lashnail",
    resume_exception: false,
    pilot_order: 4,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Rafaele",
    instagram_handle: "rafaeleandradestudio",
    resume_exception: false,
    pilot_order: 5,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Leticia",
    instagram_handle: "leticiacosta.studiolc",
    resume_exception: false,
    pilot_order: 6,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Jamires",
    instagram_handle: "jamires_unhasdegel2",
    resume_exception: false,
    pilot_order: 7,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Geovana",
    instagram_handle: "geovanabrasil.nails",
    resume_exception: false,
    pilot_order: 8,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Rafaella",
    instagram_handle: "rafaellatrindadebeauty",
    resume_exception: false,
    pilot_order: 9,
    cohort: PILOT_COHORT_ID,
  },
  {
    greeting: "Andressa",
    instagram_handle: "espaco_andressamanoel",
    resume_exception: false,
    pilot_order: 10,
    cohort: PILOT_COHORT_ID,
  },
];

/** Phones alinhados ao SEED (ordem). Seed SQL usa estes. */
export const SEED_PILOT_PHONES: readonly string[] = [
  "5581993552037",
  "5587981172023",
  "5585996074889",
  "5562981345228",
  "5511986621610",
  "5521964623139",
  "5581998436311",
  "5541988180457",
  "5581984963119",
  "5519992020426",
] as const;

/** Fixture de testes / dry local — NÃO é runtime do tick em produção. */
export function seedPilotRosterFixture(): PilotLead[] {
  return SEED_PILOT_PHONES.map((phone, i) => {
    const f = SEED_PILOT_PRESELECTED[i]!;
    return {
      order: f.pilot_order,
      phone,
      greeting: f.greeting,
      handle: f.instagram_handle,
      resumeException: f.resume_exception,
      leadId: `seed-fixture-${i + 1}`,
    };
  });
}
