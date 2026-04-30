export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return new Response('Missing url parameter', { status: 400 });
    }

    try {
      const response = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': new URL(target).origin + '/',
          'Origin': new URL(target).origin,
        },
      });

      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin');

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (err) {
      return new Response('Proxy error: ' + err.message, { status: 502 });
    }
  },
};