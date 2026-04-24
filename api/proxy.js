// api/proxy.js — Vercel Serverless Function
// بروكسي بسيط للـ API فقط (الفيديو والصور مباشرة)

export const config = {
  api: { responseLimit: false, bodyParser: false },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url: rawUrl, type } = req.query;

  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Connection': 'keep-alive',
  };

  if (req.headers['range']) {
    headers['Range'] = req.headers['range'];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream returned ${response.status}`
      });
    }

    // نسخ headers
    ['content-type', 'content-length', 'cache-control'].forEach(h => {
      const value = response.headers.get(h);
      if (value) res.setHeader(h, value);
    });

    // إرجاع البيانات
    const text = await response.text();
    return res.status(200).send(text);

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(err.name === 'AbortError' ? 504 : 502).json({
      error: err.message || 'Proxy failed'
    });
  }
}
