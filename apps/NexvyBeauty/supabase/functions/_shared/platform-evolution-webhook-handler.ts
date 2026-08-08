import {
  authenticateEvolutionWebhookCallback,
  extractEvolutionWebhookCredentials,
} from "./evolution-webhook-auth.ts";

export type PlatformEvolutionWebhookAuthFailure =
  | "no_token"
  | "unknown_instance"
  | "token_mismatch";

export interface PlatformEvolutionWebhookInstance {
  instance_token: string | null | undefined;
}

export interface PlatformEvolutionWebhookHandlerDependencies<
  TContext,
  TInstance extends PlatformEvolutionWebhookInstance,
> {
  createContext: () => TContext;
  extractInstanceRef: (payload: Record<string, unknown>) => string;
  findInstance: (
    context: TContext,
    instanceRef: string,
  ) => Promise<TInstance | null>;
  handleAuthorized: (
    context: TContext,
    request: Request,
    payload: Record<string, unknown>,
    instance: TInstance,
  ) => Promise<Response>;
  logAuthFailure: (reason: PlatformEvolutionWebhookAuthFailure) => void;
  logHandlerFailure?: () => void;
  corsHeaders?: HeadersInit;
}

export function createPlatformEvolutionWebhookHandler<
  TContext,
  TInstance extends PlatformEvolutionWebhookInstance,
>(
  dependencies: PlatformEvolutionWebhookHandlerDependencies<
    TContext,
    TInstance
  >,
): (request: Request) => Promise<Response> {
  const unauthorized = (reason: PlatformEvolutionWebhookAuthFailure) => {
    dependencies.logAuthFailure(reason);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        ...dependencies.corsHeaders,
        "Content-Type": "application/json",
      },
    });
  };

  return async (request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: dependencies.corsHeaders });
    }

    try {
      const parsed = await request.json().catch(() => ({}));
      const payload = parsed && typeof parsed === "object" &&
          !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};

      if (
        extractEvolutionWebhookCredentials(payload, request.headers).length ===
          0
      ) {
        return unauthorized("no_token");
      }

      const context = dependencies.createContext();
      const instance = await dependencies.findInstance(
        context,
        dependencies.extractInstanceRef(payload),
      );
      if (!instance) return unauthorized("unknown_instance");

      const auth = authenticateEvolutionWebhookCallback(
        instance.instance_token,
        payload,
        request.headers,
      );
      if (!auth.ok) return unauthorized(auth.reason);

      return await dependencies.handleAuthorized(
        context,
        request,
        payload,
        instance,
      );
    } catch {
      dependencies.logHandlerFailure?.();
      return new Response(
        JSON.stringify({ ok: false, error: "Internal handler error" }),
        {
          status: 200,
          headers: {
            ...dependencies.corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  };
}
