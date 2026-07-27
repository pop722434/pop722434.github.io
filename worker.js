// Cloudflare Worker — contact form proxy
// Deploy: https://dash.cloudflare.com/ -> Workers & Pages -> Create Worker
//
// Set secrets (via dashboard or wrangler):
//   TELEGRAM_BOT_TOKEN  = 8857309040:AAEXlr_ZgqYWoAvnQjtqYAsBAkn7FvAuNd8
//   TELEGRAM_CHAT_ID    = 8129791340
//   TURNSTILE_SECRET    = get from Cloudflare Turnstile dashboard (site key: 0x4AAAAAAD-awN30FahbmN2S)
//
// After deploying, update index.html: replace the fetch URL with your worker URL
//   (e.g. https://contact-form.username.workers.dev)

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.json();
    const name = body.name;
    const message = body.message;
    const turnstileResp = body['cf-turnstile-response'];

    if (!name || !message || !turnstileResp) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify Turnstile captcha server-side
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: turnstileResp, remoteip: ip }),
    });
    const tsData = await tsRes.json();
    if (!tsData.success) {
      return new Response(JSON.stringify({ ok: false, error: 'Captcha verification failed' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const text = `From: ${name}\nMessage: ${message}`;
    const tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
    const tgData = await tgRes.json();

    if (tgData.ok) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: false, error: tgData.description || 'Telegram error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  },
};
