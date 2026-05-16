# Coinly Weiyun Proxy

Cloudflare Workers proxy for Tencent Weiyun sync. It exists only to bypass browser CORS for Weiyun MCP and download URLs.

## Endpoints

- `POST /mcp`
  - Header: `x-weiyun-token: <mcp_token>`
  - Body: original JSON-RPC MCP request from Coinly.
  - Forwards to `https://www.weiyun.com/api/v3/mcpserver` with `WyHeader: mcp_token=<token>`.

- `POST /download`
  - Body: `{ "url": "<https_download_url>", "cookie": "FTN5K=..." }`
  - Fetches the Weiyun download URL and returns the raw response body.

## Deploy

```bash
cd proxy/weiyun
npx wrangler deploy
```

After deployment, set the Worker base URL in Coinly:

```env
VITE_WEIYUN_PROXY_URL=https://coinly-weiyun-proxy.<account>.workers.dev
```

You can also set a per-target proxy URL in the Weiyun sync provider form.

## Security

The Worker is stateless. It does not store tokens, payloads, or decrypted Coinly data. Coinly still encrypts the ledger before upload.
