import {
  EVOLUTION_WEBHOOK_EVENTS,
  type EvolutionEvent,
  invalidEvents,
  PLATFORM_EVOLUTION_WEBHOOK_EVENTS,
  TENANT_EVOLUTION_WEBHOOK_EVENTS,
} from "./evolution-webhook-events.ts";

export interface EvolutionWebhookConfig {
  url: string;
  globalApiKey: string;
}

export interface EvolutionWebhookResult {
  ok: boolean;
  error?: string;
  status?: number;
  response?: unknown;
}

export type EvolutionWebhookProvisioner = (
  config: EvolutionWebhookConfig,
  instanceName: string,
  instanceToken: string | null | undefined,
  webhookUrl: string,
  transport?: typeof fetch,
) => Promise<EvolutionWebhookResult>;

function maskKey(value: string): string {
  return value.length <= 8
    ? "***"
    : `${value.slice(0, 5)}***${value.slice(-3)}`;
}

async function configureWebhook(
  config: EvolutionWebhookConfig,
  instanceName: string,
  instanceToken: string | null | undefined,
  webhookUrl: string,
  events: readonly EvolutionEvent[],
  transport: typeof fetch = fetch,
): Promise<EvolutionWebhookResult> {
  if (!instanceName) return { ok: false, error: "Nome da instância ausente." };
  if (!instanceToken) {
    return { ok: false, error: "Token da instância ausente." };
  }

  const invalid = invalidEvents(events);
  if (invalid.length) {
    return {
      ok: false,
      error: `eventos fora do enum: ${invalid.join(", ")}`,
    };
  }

  console.log(
    `[configureWebhook] name=${instanceName} apikey=${
      maskKey(instanceToken)
    } (instance token)`,
  );

  let response: Response;
  try {
    response = await transport(
      `${config.url}/webhook/set/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: instanceToken,
        },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            events,
          },
        }),
      },
    );
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `Falha ao conectar em ${config.url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  console.log(
    `[configureWebhook] name=${instanceName} status=${response.status} ok=${response.ok}`,
  );

  if (response.ok) {
    return { ok: true, status: response.status, response: body };
  }

  const apiError = typeof body === "object" && body !== null
    ? String(
      (body as Record<string, unknown>).message ??
        (body as Record<string, unknown>).error ??
        "",
    )
    : text
    ? `Servidor respondeu ${response.status}: ${text.slice(0, 200)}`
    : "";

  return {
    ok: false,
    status: response.status,
    error: apiError ||
      `Falha ao configurar webhook (status ${response.status}).`,
    response: body,
  };
}

function provisioner(
  events: readonly EvolutionEvent[],
): EvolutionWebhookProvisioner {
  return (config, instanceName, instanceToken, webhookUrl, transport) =>
    configureWebhook(
      config,
      instanceName,
      instanceToken,
      webhookUrl,
      events,
      transport,
    );
}

export const configureEvolutionProxyWebhook = provisioner(
  TENANT_EVOLUTION_WEBHOOK_EVENTS,
);

export const configurePlatformEvolutionProxyWebhook = provisioner(
  PLATFORM_EVOLUTION_WEBHOOK_EVENTS,
);

export const configureOnboardingEvolutionWebhook = provisioner(
  TENANT_EVOLUTION_WEBHOOK_EVENTS,
);

export const configureDemoEvolutionWebhook = provisioner(
  EVOLUTION_WEBHOOK_EVENTS,
);
