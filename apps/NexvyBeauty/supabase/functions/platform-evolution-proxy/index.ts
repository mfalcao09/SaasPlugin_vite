// Legacy alias retired (C-hard-2). Use platform-whatsapp-qr-proxy.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-brain-secret, x-cold-secret",
};

Deno.serve((_req) =>
  new Response(
    JSON.stringify({
      error: "gone",
      detail: "platform-evolution-proxy removed. Use platform-whatsapp-qr-proxy.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  )
);
