# Coinly WebDAV Proxy

WebDAV proxy for Coinly. It can run either on Cloudflare Workers or as a Docker container on your own server.

## Endpoints

- `POST /dav?url=<target_url>&method=<webdav_method>`
  - Optional header: `authorization: Basic ...`
  - Body: original WebDAV request body for non-`GET`/`HEAD` methods.

## Workers Deploy

```bash
cd proxy/webdav
npx wrangler login
npx wrangler deploy
```

## Docker Deploy

```bash
cd proxy/webdav
docker build -t coinly-webdav-proxy .
docker run --rm -p 8787:8787 coinly-webdav-proxy
```

Use `http://your-server:8787` as the proxy base for direct server deployment, or put Nginx in front of it.
