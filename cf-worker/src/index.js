export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return new Response('Missing url parameter', { status: 400 });
    }

    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(target).origin + '/',
        'Accept': '*/*',
      };

      if (request.headers.has('range')) {
        headers['Range'] = request.headers.get('range');
      }

      const response = await fetch(target, { headers });

      const outHeaders = new Headers();
      outHeaders.set('Access-Control-Allow-Origin', '*');
      outHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      outHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin');
      outHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

      ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'].forEach(h => {
        const v = response.headers.get(h);
        if (v) outHeaders.set(h, v);
      });

      return new Response(response.body, {
        status: response.status,
        headers: outHeaders,
      });
    } catch (err) {
      return new Response('Proxy error: ' + err.message, { status: 502 });
    }
  },
};