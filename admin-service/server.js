import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// --- CONFIGURATION ---
const app = Fastify({ logger: true });
const PORT = 4000;
// This is the "internal" Docker DNS name for the API service
const API_SERVICE_URL = 'http://api-service:3000'; 
// This is the hardcoded secret for our admin tool to talk to the API
const ADMIN_API_KEY = 'ADMIN_SUPER_SECRET_KEY'; 
// This is a hardcoded, mock admin login
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'password123';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- PLUGINS ---
app.register(fastifyCors, { origin: 'http://localhost:8080', credentials: true }); // Allow client
app.register(fastifyCookie);
app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// --- AUTH HOOK (Mock Session) ---
// This hook checks for a valid session cookie
app.decorate('adminAuth', async (request, reply) => {
  try {
    if (request.cookies.session !== 'valid-admin-session') {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  } catch (err) {
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
    const response = await axios.get(`${API_SERVICE_URL}/api/admin/health`);
    reply.send(response.data);
  } catch (error) {
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
    const response = await axios.get(`${API_SERVICE_URL}/api/leaderboard/flush-info`, {
      headers: { 'X-Admin-API-Key': ADMIN_API_KEY }
    });
    reply.send(response.data);
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
