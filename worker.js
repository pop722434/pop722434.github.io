// Cloudflare Worker — contact form proxy + visitor counter
// Deploy: https://dash.cloudflare.com/ -> Workers & Pages -> Create Worker
// Paste this entire file into the editor.
//
// Then go to Settings -> Variables and add:
//   TELEGRAM_BOT_TOKEN  = 8857309040:AAEXlr_ZgqYWoAvnQjtqYAsBAkn7FvAuNd8
//   TELEGRAM_CHAT_ID    = 8129791340
//   TURNSTILE_SECRET    = get from Cloudflare Turnstile dashboard (site key: 0x4AAAAAAD-awN30FahbmN2S)
//
// Then go to Workers -> Settings -> KV Namespace Bindings:
//   Create a KV namespace named "visitor-kv" and bind it with variable name "VISITORS"

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsResponse(body, status) {
  return new Response(body, {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
  });
}

addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  var url = new URL(request.url);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS_HEADERS });
  }

  // Visitor counter
  if (url.pathname === '/visit') {
    if (request.method === 'GET') {
      var count = parseInt(await VISITORS.get('count') || '0', 10);
      return corsResponse(JSON.stringify({ count: count }), 200);
    }
    if (request.method === 'POST') {
      var newCount = await VISITORS.get('count') || '0';
      newCount = parseInt(newCount, 10) + 1;
      await VISITORS.put('count', String(newCount));
      return corsResponse(JSON.stringify({ count: newCount }), 200);
    }
    return corsResponse('Method not allowed', 405);
  }

  // Contact form - only POST
  if (request.method !== 'POST') {
    return corsResponse('Method not allowed', 405);
  }

  var body = await request.json();
  var name = body.name;
  var message = body.message;
  var turnstileResp = body['cf-turnstile-response'];

  if (!name || !message || !turnstileResp) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Missing fields' }), 400);
  }

  var ip = request.headers.get('CF-Connecting-IP') || '';
  var tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: TURNSTILE_SECRET, response: turnstileResp, remoteip: ip }),
  });
  var tsData = await tsRes.json();
  if (!tsData.success) {
    return corsResponse(JSON.stringify({ ok: false, error: 'Captcha verification failed' }), 403);
  }

  var text = 'From: ' + name + '\nMessage: ' + message;
  var tgRes = await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text }),
  });
  var tgData = await tgRes.json();

  if (tgData.ok) {
    return corsResponse(JSON.stringify({ ok: true }), 200);
  }
  return corsResponse(JSON.stringify({ ok: false, error: tgData.description || 'Telegram error' }), 500);
}