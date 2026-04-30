// vite.config.js - Configure local proxy for development
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local proxy middleware to mimic Vercel's /api/proxy during development
function localProxyMiddleware() {
  return {
    name: 'local-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin, Authorization')
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type')

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          return res.end()
        }

        // Parse URL from query params
        const urlObj = new URL(req.url, 'http://localhost')
        const targetUrl = decodeURIComponent(urlObj.searchParams.get('url') || '')

        if (!targetUrl) {
          res.writeHead(400)
          return res.end('Missing url parameter')
        }

        // Validate URL
        try {
          new URL(targetUrl)
        } catch (err) {
          res.writeHead(400)
          return res.end('Invalid URL')
        }

        // Prepare headers for outgoing request
        const outgoingHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive',
        }

        // Copy relevant headers from incoming request
        if (req.headers.range) {
          outgoingHeaders.Range = req.headers.range
        }
        if (req.headers.referer) {
          outgoingHeaders.Referer = req.headers.referer
        }
        if (req.headers.origin) {
          outgoingHeaders.Origin = req.headers.origin
        }

        try {
          // Check if this is a media/streaming request
          const isMediaRequest = 
            req.headers.accept?.includes('video/') || 
            req.headers.accept?.includes('audio/') ||
            targetUrl.match(/\.(m3u8|ts|mp4|mov|avi|mkv|flv|webm)(\?|$)/i) ||
            req.headers.range

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

          const response = await fetch(targetUrl, {
            method: req.method,
            headers: outgoingHeaders,
            signal: controller.signal,
            redirect: 'follow',
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            res.writeHead(response.status, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({
              error: `Upstream server returned ${response.status}`,
              details: response.statusText
            }))
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
          ]

          headersToCopy.forEach(header => {
            const value = response.headers.get(header)
            if (value) {
              res.setHeader(header, value)
            }
          })

          // Set CORS headers on response
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin')

          // Handle different response types
          if (isMediaRequest || req.headers.range) {
            // For media/range requests, stream the response
            res.writeHead(response.status)
            
            // For range requests, we need to pass through the status code properly
            if (response.status === 206) {
              res.statusCode = 206
            }
            
            // Stream the response body
            if (response.body) {
              const reader = response.body.getReader()
              const stream = new ReadableStream({
                async pull(controller) {
                  const { done, value } = await reader.read()
                  if (done) {
                    controller.close()
                  } else {
                    controller.enqueue(value)
                  }
                },
                cancel() {
                  reader.cancel()
                }
              })
              
              // For streaming, we need to handle it differently in Node.js
              // Let's buffer it for simplicity in dev mode
              const chunks = []
              for await (const chunk of response.body) {
                chunks.push(chunk)
              }
              const buffer = Buffer.concat(chunks)
              res.end(buffer)
            } else {
              // Fallback for non-streaming responses
              const buffer = await response.arrayBuffer()
              res.end(Buffer.from(buffer))
            }
          } else {
            // For API/json/image responses, buffer and send
            const contentType = response.headers.get('content-type') || ''
            
            if (contentType.includes('application/json')) {
              const data = await response.json()
              res.writeHead(response.status, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(data))
            } else if (contentType.includes('image/')) {
              const buffer = await response.arrayBuffer()
              res.setHeader('Cache-Control', 'public, max-age=86400') // Cache images for 1 day
              res.writeHead(response.status)
              res.end(Buffer.from(buffer))
            } else {
              // Default to text for other content types
              const text = await response.text()
              res.writeHead(response.status)
              res.end(text)
            }
          }
        } catch (error) {
          console.error('Proxy error:', error)
          
          if (error.name === 'AbortError') {
            res.writeHead(504, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ error: 'Request timeout' }))
          }
          
          if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ 
              error: 'Unable to connect to upstream server',
              details: 'The IPTV server may be blocking requests from this proxy or be unavailable'
            }))
          }
          
          res.writeHead(502, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ 
            error: 'Proxy error', 
            message: error.message 
          }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    localProxyMiddleware(),   // ← يعمل محلياً فقط
  ],
  // على Vercel: api/proxy.js يتولى الأمر تلقائياً
  server: {
    port: 3000,
    strictPort: true,
    hmr: {
      overlay: false
    }
  }
})