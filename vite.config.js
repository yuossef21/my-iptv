import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function localProxyMiddleware() {
  return {
    name: 'local-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin')
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')

        if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

        const urlObj = new URL(req.url, 'http://localhost')
        const targetUrl = decodeURIComponent(urlObj.searchParams.get('url') || '')

        if (!targetUrl) { res.writeHead(400); return res.end('No URL'); }

        try { new URL(targetUrl) } catch { res.writeHead(400); return res.end('Invalid URL') }

        try {
          const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive',
          }
          if (req.headers.range) headers['Range'] = req.headers.range

          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 30000)

          const response = await fetch(targetUrl, {
            headers,
            signal: controller.signal,
            redirect: 'follow',
          })
          clearTimeout(timeout)

          const contentType = response.headers.get('content-type') || ''
          const isM3U8 = contentType.includes('mpegurl') || contentType.includes('m3u') ||
                         targetUrl.includes('.m3u8') || targetUrl.includes('.m3u')

          ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'].forEach(h => {
            const v = response.headers.get(h)
            if (v) res.setHeader(h, v)
          })

          res.writeHead(response.status)

          if (isM3U8) {
            let text = await response.text()
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1)
            text = text.replace(/^((?!#|https?:\/\/).+\.(?:m3u8|ts|aac|mp4|fmp4))$/gm, match => {
              return `/api/proxy?url=${encodeURIComponent(baseUrl + match)}`
            })
            return res.end(text)
          }

          if (response.body) {
            for await (const chunk of response.body) {
              res.write(chunk)
            }
            return res.end()
          }

          const buf = await response.arrayBuffer()
          res.end(Buffer.from(buf))

        } catch (err) {
          if (!res.headersSent) res.writeHead(502)
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), localProxyMiddleware()],
})