import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// --- CONFIGURATION ---
const app = Fastify({ logger: true });
const PORT = process.env.PORT || 4000;
// This is the "internal" Docker DNS name for the API service
// Can be overridden via environment variable for different deployments
// For Railway, set this to the public domain of the API service (e.g., https://api-service-production-xxx.up.railway.app)
const API_SERVICE_URL = process.env.API_SERVICE_URL || 'http://api-service:3000'; 
// This is the hardcoded secret for our admin tool to talk to the API
const ADMIN_API_KEY = 'ADMIN_SUPER_SECRET_KEY'; 
// This is a hardcoded, mock admin login
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'password123';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- PLUGINS ---
// CORS not needed since admin panel is served from same origin, but allow all for flexibility
app.register(fastifyCors, { origin: true, credentials: true });
app.register(fastifyCookie);
app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// --- AUTH HOOK (Mock Session) ---
// This is a middleware function that protects admin panel endpoints.
// It runs BEFORE each endpoint handler to check if the user is logged in.
//
// How it works:
// 1. When user logs in via /login, they get a cookie named "session" with value "valid-admin-session"
// 2. When user tries to access admin endpoints (like /api/game-config), this hook checks for that cookie
// 3. If cookie exists and is correct -> request continues to the endpoint
// 4. If cookie is missing/wrong -> request is rejected with 401 Unauthorized
//
// This prevents unauthorized access to admin functionality without logging in.
app.decorate('adminAuth', async (request, reply) => {
  try {
    // Check if the request has the correct session cookie
    if (request.cookies.session !== 'valid-admin-session') {
      // No valid session cookie = user not logged in = reject request
      reply.status(401).send({ error: 'Unauthorized' });
      return; // Stop here, don't continue to endpoint
    }
    // Cookie is valid, let request continue to the endpoint handler
  } catch (err) {
    // Error reading cookies = reject request
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

// --- ROUTES ---

// 1. Serve the admin login page
app.get('/', (req, reply) => {
  reply.sendFile('index.html');
});

// 2. Mock login endpoint
app.post('/login', (request, reply) => {
  const { username, password } = request.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // Set a mock session cookie. In production, this would be a secure, signed JWT.
    reply.setCookie('session', 'valid-admin-session', {
      path: '/',
      httpOnly: true,
      maxAge: 3600 // 1 hour
    }).send({ success: true });
  } else {
    reply.status(401).send({ success: false, message: 'Invalid credentials' });
  }
});

// 3. Get current game config (proxies to the API service)
app.get('/api/game-config', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const response = await axios.get(`${API_SERVICE_URL}/api/game-config`);
    reply.send(response.data);
  } catch (error) {
    reply.status(500).send({ error: 'Failed to fetch config from API service' });
  }
});

// 3b. Get current MOTD (proxies to the API service)
app.get('/api/motd', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const response = await axios.get(`${API_SERVICE_URL}/api/motd`);
    reply.send(response.data);
  } catch (error) {
    reply.status(500).send({ error: 'Failed to fetch MOTD from API service' });
  }
});

// 3c. Get current health (proxies to the API service)
app.get('/api/health', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const response = await axios.get(`${API_SERVICE_URL}/api/admin/health`, {
      headers: {
        'X-Admin-API-Key': ADMIN_API_KEY
      }
    });
    reply.send(response.data);
  } catch (error) {
    console.error('Error fetching health:', error.message);
    reply.status(500).send({ error: 'Failed to fetch health from API service' });
  }
});

// 3e. Get leaderboard (proxies to the API service)
app.get('/api/leaderboard', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const response = await axios.get(`${API_SERVICE_URL}/api/admin/leaderboard`, {
      headers: { 'X-Admin-API-Key': ADMIN_API_KEY }
    });
    reply.send(response.data);
  } catch (error) {
    reply.status(500).send({ error: 'Failed to fetch leaderboard from API service' });
  }
});

// 3g. Get leaderboard flush interval (proxies to the API service)
app.get('/api/leaderboard-flush-interval', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const response = await axios.get(`${API_SERVICE_URL}/api/admin/leaderboard-flush-interval`, {
      headers: { 'X-Admin-API-Key': ADMIN_API_KEY }
    });
    reply.send(response.data);
  } catch (error) {
    reply.status(500).send({ error: 'Failed to fetch flush interval from API service' });
  }
});

// 3h. Update leaderboard flush interval (proxies to the API service)
app.post('/api/leaderboard-flush-interval', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    app.log.info('Flush interval update request received:', { body: request.body });
    
    const response = await axios.post(`${API_SERVICE_URL}/api/admin/leaderboard-flush-interval`, request.body, {
      headers: {
        'X-Admin-API-Key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    app.log.info('Flush interval successfully updated on API service');
    reply.send({ success: true });
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      url: `${API_SERVICE_URL}/api/admin/leaderboard-flush-interval`,
      requestBody: request.body
    };
    
    app.log.error('Flush interval update error:', errorDetails);
    
    reply.status(500).send({
      error: 'Failed to update flush interval',
      details: error.response?.data || error.message
    });
  }
});

// 3i. Get leaderboard flush info (proxies to the API service)
app.get('/api/leaderboard-flush-info', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    // The flush info is now included in the /api/leaderboard response
    const response = await axios.get(`${API_SERVICE_URL}/api/leaderboard`);
    // Extract just the flush info from the combined response
    reply.send({
      lastFlush: response.data.lastFlush,
      flushIntervalMinutes: response.data.flushIntervalMinutes
    });
  } catch (error) {
    reply.status(500).send({ error: 'Failed to fetch flush info from API service' });
  }
});

// 3f. Flush leaderboard (proxies to the API service)
app.delete('/api/leaderboard', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    app.log.info('Leaderboard flush request received');
    
    const response = await axios.delete(`${API_SERVICE_URL}/api/admin/leaderboard`, {
      headers: { 
        'X-Admin-API-Key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    app.log.info('Leaderboard successfully flushed on API service');
    reply.send({ success: true });
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      url: `${API_SERVICE_URL}/api/admin/leaderboard`
    };
    
    app.log.error('Leaderboard flush error:', errorDetails);
    
    reply.status(500).send({
      error: 'Failed to flush leaderboard',
      details: error.response?.data || error.message
    });
  }
});

// 4. Get Players List (proxies to the API service)
app.get('/api/players', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const page = request.query.page || '1';
    const limit = request.query.limit || '20';
    const search = request.query.search || '';
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
    const response = await axios.get(`${API_SERVICE_URL}/api/admin/players?page=${page}&limit=${limit}${searchParam}`, {
      headers: { 'X-Admin-API-Key': ADMIN_API_KEY }
    });
    reply.send(response.data);
  } catch (error) {
    app.log.error('Error fetching players:', error);
    reply.status(500).send({ error: 'Failed to fetch players from API service' });
  }
});

// 5a. Delete All Players - MUST come before /api/players/:uuid to avoid route collision
app.delete('/api/players', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const response = await axios.delete(`${API_SERVICE_URL}/api/admin/players`, {
      headers: { 
        'X-Admin-API-Key': ADMIN_API_KEY
      }
    });
    reply.send(response.data);
  } catch (error) {
    app.log.error('Error deleting all players:', error.message || error);
    if (error.response) {
      app.log.error('API Service response:', error.response.status, error.response.data);
    }
    const status = error.response?.status || 500;
    reply.status(status).send({ error: error.response?.data?.error || error.message || 'Failed to delete all players' });
  }
});

// 5b. Delete Players (Bulk) - MUST come before /api/players/:uuid to avoid route collision
app.post('/api/players/bulk-delete', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const response = await axios.post(`${API_SERVICE_URL}/api/admin/players/bulk-delete`, request.body, {
      headers: { 
        'X-Admin-API-Key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    reply.send(response.data);
  } catch (error) {
    app.log.error('Error bulk deleting players:', error.message || error);
    if (error.response) {
      app.log.error('API Service response:', error.response.status, error.response.data);
    } else if (error.request) {
      app.log.error('No response received from API service:', error.request);
    } else {
      app.log.error('Error setting up request:', error.message);
    }
    const status = error.response?.status || 500;
    reply.status(status).send({ error: error.response?.data?.error || error.message || 'Failed to bulk delete players' });
  }
});

// 6. Update Player Profile (proxies to the API service)
app.post('/api/players/:uuid', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const { uuid } = request.params;
    const response = await axios.post(`${API_SERVICE_URL}/api/admin/players/${uuid}`, request.body, {
      headers: { 
        'X-Admin-API-Key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    reply.send(response.data);
  } catch (error) {
    app.log.error('Error updating player:', error);
    const status = error.response?.status || 500;
    reply.status(status).send({ error: error.response?.data?.error || 'Failed to update player' });
  }
});

// 7. Delete Player (Individual) - proxies to the API service
app.delete('/api/players/:uuid', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    const { uuid } = request.params;
    const response = await axios.delete(`${API_SERVICE_URL}/api/admin/players/${uuid}`, {
      headers: { 
        'X-Admin-API-Key': ADMIN_API_KEY
      }
    });
    reply.code(200).send();
  } catch (error) {
    app.log.error('Error deleting player:', error.message || error);
    if (error.response) {
      app.log.error('API Service response:', error.response.status, error.response.data);
    } else if (error.request) {
      app.log.error('No response received from API service');
    }
    const status = error.response?.status || 500;
    reply.status(status).send({ error: error.response?.data?.error || error.message || 'Failed to delete player' });
  }
});

// 3d. Update health (proxies to the API service)
app.post('/api/health', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    app.log.info('Health update request received:', { body: request.body });
    
    const response = await axios.post(`${API_SERVICE_URL}/api/admin/health`, request.body, {
      headers: { 
        'X-Admin-API-Key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    app.log.info('Health successfully updated on API service');
    reply.send({ success: true });
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      url: `${API_SERVICE_URL}/api/admin/health`,
      requestBody: request.body
    };
    
    app.log.error('Health update error:', errorDetails);
    
    reply.status(500).send({ 
      error: 'Failed to update health',
      details: error.response?.data || error.message 
    });
  }
});

// 4. Update game config (proxies to the API service with secret key)
app.post('/api/game-config', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    app.log.info('Game config update request received:', { body: request.body });
    
    const response = await axios.post(`${API_SERVICE_URL}/api/admin/game-config`, request.body, {
      headers: { 
        'X-Admin-API-Key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    app.log.info('Game config successfully updated on API service');
    reply.send({ success: true });
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      url: `${API_SERVICE_URL}/api/admin/game-config`,
      requestBody: request.body
    };
    
    app.log.error('Game config update error:', errorDetails);
    
    reply.status(500).send({ 
      error: 'Failed to update config',
      details: error.response?.data || error.message 
    });
  }
});

// 5. Send Message of the Day (proxies to the API service with secret key)
app.post('/api/motd', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    app.log.info('MOTD request received:', { body: request.body });
    
    const response = await axios.post(`${API_SERVICE_URL}/api/admin/broadcast-motd`, request.body, {
      headers: { 
        'X-Admin-API-Key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    app.log.info('MOTD successfully forwarded to API service');
    reply.send({ success: true });
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      url: `${API_SERVICE_URL}/api/admin/broadcast-motd`,
      requestBody: request.body
    };
    
    app.log.error('MOTD Error:', errorDetails);
    
    reply.status(500).send({ 
      error: 'Failed to send MOTD',
      details: error.response?.data || error.message 
    });
  }
});

// --- SERVER START ---
// Only start listening if this file is run directly (not imported for testing)
const isTest = process.env.NODE_ENV === 'test';
if (!isTest) {
  const start = async () => {
    try {
      await app.listen({ port: PORT, host: '0.0.0.0' });
      app.log.info(`Admin Service listening on ${PORT}`);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };
  start();
}

// Export app for testing
export { app };
