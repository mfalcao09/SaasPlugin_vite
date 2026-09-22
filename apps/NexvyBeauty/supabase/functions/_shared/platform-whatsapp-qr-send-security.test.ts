import { assertEquals } from "jsr:@std/assert@1";

const source = await Deno.readTextFile(
  new URL("../platform-whatsapp-qr-send/index.ts", import.meta.url),
);

Deno.test("QR send 401 response exposes no credential oracle", () => {
  for (
    const forbidden of [
      "service_key_len",
      "bearer_matches",
      "apikey_matches",
      "bearer_eq_apikey",
    ]
  ) {
    assertEquals(source.includes(forbidden), false, forbidden);
  }
  assertEquals(
    source.includes('return json({ error: "unauthorized" }, 401)'),
    true,
  );
});
