# Authentication Architecture

This document explains the authentication layers in Firewall Defense.

## Two-Layer Authentication Architecture

### Layer 1: Admin Service (Port 4000)
**Purpose:** Web UI for administrators with session-based authentication.

- **Authentication:** Session cookie (obtained via `/login`)
- **Enforced by:** `adminAuth` hook in `admin-service/server.js`
- **Who uses it:** Administrators accessing the web-based admin panel
- **Protection:** Prevents unauthorized access to the admin UI

**Flow:**
1. Admin logs in at `http://localhost:4000/login`
2. Receives session cookie
3. Admin panel UI sends requests to admin-service (port 4000)
4. Admin-service validates session cookie
5. Admin-service proxies request to API service (port 3000) with `X-Admin-API-Key` header

### Layer 2: API Service (Port 3000)
**Purpose:** REST API that can be called directly or via admin-service proxy.

- **Authentication:** `X-Admin-API-Key` header (for admin endpoints)
- **Enforced by:** `authenticateAdmin` middleware in `api-service/server.js`
- **Who uses it:** 
  - Admin-service (when proxying admin panel requests)
  - Direct API calls (Swagger UI, scripts, etc.)
- **Protection:** Prevents unauthorized calls to admin API endpoints

**Admin Endpoints (require `X-Admin-API-Key`):**
- `GET /api/admin/health`
- `POST /api/admin/health`
- `POST /api/admin/broadcast-motd`
- `POST /api/admin/game-config`
- `GET /api/admin/leaderboard`
- `DELETE /api/admin/leaderboard`
- `GET /api/admin/leaderboard-flush-interval`
- `POST /api/admin/leaderboard-flush-interval`

**Player Endpoints (require JWT Bearer token):**
- `POST /api/player/setup`
- `GET /api/player/profile`
- `POST /api/match/complete`

**Public Endpoints (no authentication):**
- `POST /api/auth/enroll`
- `GET /api/game-config`
- `GET /api/leaderboard`
- `GET /api/firewall/status`
- `GET /api/motd`

## Using Swagger UI with Admin Endpoints

When calling admin endpoints via Swagger UI:

1. Click the **Authorize** button (padlock icon) at the top of Swagger UI
2. Enter the admin API key in the `adminApiKey` field
   - Default value: `ADMIN_SUPER_SECRET_KEY`
   - This matches the value in `docker-compose.yml` or `ADMIN_API_KEY` environment variable
3. Click **Authorize** and **Close**
4. Now all admin endpoints will include the `X-Admin-API-Key` header automatically

## Security Considerations

**For Workshop/Development:**
- Default API key is hardcoded: `ADMIN_SUPER_SECRET_KEY`
- This is acceptable for educational purposes

**For Production:**
- **MUST** set `ADMIN_API_KEY` environment variable to a strong, randomly generated secret
- **MUST** set `JWT_SECRET` environment variable to a strong, randomly generated secret
- **SHOULD** use HTTPS/WSS for all connections
- **SHOULD** implement rate limiting on admin endpoints
- **SHOULD** log all admin actions for audit purposes
- **CONSIDER** adding IP whitelisting for admin endpoints

## Why Two Layers?

1. **Admin Panel Protection:** Session-based auth provides better UX for web UI (remember login, session timeout)
2. **API Flexibility:** Direct API access (via Swagger, scripts) doesn't require maintaining sessions
3. **Service Separation:** Admin-service can be replaced or updated without changing API service authentication
4. **Different Use Cases:** Web UI vs. programmatic API access have different auth needs

## Testing Authentication

### Test Admin API Key (via curl):
```bash
# Without API key (should fail)
curl -X DELETE http://localhost:3000/api/admin/leaderboard

# With API key (should succeed)
curl -X DELETE http://localhost:3000/api/admin/leaderboard \
  -H "X-Admin-API-Key: ADMIN_SUPER_SECRET_KEY"
```

### Test Session Cookie (via browser):
1. Open http://localhost:4000
2. Login with `admin` / `password123`
3. Browser automatically sends session cookie with requests
4. Admin panel UI works without manual header management

