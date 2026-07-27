// Cloudflare Worker — contact form proxy
// Deploy: https://dash.cloudflare.com/ -> Workers & Pages -> Create Worker
// Paste this entire file into the editor.
//
// Then go to Settings -> Variables and add:
//   TELEGRAM_BOT_TOKEN  = 8857309040:AAEXlr_ZgqYWoAvnQjtqYAsBAkn7FvAuNd8
//   TELEGRAM_CHAT_ID    = 8129791340
//   TURNSTILE_SECRET    = get from Cloudflare Turnstile dashboard (site key: 0x4AAAAAAD-awN30FahbmN2S)

addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  var body = await request.json();
  var name = body.name;
  var message = body.message;
  var turnstileResp = body['cf-turnstile-response'];

  if (!name || !message || !turnstileResp) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify Turnstile captcha server-side
  var ip = request.headers.get('CF-Connecting-IP') || '';
  var tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: TURNSTILE_SECRET, response: turnstileResp, remoteip: ip }),
  });
  var tsData = await tsRes.json();
  if (!tsData.success) {
    return new Response(JSON.stringify({ ok: false, error: 'Captcha verification failed' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  var text = 'From: ' + name + '\nMessage: ' + message;
  var tgRes = await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text }),
  });
  var tgData = await tgRes.json();

  if (tgData.ok) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: false, error: tgData.description || 'Telegram error' }), {
    status: 500, headers: { 'Content-Type': 'application/json' },
  });
}