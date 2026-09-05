import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BRAIN_MAX_OUTPUT_TOKENS_PROSPECTOR,
  BRAIN_MAX_OUTPUT_TOKENS_SDR,
  resolveBrainMaxOutputTokens,
} from "./brain-max-tokens.ts";

Deno.test("prospector (Camila) usa teto maior que SDR", () => {
  assertEquals(resolveBrainMaxOutputTokens(true), BRAIN_MAX_OUTPUT_TOKENS_PROSPECTOR);
  assertEquals(resolveBrainMaxOutputTokens(false), BRAIN_MAX_OUTPUT_TOKENS_SDR);
  assertEquals(BRAIN_MAX_OUTPUT_TOKENS_PROSPECTOR > BRAIN_MAX_OUTPUT_TOKENS_SDR, true);
});
