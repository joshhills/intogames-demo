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

// 4. Update game config (proxies to the API service with secret key)
app.post('/api/game-config', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    await axios.post(`${API_SERVICE_URL}/api/admin/game-config`, request.body, {
      headers: { 'X-Admin-API-Key': ADMIN_API_KEY } // Use the secret key
    });
    reply.send({ success: true });
  } catch (error) {
    reply.status(500).send({ error: 'Failed to update config' });
  }
});

// 5. Send Message of the Day (proxies to the API service with secret key)
app.post('/api/motd', { preHandler: [app.adminAuth] }, async (request, reply) => {
  try {
    await axios.post(`${API_SERVICE_URL}/api/admin/motd`, request.body, {
      headers: { 'X-Admin-API-Key': ADMIN_API_KEY }
    });
    reply.send({ success: true });
  } catch (error) {
    reply.status(500).send({ error: 'Failed to send MOTD' });
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
