// api/proxy.js — Vercel Serverless Function (محسن)

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

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Connection': 'keep-alive',
  };

  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';
    const isM3U8 = contentType.includes('mpegurl') || contentType.includes('m3u') ||
                   targetUrl.includes('.m3u8') || targetUrl.includes('.m3u');

    // نسخ headers مهمة
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'].forEach(h => {
      const val = response.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    res.status(response.status);

    if (isM3U8) {
      // إصلاح روابط HLS النسبية
      let text = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

      text = text.replace(/^((?!#|https?:\/\/).+\.(?:m3u8|ts|aac|mp4|fmp4))$/gm, (match) => {
        return `/api/proxy?url=${encodeURIComponent(baseUrl + match)}`;
      });

      return res.send(text);
    }

    // للملفات الثنائية - streaming مباشر
    if (response.body) {
      for await (const chunk of response.body) {
        res.write(chunk);
      }
      return res.end();
    }

    const buffer = await response.arrayBuffer();
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(err.name === 'AbortError' ? 504 : 502).json({
      error: err.message || 'Proxy failed'
    });
  }
}