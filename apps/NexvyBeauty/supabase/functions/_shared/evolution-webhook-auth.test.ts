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
