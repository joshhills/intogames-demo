# Railway Deployment Guide

This guide explains how to deploy the Firewall Defense demo to Railway for public access.

## Prerequisites

1. A GitHub account
2. A Railway account (sign up at [railway.app](https://railway.app))
3. Your repository pushed to GitHub

## Railway Setup

### 1. Connect Your Repository

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Select your `intogames-workshop` repository
5. Railway will automatically detect your `docker-compose.yml` file

### 2. Deploy Docker Compose Services

Railway supports Docker Compose! When you connect your repo, Railway will:

1. **Automatically detect** your `docker-compose.yml`
2. **Import all services** from the compose file
3. **Assign public domains** to each service

### 3. Configure Environment Variables

After Railway imports your services, you need to configure the client service to know where the API and Push services are located.

#### For Each Service:

1. Go to your Railway project
2. Click on a service (e.g., `client`, `api-service`, `push-service`)
3. Go to the **"Variables"** tab
4. Add the following environment variables:

#### Client Service Variables:

Set these to point to the public domains Railway assigns:

```
CLIENT_API_URL=https://[your-api-service-domain]/api
CLIENT_WS_URL=wss://[your-push-service-domain]/ws
```

To find the domains:
1. Go to each service in Railway
2. Click **"Settings"**
3. Copy the **"Public Domain"** (e.g., `api-service-production.up.railway.app`)
4. Use that domain in the variables above

#### Alternative: Use Railway Service References

Railway provides service references. You can also set:

```
RAILWAY_API_DOMAIN=[api-service-public-domain]
RAILWAY_PUSH_DOMAIN=[push-service-public-domain]
```

The `inject-config.sh` script will automatically construct URLs from these.

### 4. Configure Redis

Railway provides a Redis addon. You have two options:

#### Option A: Use Railway's Redis Addon (Recommended)

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add Redis"**
3. Railway will create a Redis instance
4. Update your `docker-compose.yml` to use the Railway Redis connection string (if needed)

#### Option B: Use Your Compose Redis Service

Your existing `redis` service in the compose file will work, but Railway's managed Redis is more reliable for production.

### 5. Deploy

1. Railway will automatically deploy when you push to your connected branch
2. Or manually trigger a deployment from the Railway dashboard
3. Watch the build logs to ensure all services start correctly

## Accessing Your Deployed Services

After deployment:

1. Each service gets its own public domain (e.g., `client-production.up.railway.app`)
2. Access the game at your client service's public domain
3. The admin panel will be at your admin-service's public domain
4. Grafana (if you choose to deploy it) will be at your grafana service's domain

## Important Notes

### Service Dependencies

Railway will handle service dependencies based on your `docker-compose.yml` `depends_on` directives. However, you may need to:

- Ensure services wait for Redis to be ready
- Configure health checks for services that depend on others

### Port Configuration

Railway automatically assigns ports. Your services should listen on the port specified by the `PORT` environment variable Railway provides, or use the ports defined in your compose file.

### HTTPS/WebSocket

Railway automatically provides HTTPS for all services. WebSocket connections should use `wss://` instead of `ws://`. The `inject-config.sh` script handles this automatically.

### Monitoring Services

For a workshop demo, you may want to exclude some monitoring services (Prometheus, Grafana, Loki) to save resources. You can:

1. Create a `docker-compose.prod.yml` that excludes monitoring services
2. Or manually disable those services in Railway after deployment

## Troubleshooting

### Client Can't Connect to API

- Check that `CLIENT_API_URL` is set correctly in the client service
- Verify the API service is running and has a public domain
- Check Railway logs for both services

### WebSocket Connection Fails

- Ensure `CLIENT_WS_URL` uses `wss://` (not `ws://`)
- Check that the push-service is running
- Verify the push-service has a public domain assigned

### Services Not Starting

- Check Railway build logs for each service
- Verify all environment variables are set
- Ensure Docker images build successfully

### Redis Connection Issues

- If using Railway's Redis addon, get the connection string from the addon settings
- Update your services' `REDIS_URI` environment variable

## Cost Considerations

Railway's free tier includes:
- $5 credit per month
- 500 hours of usage
- Suitable for workshop demos and small projects

For production use, consider Railway's paid plans or alternative platforms like Render.com.

## Next Steps

1. Test your deployed game at the client service URL
2. Share the URL with workshop participants
3. Monitor usage in Railway dashboard
4. Set up custom domains if needed (Railway Pro)

## Alternative: Render.com

If you prefer Render.com (better Docker Compose support on free tier):

1. Connect your GitHub repo to Render
2. Select "Blueprint" deployment
3. Render will automatically detect and deploy your `docker-compose.yml`
4. Configure environment variables similarly

