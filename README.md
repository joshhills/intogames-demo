# Firewall Defense - Connected Play Demo

A complete "Firewall Defense" game project demonstrating multi-service backend architecture for connected gameplay. This project shows how multiple backend services work together to power a simple connected game with real-time updates, leaderboards, and live operations management.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Services](#services)
- [Authentication](#authentication)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Monitoring & Observability](#monitoring--observability)
- [Deployment](#deployment)

## Quick Start

### Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)

### Running the Demo

1. Clone this repository
2. Open a terminal in the root directory
3. Run:
   ```bash
   docker-compose up --build
   ```
4. Wait for all services to start (may take a few minutes on first run)
5. Open your browser: **http://localhost:8080**

You can open multiple browser windows to simulate multiple players and see real-time WebSocket updates broadcast to all clients simultaneously.

### Access URLs

- **Game Client**: http://localhost:8080
- **API Service**: http://localhost:3000
- **Admin Panel**: http://localhost:4000
- **Swagger UI**: http://localhost:8081
- **Grafana** (Monitoring): http://localhost:3002
- **Prometheus** (Metrics): http://localhost:9090
- **Redis Commander** (Redis Viewer): http://localhost:3003

**Default Credentials** (for admin panel, Grafana, and Redis Commander):
- Username: `admin`
- Password: `password123`

## Architecture Overview

This project runs multiple services simultaneously using Docker Compose:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│ API Service │────▶│    Redis    │
│  (p5.js)    │◀────│  (Express)  │◀────│   (Data)    │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │
      │                    │
      └────────────────────┼────────────────────┐
                           │                    │
                    ┌─────────────┐      ┌─────────────┐
                    │Push Service │      │   Admin     │
                    │(WebSocket)  │      │  Service    │
                    └─────────────┘      └─────────────┘
```

**Key Concepts:**
- **Client**: Browser-based game using p5.js/p5.play
- **API Service**: REST API handling authentication, profiles, scores, leaderboards
- **Push Service**: WebSocket server for real-time updates (health, leaderboard, MOTD)
- **Redis**: Data store for player profiles, leaderboards, global state, and Pub/Sub messaging
- **Admin Service**: Web UI for live operations management
- **Monitoring**: Prometheus (metrics) + Grafana (visualization) + Loki (logs)

## Services

### 1. Client (Port 8080)
- **Technology**: p5.js/p5.play served by Nginx
- **Purpose**: Game frontend with real-time updates via WebSocket
- **Features**: Player profile, game config, leaderboard, global health display

### 2. API Service (Port 3000)
- **Technology**: Node.js + Express
- **Purpose**: Main REST API for game backend
- **Endpoints**:
  - Authentication: `/api/auth/enroll`
  - Player profiles: `/api/player/*`
  - Game config: `/api/game-config`
  - Match submission: `/api/match/complete`
  - Leaderboard: `/api/leaderboard`
  - Global health: `/api/firewall/status`
  - MOTD: `/api/motd`
  - Admin endpoints: `/api/admin/*`
- **Metrics**: Available at `/metrics` (Prometheus format)

### 3. Push Service (Port 3001)
- **Technology**: Node.js + Fastify + WebSocket
- **Purpose**: Real-time push notifications via WebSocket
- **Updates Broadcast**:
  - Global firewall health changes
  - Leaderboard updates (top 3 changes)
  - Message of the Day (MOTD)
  - Match completion notifications
- **Metrics**: Available at `/metrics` (Prometheus format)

### 4. Redis (Port 6379)
- **Technology**: Redis
- **Purpose**: Data store and message broker
- **Stores**:
  - Player profiles (`player:uuid`)
  - Leaderboard (sorted set: `leaderboard`)
  - Global health (`global_health`, `global_max_health`)
  - MOTD (`global_motd`)
  - Leaderboard flush settings
- **Pub/Sub**: `global_updates` channel for inter-service communication

### 5. Admin Service (Port 4000)
- **Technology**: Node.js + Fastify
- **Purpose**: Web-based admin panel for live operations
- **Features**:
  - Game configuration management (per difficulty)
  - Global health and max health management
  - MOTD updates
  - Leaderboard viewing and flushing
  - Leaderboard flush interval configuration
- **Authentication**: Session-based (username: `admin`, password: `password123`)

### 6. Swagger UI (Port 8081)
- **Purpose**: Interactive API documentation
- **Features**: Browse and test all API endpoints for API Service, Admin Service, and Push Service

## Authentication

The project uses a two-layer authentication architecture:

### Layer 1: Admin Panel (Session Cookie)
- **Location**: Admin Service (port 4000)
- **Method**: Session cookie obtained via `/login`
- **Credentials**: `admin` / `password123`
- **Who uses it**: Administrators accessing the web UI

### Layer 2: API Service (API Key / JWT)
- **Location**: API Service (port 3000)
- **Admin Endpoints**: Require `X-Admin-API-Key` header
  - Default: `ADMIN_SUPER_SECRET_KEY`
  - Endpoints: `/api/admin/*`
- **Player Endpoints**: Require JWT Bearer token (obtained from `/api/auth/enroll`)
  - Endpoints: `/api/player/*`, `/api/match/complete`
- **Public Endpoints**: No authentication required
  - Endpoints: `/api/auth/enroll`, `/api/game-config`, `/api/leaderboard`, `/api/firewall/status`, `/api/motd`

### Using Swagger UI with Admin Endpoints

1. Open http://localhost:8081
2. Click **Authorize** (padlock icon)
3. Enter `ADMIN_SUPER_SECRET_KEY` in the `adminApiKey` field
4. Click **Authorize** and **Close**
5. All admin endpoints will now include the API key automatically

## API Documentation

### Interactive Documentation

**Swagger UI**: http://localhost:8081

The easiest way to explore and test APIs. Use the dropdown to switch between:
- API Service documentation
- Admin Service documentation  
- Push Service (WebSocket) documentation

### OpenAPI Specifications

OpenAPI 3.0 specs are located in `docs/`:
- `openapi-api-service.yaml` - Main REST API
- `openapi-admin-service.yaml` - Admin panel API
- `openapi-push-service.yaml` - WebSocket protocol

You can view these in:
- Swagger Editor: https://editor.swagger.io
- Import to Postman for API testing
- Redoc: `npx @redocly/cli preview-docs docs/openapi-api-service.yaml`

## Testing

The project includes comprehensive unit and integration tests.

### Running Tests

**API Service:**
```bash
cd api-service
npm install
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

**Admin Service:**
```bash
cd admin-service
npm install
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Test Requirements

- **Redis**: Integration tests require a Redis instance
  - Use the Redis service from `docker-compose.yml`
  - Or run: `docker run -d -p 6379:6379 redis:latest`
- **Environment Variables**: Tests use defaults but can be overridden
  - `JWT_SECRET`: `'your-super-secret-key'`
  - `ADMIN_API_KEY`: `'ADMIN_SUPER_SECRET_KEY'`
  - `REDIS_URI`: `'redis://localhost:6379'`

### Test Structure

- **API Service**: Unit tests (auth), integration tests (all endpoints)
- **Admin Service**: Integration tests (login, protected routes)

## Monitoring & Observability

### Grafana (http://localhost:3002)
- **Credentials**: `admin` / `password123`
- **Dashboards**:
  - **Firewall Defense - Game Metrics**: Real-time game metrics, player counts, match statistics
  - **Firewall Defense - Logs**: Application logs from all services

### Prometheus (http://localhost:9090)
- **Purpose**: Metrics collection
- **Scrapes**: API Service (`/metrics`) and Push Service (`/metrics`)

### Loki + Promtail
- **Purpose**: Log aggregation
- **Collected Services**: api-service, push-service, admin-service
- **View Logs**: Grafana → Explore → Select "Loki" → Query: `{job="api-service"}`

### Redis Commander (http://localhost:3003)
- **Credentials**: `admin` / `password123`
- **Purpose**: Browse and inspect Redis data
- **Features**: View keys, hashes, sorted sets, pub/sub channels

### Available Metrics

**Game Metrics:**
- Active Players (WebSocket connections)
- Matches Completed (rate by difficulty)
- Match Scores Distribution
- Total Players, Leaderboard Size
- Global Firewall Health & Max Health

**Event Metrics:**
- Players Enrolled
- Leaderboard Flushes
- MOTD Broadcasts
- WebSocket Connection Events

**API Metrics:**
- Request Rate (by endpoint)
- Request Duration (latency distribution)

### LogQL Query Examples

In Grafana Explore (Loki datasource):
- `{job="api-service"}` - All API logs
- `{job="push-service"} |= "error"` - Errors from push service
- `{job="admin-service"} |= "login"` - Login events

### Setting Up Loki Datasource

The Loki datasource is not auto-provisioned (to prevent Grafana startup issues). To add it manually:

1. Go to Grafana: http://localhost:3002
2. Click **Configuration** → **Data Sources** → **Add data source**
3. Select **Loki**
4. Set URL to: `http://loki:3100`
5. Set UID to: `loki`
6. Click **Save & Test**

This will enable the logs dashboard to work properly.

## Deployment

### Railway (Recommended for Free Hosting)

Railway now supports Docker Compose! This is the easiest way to deploy the demo for a workshop.

**Quick Start:**
1. Push your repository to GitHub
2. Sign up at [railway.app](https://railway.app) (free tier available)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway will automatically detect and deploy your `docker-compose.yml`
6. Configure environment variables (see [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for details)

**Full Guide:** See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for detailed Railway deployment instructions, including:
- How to configure service URLs
- Setting up Redis
- Troubleshooting common issues
- Cost considerations

### Environment Variables

You can customize URLs and connections for different deployments:

**Docker Compose:**
```bash
export API_SERVICE_URL=http://api.yourdomain.com
export ADMIN_SERVICE_URL=http://admin.yourdomain.com
export WS_SERVICE_URL=wss://push.yourdomain.com
export CLIENT_URL=http://game.yourdomain.com
docker-compose up
```

**Service-Specific:**
- `REDIS_URI` - Redis connection string
- `JWT_SECRET` - Secret for JWT tokens (**MUST** set in production)
- `ADMIN_API_KEY` - Secret for admin endpoints (**MUST** set in production)

**Client Configuration:**

Inject URLs via script tag:
```html
<script>
  window.API_URL = 'https://api.yourdomain.com/api';
  window.WS_URL = 'wss://push.yourdomain.com/ws';
</script>
<script src="api.js"></script>
```

### Production Checklist

- [ ] Set strong `JWT_SECRET` and `ADMIN_API_KEY` values
- [ ] Use secure WebSocket protocol (`wss://`) for production
- [ ] Configure CORS in admin-service for your client domain
- [ ] Set up SSL/TLS certificates for HTTPS/WSS
- [ ] Configure persistent volumes for Redis data
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy for database
- [ ] Update OpenAPI specs with production server URLs

### Production docker-compose Override

Create `docker-compose.prod.yml`:
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

Run with:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
```

## Additional Resources

- **Design Document**: `docs/DESIGN_DOCUMENT.md` - Comprehensive design requirements and business outcomes
- **OpenAPI Specs**: `docs/openapi-*.yaml` - Full API specifications
- **Test Examples**: See `__tests__/` directories in each service for test patterns

## Troubleshooting

**Services won't start:**
- Check Docker is running: `docker ps`
- Check ports aren't in use: `lsof -i :8080 -i :3000 -i :3001`
- View logs: `docker-compose logs [service-name]`

**Can't connect to WebSocket:**
- Check push-service is running: `docker-compose ps`
- Check browser console for connection errors
- Verify `WS_URL` in client matches push-service URL

**Tests failing:**
- Ensure Redis is running: `docker ps | grep redis`
- Check Redis is accessible: `docker-compose exec redis redis-cli ping`
- Verify environment variables are set correctly

**Can't access admin panel:**
- Check credentials: `admin` / `password123`
- Clear browser cookies and try again
- Check admin-service logs: `docker-compose logs admin-service`
