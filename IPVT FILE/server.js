const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // Proxy endpoint
    if (parsedUrl.pathname === '/proxy.php' && parsedUrl.query.url) {
        const targetUrl = decodeURIComponent(parsedUrl.query.url);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Accept, Origin');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const client = targetUrl.startsWith('https') ? https : http;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive',
        };

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const proxyReq = client.get(targetUrl, { headers }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);

            if (proxyRes.headers['content-type']?.includes('mpegurl') ||
                proxyRes.headers['content-type']?.includes('m3u')) {
                let data = '';
                proxyRes.on('data', chunk => data += chunk);
                proxyRes.on('end', () => {
                    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                    data = data.replace(/^((?!#|https?:\/\/).+\.(?:m3u8|ts|aac|mp4|fmp4))$/gm,
                        (match) => `proxy.php?url=${encodeURIComponent(baseUrl + match)}`);
                    res.end(data);
                });
            } else {
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
        });

        return;
    }

    // Serve static files
    let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
    filePath = path.join(__dirname, filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`   IPTV PRO - Server Running`);
    console.log(`========================================`);
    console.log(`\n✅ Server: http://localhost:${PORT}`);
    console.log(`\nPress Ctrl+C to stop\n`);
});
