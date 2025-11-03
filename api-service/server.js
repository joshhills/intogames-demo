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
  getMaxHealth,
  setMaxHealth,
  getMOTD,
  setMOTD,
  getLeaderboardLastFlush,
  setLeaderboardLastFlush,
  getLeaderboardFlushInterval,
  setLeaderboardFlushInterval,
  redisClient
} from '../shared/redis-client.js';
import {
  register,
  matchesCompleted,
  leaderboardFlushes,
  motdBroadcasts,
  activePlayers,
  leaderboardSize,
  globalHealth as globalHealthGauge,
  globalMaxHealth as globalMaxHealthGauge,
  playersEnrolled,
  matchScoreHistogram,
  matchSuccessRatioHistogram,
  recordApiRequest
} from './metrics.js';

const app = express();
const port = 3000;

// --- CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key'; // NEVER hardcode in production!
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'ADMIN_SUPER_SECRET_KEY';
const GAME_CONFIG = {
  easy: { holeCount: 1, spawnRate: 1000, maxSpeed: 1.5, penalty: 5, defenseBonus: 5, gameTimeSeconds: 60 },
  medium: { holeCount: 1, spawnRate: 750, maxSpeed: 2, penalty: 10, defenseBonus: 5, gameTimeSeconds: 60 },
  hard: { holeCount: 2, spawnRate: 500, maxSpeed: 2.5, penalty: 15, defenseBonus: 5, gameTimeSeconds: 60 }
};
// Global max health and leaderboard flush interval are stored in Redis and managed via admin panel

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// Request tracking middleware for metrics
app.use((req, res, next) => {
  const start = Date.now();
  const originalEnd = res.end;
  
  res.end = function(...args) {
    const duration = Date.now() - start;
    const endpoint = req.route ? req.route.path : req.path;
    recordApiRequest(req.method, endpoint, res.statusCode, duration);
    originalEnd.apply(res, args);
  };
  
  next();
});

// Middleware to verify JWT token (for player endpoints)
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

// Middleware to verify admin API key (for admin endpoints)
const authenticateAdmin = (req, res, next) => {
  const apiKey = req.headers['x-admin-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(401).send({ error: 'Unauthorized: Invalid or missing admin API key' });
  }
  next();
};

// Function to publish a message for the WebSocket service to pick up
const broadcastMessage = async (data) => {
    // Publish a stringified message to the 'global_updates' channel
    // The WS service (ws-service/server.js) will be subscribed to this.
    try {
        if (!redisClient) {
            throw new Error('Redis client not initialized');
        }
        if (redisClient.status !== 'ready' && redisClient.status !== 'connect') {
            console.warn('Redis client not ready, status:', redisClient.status);
            // Try anyway, ioredis queues commands
        }
        const result = await redisClient.publish('global_updates', JSON.stringify(data));
        console.log('MOTD broadcasted, subscribers:', result);
        return result;
    } catch (error) {
        console.error('Redis Publish Error:', error);
        throw error; // Re-throw so calling code can handle it
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
      totalScore: 0
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
  const totalScore = parseInt(player.totalScore, 10) || 0;
  res.json({ ...player, totalScore });
});

// --- GAME LOGIC AND LEADERBOARD ENDPOINTS ---

// Endpoint to retrieve remote game configuration
app.get('/api/game-config', (req, res) => {
  res.json(GAME_CONFIG);
});


// 4. Submit Match Score
app.post('/api/match/complete', authenticateToken, async (req, res) => {
  const { score, difficulty, successRatio } = req.body;
  const { uuid } = req.user;
  let player = await db.hGetAll(`player:${uuid}`);

  // 4a. Check if leaderboard needs to be flushed based on interval
  const flushIntervalMinutes = await getLeaderboardFlushInterval();
  
  const lastFlush = await getLeaderboardLastFlush();
  const now = Date.now();
  const flushIntervalMs = flushIntervalMinutes * 60 * 1000;
  
  let leaderboardFlushed = false;
  if (!lastFlush || (now - lastFlush) >= flushIntervalMs) {
    // Time to flush the leaderboard
    // Get all player UUIDs from the leaderboard before deleting it
    const allScores = await db.zRangeWithScores('leaderboard', 0, -1, { REV: true });
    const playerUUIDs = allScores.map(entry => entry.value);
    
    // Reset totalScore for all players who were on the leaderboard
    await Promise.all(playerUUIDs.map(async (playerUUID) => {
      await db.hSet(`player:${playerUUID}`, 'totalScore', '0');
    }));
    
    // Delete the leaderboard ZSET
            await redisClient.del('leaderboard');
            await setLeaderboardLastFlush(now);
            leaderboardFlushed = true;
            leaderboardFlushes.inc(); // Track leaderboard flush
            console.log(`Leaderboard flushed (interval: ${flushIntervalMinutes} minutes). Reset ${playerUUIDs.length} player scores.`);
          }

  // 4b. Get top 3 BEFORE updating (to compare later)
  const topScoresBefore = leaderboardFlushed ? [] : await db.zRangeWithScores('leaderboard', 0, 2, { REV: true });

  // 4c. Update Total Score (cumulative across all games, resets if leaderboard was flushed)
  let currentTotalScore = 0;
  if (!leaderboardFlushed) {
    currentTotalScore = parseInt(player.totalScore, 10) || 0;
  }
  const newTotalScore = currentTotalScore + score;
  
          await db.hSet(`player:${uuid}`, 'totalScore', newTotalScore);
          
          // 4d. Update Leaderboard (ZSET) with cumulative total score
          await db.zAdd('leaderboard', { score: newTotalScore, value: uuid });
          
          // Track match completion metrics
          matchesCompleted.inc({ difficulty });
          matchScoreHistogram.observe({ difficulty }, score);
          
          // Track success ratio if provided
          if (successRatio !== undefined && !isNaN(successRatio)) {
            // Ensure success ratio is between 0 and 100
            const clampedRatio = Math.max(0, Math.min(100, parseFloat(successRatio)));
            matchSuccessRatioHistogram.observe({ difficulty }, clampedRatio);
          }

  // 4e. Get top 3 AFTER updating and check if order changed
  const topScoresAfter = await db.zRangeWithScores('leaderboard', 0, 2, { REV: true });
  
  let top3Changed = false;
  if (leaderboardFlushed) {
    top3Changed = true; // Always changed if we just flushed
  } else {
    // Compare top 3 before and after
    if (topScoresBefore.length !== topScoresAfter.length) {
      top3Changed = true;
    } else {
      for (let i = 0; i < topScoresBefore.length; i++) {
        if (topScoresBefore[i].value !== topScoresAfter[i].value || 
            topScoresBefore[i].score !== topScoresAfter[i].score) {
          top3Changed = true;
          break;
        }
      }
    }
  }
  
          if (top3Changed) {
            // Fetch player details for top 3
            const leaderboard = await Promise.all(topScoresAfter.map(async entry => {
              const playerData = await db.hGetAll(`player:${entry.value}`);
              return {
                tagline: playerData.tagline || `Defender-${entry.value.substring(0, 4)}`,
                score: entry.score
              };
            }));

            // Include flush info in the update so clients don't need to poll
            const currentLastFlush = await getLeaderboardLastFlush();
            const currentFlushInterval = await getLeaderboardFlushInterval();

            broadcastMessage({
              type: 'LEADERBOARD_UPDATE',
              leaderboard: leaderboard,
              lastFlush: currentLastFlush,
              flushIntervalMinutes: currentFlushInterval
            });
          }

  // 4f. Update Global Health
  const currentHealth = await getGlobalHealth();
  const maxHealth = await getMaxHealth();
  
  let newHealth;
  if (score < 0) {
    newHealth = Math.max(0, currentHealth + score);
  } else {
    newHealth = Math.min(maxHealth, currentHealth + score);
  }
  
  await setGlobalHealth(newHealth);

  // Broadcast the health update
  broadcastMessage({ type: 'HEALTH_UPDATE', health: newHealth });
  
  // Return the player's current total score so client can display it
  res.json({ totalScore: newTotalScore });
});

// 5. Get Leaderboard (Top 3 + Flush Info)
app.get('/api/leaderboard', async (req, res) => {
  try {
    // Get the top 3 cumulative total scores and their UUIDs from the ZSET
    const topScores = await db.zRangeWithScores('leaderboard', 0, 2, { REV: true });
    
    // Fetch player details for each UUID
    const leaderboard = await Promise.all(topScores.map(async entry => {
      const player = await db.hGetAll(`player:${entry.value}`);
      // Use the score from the sorted set (which is the cumulative total)
      return {
        tagline: player.tagline,
        score: entry.score
      };
    }));

    // Get flush info
    const lastFlush = await getLeaderboardLastFlush();
    const flushIntervalMinutes = await getLeaderboardFlushInterval();

    res.json({
      leaderboard: leaderboard,
      lastFlush: lastFlush,
      flushIntervalMinutes: flushIntervalMinutes
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).send({ error: 'Failed to get leaderboard' });
  }
});

// 5b. Get Full Leaderboard (for admin panel)
app.get('/api/admin/leaderboard', authenticateAdmin, async (req, res) => {
  try {
    // Get all scores from the ZSET
    const allScores = await db.zRangeWithScores('leaderboard', 0, -1, { REV: true });
    
    // Fetch player details for each UUID
    const leaderboard = await Promise.all(allScores.map(async entry => {
      const player = await db.hGetAll(`player:${entry.value}`);
      return {
        uuid: entry.value,
        tagline: player.tagline || `Defender-${entry.value.substring(0, 4)}`,
        score: entry.score
      };
    }));

    res.json(leaderboard);
  } catch (error) {
    console.error('Error getting full leaderboard:', error);
    res.status(500).send({ error: 'Failed to get leaderboard' });
  }
});

// 5c. Flush Leaderboard (for admin panel)
app.delete('/api/admin/leaderboard', authenticateAdmin, async (req, res) => {
  try {
    const now = Date.now();
    
    // Get all player UUIDs from the leaderboard before deleting it
    const allScores = await db.zRangeWithScores('leaderboard', 0, -1, { REV: true });
    const playerUUIDs = allScores.map(entry => entry.value);
    
    // Reset totalScore for all players who were on the leaderboard
    await Promise.all(playerUUIDs.map(async (uuid) => {
      await db.hSet(`player:${uuid}`, 'totalScore', '0');
    }));
    
    // Delete the leaderboard ZSET
    await redisClient.del('leaderboard');
    await setLeaderboardLastFlush(now);
    
            // Broadcast empty leaderboard update to all clients with flush info
            const currentLastFlush = await getLeaderboardLastFlush();
            const currentFlushInterval = await getLeaderboardFlushInterval();
            
            broadcastMessage({
              type: 'LEADERBOARD_UPDATE',
              leaderboard: [],
              flushed: true,
              lastFlush: currentLastFlush,
              flushIntervalMinutes: currentFlushInterval
            });
    
    console.log(`Leaderboard flushed via admin panel. Reset ${playerUUIDs.length} player scores.`);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error flushing leaderboard:', error);
    res.status(500).send({ error: 'Failed to flush leaderboard' });
  }
});

// 6. Get Global Health (Polling endpoint)
app.get('/api/firewall/status', async (req, res) => {
  const health = await getGlobalHealth();
  res.json({ health });
});

// 6b. Get Leaderboard Flush Interval (for admin)
app.get('/api/admin/leaderboard-flush-interval', authenticateAdmin, async (req, res) => {
  try {
    const interval = await getLeaderboardFlushInterval();
    res.json({ flushIntervalMinutes: interval });
  } catch (error) {
    console.error('Error getting leaderboard flush interval:', error);
    res.status(500).send({ error: 'Failed to get flush interval' });
  }
});

// 6d. Set Leaderboard Flush Interval (for admin)
app.post('/api/admin/leaderboard-flush-interval', authenticateAdmin, async (req, res) => {
  try {
    const { flushIntervalMinutes } = req.body;
    
    if (typeof flushIntervalMinutes !== 'number' || flushIntervalMinutes < 1) {
      return res.status(400).send({ error: 'Invalid flushIntervalMinutes (must be at least 1 minute)' });
    }
    
    await setLeaderboardFlushInterval(flushIntervalMinutes);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error setting leaderboard flush interval:', error);
    res.status(500).send({ error: 'Failed to set flush interval' });
  }
});

// 7. Get MOTD (Message of the Day)
app.get('/api/motd', async (req, res) => {
  try {
    const motd = await getMOTD();
    res.json({ motd });
  } catch (error) {
    console.error('Error getting MOTD:', error);
    res.status(500).send({ error: 'Failed to get MOTD' });
  }
});

// 8. Get Global Health and Max Health (for admin panel)
app.get('/api/admin/health', authenticateAdmin, async (req, res) => {
  try {
    const health = await getGlobalHealth();
    const maxHealth = await getMaxHealth();
    res.json({ health, maxHealth });
  } catch (error) {
    console.error('Error getting health:', error);
    res.status(500).send({ error: 'Failed to get health' });
  }
});

// 9. Set Global Health (for admin panel)
app.post('/api/admin/health', authenticateAdmin, async (req, res) => {
  try {
    const { health, maxHealth } = req.body;
    
    if (health !== undefined) {
      const currentHealth = await getGlobalHealth();
      const currentMaxHealth = await getMaxHealth();
      // Ensure health is within valid bounds
      const newHealth = Math.max(0, Math.min(currentMaxHealth, health));
      await setGlobalHealth(newHealth);
      
      // Broadcast the health update
      await broadcastMessage({ type: 'HEALTH_UPDATE', health: newHealth });
    }
    
    if (maxHealth !== undefined) {
      const maxHealthNum = parseInt(maxHealth, 10);
      if (isNaN(maxHealthNum) || maxHealthNum < 1) {
        return res.status(400).send({ error: 'Invalid maxHealth value' });
      }
      await setMaxHealth(maxHealthNum);
      
      // If current health exceeds new max, cap it
      const currentHealth = await getGlobalHealth();
      if (currentHealth > maxHealthNum) {
        await setGlobalHealth(maxHealthNum);
        await broadcastMessage({ type: 'HEALTH_UPDATE', health: maxHealthNum });
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error setting health:', error);
    res.status(500).send({ error: 'Failed to set health' });
  }
});


// --- ADMIN API ENDPOINTS (For Admin Service) ---

// 1. Send Message of the Day
app.post('/api/admin/broadcast-motd', authenticateAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).send('Message is required.');
    }

    // Save MOTD to Redis for persistence
    await setMOTD(message);

    // Use the established Redis Pub/Sub channel to broadcast to active clients
    await broadcastMessage({
      type: 'MOTD',
      message: `MESSAGE FROM ADMIN: ${message}`
    });

    motdBroadcasts.inc(); // Track MOTD broadcast
    res.sendStatus(200);
  } catch (error) {
    console.error('Error broadcasting MOTD:', error);
    res.status(500).send({ error: 'Failed to broadcast MOTD' });
  }
});

// 2. Update Game Configuration
app.post('/api/admin/game-config', authenticateAdmin, async (req, res) => {
  try {
    const newConfig = req.body;
    
    // Validate the config structure
    if (!newConfig || typeof newConfig !== 'object') {
      return res.status(400).send({ error: 'Invalid config format' });
    }

    // Validate each difficulty level
    const requiredKeys = ['easy', 'medium', 'hard'];
    const requiredFields = ['holeCount', 'spawnRate', 'maxSpeed', 'penalty', 'defenseBonus', 'gameTimeSeconds'];
    
    for (const key of requiredKeys) {
      if (!newConfig[key]) {
        return res.status(400).send({ error: `Missing ${key} config` });
      }
      const level = newConfig[key];
      
      // Validate all required fields are numbers
      for (const field of requiredFields) {
        if (typeof level[field] !== 'number' || level[field] < 0) {
          return res.status(400).send({ error: `Invalid ${key}.${field} value (must be a positive number)` });
        }
      }
      
      // Additional validation
      if (level.gameTimeSeconds < 1) {
        return res.status(400).send({ error: `Invalid ${key}.gameTimeSeconds (must be at least 1 second)` });
      }
      if (level.holeCount < 0) {
        return res.status(400).send({ error: `Invalid ${key}.holeCount (must be non-negative)` });
      }
    }

    // Update the in-memory config (could also persist to Redis if needed)
    Object.keys(newConfig).forEach(difficulty => {
      if (GAME_CONFIG[difficulty]) {
        Object.assign(GAME_CONFIG[difficulty], newConfig[difficulty]);
      }
    });

    console.log('Game config updated:', GAME_CONFIG);

    res.sendStatus(200);
  } catch (error) {
    console.error('Error updating game config:', error);
    res.status(500).send({ error: 'Failed to update game config' });
  }
});

        // --- METRICS ENDPOINT ---
        app.get('/metrics', async (req, res) => {
          try {
            // Update dynamic metrics from Redis
            const health = await getGlobalHealth();
            const maxHealth = await getMaxHealth();
            globalHealthGauge.set(health);
            globalMaxHealthGauge.set(maxHealth);
            
            // Count active players (all player:uuid keys)
            const playerKeys = await redisClient.keys('player:*');
            activePlayers.set(playerKeys.length);
            
            // Count leaderboard size
            const leaderboardCount = await redisClient.zcard('leaderboard');
            leaderboardSize.set(leaderboardCount || 0);
            
            res.set('Content-Type', register.contentType);
            res.end(await register.metrics());
          } catch (error) {
            console.error('Error generating metrics:', error);
            res.status(500).send('Error generating metrics');
          }
        });

        // --- INITIALIZATION ---
        // Only start listening if this file is run directly (not imported for testing)
        const isTest = process.env.NODE_ENV === 'test';
        if (!isTest) {
          app.listen(port, () => {
            console.log(`API Service listening at http://localhost:${port}`);
            console.log(`Metrics available at http://localhost:${port}/metrics`);
          });

          // We only need to check the connection status for the publisher client here
          redisClient.on('connect', () => {
            console.log('API Service connected to Redis (Publisher Client).');
          });
        }

// Export app for testing
export { app, GAME_CONFIG };
