# IPTV Proxy - Cloudflare Worker

## Setup

1. **تثبيت Wrangler:**
```bash
cd cf-worker
npm install
```

2. **تسجيل الدخول:**
```bash
npx wrangler login
```

3. **Deploy:**
```bash
npm run deploy
```

4. **انسخ الـ Worker URL** واحطه في `src/api.js` في المشروع الرئيسي