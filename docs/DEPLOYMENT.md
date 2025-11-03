# Deployment Guide

This guide covers deploying Firewall Defense to a production environment.

## Environment Variables

The following environment variables can be set to customize URLs and connections for different deployment scenarios:

### Docker Compose Environment Variables

You can set these before running `docker-compose up`:

```bash
export API_SERVICE_URL=http://api.yourdomain.com
export ADMIN_SERVICE_URL=http://admin.yourdomain.com
export WS_SERVICE_URL=wss://push.yourdomain.com
export CLIENT_URL=http://game.yourdomain.com
```

### Service-Specific Environment Variables

#### API Service
- `REDIS_URI` - Redis connection string (default: `redis://redis:6379`)
- `JWT_SECRET` - Secret key for JWT tokens (MUST be set in production)
- `ADMIN_API_KEY` - Secret key for admin endpoints (MUST be set in production)

#### Admin Service
- `API_SERVICE_URL` - URL to API service (default: `http://api-service:3000`)
- `CLIENT_URL` - URL of game client for CORS (default: `http://localhost:8080`)

#### Push Service
- `REDIS_URI` - Redis connection string (default: `redis://redis:6379`)
- `PORT` - WebSocket port (default: `3001`)

#### Client (Static Files)

For the client, you have two options:

**Option 1: Inject URLs via script tag (Recommended)**

Create a `config.js` file that gets injected before `api.js`:

```html
<script>
  window.API_URL = 'https://api.yourdomain.com/api';
  window.WS_URL = 'wss://push.yourdomain.com/ws';
</script>
<script src="api.js"></script>
```

**Option 2: Build-time replacement**

If using a build process, replace URLs during build:
- Replace `http://localhost:3000/api` with your API URL
- Replace `ws://localhost:3001/ws` with your WebSocket URL

## Production Checklist

- [ ] Set strong `JWT_SECRET` and `ADMIN_API_KEY` values
- [ ] Use secure WebSocket protocol (`wss://`) for production
- [ ] Configure CORS in admin-service to allow only your client domain
- [ ] Set up SSL/TLS certificates for HTTPS/WSS
- [ ] Configure persistent volumes for Redis data (if you want data to survive container restarts)
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy for database
- [ ] Update OpenAPI specs with production server URLs
- [ ] Test all endpoints in production environment

## Example Production docker-compose.yml Override

Create a `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  api-service:
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - ADMIN_API_KEY=${ADMIN_API_KEY}
      - REDIS_URI=${REDIS_URI}

  admin-service:
    environment:
      - API_SERVICE_URL=${API_SERVICE_URL}
      - CLIENT_URL=${CLIENT_URL}

  push-service:
    environment:
      - REDIS_URI=${REDIS_URI}
```

Then run:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
```

