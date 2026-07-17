// deno test — prova a BARREIRA de aprovação no SEND (defense-in-depth).
//   deno test --no-check supabase/functions/_shared/cold-outreach/approved-gate.test.ts
//
// Espelha o padrão inbound-plan.test.ts: a DECISÃO pura é testada aqui; o index.ts
// só lê approved_at + executa (marca 'skipped'/para cadência OU envia).
import { assertEquals } from "jsr:@std/assert@1";
import {
  isApprovedForSend,
  partitionByApproval,
  type QueueSendRef,
  UNAPPROVED_SKIP_REASON,
} from "./approved-gate.ts";

// ── (1) linha cujo lead está approved_at=NULL: NÃO envia → é pulada ──────────
Deno.test("SEND inicial: lead approved_at=NULL NÃO envia (barrado no send)", () => {
  // isApprovedForSend gate o deliver() da abertura em tickCampaign.
  assertEquals(isApprovedForSend(null), false);
  assertEquals(isApprovedForSend(undefined), false);
  assertEquals(isApprovedForSend(""), false);
  assertEquals(isApprovedForSend("   "), false);
});

// ── (2) linha cujo lead está APROVADO: envia ────────────────────────────────
Deno.test("SEND inicial: lead approved_at presente ENVIA", () => {
  assertEquals(isApprovedForSend("2026-07-16T09:30:00Z"), true);
  assertEquals(isApprovedForSend("2026-07-13T00:00:00Z"), true);
});

// ── (3) follow-up num lead que ficou DES-aprovado: NÃO envia ─────────────────
Deno.test("FOLLOW-UP: lead des-aprovado após a abertura NÃO recebe follow-up", () => {
  const rows: QueueSendRef[] = [
    { extracted_lead_id: "lead-aprovado" },
    { extracted_lead_id: "lead-desaprovado" }, // approved_at virou NULL após enfileirar
  ];
  // Só 'lead-aprovado' volta do recheck .in(...).not('approved_at','is',null).
  const approved = new Set<string>(["lead-aprovado"]);
  const { sendable, skip } = partitionByApproval(rows, approved);
  assertEquals(sendable.map((r) => r.extracted_lead_id), ["lead-aprovado"]);
  assertEquals(skip.map((r) => r.extracted_lead_id), ["lead-desaprovado"]);
});

// ── batch: mistura aprovado/des-aprovado preserva ordem e particiona certo ───
Deno.test("FOLLOW-UP batch: particiona enviáveis vs pulados preservando ordem", () => {
  const rows: QueueSendRef[] = [
    { extracted_lead_id: "a" },
    { extracted_lead_id: "b" },
    { extracted_lead_id: "c" },
  ];
  const approved = new Set<string>(["a", "c"]);
  const { sendable, skip } = partitionByApproval(rows, approved);
  assertEquals(sendable.map((r) => r.extracted_lead_id), ["a", "c"]);
  assertEquals(skip.map((r) => r.extracted_lead_id), ["b"]);
});

// ── fail-safe: linha sem extracted_lead_id não é reverificável → NÃO envia ───
Deno.test("fail-safe: linha sem extracted_lead_id vai pra skip (não envia)", () => {
  const rows: QueueSendRef[] = [
    { extracted_lead_id: null },
    { extracted_lead_id: undefined },
    { extracted_lead_id: "ok" },
  ];
  const { sendable, skip } = partitionByApproval(rows, new Set(["ok"]));
  assertEquals(sendable.map((r) => r.extracted_lead_id), ["ok"]);
  assertEquals(skip.length, 2);
});

// ── conjunto de aprovados vazio: NADA é enviável (fila inteira barrada) ──────
Deno.test("nenhum lead aprovado: partição manda tudo pra skip", () => {
  const rows: QueueSendRef[] = [{ extracted_lead_id: "x" }, { extracted_lead_id: "y" }];
  const { sendable, skip } = partitionByApproval(rows, new Set<string>());
  assertEquals(sendable.length, 0);
  assertEquals(skip.length, 2);
});

// ── motivo canônico de skip é estável (index.ts grava em skip_reason) ────────
Deno.test("skip_reason canônico não muda sem intenção", () => {
  assertEquals(UNAPPROVED_SKIP_REASON, "lead_unapproved_at_send");
});
