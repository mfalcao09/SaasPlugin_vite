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
import {
  authenticateEvolutionWebhookCallback,
  isTenantWebhookAuthEnforceEnabled,
  tenantWebhookUnauthorizedResponse,
} from "./evolution-webhook-auth.ts";
import { createPlatformEvolutionWebhookHandler } from "./platform-evolution-webhook-handler.ts";
import { createPlatformEvolutionWebhookReceiver } from "../platform-whatsapp-qr-webhook/index.ts";

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
    "platform-whatsapp-qr-proxy",
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

Deno.test("TENANT_WEBHOOK_AUTH_ENFORCE default is off", () => {
  equal(isTenantWebhookAuthEnforceEnabled(undefined), false, "undefined");
  equal(isTenantWebhookAuthEnforceEnabled(null), false, "null");
  equal(isTenantWebhookAuthEnforceEnabled(""), false, "empty");
  equal(isTenantWebhookAuthEnforceEnabled("false"), false, "false");
  equal(isTenantWebhookAuthEnforceEnabled("true"), true, "true");
  equal(isTenantWebhookAuthEnforceEnabled(" TRUE "), true, "trimmed true");
});

Deno.test("tenant unauthorized response matches platform 401 contract", async () => {
  const response = tenantWebhookUnauthorizedResponse("no_token", {
    "Access-Control-Allow-Origin": "*",
  });
  equal(response.status, 401, "status");
  const body = await response.json();
  equal(body.error, "Unauthorized", "body");
  equal(
    response.headers.get("Content-Type"),
    "application/json",
    "content-type",
  );
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
  return new Request("https://example.invalid/platform-whatsapp-qr-webhook", {
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

Deno.test("receptor processa exatamente a instância autenticada", async () => {
  const authenticated = {
    id: "authenticated-instance-id",
    instance_token: "instance-token",
    name: "instance-name",
    product_id: "authenticated-product",
  };
  const competing = {
    id: "competing-instance-id",
    instance_token: "other-token",
    name: "instance-name",
    product_id: "competing-product",
  };
  let updatedInstanceId = "";

  const fakeSupabase = {
    from: (_table: string) => {
      let operation = "select";
      const query: Record<string, unknown> = {
        select: (_fields: string) => query,
        update: (_values: unknown) => {
          operation = "update";
          return query;
        },
        eq: (_column: string, value: string) => {
          if (operation === "update") {
            updatedInstanceId = value;
            return Promise.resolve({ error: null });
          }
          return query;
        },
        limit: (_count: number) =>
          Promise.resolve({
            data: [authenticated],
          }),
        or: (_filter: string) => Promise.resolve({ data: [competing] }),
      };
      return query;
    },
  };

  const receiver = createPlatformEvolutionWebhookReceiver(
    () => fakeSupabase,
  );
  const response = await receiver(
    webhookRequest(
      {
        event: "CONNECTION_UPDATE",
        instance: "instance-name",
        data: { state: "open" },
      },
      { apikey: "instance-token" },
    ),
  );

  equal(response.status, 200, "status do processamento autorizado");
  equal(
    updatedInstanceId,
    authenticated.id,
    "efeitos devem usar a mesma linha autenticada pelo gate",
  );
});

function ackReceiverHarness(messageConnectionId: string) {
  const authenticated = {
    id: "authenticated-instance-id",
    instance_token: "instance-token",
    name: "instance-name",
  };
  let ackInstanceFilter = "";
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const fakeSupabase = {
    from: (table: string) => {
      const query: Record<string, unknown> = {
        select: (_fields: string) => query,
        eq: (column: string, value: string) => {
          if (column === "metadata->>connection_id") {
            ackInstanceFilter = value;
          }
          return query;
        },
        limit: (_count: number) =>
          Promise.resolve({
            data: table === "platform_crm_wa_qr_instances"
              ? [authenticated]
              : [],
          }),
        maybeSingle: () =>
          Promise.resolve({
            data: table === "platform_crm_messages"
              ? {
                metadata: {
                  campaign_id: "campaign-id",
                  connection_id: messageConnectionId,
                },
                created_at: "2026-08-08T12:00:00.000Z",
              }
              : null,
          }),
      };
      return query;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ error: null });
    },
  };

  return {
    authenticated,
    receiver: createPlatformEvolutionWebhookReceiver(() => fakeSupabase),
    ackInstanceFilter: () => ackInstanceFilter,
    rpcCalls,
  };
}

function deliveryAckRequest(): Request {
  return webhookRequest(
    {
      event: "MESSAGES_UPDATE",
      instance: "instance-name",
      data: {
        messages: [{
          key: { id: "wamid-1" },
          status: "DELIVERY_ACK",
        }],
      },
    },
    { apikey: "instance-token" },
  );
}

Deno.test("ACK de outra instância não atualiza contador", async () => {
  const harness = ackReceiverHarness("competing-instance-id");
  const response = await harness.receiver(deliveryAckRequest());

  equal(response.status, 200, "ACK cruzado continua sendo reconhecido");
  equal(harness.rpcCalls.length, 0, "ACK de B não pode alterar contador de A");
  equal(
    harness.ackInstanceFilter(),
    harness.authenticated.id,
    "consulta do ACK deve filtrar pela instância autenticada",
  );
});

Deno.test("ACK da instância autenticada atualiza contador", async () => {
  const harness = ackReceiverHarness("authenticated-instance-id");
  const response = await harness.receiver(deliveryAckRequest());

  equal(response.status, 200, "ACK legítimo");
  equal(harness.rpcCalls.length, 1, "ACK de A deve atualizar contador");
  equal(
    harness.rpcCalls[0].args.p_instance,
    harness.authenticated.id,
    "contador deve usar a instância autenticada",
  );
  equal(harness.rpcCalls[0].args.p_delivered, 1, "incremento de entrega");
});
