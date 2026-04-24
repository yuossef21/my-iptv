import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ===== Middleware يحاكي api/proxy.js لوكلياً =====
function localProxyMiddleware() {
  return {
    name: 'local-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin')
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')

        if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

        const urlObj = new URL(req.url, 'http://localhost')
        const targetUrl = decodeURIComponent(urlObj.searchParams.get('url') || '')

        if (!targetUrl) { res.writeHead(400); return res.end('No URL'); }

        try {
          new URL(targetUrl) // تحقق
        } catch {
          res.writeHead(400); return res.end('Invalid URL')
        }

        try {
          const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive',
          }
          if (req.headers['range']) headers['Range'] = req.headers['range']

          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)

          const response = await fetch(targetUrl, {
            headers,
            signal: controller.signal,
            redirect: 'follow',
          })
          clearTimeout(timeout)

          // تمرير headers مهمة
          ;['content-type','content-length','cache-control'].forEach(h => {
            const v = response.headers.get(h)
            if (v) res.setHeader(h, v)
          })

          res.writeHead(response.status)

          // إرجاع البيانات
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
  plugins: [
    react(),
    localProxyMiddleware(),   // ← يعمل محلياً فقط
  ],
  // على Vercel: api/proxy.js يتولى الأمر تلقائياً
})
