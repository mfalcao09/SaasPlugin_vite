import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractChatCompletionContent } from "./ai-completion-text.ts";

Deno.test("extractChatCompletionContent: string", () => {
  assertEquals(
    extractChatCompletionContent({ choices: [{ message: { content: "  oi  " } }] }),
    "oi",
  );
});

Deno.test("extractChatCompletionContent: array parts", () => {
  assertEquals(
    extractChatCompletionContent({
      choices: [{ message: { content: [{ type: "text", text: "Bom dia!" }] } }],
    }),
    "Bom dia!",
  );
});
