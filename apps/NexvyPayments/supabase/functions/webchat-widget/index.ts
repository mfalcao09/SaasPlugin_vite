// Edge Function: webchat-widget (Sprint 10 F4)
// verify_jwt: false — serve script JS embeddable
// GET /webchat-widget?key=API_KEY → Content-Type: application/javascript

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PROJECT_URL = SUPABASE_URL.replace(/\/$/, "");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsResponse(code: string, status = 200): Response {
  return new Response(code, {
    status,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...CORS_HEADERS,
    },
  });
}

function escapeJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const url = new URL(req.url);
  const apiKey = url.searchParams.get("key") ?? "";

  if (!apiKey) {
    return jsResponse(`console.error('[webchat] missing key param');`, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: keyRow } = await supabase
    .from("empresa_api_keys")
    .select("empresa_id, revoked_at")
    .eq("api_key", apiKey)
    .is("revoked_at", null)
    .single();

  if (!keyRow) {
    return jsResponse(`console.error('[webchat] invalid key');`, 403);
  }

  const { data: emp } = await supabase
    .from("empresas")
    .select("webchat_enabled, webchat_greeting, webchat_primary_color, webchat_agent_name")
    .eq("id", keyRow.empresa_id)
    .single();

  if (!emp || emp.webchat_enabled === false) {
    return jsResponse(`console.warn('[webchat] disabled for this tenant');`);
  }

  const greeting = escapeJs(String(emp.webchat_greeting ?? "Olá! Como posso ajudar?"));
  const color = String(emp.webchat_primary_color ?? "#ea580c").replace(/[^#0-9a-fA-F]/g, "");
  const agent = escapeJs(String(emp.webchat_agent_name ?? "Suporte"));
  const handlerUrl = `${PROJECT_URL}/functions/v1/webchat-handler`;

  const code = `
(function(){
  if (window.__NEXVY_WEBCHAT__) return;
  window.__NEXVY_WEBCHAT__ = true;

  var API_KEY = '${escapeJs(apiKey)}';
  var HANDLER_URL = '${handlerUrl}';
  var COLOR = '${color}';
  var GREETING = '${greeting}';
  var AGENT = '${agent}';

  var sessionId = localStorage.getItem('nexvy_webchat_sid');
  if (!sessionId) {
    sessionId = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('nexvy_webchat_sid', sessionId);
  }
  var contactName = localStorage.getItem('nexvy_webchat_name') || '';

  var style = document.createElement('style');
  style.textContent = ''
    + '.nexvy-wc-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:'+COLOR+';color:#fff;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;z-index:2147483646;font-size:24px}'
    + '.nexvy-wc-panel{position:fixed;bottom:96px;right:24px;width:340px;max-width:calc(100vw - 48px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483646;font-family:system-ui,sans-serif}'
    + '.nexvy-wc-panel.open{display:flex}'
    + '.nexvy-wc-hdr{background:'+COLOR+';color:#fff;padding:14px 16px;font-weight:600}'
    + '.nexvy-wc-body{flex:1;overflow-y:auto;padding:12px;background:#f8fafc}'
    + '.nexvy-wc-msg{margin-bottom:8px;padding:8px 12px;border-radius:12px;max-width:80%;font-size:14px;line-height:1.4}'
    + '.nexvy-wc-msg.bot{background:#fff;color:#0f172a;border:1px solid #e2e8f0}'
    + '.nexvy-wc-msg.me{background:'+COLOR+';color:#fff;margin-left:auto}'
    + '.nexvy-wc-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e2e8f0;background:#fff}'
    + '.nexvy-wc-form input{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font-size:14px;outline:none}'
    + '.nexvy-wc-form button{background:'+COLOR+';color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px}'
    + '.nexvy-wc-name{padding:12px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;background:#fff}'
    + '.nexvy-wc-name input{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;font-size:13px;outline:none}';
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.className = 'nexvy-wc-btn';
  btn.setAttribute('aria-label', 'Abrir chat');
  btn.innerHTML = '✉';

  var panel = document.createElement('div');
  panel.className = 'nexvy-wc-panel';
  panel.innerHTML = ''
    + '<div class="nexvy-wc-hdr">'+AGENT+'</div>'
    + (contactName ? '' : '<div class="nexvy-wc-name"><input id="nexvy-wc-name-input" placeholder="Seu nome" /></div>')
    + '<div class="nexvy-wc-body" id="nexvy-wc-body"></div>'
    + '<form class="nexvy-wc-form" id="nexvy-wc-form"><input id="nexvy-wc-input" placeholder="Digite sua mensagem..." autocomplete="off" /><button type="submit">Enviar</button></form>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var body = panel.querySelector('#nexvy-wc-body');
  function pushMsg(text, who){
    var el = document.createElement('div');
    el.className = 'nexvy-wc-msg ' + (who === 'me' ? 'me' : 'bot');
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  var greeted = false;
  btn.addEventListener('click', function(){
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && !greeted) {
      pushMsg(GREETING, 'bot');
      greeted = true;
    }
  });

  panel.querySelector('#nexvy-wc-form').addEventListener('submit', function(e){
    e.preventDefault();
    var input = panel.querySelector('#nexvy-wc-input');
    var nameInput = panel.querySelector('#nexvy-wc-name-input');
    var text = (input.value || '').trim();
    if (!text) return;

    if (nameInput) {
      var n = (nameInput.value || '').trim();
      if (n) { contactName = n; localStorage.setItem('nexvy_webchat_name', n); }
    }

    pushMsg(text, 'me');
    input.value = '';

    fetch(HANDLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        contact_name: contactName || 'Visitante',
        message: text,
        session_id: sessionId
      })
    }).catch(function(err){ console.error('[webchat] send error', err); });
  });
})();
`;

  return jsResponse(code);
});
