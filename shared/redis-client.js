// --- REDIS CLIENT UTILITY ---
// Shared Redis connection management for API and Push services.
// Provides both publisher and subscriber clients for Redis Pub/Sub,
// as well as database operations for game state management.

import Redis from 'ioredis';

// Redis connection URI from environment or default
const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';

// --- PUBLISHER CLIENT (for API Service) ---
// Used for storing game data (player profiles, leaderboard, health) and publishing updates
const redisClient = new Redis(REDIS_URI);

// Create a database interface wrapper that provides camelCase method names
// to match the expected API in the services
const db = {
  // Hash operations
  hGetAll: async (key) => {
    const result = await redisClient.hgetall(key);
    return result || {};
  },
  hSet: async (key, fieldOrObject, value) => {
    if (value !== undefined) {
      // Single field-value pair: hSet(key, field, value)
      return await redisClient.hset(key, fieldOrObject, value);
    } else {
      // Object with multiple fields: hSet(key, {field1: value1, field2: value2})
      // ioredis hset accepts object directly
      return await redisClient.hset(key, fieldOrObject);
    }
  },
  // Sorted set operations
  zAdd: async (key, options) => {
    // Expected format: zAdd(key, {score: score, value: value})
    if (options.score !== undefined && options.value !== undefined) {
      // ioredis zadd: zadd(key, score, member)
      return await redisClient.zadd(key, options.score, options.value);
    }
    return await redisClient.zadd(key, options);
  },
  zRangeWithScores: async (key, start, stop, options = {}) => {
    // ioredis zrange with WITHSCORES returns [member, score, member, score, ...]
    const args = [key, start, stop];
    if (options.REV) {
      args.push('REV');
    }
    args.push('WITHSCORES');
    
    const result = await redisClient.zrange(...args);
    
    // Convert flat array to array of {value, score} objects
    const pairs = [];
    for (let i = 0; i < result.length; i += 2) {
      pairs.push({
        value: result[i],
        score: parseFloat(result[i + 1])
      });
    }
    return pairs;
  }
};

// --- SUBSCRIBER CLIENT (for Push Service) ---
// Separate client for subscribing to Redis channels (required by Redis Pub/Sub architecture)
// Only initialized when actually used (by push-service)
let subscriberClient = null;
let subscriberInitialized = false;

// Store of active WebSocket connections
export const activeConnections = new Set();

// Lazy initialization of subscriber client
function initializeSubscriber() {
  if (subscriberInitialized) return subscriberClient;
  
  subscriberClient = new Redis(REDIS_URI, {
    enableReadyCheck: false,
    maxRetriesPerRequest: null
  });
  subscriberInitialized = true;
  
  subscriberClient.on('connect', () => {
    console.log('Redis Subscriber Client connected.');
    
    subscriberClient.subscribe('global_updates', (err, count) => {
      if (err) {
        console.error('Error subscribing to Redis channel:', err);
      } else {
        console.log(`Subscribed to 'global_updates' channel. Active subscriptions: ${count}`);
      }
    });
  });
  
  subscriberClient.on('message', (channel, message) => {
    if (channel === 'global_updates') {
      try {
        const data = message;
        activeConnections.forEach((ws) => {
          if (ws && typeof ws === 'object' && ws.readyState === 1) {
            try {
              ws.send(data);
            } catch (error) {
              console.error('Error sending message to WebSocket:', error);
              activeConnections.delete(ws);
            }
          } else if (ws && ws.readyState !== 1) {
            // Remove closed/connecting connections
            activeConnections.delete(ws);
          }
        });
      } catch (error) {
        console.error('Error processing Redis message:', error);
      }
    }
  });
  
  subscriberClient.on('error', (error) => {
    // Ignore "Connection in subscriber mode" errors as they're expected
    if (!error.message.includes('subscriber mode')) {
      console.error('Redis Subscriber Client error:', error);
    }
  });
  
  return subscriberClient;
}

// --- GLOBAL HEALTH FUNCTIONS ---
// These functions manage the global firewall health value stored in Redis

async function getGlobalHealth() {
  try {
    const health = await redisClient.get('global_health');
    return health ? parseInt(health, 10) : 100; // Default to 100 if not set
  } catch (error) {
    console.error('Error getting global health:', error);
    return 100;
  }
}

async function setGlobalHealth(value) {
  try {
    await redisClient.set('global_health', value.toString());
  } catch (error) {
    console.error('Error setting global health:', error);
  }
}

async function getMaxHealth() {
  try {
    const maxHealth = await redisClient.get('global_max_health');
    return maxHealth ? parseInt(maxHealth, 10) : 1000; // Default to 1000 if not set
  } catch (error) {
    console.error('Error getting max health:', error);
    return 1000;
  }
}

async function setMaxHealth(value) {
  try {
    await redisClient.set('global_max_health', value.toString());
  } catch (error) {
    console.error('Error setting max health:', error);
  }
}

async function getMOTD() {
  try {
    const motd = await redisClient.get('global_motd');
    return motd || null;
  } catch (error) {
    console.error('Error getting MOTD:', error);
    return null;
  }
}

async function setMOTD(value) {
  try {
    if (value && value.trim()) {
      await redisClient.set('global_motd', value);
    } else {
      await redisClient.del('global_motd');
    }
  } catch (error) {
    console.error('Error setting MOTD:', error);
  }
}

async function getLeaderboardLastFlush() {
  try {
    const timestamp = await redisClient.get('leaderboard_last_flush');
    return timestamp ? parseInt(timestamp, 10) : null;
  } catch (error) {
    console.error('Error getting leaderboard last flush:', error);
    return null;
  }
}

async function setLeaderboardLastFlush(timestamp) {
  try {
    await redisClient.set('leaderboard_last_flush', timestamp.toString());
  } catch (error) {
    console.error('Error setting leaderboard last flush:', error);
  }
}

async function getLeaderboardFlushInterval() {
  try {
    const interval = await redisClient.get('leaderboard_flush_interval_minutes');
    return interval ? parseInt(interval, 10) : 60; // Default to 60 minutes if not set
  } catch (error) {
    console.error('Error getting leaderboard flush interval:', error);
    return 60;
  }
}

async function setLeaderboardFlushInterval(minutes) {
  try {
    await redisClient.set('leaderboard_flush_interval_minutes', minutes.toString());
  } catch (error) {
    console.error('Error setting leaderboard flush interval:', error);
  }
}

// --- WEBSOCKET CONNECTION HANDLER ---
// This function is called when a new WebSocket connection is established
// It also initializes the subscriber client if not already done

function handleNewConnection(ws) {
  try {
    // Initialize subscriber on first connection
    if (!subscriberInitialized) {
      initializeSubscriber();
    }
    
    // Check if this connection already exists
    if (activeConnections.has(ws)) {
      console.log('WebSocket connection already in pool, skipping.');
      return;
    }
    
    // Clean up any dead connections before adding
    activeConnections.forEach((existingWs) => {
      if (!existingWs || existingWs.readyState === 3) { // 3 = CLOSED
        activeConnections.delete(existingWs);
      }
    });
    
    console.log('Adding new WebSocket connection to active pool.');
    activeConnections.add(ws);

    // Remove connection when it closes
    const removeConnection = () => {
      console.log('Removing WebSocket connection from active pool.');
      activeConnections.delete(ws);
    };
    
    // Ensure we only add listeners once
    if (!ws._listenersAdded && ws && typeof ws.on === 'function') {
      ws.on('close', removeConnection);
      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message || error);
        removeConnection();
      });
      ws._listenersAdded = true;
    }
  } catch (error) {
    console.error('Error in handleNewConnection:', error);
    // Don't close the connection if there's an error in our handler
  }
}

// Handle publisher client errors
redisClient.on('error', (error) => {
  console.error('Redis Publisher Client error:', error);
});

// Initialize global health to 100 if not already set
redisClient.get('global_health').then((health) => {
  if (health === null) {
    redisClient.set('global_health', '100');
    console.log('Initialized global_health to 100.');
  }
}).catch((error) => {
  console.error('Error initializing global health:', error);
});

redisClient.get('global_max_health').then((maxHealth) => {
  if (maxHealth === null) {
    redisClient.set('global_max_health', '1000');
    console.log('Initialized global_max_health to 1000.');
  }
}).catch((error) => {
  console.error('Error initializing global max health:', error);
});

redisClient.get('leaderboard_flush_interval_minutes').then((interval) => {
  if (interval === null) {
    redisClient.set('leaderboard_flush_interval_minutes', '60');
    console.log('Initialized leaderboard_flush_interval_minutes to 60.');
  }
}).catch((error) => {
  console.error('Error initializing leaderboard flush interval:', error);
});

// Getter for subscriberClient that initializes on first access
function getSubscriberClient() {
  return initializeSubscriber();
}

// --- EXPORTS ---
export {
  db,
  redisClient,
  getSubscriberClient as subscriberClient,
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
  handleNewConnection
};

