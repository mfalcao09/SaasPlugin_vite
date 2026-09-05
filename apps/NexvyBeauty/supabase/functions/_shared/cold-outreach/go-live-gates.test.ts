import { assertEquals } from "jsr:@std/assert@1";
import {
  validateRealSend,
  validateWindowForRealSend,
  isPermissiveWindow,
} from "./go-live-gates.ts";

Deno.test("piloto sem ALLOW_REAL_SEND bloqueia envio real", () => {
  const v = validateRealSend({
    campaignName: "piloto-camila-zapi-20260901",
    dryRun: false,
    envEnabled: true,
    allowRealSendEnv: null,
  });
  assertEquals(v.allowed, false);
  assertEquals(v.reason?.includes("ALLOW_REAL_SEND"), true);
});

Deno.test("piloto com ALLOW_REAL_SEND=1 permite", () => {
  const v = validateRealSend({
    campaignName: "piloto-camila-zapi-20260901",
    dryRun: false,
    envEnabled: true,
    allowRealSendEnv: "1",
  });
  assertEquals(v.allowed, true);
});

Deno.test("janela 0-24 bloqueia real sem flag", () => {
  assertEquals(isPermissiveWindow({ startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] }), true);
  const v = validateWindowForRealSend({ startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] }, null);
  assertEquals(v.allowed, false);
});

Deno.test("janela comercial 9-18 ok", () => {
  const v = validateWindowForRealSend({ startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5] }, null);
  assertEquals(v.allowed, true);
});
