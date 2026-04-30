// api/proxy.js — Vercel Serverless Function

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

  const { url, type } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Language': 'ar,en;q=0.9',
      'Connection': 'keep-alive',
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    if (type === 'stream') {
      const response = await fetch(targetUrl, { headers, redirect: 'follow' });
      res.status(response.status);
      ['content-type','content-length','content-range','accept-ranges','cache-control'].forEach(k => {
        const v = response.headers.get(k);
        if (v) res.setHeader(k, v);
      });
      if (response.body) {
        for await (const chunk of response.body) {
          res.write(chunk);
        }
      }
      return res.end();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    const allowedHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    allowedHeaders.forEach(h => {
      const val = response.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    res.status(response.status);

    const contentType = response.headers.get('content-type') || '';
    const isM3U8 = contentType.includes('mpegurl') || contentType.includes('m3u') ||
                   targetUrl.includes('.m3u8') || targetUrl.includes('.m3u');

    if (isM3U8) {
      let text = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

      text = text.replace(/^((?!#|https?:\/\/).+\.(?:m3u8|ts|aac|mp4|fmp4))$/gm, (match) => {
        const absoluteUrl = baseUrl + match;
        return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      });

      return res.send(text);
    }

    const buffer = await response.arrayBuffer();
    return res.send(Buffer.from(buffer));

  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timeout' });
    }
    return res.status(502).json({ error: 'Proxy error: ' + error.message });
  }
}