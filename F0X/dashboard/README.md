# F0X Dashboard

Hosted multi-tenant web dashboard for F0X MCP messaging.

## Local run

```bash
npm install
npm run dev
```

Set frontend API base URL:

```bash
VITE_API_BASE_URL=http://localhost:8787 npm run dev
```

## Deploy on Render

1. Create a Web Service for `F0X/dashboard`.
2. Build command: `npm install && npm run build`.
3. Publish directory: `dist`.
4. Set `VITE_API_BASE_URL` to your hosted backend base URL.

## Deploy on VPS

```bash
docker build -t f0x-dashboard .
docker run -d -p 8080:80 f0x-dashboard
```

Use reverse proxy (nginx/caddy) to route `/api` to the mcp-server web-dashboard backend.
