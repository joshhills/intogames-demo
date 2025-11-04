// This file abstracts all network communication
// It's the "client-side" of your online systems

// These URLs can be overridden by setting window.API_URL and window.WS_URL before loading this script
// For production, inject these via environment variables during build
const API_URL = window.API_URL || 'http://localhost:3000/api';
const WS_URL = window.WS_URL || 'ws://localhost:3001/ws';

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

// --- PROFILE SETUP MODAL ---
function updateModalCharacterCounters() {
  if (!validationConfig) return;
  
  const productNameInput = document.getElementById('modal-product-name-input');
  const taglineInput = document.getElementById('modal-tagline-input');
  const productNameCounter = document.getElementById('modal-product-name-counter');
  const taglineCounter = document.getElementById('modal-tagline-counter');
  
  if (productNameInput && productNameCounter) {
    const length = productNameInput.value.trim().length;
    const max = validationConfig.corporationNameMaxLength || 64;
    productNameCounter.textContent = `${length}/${max}`;
    
    if (length < (validationConfig.corporationNameMinLength || 1)) {
      productNameCounter.style.color = '#ff0000';
    } else if (length > max * 0.9) {
      productNameCounter.style.color = '#ffaa00';
    } else {
      productNameCounter.style.color = '#888';
    }
    
    productNameInput.maxLength = max;
  }
  
  if (taglineInput && taglineCounter) {
    const length = taglineInput.value.trim().length;
    const max = validationConfig.taglineMaxLength || 128;
    taglineCounter.textContent = `${length}/${max}`;
    
    if (length < (validationConfig.taglineMinLength || 1)) {
      taglineCounter.style.color = '#ff0000';
    } else if (length > max * 0.9) {
      taglineCounter.style.color = '#ffaa00';
    } else {
      taglineCounter.style.color = '#888';
    }
    
    taglineInput.maxLength = max;
  }
}

function showProfileSetupModal() {
  const modal = document.getElementById('profile-setup-modal');
  if (!modal) return;
  
  modal.style.display = 'flex';
  
  // Populate with existing values if available
  const productNameInput = document.getElementById('modal-product-name-input');
  const taglineInput = document.getElementById('modal-tagline-input');
  const productNameMain = document.getElementById('product-name-input');
  const taglineMain = document.getElementById('tagline-input');
  
  if (productNameInput && productNameMain) {
    productNameInput.value = productNameMain.value || '';
  }
  if (taglineInput && taglineMain) {
    taglineInput.value = taglineMain.value || '';
  }
  
  // Update character counters
  updateModalCharacterCounters();
  
  // Set up listeners for modal counters
  if (productNameInput) {
    productNameInput.addEventListener('input', updateModalCharacterCounters);
  }
  if (taglineInput) {
    taglineInput.addEventListener('input', updateModalCharacterCounters);
  }
  
  // Focus on product name input
  if (productNameInput) {
    setTimeout(() => productNameInput.focus(), 100);
  }
}

function hideProfileSetupModal() {
  const modal = document.getElementById('profile-setup-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Initialize modal save button handler
document.addEventListener('DOMContentLoaded', () => {
  const modalSaveBtn = document.getElementById('modal-save-profile-btn');
  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', async () => {
      const productNameInput = document.getElementById('modal-product-name-input');
      const taglineInput = document.getElementById('modal-tagline-input');
      const productNameMain = document.getElementById('product-name-input');
      const taglineMain = document.getElementById('tagline-input');
      
      // Validate modal inputs
      if (!validationConfig) {
        validationConfig = {
          corporationNameMinLength: 1,
          corporationNameMaxLength: 64,
          taglineMinLength: 1,
          taglineMaxLength: 128
        };
      }
      
      const productName = productNameInput ? productNameInput.value.trim() : '';
      const tagline = taglineInput ? taglineInput.value.trim() : '';
      
      // Client-side validation
      if (productName !== '') {
        const corpLength = productName.length;
        if (corpLength < validationConfig.corporationNameMinLength) {
          showNotification(`Corporation name must be at least ${validationConfig.corporationNameMinLength} character(s)`);
          return;
        }
        if (corpLength > validationConfig.corporationNameMaxLength) {
          showNotification(`Corporation name must be at most ${validationConfig.corporationNameMaxLength} characters`);
          return;
        }
      }
      
      const taglineLength = tagline.length;
      if (taglineLength < validationConfig.taglineMinLength) {
        showNotification(`Tagline must be at least ${validationConfig.taglineMinLength} character(s)`);
        return;
      }
      if (taglineLength > validationConfig.taglineMaxLength) {
        showNotification(`Tagline must be at most ${validationConfig.taglineMaxLength} characters`);
        return;
      }
      
      // Sync modal inputs to main inputs
      if (productNameInput && productNameMain) {
        productNameMain.value = productName;
        updateCharacterCounters();
      }
      if (taglineInput && taglineMain) {
        taglineMain.value = tagline;
        updateCharacterCounters();
      }
      
      // Trigger profile save
      await saveProfile();
    });
  }
});

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
function updateCharacterCounters() {
  if (!validationConfig) return;
  
  const productNameInput = document.getElementById('product-name-input');
  const taglineInput = document.getElementById('tagline-input');
  const productNameCounter = document.getElementById('product-name-counter');
  const taglineCounter = document.getElementById('tagline-counter');
  
  if (productNameInput && productNameCounter) {
    const length = productNameInput.value.trim().length;
    const max = validationConfig.corporationNameMaxLength || 64;
    productNameCounter.textContent = `${length}/${max}`;
    
    // Color code: red if invalid, yellow if approaching limit, green otherwise
    if (length < (validationConfig.corporationNameMinLength || 1)) {
      productNameCounter.style.color = '#ff0000';
    } else if (length > max * 0.9) {
      productNameCounter.style.color = '#ffaa00';
    } else {
      productNameCounter.style.color = '#888';
    }
    
    // Update maxlength attribute
    productNameInput.maxLength = max;
  }
  
  if (taglineInput && taglineCounter) {
    const length = taglineInput.value.trim().length;
    const max = validationConfig.taglineMaxLength || 128;
    taglineCounter.textContent = `${length}/${max}`;
    
    // Color code: red if invalid, yellow if approaching limit, green otherwise
    if (length < (validationConfig.taglineMinLength || 1)) {
      taglineCounter.style.color = '#ff0000';
    } else if (length > max * 0.9) {
      taglineCounter.style.color = '#ffaa00';
    } else {
      taglineCounter.style.color = '#888';
    }
    
    // Update maxlength attribute
    taglineInput.maxLength = max;
  }
}

function validateProfile() {
  if (!validationConfig) {
    validationConfig = {
      corporationNameMinLength: 1,
      corporationNameMaxLength: 64,
      taglineMinLength: 1,
      taglineMaxLength: 128
    };
  }
  
  const productNameInput = document.getElementById('product-name-input');
  const taglineInput = document.getElementById('tagline-input');
  let isValid = true;
  let errorMessage = '';
  
  // Validate corporation name (optional but if provided, must meet requirements)
  if (productNameInput && productNameInput.value.trim() !== '') {
    const length = productNameInput.value.trim().length;
    if (length < validationConfig.corporationNameMinLength) {
      isValid = false;
      errorMessage = `Corporation name must be at least ${validationConfig.corporationNameMinLength} character(s)`;
    } else if (length > validationConfig.corporationNameMaxLength) {
      isValid = false;
      errorMessage = `Corporation name must be at most ${validationConfig.corporationNameMaxLength} characters`;
    }
  }
  
  // Validate tagline (required)
  if (taglineInput) {
    const length = taglineInput.value.trim().length;
    if (length < validationConfig.taglineMinLength) {
      isValid = false;
      errorMessage = `Tagline must be at least ${validationConfig.taglineMinLength} character(s)`;
    } else if (length > validationConfig.taglineMaxLength) {
      isValid = false;
      errorMessage = `Tagline must be at most ${validationConfig.taglineMaxLength} characters`;
    }
  }
  
  return { isValid, errorMessage };
}

async function getProfile() {
  if (!jwtToken) return;
  try {
    const response = await fetch(`${API_URL}/player/profile`, {
      headers: { 'Authorization': `Bearer ${jwtToken}` },
    });
    const profile = await response.json();
    const productNameInput = document.getElementById('product-name-input');
    const taglineInput = document.getElementById('tagline-input');
    const colorInput = document.getElementById('color-input');
    
    if (productNameInput) productNameInput.value = profile.productName || '';
    if (taglineInput) taglineInput.value = profile.tagline || '';
    if (colorInput) colorInput.value = profile.color || '#FFFFFF';
    
    // Update character counters
    updateCharacterCounters();
    
    // Update player's total score display
    if (profile.totalScore !== undefined) {
      updatePlayerScore(profile.totalScore);
    }
    
    // Check if profile needs setup (first login)
    // Show modal if corporation name is generic/default or tagline is placeholder
    const needsSetup = !profile.productName || 
                      profile.productName.startsWith('Generic Co. #') || 
                      !profile.tagline || 
                      profile.tagline === 'Your tagline here!';
    if (needsSetup && !localStorage.getItem('profileSetupShown')) {
      showProfileSetupModal();
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
    // Flush info is now included in the leaderboard endpoint
    const response = await fetch(`${API_URL}/leaderboard`);
    if (!response.ok) {
      // Hide countdown if we can't fetch info
      const countdownEl = document.getElementById('leaderboard-reset-countdown');
      if (countdownEl) {
        countdownEl.textContent = '';
      }
      return;
    }
    
    const data = await response.json();
    leaderboardFlushInfo = {
      lastFlush: data.lastFlush,
      flushIntervalMinutes: data.flushIntervalMinutes
    };
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
    // Note: Flush info will be updated via WebSocket LEADERBOARD_UPDATE message
    // No need to poll - just wait for the push notification
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
  
  // Client-side validation
  const validation = validateProfile();
  if (!validation.isValid) {
    showNotification(validation.errorMessage);
    return;
  }
  
  const productName = document.getElementById('product-name-input').value.trim();
  const tagline = document.getElementById('tagline-input').value.trim();
  const color = document.getElementById('color-input').value;
  
  try {
    const response = await fetch(`${API_URL}/player/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ productName, tagline, color }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      showNotification(errorText || 'Failed to save profile');
      return;
    }
    
    showNotification('Profile Saved!');
    // Mark that profile setup has been shown (don't show modal again)
    localStorage.setItem('profileSetupShown', 'true');
    // Close modal if open
    hideProfileSetupModal();
    // Notify sketch.js to update the color
    window.dispatchEvent(new CustomEvent('profileLoaded', { detail: { productName, color, tagline } }));
  } catch (error) {
    console.error('Save Profile Error:', error);
    showNotification('Failed to save profile. Please try again.');
  }
}

// --- GAME & METAGAME ---

let validationConfig = null;

async function getGameConfig() {
  try {
    const response = await fetch(`${API_URL}/game-config`); 
    gameConfig = await response.json();
    console.log('Game Config Loaded:', gameConfig);
    
    // Store validation config
    validationConfig = gameConfig.validation || {
      corporationNameMinLength: 1,
      corporationNameMaxLength: 64,
      taglineMinLength: 1,
      taglineMaxLength: 128
    };
    
    // Update character counter max values
    updateCharacterCounters();
    
    // Enable the start button now that we have config
    document.getElementById('start-game-btn').disabled = false;
    
  } catch (error) {
    console.error('Game Config Error:', error);
    showNotification('Error loading game config. Using defaults.');
    
    // Use defaults if config fails to load
    validationConfig = {
      corporationNameMinLength: 1,
      corporationNameMaxLength: 64,
      taglineMinLength: 1,
      taglineMaxLength: 128
    };
    
    // Fallback in case API is down
    gameConfig = {
      easy: { 
        holeCount: 1, 
        spawnRate: 1000, 
        maxSpeed: 1.5, 
        penalty: 5, 
        defenseBonus: 5, 
        gameTimeSeconds: 60,
        adblockDepletionRate: 100,
        adblockRegenerationRate: 50,
        adblockTimeoutAfterUse: 2,
        holesWander: false
      },
      medium: { 
        holeCount: 1, 
        spawnRate: 750, 
        maxSpeed: 2, 
        penalty: 10, 
        defenseBonus: 5, 
        gameTimeSeconds: 60,
        adblockDepletionRate: 150,
        adblockRegenerationRate: 40,
        adblockTimeoutAfterUse: 2,
        holesWander: false
      },
      hard: { 
        holeCount: 2, 
        spawnRate: 500, 
        maxSpeed: 2.5, 
        penalty: 15, 
        defenseBonus: 5, 
        gameTimeSeconds: 60,
        adblockDepletionRate: 200,
        adblockRegenerationRate: 30,
        adblockTimeoutAfterUse: 3,
        holesWander: true
      }
    };
  }
}

async function getLeaderboard() {
  try {
    const response = await fetch(`${API_URL}/leaderboard`);
    const data = await response.json();
    // Update leaderboard display with top 3
    updateLeaderboardDisplay(data.leaderboard || []);
    // Update flush info if not already loaded
    if (data.lastFlush !== undefined && data.flushIntervalMinutes !== undefined) {
      leaderboardFlushInfo = {
        lastFlush: data.lastFlush,
        flushIntervalMinutes: data.flushIntervalMinutes
      };
      updateFlushCountdownDisplay();
    }
  } catch (error) {
    console.error('Leaderboard Error:', error);
  }
}

function updateLeaderboardDisplay(leaderboard) {
  const listEl = document.getElementById('leaderboard-list');
  if (!listEl) return;
  
  listEl.innerHTML = leaderboard.map(entry => {
    const corporationName = entry.productName || '';
    const tagline = entry.tagline || '';
    const score = formatNumber(entry.score);
    const playerColor = entry.color || '#FFFFFF';
    
    // Show corporation name and tagline on separate lines (tagline smaller)
    // Border color matches player's profile color
    const borderStyle = `border: 2px solid ${playerColor}; padding: 0.5em; margin-bottom: 0.5em; background-color: rgba(0, 0, 0, 0.3);`;
    
    if (corporationName) {
      return `<li style="${borderStyle}"><div style="font-weight: bold; margin-bottom: 0.2em;">${corporationName}</div><div style="font-size: 0.8em; color: #888; margin-left: 1.2em; margin-bottom: 0.3em;">${tagline}</div><div style="font-size: 0.9em;">Score: ${score}</div></li>`;
    } else {
      return `<li style="${borderStyle}"><div style="font-weight: bold; margin-bottom: 0.3em;">${tagline}</div><div style="font-size: 0.9em;">Score: ${score}</div></li>`;
    }
  }).join('');
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

async function submitMatchScore(score, difficulty, successRatio, bugsKilled, bugsReachedHoles) {
  if (!jwtToken) return;
  try {
    const response = await fetch(`${API_URL}/match/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
              body: JSON.stringify({ score, difficulty, successRatio, bugsKilled, bugsReachedHoles }),
    });
    
    if (response.ok) {
      const data = await response.json();
      // Update player's own score display
      if (data.totalScore !== undefined) {
        updatePlayerScore(data.totalScore);
      }
      // Flush info and leaderboard will be updated via WebSocket LEADERBOARD_UPDATE message if top 3 changes
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
        // Leaderboard will be updated via LEADERBOARD_UPDATE message, no need to fetch
      }
      
      if (data.type === 'LEADERBOARD_UPDATE') {
        // Update the leaderboard display with new data
        updateLeaderboardDisplay(data.leaderboard);
        // Update flush info from the message if provided (no need to call API)
        if (data.lastFlush !== undefined && data.flushIntervalMinutes !== undefined) {
          leaderboardFlushInfo = {
            lastFlush: data.lastFlush,
            flushIntervalMinutes: data.flushIntervalMinutes
          };
        }
        
        // If leaderboard was flushed, show notification and reset countdown
        if (data.flushed) {
          showNotification('Leaderboard has been reset!');
          // Reset player's own score display to 0 since all scores were reset
          updatePlayerScore(0);
          // Refresh profile once to get updated score
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
      
      if (data.type === 'PROFILE_UPDATED') {
        // Admin updated the player's profile
        const currentUuid = localStorage.getItem('local_uuid');
        if (data.uuid === currentUuid) {
          console.log('Profile was updated by admin:', data);
          
          // Update profile inputs
          const productNameInput = document.getElementById('product-name-input');
          const taglineInput = document.getElementById('tagline-input');
          
          if (productNameInput && data.productName !== undefined) {
            productNameInput.value = data.productName;
          }
          if (taglineInput && data.tagline !== undefined) {
            taglineInput.value = data.tagline;
          }
          
          // Update character counters
          updateCharacterCounters();
          
          // Notify sketch.js to update the profile
          window.dispatchEvent(new CustomEvent('profileLoaded', { 
            detail: { 
              productName: data.productName || '', 
              tagline: data.tagline || '',
              color: document.getElementById('color-input')?.value || '#FFFFFF'
            } 
          }));
          
          showNotification('Your profile was updated by an administrator');
        }
      }
      
      if (data.type === 'PLAYER_DELETED') {
        // Player was deleted by admin
        const currentUuidDeleted = localStorage.getItem('local_uuid');
        if (data.uuid === currentUuidDeleted) {
          console.log('Player account was deleted by admin');
          
          // Clear local storage
          localStorage.removeItem('local_uuid');
          localStorage.removeItem('jwt_token');
          localStorage.removeItem('profileSetupShown');
          
          // Clear JWT token
          jwtToken = null;
          
          // Show notification
          showNotification('Your account has been deleted. Please refresh to re-enroll.', true);
          
          // Optionally, redirect or trigger re-enrollment after a delay
          setTimeout(() => {
            if (confirm('Your account was deleted. Would you like to refresh the page to create a new account?')) {
              window.location.reload();
            }
          }, 2000);
        }
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
