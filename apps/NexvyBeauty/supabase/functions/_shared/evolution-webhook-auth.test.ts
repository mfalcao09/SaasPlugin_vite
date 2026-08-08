import {
  configureDemoEvolutionWebhook,
  configureEvolutionProxyWebhook,
  configureOnboardingEvolutionWebhook,
  configurePlatformEvolutionProxyWebhook,
  type EvolutionWebhookProvisioner,
} from "./evolution-webhook-provisioners.ts";
import {
  EVOLUTION_WEBHOOK_EVENTS,
  PLATFORM_EVOLUTION_WEBHOOK_EVENTS,
  TENANT_EVOLUTION_WEBHOOK_EVENTS,
} from "./evolution-webhook-events.ts";
import { authenticateEvolutionWebhookCallback } from "./evolution-webhook-auth.ts";
import { createPlatformEvolutionWebhookHandler } from "./platform-evolution-webhook-handler.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} — esperado ${String(expected)}, veio ${String(actual)}`,
    );
  }
}

const provisioners: Array<
  [string, EvolutionWebhookProvisioner, readonly string[]]
> = [
  [
    "evolution-proxy",
    configureEvolutionProxyWebhook,
    TENANT_EVOLUTION_WEBHOOK_EVENTS,
  ],
  [
    "platform-evolution-proxy",
    configurePlatformEvolutionProxyWebhook,
    PLATFORM_EVOLUTION_WEBHOOK_EVENTS,
  ],
  [
    "onboarding-evolution",
    configureOnboardingEvolutionWebhook,
    TENANT_EVOLUTION_WEBHOOK_EVENTS,
  ],
  ["demo-evolution", configureDemoEvolutionWebhook, EVOLUTION_WEBHOOK_EVENTS],
];

for (const [name, configureWebhook, expectedEvents] of provisioners) {
  Deno.test(`${name}: POST webhook/set usa somente instanceToken`, async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    const transport: typeof fetch = ((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requests.push({ input: String(input), init });
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const result = await configureWebhook(
      {
        url: "https://evolution.invalid",
        globalApiKey: "global-must-not-leak",
      },
      "instance name",
      "instance-token",
      "https://example.invalid/evolution-webhook",
      transport,
    );
    equal(result.ok, true, "configuração deveria passar");
    equal(requests.length, 1, "deveria haver exatamente um HTTP");
    equal(
      new Headers(requests[0].init?.headers).get("apikey"),
      "instance-token",
      "apikey deve ser o token da instância",
    );
    assert(
      requests[0].input.endsWith("/webhook/set/instance%20name"),
      "rota deve endereçar o nome codificado",
    );
    equal(requests[0].init?.method, "POST", "método");
    const payload = JSON.parse(String(requests[0].init?.body));
    equal(payload.webhook.enabled, true, "webhook deve ficar habilitado");
    equal(
      payload.webhook.url,
      "https://example.invalid/evolution-webhook",
      "URL do webhook",
    );
    equal(
      payload.webhook.headers?.apikey,
      "instance-token",
      "JSON do webhook deve autenticar callbacks com o token da instância",
    );
    equal(
      JSON.stringify(payload.webhook.events),
      JSON.stringify(expectedEvents),
      "eventos do provisionador",
    );
  });

  Deno.test(`${name}: token ausente retorna erro e faz zero HTTP`, async () => {
    let httpCalls = 0;
    const transport: typeof fetch = (() => {
      httpCalls++;
      throw new Error("HTTP não deveria ser chamado");
    }) as typeof fetch;

    const result = await configureWebhook(
      {
        url: "https://evolution.invalid",
        globalApiKey: "global-must-not-leak",
      },
      "instance-name",
      null,
      "https://example.invalid/evolution-webhook",
      transport,
    );
    equal(result.ok, false, "token ausente deve falhar");
    assert(
      result.error?.includes("Token da instância ausente"),
      "erro deve ser observável",
    );
    equal(httpCalls, 0, "token ausente não pode cair na globalApiKey");
  });

  Deno.test(`${name}: erro HTTP textual preserva status e diagnóstico`, async () => {
    const transport = (() =>
      Promise.resolve(
        new Response("upstream indisponível", { status: 502 }),
      )) as typeof fetch;
    const result = await configureWebhook(
      {
        url: "https://evolution.invalid",
        globalApiKey: "global-must-not-leak",
      },
      "instance-name",
      "instance-token",
      "https://example.invalid/evolution-webhook",
      transport,
    );
    equal(result.ok, false, "resposta 502 deve falhar");
    equal(
      result.error,
      "Servidor respondeu 502: upstream indisponível",
      "diagnóstico textual",
    );
  });
}

Deno.test("callback sem token é rejeitado", () => {
  const result = authenticateEvolutionWebhookCallback(
    "instance-token",
    {},
    new Headers(),
  );
  equal(result.ok, false, "callback sem token");
  if (!result.ok) equal(result.reason, "no_token", "motivo");
});

Deno.test("callback com token incorreto é rejeitado", () => {
  const result = authenticateEvolutionWebhookCallback(
    "instance-token",
    {},
    new Headers({ apikey: "wrong-token" }),
  );
  equal(result.ok, false, "callback com token incorreto");
  if (!result.ok) equal(result.reason, "token_mismatch", "motivo");
});

Deno.test("callback com token correto é aceito", () => {
  const result = authenticateEvolutionWebhookCallback(
    "instance-token",
    {},
    new Headers({ apikey: "instance-token" }),
  );
  equal(result.ok, true, "callback com token correto");
});

Deno.test("callback aceita header correto mesmo com body incorreto", () => {
  const result = authenticateEvolutionWebhookCallback(
    "instance-token",
    { apikey: "wrong-body-token" },
    new Headers({ apikey: "instance-token" }),
  );
  equal(result.ok, true, "header correto não pode ser eclipsado pelo body");
});

function webhookRequest(
  payload: Record<string, unknown>,
  headers: HeadersInit = {},
): Request {
  return new Request("https://example.invalid/platform-evolution-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

async function receiverHarness() {
  let lookups = 0;
  let writes = 0;
  const rejected: string[] = [];
  const handler = createPlatformEvolutionWebhookHandler({
    createContext: () => null,
    extractInstanceRef: (payload) => String(payload.instance ?? ""),
    findInstance: async (_context) => {
      lookups++;
      return { id: "instance-id", instance_token: "instance-token" };
    },
    handleAuthorized: async (_context) => {
      writes++;
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    },
    logAuthFailure: (reason) => rejected.push(reason),
  });
  return {
    handler,
    counts: () => ({ lookups, writes }),
    rejected,
  };
}

Deno.test("receptor retorna 401 sem token e não executa escrita", async () => {
  const harness = await receiverHarness();
  const response = await harness.handler(
    webhookRequest({
      instance: "attacker-instance",
      event: "attacker-event",
    }),
  );
  equal(response.status, 401, "status sem token");
  equal(
    harness.counts().lookups,
    0,
    "sem token não precisa consultar instância",
  );
  equal(harness.counts().writes, 0, "sem token não pode executar escrita");
  equal(JSON.stringify(harness.rejected), '["no_token"]', "log seguro");
});

Deno.test("receptor retorna 401 para token incorreto e não executa escrita", async () => {
  const harness = await receiverHarness();
  const response = await harness.handler(
    webhookRequest(
      {
        instance: "attacker-instance",
        event: "attacker-event",
      },
      { apikey: "global-must-not-fallback" },
    ),
  );
  equal(response.status, 401, "status com token incorreto");
  equal(harness.counts().lookups, 1, "token apresentado consulta instância");
  equal(
    harness.counts().writes,
    0,
    "token incorreto não pode executar escrita",
  );
  equal(JSON.stringify(harness.rejected), '["token_mismatch"]', "log seguro");
});

Deno.test("receptor retorna 2xx e executa fluxo autorizado com token correto", async () => {
  const harness = await receiverHarness();
  const response = await harness.handler(
    webhookRequest(
      {
        instance: "instance-name",
        event: "MESSAGES_UPSERT",
        apikey: "wrong-body-token",
      },
      { apikey: "instance-token" },
    ),
  );
  equal(response.status, 202, "status com token correto");
  equal(harness.counts().lookups, 1, "deve resolver instância");
  equal(harness.counts().writes, 1, "gate válido libera fluxo autorizado");
  equal(harness.rejected.length, 0, "não deve logar falha");
});
