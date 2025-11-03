// --- API SERVICE ---
// A simple Express server that handles player data,
// authentication, and leaderboards.

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import { 
  db, 
  getGlobalHealth,
  setGlobalHealth,
  redisClient
} from '../shared/redis-client.js';
const app = express();
const port = 3000;

// --- CONFIGURATION ---
const JWT_SECRET = 'your-super-secret-key'; // NEVER hardcode in production!
const GAME_CONFIG = {
  easy: { holeCount: 1, spawnRate: 1000, maxSpeed: 1.5, penalty: 5, defenseBonus: 5, maxHealth: 200 },
  medium: { holeCount: 1, spawnRate: 750, maxSpeed: 2, penalty: 10, defenseBonus: 5, maxHealth: 300 },
  hard: { holeCount: 2, spawnRate: 500, maxSpeed: 2.5, penalty: 15, defenseBonus: 5, maxHealth: 400 }
};

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Function to publish a message for the WebSocket service to pick up
const broadcastMessage = async (data) => {
    // Publish a stringified message to the 'global_updates' channel
    // The WS service (ws-service/server.js) will be subscribed to this.
    try {
        await redisClient.publish('global_updates', JSON.stringify(data));
    } catch (error) {
        console.error('Redis Publish Error:', error);
    }
};


// --- AUTH AND PLAYER SETUP ENDPOINTS ---

// 1. Enroll and Login (Get a JWT)
app.post('/api/auth/enroll', async (req, res) => {
  const { local_uuid } = req.body;
  if (!local_uuid) {
    return res.status(400).send('local_uuid is required');
  }

  // Check if player exists
  let player = await db.hGetAll(`player:${local_uuid}`);

  if (Object.keys(player).length === 0) {
    // New player setup
    player = {
      uuid: local_uuid,
      tagline: `Defender-${local_uuid.substring(0, 4)}`,
      color: '#FFFFFF',
      maxScore: 0
    };
    await db.hSet(`player:${local_uuid}`, player);
  }

  // Create JWT
  const token = jwt.sign({ uuid: local_uuid, tagline: player.tagline }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, player });
});

// 2. Save Player Tagline/Color
app.post('/api/player/setup', authenticateToken, async (req, res) => {
  const { tagline, color } = req.body;
  const { uuid } = req.user;

  if (!tagline || !color) {
    return res.status(400).send('Tagline and color are required');
  }

  // Update in Redis
  await db.hSet(`player:${uuid}`, { tagline, color });

  res.sendStatus(200);
});

// 3. Get Player Profile
app.get('/api/player/profile', authenticateToken, async (req, res) => {
  const { uuid } = req.user;
  const player = await db.hGetAll(`player:${uuid}`);
  res.json(player);
});

// --- GAME LOGIC AND LEADERBOARD ENDPOINTS ---

// Endpoint to retrieve remote game configuration
app.get('/api/game-config', (req, res) => {
  res.json(GAME_CONFIG);
});


// 4. Submit Match Score
app.post('/api/match/complete', authenticateToken, async (req, res) => {
  const { score } = req.body;
  const { uuid } = req.user;
  let player = await db.hGetAll(`player:${uuid}`);

  // 4a. Update Max Score
  const currentMaxScore = parseInt(player.maxScore, 10) || 0;
  if (score > currentMaxScore) {
    await db.hSet(`player:${uuid}`, 'maxScore', score);
    
    // 4b. Update Leaderboard (ZSET)
    await db.zAdd('leaderboard', { score: score, value: uuid });

    // Broadcast the new top defender (optional: only if they broke a world record)
    broadcastMessage({ 
      type: 'NEW_TOP_DEFENDER', 
      message: `${player.tagline} just defended the network with a score of ${score}!`
    });
  }

  // 4c. Update Global Health
  const currentHealth = await getGlobalHealth();
  const currentDifficulty = 'medium'; // Could be passed from client, using default for now
  const config = GAME_CONFIG[currentDifficulty] || GAME_CONFIG.medium;
  const maxHealth = config.maxHealth || 300;
  
  let newHealth;
  if (score < 0) {
    // Negative score reduces health (but not below 0)
    newHealth = Math.max(0, currentHealth + score); // score is already negative
  } else {
    // Positive score increases health (but not above max)
    newHealth = Math.min(maxHealth, currentHealth + score);
  }
  
  await setGlobalHealth(newHealth);

  // Broadcast the health update
  broadcastMessage({ type: 'HEALTH_UPDATE', health: newHealth });
  
  res.sendStatus(200);
});

// 5. Get Top 3 Leaderboard
app.get('/api/leaderboard/top3', async (req, res) => {
  // Get the top 3 scores and their UUIDs from the ZSET
  const topScores = await db.zRangeWithScores('leaderboard', 0, 2, { REV: true });
  
  // Fetch player details for each UUID
  const leaderboard = await Promise.all(topScores.map(async entry => {
    const player = await db.hGetAll(`player:${entry.value}`);
    return {
      tagline: player.tagline,
      score: entry.score
    };
  }));

  res.json(leaderboard);
});

// 6. Get Global Health (Polling endpoint)
app.get('/api/firewall/status', async (req, res) => {
  const health = await getGlobalHealth();
  res.json({ health });
});


// --- ADMIN API ENDPOINT (For Admin Service to send MOTD) ---
// This simple endpoint allows the admin-service to send a message to all clients.
app.post('/api/admin/broadcast-motd', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).send('Message is required.');
  }

  // Use the established Redis Pub/Sub channel
  broadcastMessage({
    type: 'MOTD',
    message: `MESSAGE FROM ADMIN: ${message}`
  });

  res.sendStatus(200);
});

// --- INITIALIZATION ---
app.listen(port, () => {
  console.log(`API Service listening at http://localhost:${port}`);
});

// We only need to check the connection status for the publisher client here
redisClient.on('connect', () => {
  console.log('API Service connected to Redis (Publisher Client).');
});
