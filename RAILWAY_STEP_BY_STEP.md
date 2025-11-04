# Railway Deployment - Step by Step Guide

## Understanding Railway's Docker Compose Support

**Important:** Railway doesn't automatically import Docker Compose services. You need to **manually create each service** from your compose file. Railway will build each service using its Dockerfile.

## Step-by-Step Setup

### Step 1: Create a New Project

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository (`intogames-workshop` or whatever you named it)

### Step 2: Add Redis Service First

Redis needs to be available before other services start.

**Option A: Use Railway's Managed Redis (Recommended)**
1. Click **"+ New"** in your Railway project
2. Select **"Database"** → **"Add Redis"**
3. Railway will create a managed Redis instance
4. Note the service name (e.g., "Redis") - you'll need it for environment variables

**Option B: Use Your Compose Redis Service**
1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. In **"Settings"** → **"Source"**:
   - **Root Directory**: Leave empty (or `./`)
4. In **"Settings"** → **"Build"**:
   - **Builder**: Select **"Docker"** (not Railpack!)
   - **Docker Image**: `redis:latest`
   - **Start Command**: `redis-server`

### Step 3: Create API Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. In **"Settings"** → **"Source"**:
   - **Root Directory**: `./` (root of repo, since Dockerfile references parent directories)
4. In **"Settings"** → **"Build"**:
   - **Builder**: **"Docker"** (important! Not Railpack)
   - **Dockerfile Path**: `api-service/Dockerfile`
5. In **"Settings"** → **"Variables"**, add:
   ```
   REDIS_URI=${{Redis.REDIS_URL}}
   PUSH_SERVICE_URL=https://push-service-production.up.railway.app
   JWT_SECRET=THIS_IS_A_VERY_SECRET_KEY_FOR_THE_WORKSHOP
   ADMIN_API_KEY=ADMIN_SUPER_SECRET_KEY
   ```
   *Note: You'll need to update `PUSH_SERVICE_URL` after creating push-service*

### Step 4: Create Push Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. In **"Settings"** → **"Source"**:
   - **Root Directory**: `./` (root of repo)
4. In **"Settings"** → **"Build"**:
   - **Builder**: **"Docker"**
   - **Dockerfile Path**: `push-service/Dockerfile`
5. In **"Variables"**, add:
   ```
   REDIS_URI=${{Redis.REDIS_URL}}
   ```

### Step 5: Create Client Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. In **"Settings"** → **"Source"**:
   - **Root Directory**: `./`
4. In **"Settings"** → **"Build"**:
   - **Builder**: **"Docker"**
   - **Dockerfile Path**: `client/Dockerfile`
5. In **"Variables"**, add:
   ```
   CLIENT_API_URL=https://[api-service-domain]/api
   CLIENT_WS_URL=wss://[push-service-domain]/ws
   ```
   *You'll get these domains after deploying api-service and push-service*

### Step 6: Create Admin Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your repository
3. In **"Settings"** → **"Source"**:
   - **Root Directory**: `admin-service/` (important! The Dockerfile copies from current directory)
4. In **"Settings"** → **"Build"**:
   - **Builder**: **"Docker"**
   - **Dockerfile Path**: `Dockerfile` (relative to admin-service/ directory)
5. In **"Variables"**, add:
   ```
   API_SERVICE_URL=https://[api-service-domain]
   ```
   *Get this domain from api-service's Settings tab*

### Step 7: Get Public Domains and Update Variables

After deploying services, you need to get their public domains:

1. Click on `api-service` → **"Settings"** tab
2. Scroll down to **"Networking"** section
3. Copy the **"Public Domain"** (e.g., `api-service-production.up.railway.app`)
4. Do the same for `push-service`
5. Update the `CLIENT_API_URL` and `CLIENT_WS_URL` in the client service's Variables
6. Update `PUSH_SERVICE_URL` in api-service's Variables
7. Update `API_SERVICE_URL` in admin-service's Variables

### Step 8: Deploy and Test

1. Deploy services in this order:
   - Redis (first)
   - api-service and push-service (after Redis)
   - client and admin-service (after api/push)

2. Access your game at the client service's public domain!

## Troubleshooting

### "No start command found" Error

If you see this error, it means Railway is trying to use Railpack instead of Docker.

**Fix:**
1. Go to the service's **"Settings"** tab
2. Under **"Build"**, make sure:
   - **Builder**: Set to **"Docker"** (not "Railpack")
   - **Dockerfile Path**: Correctly set (e.g., `client/Dockerfile`)

### Services Can't Connect to Each Other

Railway services don't use Docker Compose service names. Instead:

1. Use Railway's **service references**: `${{ServiceName.VARIABLE}}`
2. Or use **public domains** with HTTPS
3. For Redis, use Railway's managed Redis and its connection string

### Redis Connection Issues

**Option 1: Use Railway's Managed Redis (Recommended)**
1. Add a new Redis database from Railway's dashboard
2. Use its connection string from Variables tab

**Option 2: Use Your Compose Redis Service**
- Make sure the `redis` service is deployed
- Use its public domain (if exposed) or Railway's internal networking

## Key Differences from Local Docker Compose

| Local Docker Compose | Railway |
|---------------------|---------|
| `redis:6379` (service name) | `${{Redis.REDIS_URL}}` or public domain |
| `http://api-service:3000` | `https://api-service-production.up.railway.app` |
| Services communicate via Docker network | Services communicate via public domains or Railway references |
| Single `docker-compose up` command | Each service deployed separately |

## Quick Reference: Service Configuration

For each service, make sure:
- ✅ **Builder** is set to **"Docker"** (not Railpack)
- ✅ **Root Directory** matches the Dockerfile's build context:
  - `client/` → Dockerfile Path: `Dockerfile` (client service)
  - `admin-service/` → Dockerfile Path: `Dockerfile` (admin service)
  - `./` (root) → Dockerfile Path: `api-service/Dockerfile` (api service)
  - `./` (root) → Dockerfile Path: `push-service/Dockerfile` (push service)
- ✅ Environment variables use Railway service references (`${{ServiceName.VARIABLE}}`) or public domains

## Next Steps

1. Deploy all services
2. Test the game at the client's public URL
3. Configure environment variables for cross-service communication
4. Share the URL with your workshop participants!
