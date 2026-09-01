// Legacy alias retired (C-hard-2). Use platform-whatsapp-qr-send.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-brain-secret, x-cold-secret",
};

Deno.serve((_req) =>
  new Response(
    JSON.stringify({
      error: "gone",
      detail: "platform-evolution-send removed. Use platform-whatsapp-qr-send.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  )
);
