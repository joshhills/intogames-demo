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
  getGameConfig,
  setGameConfig,
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
  bugsSquashed,
  bugsExploited,
  recordApiRequest
} from './metrics.js';

const app = express();
const port = 3000;

// --- CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key'; // NEVER hardcode in production!
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'ADMIN_SUPER_SECRET_KEY';
// GAME_CONFIG will be loaded from Redis on startup (with defaults if not found)
let GAME_CONFIG = {
  validation: {
    corporationNameMinLength: 1,
    corporationNameMaxLength: 64,
    taglineMinLength: 1,
    taglineMaxLength: 128
  },
  trapTimeout: 5000, // Trap timeout in milliseconds (5 seconds default)
  trapDurability: 1, // Number of hits before trap disappears (default: 1 = one-time use)
  trapShrinkPercent: 0, // Percent size reduction per hit (0-100, default: 0 = no shrinkage)
  easy: { 
    holeCount: 1, 
    spawnRate: 1000, 
    maxSpeed: 1.5, 
    penalty: 5, 
    defenseBonus: 5, 
    gameTimeSeconds: 60,
    adblockDepletionRate: 100, // Percentage per second (depletes in 1 second)
    adblockRegenerationRate: 50, // Percentage per second (regenerates in 2 seconds)
    adblockTimeoutAfterUse: 2, // Seconds before regeneration starts
    holesWander: false,
    trapGrantingEnemyChance: 10 // Percentage chance (0-100) for enemy to grant trap
  },
  medium: { 
    holeCount: 1, 
    spawnRate: 750, 
    maxSpeed: 2, 
    penalty: 10, 
    defenseBonus: 5, 
    gameTimeSeconds: 60,
    adblockDepletionRate: 150, // Percentage per second (depletes in 0.67 seconds)
    adblockRegenerationRate: 40, // Percentage per second (regenerates in 2.5 seconds)
    adblockTimeoutAfterUse: 2,
    holesWander: false,
    trapGrantingEnemyChance: 15 // Percentage chance (0-100) for enemy to grant trap
  },
  hard: { 
    holeCount: 2, 
    spawnRate: 500, 
    maxSpeed: 2.5, 
    penalty: 15, 
    defenseBonus: 5, 
    gameTimeSeconds: 60,
    adblockDepletionRate: 200, // Percentage per second (depletes in 0.5 seconds)
    adblockRegenerationRate: 30, // Percentage per second (regenerates in 3.33 seconds)
    adblockTimeoutAfterUse: 3,
    holesWander: true,
    trapGrantingEnemyChance: 20 // Percentage chance (0-100) for enemy to grant trap
  }
};
// Global max health, leaderboard flush interval, and game config are stored in Redis

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

  // Update last login timestamp
  const now = Date.now();

  if (Object.keys(player).length === 0) {
    // New player setup
    // Generate player number from UUID (use last segment or first 4 chars)
    const playerNumber = local_uuid.split('-').pop() || local_uuid.substring(0, 4);
    const playerNum = parseInt(playerNumber, 16) || parseInt(playerNumber.substring(0, 4), 16) || 1;
    
    player = {
      uuid: local_uuid,
      productName: `Generic Co. #${playerNum}`,
      tagline: 'Your tagline here!',
      color: '#FFFFFF',
      totalScore: 0,
      lastLogin: now.toString()
    };
    await db.hSet(`player:${local_uuid}`, player);
  } else {
    // Update last login timestamp for existing player
    await db.hSet(`player:${local_uuid}`, 'lastLogin', now.toString());
  }

  // Create JWT
  const token = jwt.sign({ uuid: local_uuid, tagline: player.tagline }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, player });
});

// 2. Save Player Profile (Corporation Name, Tagline, Color)
app.post('/api/player/setup', authenticateToken, async (req, res) => {
  const { productName, tagline, color } = req.body;
  const { uuid } = req.user;

  if (!tagline || !color) {
    return res.status(400).send('Tagline and color are required');
  }

  // Get validation config (with defaults if not present)
  const validation = GAME_CONFIG.validation || {
    corporationNameMinLength: 1,
    corporationNameMaxLength: 64,
    taglineMinLength: 1,
    taglineMaxLength: 128
  };

  // Validate corporation name
  if (productName !== undefined && productName !== null && productName !== '') {
    const corpNameLength = productName.trim().length;
    if (corpNameLength < validation.corporationNameMinLength) {
      return res.status(400).send(`Corporation name must be at least ${validation.corporationNameMinLength} character(s)`);
    }
    if (corpNameLength > validation.corporationNameMaxLength) {
      return res.status(400).send(`Corporation name must be at most ${validation.corporationNameMaxLength} characters`);
    }
  }

  // Validate tagline
  const taglineLength = tagline.trim().length;
  if (taglineLength < validation.taglineMinLength) {
    return res.status(400).send(`Tagline must be at least ${validation.taglineMinLength} character(s)`);
  }
  if (taglineLength > validation.taglineMaxLength) {
    return res.status(400).send(`Tagline must be at most ${validation.taglineMaxLength} characters`);
  }

  // Validate color (should be hex format)
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return res.status(400).send('Invalid color format. Must be hex format (e.g., #FF0000)');
  }

  // Update in Redis (productName is optional, but store it if provided)
  const updateData = { 
    tagline: tagline.trim(),
    color: color.toUpperCase() // Normalize to uppercase
  };
  if (productName !== undefined && productName !== null && productName !== '') {
    updateData.productName = productName.trim();
  } else {
    updateData.productName = '';
  }
  await db.hSet(`player:${uuid}`, updateData);

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
app.get('/api/game-config', async (req, res) => {
  try {
    // Always fetch latest from Redis to ensure consistency
    const config = await getGameConfig();
    Object.assign(GAME_CONFIG, config); // Update in-memory cache
    res.json(GAME_CONFIG);
  } catch (error) {
    console.error('Error getting game config:', error);
    res.json(GAME_CONFIG); // Fallback to in-memory config
  }
});


// 4. Submit Match Score
app.post('/api/match/complete', authenticateToken, async (req, res) => {
  const { score, difficulty, successRatio, bugsKilled, bugsReachedHoles } = req.body;
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
          
          // Track bugs squashed and exploited
          if (bugsKilled !== undefined && !isNaN(bugsKilled) && bugsKilled >= 0) {
            bugsSquashed.inc({ difficulty }, parseInt(bugsKilled, 10));
          }
          if (bugsReachedHoles !== undefined && !isNaN(bugsReachedHoles) && bugsReachedHoles >= 0) {
            bugsExploited.inc({ difficulty }, parseInt(bugsReachedHoles, 10));
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
                productName: playerData.productName || '',
                tagline: playerData.tagline || `Defender-${entry.value.substring(0, 4)}`,
                color: playerData.color || '#FFFFFF',
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
  
  // Update Prometheus gauge
  globalHealthGauge.set(newHealth);

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
        productName: player.productName || '',
        tagline: player.tagline || `Defender-${entry.value.substring(0, 4)}`,
        color: player.color || '#FFFFFF',
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
        productName: player.productName || '',
        tagline: player.tagline || `Defender-${entry.value.substring(0, 4)}`,
        color: player.color || '#FFFFFF',
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
      
      // Update Prometheus gauge
      globalHealthGauge.set(newHealth);
      
      // Broadcast the health update
      await broadcastMessage({ type: 'HEALTH_UPDATE', health: newHealth });
    }
    
    if (maxHealth !== undefined) {
      const maxHealthNum = parseInt(maxHealth, 10);
      if (isNaN(maxHealthNum) || maxHealthNum < 1) {
        return res.status(400).send({ error: 'Invalid maxHealth value' });
      }
      await setMaxHealth(maxHealthNum);
      
      // Update Prometheus gauge
      globalMaxHealthGauge.set(maxHealthNum);
      
      // If current health exceeds new max, cap it
      const currentHealth = await getGlobalHealth();
      if (currentHealth > maxHealthNum) {
        await setGlobalHealth(maxHealthNum);
        globalHealthGauge.set(maxHealthNum);
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
    const optionalFields = ['adblockDepletionRate', 'adblockRegenerationRate', 'adblockTimeoutAfterUse', 'holesWander'];

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

      // Validate optional adblock fields if present
      if (level.adblockDepletionRate !== undefined) {
        if (typeof level.adblockDepletionRate !== 'number' || level.adblockDepletionRate < 0) {
          return res.status(400).send({ error: `Invalid ${key}.adblockDepletionRate (must be a positive number)` });
        }
      }
      if (level.adblockRegenerationRate !== undefined) {
        if (typeof level.adblockRegenerationRate !== 'number' || level.adblockRegenerationRate < 0) {
          return res.status(400).send({ error: `Invalid ${key}.adblockRegenerationRate (must be a positive number)` });
        }
      }
      if (level.adblockTimeoutAfterUse !== undefined) {
        if (typeof level.adblockTimeoutAfterUse !== 'number' || level.adblockTimeoutAfterUse < 0) {
          return res.status(400).send({ error: `Invalid ${key}.adblockTimeoutAfterUse (must be a non-negative number)` });
        }
      }
      if (level.holesWander !== undefined) {
        if (typeof level.holesWander !== 'boolean') {
          return res.status(400).send({ error: `Invalid ${key}.holesWander (must be a boolean)` });
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

    // Update the in-memory config - deep merge the entire config
    // This ensures all fields including new ones (trapTimeout, trapDurability, etc.) are saved
    Object.keys(newConfig).forEach(key => {
      if (key === 'validation') {
        // Merge validation config
        if (!GAME_CONFIG.validation) {
          GAME_CONFIG.validation = {};
        }
        Object.assign(GAME_CONFIG.validation, newConfig.validation);
      } else if (['easy', 'medium', 'hard'].includes(key)) {
        // Merge difficulty configs
        if (!GAME_CONFIG[key]) {
          GAME_CONFIG[key] = {};
        }
        Object.assign(GAME_CONFIG[key], newConfig[key]);
      } else {
        // Direct assignment for top-level fields (trapTimeout, trapDurability, trapShrinkPercent, etc.)
        GAME_CONFIG[key] = newConfig[key];
      }
    });

    // Persist to Redis - save the complete merged config
    await setGameConfig(GAME_CONFIG);

    console.log('Game config updated and persisted:', GAME_CONFIG);

    res.sendStatus(200);
  } catch (error) {
    console.error('Error updating game config:', error);
    res.status(500).send({ error: 'Failed to update game config' });
  }
});

// 3. Get Players List (Paginated with Search)
app.get('/api/admin/players', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || ''; // Search term
    const offset = (page - 1) * limit;

    // Get all player keys
    const playerKeys = await redisClient.keys('player:*');

    // Fetch all player data
    let allPlayers = await Promise.all(playerKeys.map(async (key) => {
      const uuid = key.replace('player:', '');
      const playerData = await db.hGetAll(key);
      return {
        uuid,
        productName: playerData.productName || '',
        tagline: playerData.tagline || `Defender-${uuid.substring(0, 4)}`,
        color: playerData.color || '#FFFFFF',
        totalScore: parseInt(playerData.totalScore, 10) || 0,
        lastLogin: parseInt(playerData.lastLogin, 10) || 0 // Use 0 if never logged in (old players)
      };
    }));

    // Filter by search term if provided
    if (search.trim()) {
      const searchLower = search.toLowerCase().trim();
      allPlayers = allPlayers.filter(player => {
        return player.uuid.toLowerCase().includes(searchLower) ||
               player.productName.toLowerCase().includes(searchLower) ||
               player.tagline.toLowerCase().includes(searchLower);
      });
    }

    // Sort by last login (most recent first)
    allPlayers.sort((a, b) => b.lastLogin - a.lastLogin);

    const total = allPlayers.length;

    // Get paginated players
    const players = allPlayers.slice(offset, offset + limit);

    res.json({
      players,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting players:', error);
    res.status(500).send({ error: 'Failed to get players' });
  }
});

// 4. Update Player Profile (Admin)
app.post('/api/admin/players/:uuid', authenticateAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const { productName, tagline } = req.body;

    // Get validation config
    const validation = GAME_CONFIG.validation || {
      corporationNameMinLength: 1,
      corporationNameMaxLength: 64,
      taglineMinLength: 1,
      taglineMaxLength: 128
    };

    // Check if player exists
    const playerData = await db.hGetAll(`player:${uuid}`);
    if (Object.keys(playerData).length === 0) {
      return res.status(404).send({ error: 'Player not found' });
    }

    const updateData = {};

    // Validate and update corporation name if provided
    if (productName !== undefined) {
      if (productName !== null && productName !== '') {
        const corpNameLength = productName.trim().length;
        if (corpNameLength < validation.corporationNameMinLength) {
          return res.status(400).send({ error: `Corporation name must be at least ${validation.corporationNameMinLength} character(s)` });
        }
        if (corpNameLength > validation.corporationNameMaxLength) {
          return res.status(400).send({ error: `Corporation name must be at most ${validation.corporationNameMaxLength} characters` });
        }
        updateData.productName = productName.trim();
      } else {
        updateData.productName = '';
      }
    }

    // Validate and update tagline if provided
    if (tagline !== undefined) {
      const taglineLength = tagline.trim().length;
      if (taglineLength < validation.taglineMinLength) {
        return res.status(400).send({ error: `Tagline must be at least ${validation.taglineMinLength} character(s)` });
      }
      if (taglineLength > validation.taglineMaxLength) {
        return res.status(400).send({ error: `Tagline must be at most ${validation.taglineMaxLength} characters` });
      }
      updateData.tagline = tagline.trim();
    }

    // Update player data
    if (Object.keys(updateData).length > 0) {
      await db.hSet(`player:${uuid}`, updateData);
      
      // Notify player via WebSocket that their profile was updated
      try {
        await broadcastMessage({
          type: 'PROFILE_UPDATED',
          uuid: uuid,
          productName: updateData.productName !== undefined ? updateData.productName : playerData.productName || '',
          tagline: updateData.tagline !== undefined ? updateData.tagline : playerData.tagline || ''
        });
      } catch (broadcastError) {
        console.error('Error broadcasting profile update:', broadcastError);
        // Don't fail the update if broadcast fails
      }
    }

    // Fetch updated player data
    const updatedPlayerData = await db.hGetAll(`player:${uuid}`);
    res.json({
      uuid,
      productName: updatedPlayerData.productName || '',
      tagline: updatedPlayerData.tagline || `Defender-${uuid.substring(0, 4)}`,
      color: updatedPlayerData.color || '#FFFFFF',
      totalScore: parseInt(updatedPlayerData.totalScore, 10) || 0
    });
  } catch (error) {
    console.error('Error updating player:', error);
    res.status(500).send({ error: 'Failed to update player' });
  }
});

// 5. Delete Player (Individual)
app.delete('/api/admin/players/:uuid', authenticateAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;

    // Check if player exists
    const playerData = await db.hGetAll(`player:${uuid}`);
    if (Object.keys(playerData).length === 0) {
      return res.status(404).send({ error: 'Player not found' });
    }

    // Delete player data
    await redisClient.del(`player:${uuid}`);
    
    // Remove from leaderboard if present
    await redisClient.zrem('leaderboard', uuid);

    // Notify player via WebSocket that they were deleted
    try {
      await broadcastMessage({
        type: 'PLAYER_DELETED',
        uuid: uuid
      });
    } catch (broadcastError) {
      console.error('Error broadcasting player deletion:', broadcastError);
      // Don't fail the delete if broadcast fails
    }

    // Broadcast updated leaderboard to all clients
    try {
      const top3 = await db.zRangeWithScores('leaderboard', 0, 2, { REV: true });
      const leaderboard = await Promise.all(top3.map(async (entry) => {
        const playerUUID = entry.value;
        const playerData = await db.hGetAll(`player:${playerUUID}`);
        return {
          uuid: playerUUID,
          score: entry.score,
          productName: playerData.productName || '',
          tagline: playerData.tagline || `Defender-${playerUUID.substring(0, 4)}`,
          color: playerData.color || '#FFFFFF'
        };
      }));
      
      const lastFlush = await getLeaderboardLastFlush();
      const flushInterval = await getLeaderboardFlushInterval();
      
      await broadcastMessage({
        type: 'LEADERBOARD_UPDATE',
        leaderboard: leaderboard,
        lastFlush: lastFlush,
        flushIntervalMinutes: flushInterval
      });
    } catch (leaderboardError) {
      console.error('Error broadcasting leaderboard update after deletion:', leaderboardError);
      // Don't fail the delete if leaderboard broadcast fails
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error deleting player:', error);
    res.status(500).send({ error: 'Failed to delete player' });
  }
});

// 6. Delete All Players
app.delete('/api/admin/players', authenticateAdmin, async (req, res) => {
  try {
    // Get all player keys
    const playerKeys = await redisClient.keys('player:*');
    
    if (playerKeys.length === 0) {
      return res.json({ deleted: 0, message: 'No players to delete' });
    }

    // Delete all player data
    const deletedCount = playerKeys.length;
    await Promise.all(playerKeys.map(key => redisClient.del(key)));
    
    // Clear the leaderboard
    await redisClient.del('leaderboard');
    
    // Broadcast deletion messages for all players (in batches to avoid overwhelming)
    const uuids = playerKeys.map(key => key.replace('player:', ''));
    for (const uuid of uuids) {
      try {
        await broadcastMessage({
          type: 'PLAYER_DELETED',
          uuid: uuid
        });
      } catch (broadcastError) {
        console.error(`Error broadcasting deletion for ${uuid}:`, broadcastError);
        // Continue with other broadcasts
      }
    }
    
    // Broadcast empty leaderboard update to all clients
    try {
      const lastFlush = await getLeaderboardLastFlush();
      const flushInterval = await getLeaderboardFlushInterval();
      
      await broadcastMessage({
        type: 'LEADERBOARD_UPDATE',
        leaderboard: [],
        lastFlush: lastFlush,
        flushIntervalMinutes: flushInterval
      });
    } catch (leaderboardError) {
      console.error('Error broadcasting leaderboard update after deleting all players:', leaderboardError);
      // Don't fail the delete if leaderboard broadcast fails
    }
    
    console.log(`Deleted all ${deletedCount} players from database`);
    res.json({ deleted: deletedCount, message: `Deleted ${deletedCount} player(s)` });
  } catch (error) {
    console.error('Error deleting all players:', error);
    res.status(500).send({ error: 'Failed to delete all players' });
  }
});

// 7. Delete Players (Bulk)
app.post('/api/admin/players/bulk-delete', authenticateAdmin, async (req, res) => {
  try {
    const { uuids } = req.body;

    if (!Array.isArray(uuids) || uuids.length === 0) {
      return res.status(400).send({ error: 'uuids array is required' });
    }

    const deletedUuids = [];
    const notFoundUuids = [];

    for (const uuid of uuids) {
      const playerData = await db.hGetAll(`player:${uuid}`);
      if (Object.keys(playerData).length > 0) {
        // Delete player data
        await redisClient.del(`player:${uuid}`);
        
        // Remove from leaderboard if present
        await redisClient.zrem('leaderboard', uuid);
        
        deletedUuids.push(uuid);
        
        // Notify player via WebSocket that they were deleted
        try {
          await broadcastMessage({
            type: 'PLAYER_DELETED',
            uuid: uuid
          });
        } catch (broadcastError) {
          console.error(`Error broadcasting deletion for ${uuid}:`, broadcastError);
          // Don't fail the delete if broadcast fails
        }
      } else {
        notFoundUuids.push(uuid);
      }
    }

    res.json({
      deleted: deletedUuids.length,
      deletedUuids,
      notFound: notFoundUuids.length,
      notFoundUuids
    });
  } catch (error) {
    console.error('Error bulk deleting players:', error);
    res.status(500).send({ error: 'Failed to bulk delete players' });
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
          // Initialize and load config from Redis on startup
          const initializeDefaults = async () => {
            try {
          // Initialize health values if not set
          const health = await redisClient.get('global_health');
          if (!health) {
            await redisClient.set('global_health', '100');
            console.log('Initialized global_health to 100.');
            globalHealthGauge.set(100);
          } else {
            // Update gauge with existing value
            globalHealthGauge.set(parseInt(health, 10));
          }

          const maxHealth = await redisClient.get('global_max_health');
          if (!maxHealth) {
            await redisClient.set('global_max_health', '1000');
            console.log('Initialized global_max_health to 1000.');
            globalMaxHealthGauge.set(1000);
          } else {
            // Update gauge with existing value
            globalMaxHealthGauge.set(parseInt(maxHealth, 10));
          }

              // Initialize leaderboard flush interval if not set
              const flushInterval = await redisClient.get('leaderboard_flush_interval_minutes');
              if (!flushInterval) {
                await redisClient.set('leaderboard_flush_interval_minutes', '60');
                console.log('Initialized leaderboard_flush_interval_minutes to 60.');
              }

              // Load game config from Redis
              const loadedConfig = await getGameConfig();
              Object.assign(GAME_CONFIG, loadedConfig);
              
              // If game config wasn't in Redis, save defaults
              const configExists = await redisClient.get('game_config');
              if (!configExists) {
                await setGameConfig(GAME_CONFIG);
                console.log('Initialized game config in Redis.');
              }
              
              console.log('Game config loaded from Redis:', GAME_CONFIG);
            } catch (error) {
              console.error('Error initializing defaults:', error);
            }
          };

          redisClient.on('connect', () => {
            console.log('API Service connected to Redis (Publisher Client).');
            initializeDefaults();
          });

          // If already connected, initialize immediately
          if (redisClient.status === 'ready' || redisClient.status === 'connect') {
            initializeDefaults();
          }

          app.listen(port, () => {
            console.log(`API Service listening at http://localhost:${port}`);
            console.log(`Metrics available at http://localhost:${port}/metrics`);
          });
        }

// Export app for testing
export { app, GAME_CONFIG };
