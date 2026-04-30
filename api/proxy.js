// api/proxy.js - Vercel Serverless Function Proxy
// Handles all external requests to bypass CORS and mixed content issues

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '4mb', // Increased for API responses
    responseLimit: false, // Important for streaming
  },
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get target URL from query params
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    // Validate URL
    new URL(targetUrl);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Prepare headers for outgoing request
  const outgoingHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
  };

  // Copy relevant headers from incoming request
  if (req.headers.range) {
    outgoingHeaders.Range = req.headers.range;
  }
  if (req.headers.referer) {
    outgoingHeaders.Referer = req.headers.referer;
  }
  if (req.headers.origin) {
    outgoingHeaders.Origin = req.headers.origin;
  }

  try {
    // For video/streaming requests, we'll stream the response
    const isMediaRequest = 
      req.headers.accept?.includes('video/') || 
      req.headers.accept?.includes('audio/') ||
      targetUrl.match(/\.(m3u8|ts|mp4|mov|avi|mkv|flv|webm)(\?|$)/i) ||
      req.headers.range;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: outgoingHeaders,
      signal: controller.signal,
      redirect: 'follow',
      // Important: don't decompress automatically for video
      // decompress: false, // Not available in Node.js fetch yet
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream server returned ${response.status}`,
        details: response.statusText
      });
    }

    // Copy important response headers
    const headersToCopy = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'content-disposition',
      'etag',
      'last-modified',
      'expires'
    ];

    headersToCopy.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        res.setHeader(header, value);
      }
    });

    // Set CORS headers on response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin');

    // Handle different response types
    if (isMediaRequest || req.headers.range) {
      // For media/range requests, stream the response
      res.status(response.status);
      
      // For range requests, we need to pass through the status code properly
      if (response.status === 206) {
        res.status(206);
      }
      
      // Stream the response body
      if (response.body) {
        const reader = response.body.getReader();
        const stream = new ReadableStream({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
            } else {
              controller.enqueue(value);
            }
          },
          cancel() {
            reader.cancel();
          }
        });
        
        // Pipe the stream to response
        return new Response(stream, {
          status: response.status,
          headers: res.getHeaders()
        });
      } else {
        // Fallback for non-streaming responses
        const data = await response.arrayBuffer();
        return res.send(Buffer.from(data));
      }
    } else {
      // For API/json/image responses, buffer and send
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return res.status(response.status).json(data);
      } else if (contentType.includes('image/')) {
        const buffer = await response.arrayBuffer();
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache images for 1 day
        return res.status(response.status).send(Buffer.from(buffer));
      } else {
        // Default to text for other content types
        const text = await response.text();
        return res.status(response.status).send(text);
      }
    }
  } catch (error) {
    console.error('Proxy error:', error);
    
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timeout' });
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(502).json({ 
        error: 'Unable to connect to upstream server',
        details: 'The IPTV server may be blocking requests from this proxy or be unavailable'
      });
    }
    
    return res.status(502).json({ 
      error: 'Proxy error', 
      message: error.message 
    });
  }
}