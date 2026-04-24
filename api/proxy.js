// api/proxy.js — Vercel Serverless Function
// استراتيجية ذكية:
//   ?type=api    → جلب JSON وإرجاعه (بيانات الـ IPTV API)
//   ?type=m3u8   → جلب M3U8 وإصلاح الروابط النسبية
//   ?type=stream → redirect 302 للرابط الأصلي (بدون timeout)
//   بدون type    → كشف تلقائي

export const config = {
  api: { responseLimit: false, bodyParser: false },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // استخرج URL و type
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(qs);
  const rawUrl = params.get('url');
  const type   = params.get('type') || 'auto';

  if (!rawUrl) return res.status(400).json({ error: 'No URL' });

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const ext = targetUrl.split('?')[0].split('.').pop().toLowerCase();
  const isM3U8   = type === 'm3u8'   || ext === 'm3u8' || ext === 'm3u';
  const isStream = type === 'stream' || ext === 'ts' || ext === 'mp4' || ext === 'mkv' || ext === 'avi';
  const isImage  = ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp';
  const isAPI    = type === 'api'    || targetUrl.includes('player_api.php');

  // ===== بث الفيديو والـ segments: Redirect مباشر =====
  // المتصفح يتصل بالسيرفر مباشرة — بدون timeout على Vercel
  if (isStream && !isM3U8) {
    // أضف CORS header للسيرفر الأصلي عبر redirect
    res.setHeader('Cache-Control', 'no-cache');
    return res.redirect(302, targetUrl);
  }

  // ===== M3U8 و API: جلب وإرجاع =====
  const headers = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept':          '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Connection':      'keep-alive',
    'Cache-Control':   'no-cache',
  };
  if (req.headers['range']) headers['Range'] = req.headers['range'];

  async function fetchRetry(url, n = 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, { headers, signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(t);
      return r;
    } catch(e) {
      clearTimeout(t);
      if (n < 3 && e.name !== 'AbortError') {
        await new Promise(ok => setTimeout(ok, 800 * n));
        return fetchRetry(url, n + 1);
      }
      throw e;
    }
  }

  try {
    const response = await fetchRetry(targetUrl);
    const ct = response.headers.get('content-type') || '';

    // تمرير headers
    ['content-type','content-length','accept-ranges','cache-control'].forEach(h => {
      const v = response.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    // ===== M3U8: أصلح الروابط =====
    if (isM3U8 || ct.includes('mpegurl') || ct.includes('m3u')) {
      const text    = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

      const fixed = text
        // روابط نسبية للـ segments → redirect مباشر
        .replace(
          /^((?!#|https?:\/\/).+\.(?:ts|aac|fmp4))$/gm,
          match => `/api/proxy?type=stream&url=${encodeURIComponent(baseUrl + match)}`
        )
        // روابط نسبية لـ M3U8 فرعية → عبر البروكسي
        .replace(
          /^((?!#|https?:\/\/).+\.m3u8)$/gm,
          match => `/api/proxy?type=m3u8&url=${encodeURIComponent(baseUrl + match)}`
        )
        // روابط مطلقة لـ segments → redirect
        .replace(
          /^(https?:\/\/.+\.(?:ts|aac|fmp4))$/gm,
          match => `/api/proxy?type=stream&url=${encodeURIComponent(match)}`
        )
        // encryption keys
        .replace(
          /URI="(https?:\/\/[^"]+)"/g,
          (_, u) => `URI="/api/proxy?type=stream&url=${encodeURIComponent(u)}"`
        )
        .replace(
          /URI="((?!https?:\/\/)[^"]+)"/g,
          (_, rel) => `URI="/api/proxy?type=stream&url=${encodeURIComponent(baseUrl + rel)}"`
        );

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).send(fixed);
    }

    // ===== JSON / نص / صور =====
    const contentType = response.headers.get('content-type') || '';

    // للصور: نرجعها كـ binary
    if (isImage || contentType.includes('image/')) {
      const buffer = await response.arrayBuffer();
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(response.status).send(Buffer.from(buffer));
    }

    // للنصوص و JSON
    const text = await response.text();
    return res.status(response.status).send(text);

  } catch(err) {
    console.error('Proxy error:', err.message, 'URL:', targetUrl);
    return res.status(err.name === 'AbortError' ? 504 : 502)
              .json({ error: err.message });
  }
}
