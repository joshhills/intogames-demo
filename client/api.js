// This file abstracts all network communication
// It's the "client-side" of your online systems

const API_URL = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3001/ws';

let jwtToken = null;
let gameConfig = null;

// --- HELPER FUNCTIONS ---
// Helper function to format numbers with thousands separators
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) {
    return num;
  }
  return Number(num).toLocaleString('en-US');
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function showNotification(message, isMOTD = false) {
  const toast = document.getElementById('notification-toast');
  toast.textContent = message;
  toast.style.display = 'block';
  if (isMOTD) {
    toast.style.backgroundColor = '#007bff'; // Blue for MOTD
    toast.style.color = '#FFFFFF';
  } else {
    toast.style.backgroundColor = '#00ff00'; // Green for normal
    toast.style.color = '#000000';
  }
  
  setTimeout(() => { 
    toast.style.display = 'none'; 
  }, 5000);
}

// --- AUTHENTICATION ---
let enrollmentInProgress = false;

async function enrollAndLogin() {
  if (enrollmentInProgress) {
    console.log('Enrollment already in progress, skipping...');
    return;
  }
  
  enrollmentInProgress = true;
  console.log('Authenticating...');
  try {
    let uuid = localStorage.getItem('local_uuid');
    if (!uuid) {
      uuid = generateUUID();
      localStorage.setItem('local_uuid', uuid);
    }
    document.getElementById('player-id').textContent = uuid.split('-')[0];

    const response = await fetch(`${API_URL}/auth/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ local_uuid: uuid }),
    });

    if (!response.ok) throw new Error('Failed to enroll');
    const data = await response.json();
    jwtToken = data.token;
    console.log('Enrolled and Logged In.');
    
    // Now that we're logged in, get our profile
    await getProfile();
    // Get the game config
    await getGameConfig();
    // And connect to the push service (only if not already connected)
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    }

  } catch (error) {
    console.error('Auth Error:', error);
  } finally {
    enrollmentInProgress = false;
  }
}

// --- PLAYER PROFILE ---
async function getProfile() {
  if (!jwtToken) return;
  try {
    const response = await fetch(`${API_URL}/player/profile`, {
      headers: { 'Authorization': `Bearer ${jwtToken}` },
    });
    const profile = await response.json();
    document.getElementById('tagline-input').value = profile.tagline;
    document.getElementById('color-input').value = profile.color;
    
    // Update player's total score display
    if (profile.totalScore !== undefined) {
      updatePlayerScore(profile.totalScore);
    }
    
    // Notify sketch.js that the profile is loaded
    window.dispatchEvent(new CustomEvent('profileLoaded', { detail: profile }));
  } catch (error) {
    console.error('Get Profile Error:', error);
  }
}

function updatePlayerScore(score) {
  const scoreEl = document.getElementById('player-total-score');
  if (scoreEl) {
    scoreEl.textContent = formatNumber(score);
  }
}

let leaderboardFlushInfo = null;
let flushCountdownInterval = null;

async function loadLeaderboardFlushInfo() {
  try {
    const response = await fetch(`${API_URL}/leaderboard/flush-info`);
    if (!response.ok) {
      // Hide countdown if we can't fetch info
      const countdownEl = document.getElementById('leaderboard-reset-countdown');
      if (countdownEl) {
        countdownEl.textContent = '';
      }
      return;
    }
    
    const data = await response.json();
    leaderboardFlushInfo = data;
    updateFlushCountdownDisplay();
  } catch (error) {
    console.error('Error loading leaderboard flush info:', error);
  }
}

async function updateLeaderboardFlushCountdown() {
  // Load flush info once, then use local timer
  await loadLeaderboardFlushInfo();
  
  // Clear existing interval
  if (flushCountdownInterval) {
    clearInterval(flushCountdownInterval);
    flushCountdownInterval = null;
  }
  
  // Update countdown every second (no API calls, just local calculation)
  flushCountdownInterval = setInterval(updateFlushCountdownDisplay, 1000);
}

function updateFlushCountdownDisplay() {
  const countdownEl = document.getElementById('leaderboard-reset-countdown');
  if (!countdownEl || !leaderboardFlushInfo) {
    return;
  }
  
  if (!leaderboardFlushInfo.lastFlush) {
    countdownEl.textContent = '';
    return;
  }
  
  const now = Date.now();
  const lastFlush = leaderboardFlushInfo.lastFlush;
  const flushIntervalMs = leaderboardFlushInfo.flushIntervalMinutes * 60 * 1000;
  const nextFlush = lastFlush + flushIntervalMs;
  const timeUntilFlush = nextFlush - now;
  
  if (timeUntilFlush <= 0) {
    countdownEl.textContent = 'Resets soon...';
    // Reload flush info if time has elapsed (might have been auto-flushed)
    setTimeout(loadLeaderboardFlushInfo, 2000);
    return;
  }
  
  const minutes = Math.floor(timeUntilFlush / 60000);
  const seconds = Math.floor((timeUntilFlush % 60000) / 1000);
  
  if (minutes > 0) {
    countdownEl.textContent = `Resets in ${minutes}m ${seconds}s`;
  } else {
    countdownEl.textContent = `Resets in ${seconds}s`;
  }
}

async function saveProfile() {
  if (!jwtToken) return;
  const tagline = document.getElementById('tagline-input').value;
  const color = document.getElementById('color-input').value;
  try {
    await fetch(`${API_URL}/player/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ tagline, color }),
    });
    showNotification('Profile Saved!');
    // Notify sketch.js to update the color
    window.dispatchEvent(new CustomEvent('profileLoaded', { detail: { color, tagline } }));
  } catch (error) {
    console.error('Save Profile Error:', error);
  }
}

// --- GAME & METAGAME ---

async function getGameConfig() {
  try {
    const response = await fetch(`${API_URL}/game-config`); 
    gameConfig = await response.json();
    console.log('Game Config Loaded:', gameConfig);
    // Enable the start button now that we have config
    document.getElementById('start-game-btn').disabled = false;
    
  } catch (error) {
    console.error('Game Config Error:', error);
    showNotification('Error loading game config. Using defaults.');
    // Fallback in case API is down
    gameConfig = {
      easy: { holeCount: 1, spawnRate: 1000, maxSpeed: 1.5, penalty: 5, defenseBonus: 5, gameTimeSeconds: 60 },
      medium: { holeCount: 1, spawnRate: 750, maxSpeed: 2, penalty: 10, defenseBonus: 5, gameTimeSeconds: 60 },
      hard: { holeCount: 2, spawnRate: 500, maxSpeed: 2.5, penalty: 15, defenseBonus: 5, gameTimeSeconds: 60 }
    };
  }
}

async function getLeaderboard() {
  try {
    const response = await fetch(`${API_URL}/leaderboard/top3`);
    const leaderboard = await response.json();
    updateLeaderboardDisplay(leaderboard);
  } catch (error) {
    console.error('Leaderboard Error:', error);
  }
}

function updateLeaderboardDisplay(leaderboard) {
  const listEl = document.getElementById('leaderboard-list');
  if (!listEl) return;
  
  listEl.innerHTML = leaderboard.map(entry => 
    `<li>${entry.tagline} - ${formatNumber(entry.score)}</li>`
  ).join('');
  if (leaderboard.length === 0) {
    listEl.innerHTML = '<li>No scores yet!</li>';
  }
}

// This is the "Polling" method (for demonstration)
        async function getFirewallStatus_Polling() {
          try {
            const response = await fetch(`${API_URL}/firewall/status`);
            const data = await response.json();
            document.getElementById('global-health-value').textContent = formatNumber(data.health);
          } catch (error) {
            console.error('Firewall Status Error:', error);
          }
        }

async function getMOTD() {
  try {
    const response = await fetch(`${API_URL}/motd`);
    const data = await response.json();
    if (data.motd) {
      displayMOTD(data.motd);
    } else {
      hideMOTD();
    }
  } catch (error) {
    console.error('MOTD Error:', error);
    hideMOTD();
  }
}

function displayMOTD(message) {
  const container = document.getElementById('motd-container');
  const valueEl = document.getElementById('motd-value');
  if (container && valueEl) {
    valueEl.textContent = message;
    container.style.display = 'block';
  }
}

function hideMOTD() {
  const container = document.getElementById('motd-container');
  if (container) {
    container.style.display = 'none';
  }
}

async function submitMatchScore(score, difficulty) {
  if (!jwtToken) return;
  try {
    const response = await fetch(`${API_URL}/match/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ score, difficulty }),
    });
    
    if (response.ok) {
      const data = await response.json();
      // Update player's own score display
      if (data.totalScore !== undefined) {
        updatePlayerScore(data.totalScore);
      }
      // Refresh flush info in case leaderboard was auto-flushed
      loadLeaderboardFlushInfo();
      showNotification('Defense Report Submitted!');
    } else {
      throw new Error('Failed to submit score');
    }
  } catch (error) {
    console.error('Submit Score Error:', error);
  }
}

// --- REAL-TIME PUSH (WEBSOCKET) ---
let wsConnection = null;
let reconnectTimeout = null;
let pingInterval = null;

function connectWebSocket() {
  // If already connected or connecting, don't create a new connection
  if (wsConnection) {
    if (wsConnection.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connecting, skipping...');
      return;
    }
    if (wsConnection.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, skipping...');
      return;
    }
    // Only proceed if connection is closed or closing
    if (wsConnection.readyState !== WebSocket.CLOSED && wsConnection.readyState !== WebSocket.CLOSING) {
      console.log('WebSocket in unexpected state, cleaning up...');
      wsConnection.onclose = null;
      wsConnection.onerror = null;
      wsConnection.onmessage = null;
      wsConnection.close();
    }
  }
  
  console.log('Connecting to Push Service...');
  wsConnection = new WebSocket(WS_URL);

  wsConnection.onopen = () => {
    console.log('WebSocket Connected. ReadyState:', wsConnection.readyState);
    // Clear any pending reconnect
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    // Clear any existing ping interval
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    
    // Get the *initial* health and leaderboard on connect
            getFirewallStatus_Polling();
            getLeaderboard();
            getMOTD();
            updateLeaderboardFlushCountdown(); // Start countdown timer
    
    // Send a ping to keep connection alive
    pingInterval = setInterval(() => {
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({ type: 'ping' }));
      } else {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    }, 30000); // Every 30 seconds
  };

  wsConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket Message Received:', data);

      if (data.type === 'CONNECTED') {
        console.log('Server confirmed connection:', data.message);
        return;
      }

      if (data.type === 'pong') {
        // Ping/pong keep-alive response
        return;
      }

              if (data.type === 'HEALTH_UPDATE') {
                document.getElementById('global-health-value').textContent = formatNumber(data.health);
              }

      if (data.type === 'NEW_TOP_DEFENDER') {
        showNotification(data.message);
        getLeaderboard();
      }
      
      if (data.type === 'LEADERBOARD_UPDATE') {
        // Update the leaderboard display with new data
        updateLeaderboardDisplay(data.leaderboard);
        getLeaderboard(); // Also refresh to ensure consistency
        
        // If leaderboard was flushed, show notification and reset countdown
        if (data.flushed) {
          showNotification('Leaderboard has been reset!');
          loadLeaderboardFlushInfo(); // Reload flush info to get new timestamp
          // Reset player's own score display to 0 since all scores were reset
          updatePlayerScore(0);
          // Also refresh profile to ensure consistency
          getProfile();
        }
      }
      
      if (data.type === 'MOTD') {
        // Extract the actual message (remove "MESSAGE FROM ADMIN: " prefix if present)
        let motdMessage = data.message;
        if (motdMessage.startsWith('MESSAGE FROM ADMIN: ')) {
          motdMessage = motdMessage.substring('MESSAGE FROM ADMIN: '.length);
        }
        displayMOTD(motdMessage);
        showNotification(data.message, true);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  wsConnection.onclose = (event) => {
    console.log('WebSocket Disconnected. Code:', event.code, 'Reason:', event.reason || 'none', 'WasClean:', event.wasClean);
    
    // Clear ping interval
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    
    wsConnection = null;
    
    // Only retry if not already scheduled and it wasn't a clean close from our side
    if (!reconnectTimeout && event.code !== 1000) {
      console.log('Scheduling reconnect in 3 seconds...');
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        if (!wsConnection || (wsConnection.readyState !== WebSocket.CONNECTING && wsConnection.readyState !== WebSocket.OPEN)) {
          connectWebSocket();
        }
      }, 3000);
    } else if (event.code === 1000) {
      console.log('WebSocket closed normally, not retrying.');
    }
  };

  wsConnection.onerror = (err) => {
    console.error('WebSocket Error:', err);
    // Don't close on error - let onclose handle reconnection
  };
}
