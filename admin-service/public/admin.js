document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const adminPanel = document.getElementById('admin-panel');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');

    const updateHealthBtn = document.getElementById('update-health-btn');
    const healthInput = document.getElementById('health-input');
    const maxHealthInput = document.getElementById('max-health-input');
    const healthStatus = document.getElementById('health-status');

    const sendMotdBtn = document.getElementById('send-motd-btn');
    const motdInput = document.getElementById('motd-input');
    const motdStatus = document.getElementById('motd-status');

    const updateFlushIntervalBtn = document.getElementById('update-flush-interval-btn');
    const flushIntervalInput = document.getElementById('flush-interval-input');
    const flushIntervalStatus = document.getElementById('flush-interval-status');
    const lastResetTime = document.getElementById('last-reset-time');
    const nextResetTime = document.getElementById('next-reset-time');

    const refreshLeaderboardBtn = document.getElementById('refresh-leaderboard-btn');
    const flushLeaderboardBtn = document.getElementById('flush-leaderboard-btn');
    const leaderboardList = document.getElementById('admin-leaderboard-list');
    const leaderboardLoading = document.getElementById('leaderboard-loading');
    const leaderboardEmpty = document.getElementById('leaderboard-empty');
    const leaderboardStatus = document.getElementById('leaderboard-status');

    const configForm = document.getElementById('config-form');
    const configStatus = document.getElementById('config-status');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const unsavedIndicator = document.getElementById('unsaved-indicator');

    // Track original values to detect changes
    let originalConfig = null;
    let hasUnsavedChanges = false;
    let originalHealth = null;
    let originalMaxHealth = null;
    let originalMOTD = null;
    let originalFlushInterval = null;
    let flushInfoInterval = null;

    // --- Login Logic ---
    loginBtn.addEventListener('click', async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                loginContainer.style.display = 'none';
                adminPanel.style.display = 'block';
                loginError.textContent = '';
                loadGameConfig();
                loadMOTD();
                loadHealth();
                loadLeaderboard();
                loadFlushInterval();
                loadPlayers();
                startFlushInfoUpdates();
            } else {
                loginError.textContent = 'Invalid username or password';
            }
        } catch (error) {
            loginError.textContent = 'Login request failed';
        }
    });

    // --- Health Logic ---
    function checkHealthChanges() {
        const currentHealth = healthInput.value ? parseInt(healthInput.value, 10) : undefined;
        const currentMaxHealth = maxHealthInput.value ? parseInt(maxHealthInput.value, 10) : undefined;
        
        const healthChanged = originalHealth !== null && currentHealth !== originalHealth;
        const maxHealthChanged = originalMaxHealth !== null && currentMaxHealth !== originalMaxHealth;
        
        // Add/remove changed class
        if (healthChanged) {
            healthInput.classList.add('changed');
        } else {
            healthInput.classList.remove('changed');
        }
        
        if (maxHealthChanged) {
            maxHealthInput.classList.add('changed');
        } else {
            maxHealthInput.classList.remove('changed');
        }
        
        // Enable/disable button
        updateHealthBtn.disabled = !(healthChanged || maxHealthChanged);
    }

    async function loadHealth() {
        try {
            const response = await fetch('/api/health');
            if (!response.ok) throw new Error('Failed to load');
            const data = await response.json();
            if (data.health !== undefined) {
                healthInput.value = data.health;
                originalHealth = data.health;
            }
            if (data.maxHealth !== undefined) {
                maxHealthInput.value = data.maxHealth;
                originalMaxHealth = data.maxHealth;
            }
            // Reset change indicators
            healthInput.classList.remove('changed');
            maxHealthInput.classList.remove('changed');
            updateHealthBtn.disabled = true;
        } catch (error) {
            console.error('Error loading health:', error);
        }
    }

    // Listen for health input changes
    healthInput.addEventListener('input', checkHealthChanges);
    healthInput.addEventListener('change', checkHealthChanges);
    maxHealthInput.addEventListener('input', checkHealthChanges);
    maxHealthInput.addEventListener('change', checkHealthChanges);

    updateHealthBtn.addEventListener('click', async () => {
        const health = healthInput.value ? parseInt(healthInput.value, 10) : undefined;
        const maxHealth = maxHealthInput.value ? parseInt(maxHealthInput.value, 10) : undefined;
        
        // Check if there are actual changes
        const healthChanged = originalHealth !== null && health !== undefined && health !== originalHealth;
        const maxHealthChanged = originalMaxHealth !== null && maxHealth !== undefined && maxHealth !== originalMaxHealth;
        
        if (!healthChanged && !maxHealthChanged) {
            healthStatus.textContent = 'No changes to save';
            healthStatus.className = '';
            return;
        }
        
        healthStatus.textContent = 'Updating...';
        updateHealthBtn.disabled = true;
        
        try {
            const response = await fetch('/api/health', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ health, maxHealth })
            });
            if (response.ok) {
                healthStatus.textContent = 'Health Updated!';
                healthStatus.className = 'success';
                // Reload to get updated values and reset tracking
                await loadHealth();
            } else {
                throw new Error('Failed to update');
            }
        } catch (error) {
            healthStatus.textContent = 'Error updating health. Are you logged in?';
            healthStatus.className = '';
            checkHealthChanges(); // Re-enable button if save failed
        }
    });

    // --- MOTD Logic ---
    function checkMOTDChanges() {
        const currentMOTD = motdInput.value.trim();
        const motdChanged = originalMOTD !== null && currentMOTD !== originalMOTD;
        
        // Add/remove changed class
        if (motdChanged) {
            motdInput.classList.add('changed');
        } else {
            motdInput.classList.remove('changed');
        }
        
        // Enable/disable button
        sendMotdBtn.disabled = !motdChanged;
    }

    async function loadMOTD() {
        try {
            const response = await fetch('/api/motd');
            if (!response.ok) throw new Error('Failed to load');
            const data = await response.json();
            if (data.motd) {
                motdInput.value = data.motd;
                originalMOTD = data.motd;
            } else {
                motdInput.value = '';
                originalMOTD = '';
            }
            // Reset change indicators
            motdInput.classList.remove('changed');
            sendMotdBtn.disabled = true;
        } catch (error) {
            console.error('Error loading MOTD:', error);
            // Don't show error to user, just leave field empty
            originalMOTD = '';
            sendMotdBtn.disabled = true;
        }
    }

    // Listen for MOTD input changes
    motdInput.addEventListener('input', checkMOTDChanges);
    motdInput.addEventListener('change', checkMOTDChanges);

    sendMotdBtn.addEventListener('click', async () => {
        const message = motdInput.value.trim();
        
        // Check if there are actual changes
        if (originalMOTD !== null && message === originalMOTD) {
            motdStatus.textContent = 'No changes to save';
            motdStatus.className = '';
            return;
        }
        
        motdStatus.textContent = 'Updating...';
        sendMotdBtn.disabled = true;
        
        try {
            const response = await fetch('/api/motd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            if (response.ok) {
                motdStatus.textContent = 'MOTD Updated!';
                motdStatus.className = 'success';
                // Update original value and reset change indicators
                originalMOTD = message;
                motdInput.classList.remove('changed');
            } else {
                throw new Error('Failed to update');
            }
        } catch (error) {
            motdStatus.textContent = 'Error updating MOTD. Are you logged in?';
            motdStatus.className = '';
            checkMOTDChanges(); // Re-enable button if save failed
        }
    });

    // --- Leaderboard Logic ---
    async function loadLeaderboard() {
        leaderboardLoading.style.display = 'block';
        leaderboardList.style.display = 'none';
        leaderboardEmpty.style.display = 'none';
        
        try {
            const response = await fetch('/api/leaderboard');
            if (!response.ok) throw new Error('Failed to load');
            const leaderboard = await response.json();
            
            leaderboardLoading.style.display = 'none';
            
            if (leaderboard.length === 0) {
                leaderboardEmpty.style.display = 'block';
                leaderboardList.style.display = 'none';
            } else {
                leaderboardList.innerHTML = leaderboard.map((entry, index) => 
                    `<li><strong>${index + 1}.</strong> ${entry.tagline} - ${entry.score} <span style="color: #666; font-size: 0.9em;">(${entry.uuid.substring(0, 8)}...)</span></li>`
                ).join('');
                leaderboardList.style.display = 'block';
                leaderboardEmpty.style.display = 'none';
            }
        } catch (error) {
            leaderboardLoading.style.display = 'none';
            leaderboardStatus.textContent = 'Error loading leaderboard. Are you logged in?';
            leaderboardStatus.className = '';
        }
    }

    refreshLeaderboardBtn.addEventListener('click', async () => {
        await loadLeaderboard();
        leaderboardStatus.textContent = 'Leaderboard refreshed';
        leaderboardStatus.className = 'success';
        setTimeout(() => {
            leaderboardStatus.textContent = '';
            leaderboardStatus.className = '';
        }, 2000);
    });

    flushLeaderboardBtn.addEventListener('click', async () => {
        // Show confirmation dialog
        const confirmed = confirm('Are you sure you want to flush the leaderboard? This will permanently delete all leaderboard entries. This action cannot be undone.');
        
        if (!confirmed) {
            return;
        }
        
        // Double confirmation
        const doubleConfirmed = confirm('Final confirmation: This will delete ALL leaderboard data. Are you absolutely sure?');
        
        if (!doubleConfirmed) {
            return;
        }
        
        leaderboardStatus.textContent = 'Flushing leaderboard...';
        leaderboardStatus.className = '';
        flushLeaderboardBtn.disabled = true;
        
        try {
            const response = await fetch('/api/leaderboard', {
                method: 'DELETE'
            });
            
            if (response.ok) {
                leaderboardStatus.textContent = 'Leaderboard flushed successfully';
                leaderboardStatus.className = 'success';
                await loadLeaderboard();
                await loadFlushInfo(); // Reload flush info after manual flush to get new timestamp
            } else {
                throw new Error('Failed to flush');
            }
        } catch (error) {
            leaderboardStatus.textContent = 'Error flushing leaderboard. Are you logged in?';
            leaderboardStatus.className = '';
        } finally {
            flushLeaderboardBtn.disabled = false;
        }
    });

    // --- Leaderboard Flush Interval Logic ---
    function checkFlushIntervalChanges() {
        const current = parseInt(flushIntervalInput.value, 10) || 60;
        const changed = originalFlushInterval !== null && current !== originalFlushInterval;
        
        if (changed) {
            flushIntervalInput.classList.add('changed');
        } else {
            flushIntervalInput.classList.remove('changed');
        }
        
        updateFlushIntervalBtn.disabled = !changed;
    }

    async function loadFlushInterval() {
        try {
            const response = await fetch('/api/leaderboard-flush-interval');
            if (!response.ok) throw new Error('Failed to load');
            const data = await response.json();
            if (data.flushIntervalMinutes !== undefined) {
                flushIntervalInput.value = data.flushIntervalMinutes;
                originalFlushInterval = data.flushIntervalMinutes;
            }
            flushIntervalInput.classList.remove('changed');
            updateFlushIntervalBtn.disabled = true;
        } catch (error) {
            console.error('Error loading flush interval:', error);
        }
    }

    flushIntervalInput.addEventListener('input', checkFlushIntervalChanges);
    flushIntervalInput.addEventListener('change', checkFlushIntervalChanges);

    updateFlushIntervalBtn.addEventListener('click', async () => {
        const interval = parseInt(flushIntervalInput.value, 10);
        
        if (interval < 1) {
            flushIntervalStatus.textContent = 'Interval must be at least 1 minute';
            flushIntervalStatus.className = '';
            return;
        }
        
        if (originalFlushInterval !== null && interval === originalFlushInterval) {
            flushIntervalStatus.textContent = 'No changes to save';
            flushIntervalStatus.className = '';
            return;
        }
        
        flushIntervalStatus.textContent = 'Updating...';
        updateFlushIntervalBtn.disabled = true;
        
        try {
            const response = await fetch('/api/leaderboard-flush-interval', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flushIntervalMinutes: interval })
            });
            if (response.ok) {
                flushIntervalStatus.textContent = 'Interval Updated!';
                flushIntervalStatus.className = 'success';
                originalFlushInterval = interval;
                flushIntervalInput.classList.remove('changed');
                await updateFlushInfoDisplay();
            } else {
                throw new Error('Failed to update');
            }
        } catch (error) {
            flushIntervalStatus.textContent = 'Error updating interval. Are you logged in?';
            flushIntervalStatus.className = '';
            checkFlushIntervalChanges();
        }
    });

    let flushInfoData = null; // Store last flush timestamp and interval

    let isLoadingFlushInfo = false; // Prevent concurrent loads

    async function loadFlushInfo() {
        // Prevent concurrent loads
        if (isLoadingFlushInfo) {
            return;
        }
        
        isLoadingFlushInfo = true;
        try {
            const response = await fetch('/api/leaderboard-flush-info');
            if (!response.ok) throw new Error('Failed to load');
            flushInfoData = await response.json();
            updateFlushInfoDisplay();
        } catch (error) {
            console.error('Error loading flush info:', error);
        } finally {
            isLoadingFlushInfo = false;
        }
    }

    let lastApiRefresh = 0; // Track when we last refreshed from API
    const API_REFRESH_INTERVAL = 60000; // Refresh from API every 60 seconds

    function updateFlushInfoDisplay() {
        // Only update display if we have data - don't fetch on every call
        if (!flushInfoData) {
            // Only load if we haven't loaded recently (avoid spam on multiple calls)
            const now = Date.now();
            if (now - lastApiRefresh > 5000) { // Wait at least 5 seconds between loads
                lastApiRefresh = now;
                loadFlushInfo(); // Load once if missing
            }
            return;
        }
        
        if (flushInfoData.lastFlush) {
            const lastFlushDate = new Date(flushInfoData.lastFlush);
            lastResetTime.textContent = lastFlushDate.toLocaleString();
            
            const now = Date.now();
            const flushIntervalMs = flushInfoData.flushIntervalMinutes * 60 * 1000;
            const nextFlush = flushInfoData.lastFlush + flushIntervalMs;
            const timeUntilFlush = nextFlush - now;
            
            if (timeUntilFlush <= 0) {
                nextResetTime.textContent = 'Resets soon...';
                // Only reload from API every 10 seconds if countdown has expired (to catch auto-flushes)
                if (now - lastApiRefresh > 10000) {
                    lastApiRefresh = now;
                    loadFlushInfo(); // Refresh from API
                }
            } else {
                const minutes = Math.floor(timeUntilFlush / 60000);
                const seconds = Math.floor((timeUntilFlush % 60000) / 1000);
                
                if (minutes > 0) {
                    nextResetTime.textContent = `in ${minutes}m ${seconds}s`;
                } else {
                    nextResetTime.textContent = `in ${seconds}s`;
                }
            }
        } else {
            lastResetTime.textContent = 'Never';
            nextResetTime.textContent = 'N/A';
        }
    }

    function startFlushInfoUpdates() {
        // Clear any existing interval first to prevent duplicates
        if (flushInfoInterval) {
            clearInterval(flushInfoInterval);
            flushInfoInterval = null;
        }
        
        // Load flush info once initially
        lastApiRefresh = Date.now();
        loadFlushInfo();
        
        // Update display every second (local calculation only - no API calls)
        // Only refresh from API every 60 seconds to avoid spam
        let apiRefreshCounter = 0;
        flushInfoInterval = setInterval(() => {
            updateFlushInfoDisplay(); // Local calculation only
            apiRefreshCounter++;
            if (apiRefreshCounter >= 60) {
                // Refresh from API every 60 seconds
                const now = Date.now();
                if (now - lastApiRefresh >= API_REFRESH_INTERVAL) {
                    lastApiRefresh = now;
                    loadFlushInfo();
                    apiRefreshCounter = 0;
                }
            }
        }, 1000);
    }

    // Tab switching logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            
            // Update tab buttons
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });

    // Function to get current config from form
    function getCurrentConfig() {
        const tab = document.querySelector('.tab-btn.active')?.dataset.tab || 'easy';
        const config = {
            validation: {
                corporationNameMinLength: parseInt(document.getElementById('validation-corporationNameMinLength').value) || 1,
                corporationNameMaxLength: parseInt(document.getElementById('validation-corporationNameMaxLength').value) || 64,
                taglineMinLength: parseInt(document.getElementById('validation-taglineMinLength').value) || 1,
                taglineMaxLength: parseInt(document.getElementById('validation-taglineMaxLength').value) || 128
            }
        };
        const trapTimeoutInput = document.getElementById('trapTimeout');
        config.trapTimeout = trapTimeoutInput ? parseInt(trapTimeoutInput.value) || 5000 : 5000;
        
        const trapDurabilityInput = document.getElementById('trapDurability');
        config.trapDurability = trapDurabilityInput ? parseInt(trapDurabilityInput.value) || 1 : 1;
        
        const trapShrinkPercentInput = document.getElementById('trapShrinkPercent');
        config.trapShrinkPercent = trapShrinkPercentInput ? parseInt(trapShrinkPercentInput.value) || 0 : 0;
        
        ['easy', 'medium', 'hard'].forEach(difficulty => {
            config[difficulty] = {
                holeCount: parseInt(document.getElementById(`${difficulty}-holeCount`).value),
                spawnRate: Math.round(1000 / parseFloat(document.getElementById(`${difficulty}-spawnRate`).value)),
                maxSpeed: parseFloat(document.getElementById(`${difficulty}-maxSpeed`).value),
                penalty: parseInt(document.getElementById(`${difficulty}-penalty`).value),
                defenseBonus: parseInt(document.getElementById(`${difficulty}-defenseBonus`).value),
                gameTimeSeconds: parseInt(document.getElementById(`${difficulty}-gameTimeSeconds`).value),
                adblockDepletionRate: parseFloat(document.getElementById(`${difficulty}-adblockDepletionRate`).value) || 20,
                adblockRegenerationRate: parseFloat(document.getElementById(`${difficulty}-adblockRegenerationRate`).value) || 10,
                adblockTimeoutAfterUse: parseFloat(document.getElementById(`${difficulty}-adblockTimeoutAfterUse`).value) || 5,
                holesWander: document.getElementById(`${difficulty}-holesWander`).checked,
                trapGrantingEnemyChance: (() => {
                    const input = document.getElementById(`${difficulty}-trapGrantingEnemyChance`);
                    return input ? parseInt(input.value) || 0 : 0;
                })()
            };
        });
        return config;
    }

    // Helper function to compare values with tolerance for floating point
    function valuesEqual(val1, val2, tolerance = 0.0001) {
        if (typeof val1 === 'number' && typeof val2 === 'number') {
            return Math.abs(val1 - val2) < tolerance;
        }
        return val1 === val2;
    }

    // Function to check if config has changed
    function checkForChanges() {
        if (!originalConfig) return false;
        
        const current = getCurrentConfig();
        
        // Check trapTimeout changes
        const currentTrapTimeout = current.trapTimeout || 5000;
        const originalTrapTimeout = originalConfig.trapTimeout || 5000;
        if (currentTrapTimeout !== originalTrapTimeout) {
            return true;
        }
        
        // Check trapDurability changes
        const currentTrapDurability = current.trapDurability || 1;
        const originalTrapDurability = originalConfig.trapDurability || 1;
        if (currentTrapDurability !== originalTrapDurability) {
            return true;
        }
        
        // Check trapShrinkPercent changes
        const currentTrapShrinkPercent = current.trapShrinkPercent || 0;
        const originalTrapShrinkPercent = originalConfig.trapShrinkPercent || 0;
        if (currentTrapShrinkPercent !== originalTrapShrinkPercent) {
            return true;
        }
        
        // Check validation config changes
        if (current.validation) {
            const validationFields = ['corporationNameMinLength', 'corporationNameMaxLength', 'taglineMinLength', 'taglineMaxLength'];
            for (const field of validationFields) {
                const currentVal = current.validation[field] || 0;
                const originalVal = originalConfig.validation?.[field] || 0;
                if (currentVal !== originalVal) {
                    return true;
                }
            }
        }
        
        for (const difficulty of ['easy', 'medium', 'hard']) {
            // Ensure original config has this difficulty
            if (!originalConfig[difficulty]) {
                return true; // If difficulty is missing, consider it changed
            }
            
            for (const field of ['holeCount', 'spawnRate', 'maxSpeed', 'penalty', 'defenseBonus', 'gameTimeSeconds', 'adblockDepletionRate', 'adblockRegenerationRate', 'adblockTimeoutAfterUse', 'holesWander', 'trapGrantingEnemyChance']) {
                // Special handling for spawnRate (we convert it)
                if (field === 'spawnRate') {
                    const currentSpawnRate = Math.round(1000 / parseFloat(document.getElementById(`${difficulty}-spawnRate`).value));
                    const originalSpawnRate = originalConfig[difficulty].spawnRate;
                    if (currentSpawnRate !== originalSpawnRate) {
                        return true;
                    }
                } else if (field === 'maxSpeed' || field === 'adblockDepletionRate' || field === 'adblockRegenerationRate' || field === 'adblockTimeoutAfterUse') {
                    // Use tolerance for floating point comparison
                    const currentValue = current[difficulty][field];
                    const originalValue = originalConfig[difficulty][field] || 0;
                    if (!valuesEqual(currentValue, originalValue)) {
                        return true;
                    }
                } else if (field === 'holesWander') {
                    // Boolean field
                    const currentValue = current[difficulty][field] || false;
                    const originalValue = originalConfig[difficulty][field] || false;
                    if (currentValue !== originalValue) {
                        return true;
                    }
                } else {
                    // Integer fields - strict comparison
                    const currentValue = current[difficulty][field] || 0;
                    const originalValue = originalConfig[difficulty][field] || 0;
                    if (currentValue !== originalValue) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    // Function to update change indicators
    function updateChangeIndicators() {
        hasUnsavedChanges = checkForChanges();
        
        // Show/hide unsaved indicator
        if (hasUnsavedChanges) {
            unsavedIndicator.style.display = 'block';
        } else {
            unsavedIndicator.style.display = 'none';
        }
        
        // Enable/disable save button
        saveConfigBtn.disabled = !hasUnsavedChanges;
        
        // Mark changed inputs
        if (originalConfig) {
            ['easy', 'medium', 'hard'].forEach(difficulty => {
                // Handle regular fields
                ['holeCount', 'maxSpeed', 'penalty', 'defenseBonus', 'gameTimeSeconds', 'adblockDepletionRate', 'adblockRegenerationRate', 'adblockTimeoutAfterUse', 'trapGrantingEnemyChance'].forEach(field => {
                    const input = document.getElementById(`${difficulty}-${field}`);
                    if (!input) return;
                    
                    if (field === 'maxSpeed' || field === 'adblockDepletionRate' || field === 'adblockRegenerationRate' || field === 'adblockTimeoutAfterUse') {
                        // Use tolerance for floating point comparison
                        const current = parseFloat(input.value) || 0;
                        const original = originalConfig[difficulty][field] || 0;
                        if (!valuesEqual(current, original)) {
                            input.classList.add('changed');
                        } else {
                            input.classList.remove('changed');
                        }
                    } else {
                        // Integer fields - strict comparison with defaults
                        const current = parseInt(input.value, 10) || 0;
                        const original = originalConfig[difficulty][field] || 0;
                        if (current !== original) {
                            input.classList.add('changed');
                        } else {
                            input.classList.remove('changed');
                        }
                    }
                });
                
                // Special handling for spawnRate (converted from per-second to milliseconds)
                const spawnRateInput = document.getElementById(`${difficulty}-spawnRate`);
                const currentSpawnRate = Math.round(1000 / parseFloat(spawnRateInput.value));
                if (currentSpawnRate !== originalConfig[difficulty].spawnRate) {
                    spawnRateInput.classList.add('changed');
                } else {
                    spawnRateInput.classList.remove('changed');
                }
                
                // Handle holesWander checkbox
                const holesWanderInput = document.getElementById(`${difficulty}-holesWander`);
                if (holesWanderInput) {
                    const current = holesWanderInput.checked || false;
                    const original = originalConfig[difficulty].holesWander || false;
                    if (current !== original) {
                        holesWanderInput.classList.add('changed');
                    } else {
                        holesWanderInput.classList.remove('changed');
                    }
                }
                
                // Handle trapGrantingEnemyChance
                const trapChanceInput = document.getElementById(`${difficulty}-trapGrantingEnemyChance`);
                if (trapChanceInput) {
                    const current = parseInt(trapChanceInput.value, 10) || 0;
                    const original = originalConfig[difficulty].trapGrantingEnemyChance || 0;
                    if (current !== original) {
                        trapChanceInput.classList.add('changed');
                    } else {
                        trapChanceInput.classList.remove('changed');
                    }
                }
            });
            
            // Handle trapTimeout
            const trapTimeoutInput = document.getElementById('trapTimeout');
            if (trapTimeoutInput && originalConfig.trapTimeout !== undefined) {
                const current = parseInt(trapTimeoutInput.value, 10) || 5000;
                const original = originalConfig.trapTimeout || 5000;
                if (current !== original) {
                    trapTimeoutInput.classList.add('changed');
                } else {
                    trapTimeoutInput.classList.remove('changed');
                }
            }
            
            // Handle trapDurability
            const trapDurabilityInput = document.getElementById('trapDurability');
            if (trapDurabilityInput && originalConfig.trapDurability !== undefined) {
                const current = parseInt(trapDurabilityInput.value, 10) || 1;
                const original = originalConfig.trapDurability || 1;
                if (current !== original) {
                    trapDurabilityInput.classList.add('changed');
                } else {
                    trapDurabilityInput.classList.remove('changed');
                }
            }
            
            // Handle trapShrinkPercent
            const trapShrinkPercentInput = document.getElementById('trapShrinkPercent');
            if (trapShrinkPercentInput && originalConfig.trapShrinkPercent !== undefined) {
                const current = parseInt(trapShrinkPercentInput.value, 10) || 0;
                const original = originalConfig.trapShrinkPercent || 0;
                if (current !== original) {
                    trapShrinkPercentInput.classList.add('changed');
                } else {
                    trapShrinkPercentInput.classList.remove('changed');
                }
            }
        }
    }

    // --- Config Logic ---
    async function loadGameConfig() {
        try {
            const response = await fetch('/api/game-config');
            if (!response.ok) throw new Error('Failed to load');
            const config = await response.json();
            
            // Store original config (with spawnRate in milliseconds)
            originalConfig = JSON.parse(JSON.stringify(config));
            
            // Populate form for each difficulty
            ['easy', 'medium', 'hard'].forEach(difficulty => {
                const level = config[difficulty] || {};
                const inputIds = [
                    { id: `${difficulty}-holeCount`, value: level.holeCount || 1 },
                    { id: `${difficulty}-spawnRate`, value: level.spawnRate ? (1000 / level.spawnRate).toFixed(2) : '1.00' },
                    { id: `${difficulty}-maxSpeed`, value: level.maxSpeed || 1.5 },
                    { id: `${difficulty}-penalty`, value: level.penalty || 5 },
                    { id: `${difficulty}-defenseBonus`, value: level.defenseBonus || 5 },
                    { id: `${difficulty}-gameTimeSeconds`, value: level.gameTimeSeconds || 60 },
                    { id: `${difficulty}-adblockDepletionRate`, value: level.adblockDepletionRate !== undefined ? level.adblockDepletionRate : 20 },
                    { id: `${difficulty}-adblockRegenerationRate`, value: level.adblockRegenerationRate !== undefined ? level.adblockRegenerationRate : 10 },
                    { id: `${difficulty}-adblockTimeoutAfterUse`, value: level.adblockTimeoutAfterUse !== undefined ? level.adblockTimeoutAfterUse : 5 },
                    { id: `${difficulty}-holesWander`, value: level.holesWander !== undefined ? level.holesWander : false, isCheckbox: true },
                    { id: `${difficulty}-trapGrantingEnemyChance`, value: level.trapGrantingEnemyChance !== undefined ? level.trapGrantingEnemyChance : 0 }
                ];
                
                inputIds.forEach(({ id, value, isCheckbox }) => {
                    const input = document.getElementById(id);
                    if (input) {
                        if (isCheckbox) {
                            input.checked = value;
                        } else {
                            input.value = value;
                        }
                    }
                });
            });
            
            // Load trapTimeout
            if (config.trapTimeout !== undefined) {
                const trapTimeoutInput = document.getElementById('trapTimeout');
                if (trapTimeoutInput) {
                    trapTimeoutInput.value = config.trapTimeout;
                }
            }
            
            // Load trapDurability
            if (config.trapDurability !== undefined) {
                const trapDurabilityInput = document.getElementById('trapDurability');
                if (trapDurabilityInput) {
                    trapDurabilityInput.value = config.trapDurability;
                }
            }
            
            // Load trapShrinkPercent
            if (config.trapShrinkPercent !== undefined) {
                const trapShrinkPercentInput = document.getElementById('trapShrinkPercent');
                if (trapShrinkPercentInput) {
                    trapShrinkPercentInput.value = config.trapShrinkPercent;
                }
            }
            
            // Load validation settings
            if (config.validation) {
                document.getElementById('validation-corporationNameMinLength').value = config.validation.corporationNameMinLength || 1;
                document.getElementById('validation-corporationNameMaxLength').value = config.validation.corporationNameMaxLength || 64;
                document.getElementById('validation-taglineMinLength').value = config.validation.taglineMinLength || 1;
                document.getElementById('validation-taglineMaxLength').value = config.validation.taglineMaxLength || 128;
            } else {
                // Set defaults if validation not in config
                if (!originalConfig.validation) {
                    originalConfig.validation = {
                        corporationNameMinLength: 1,
                        corporationNameMaxLength: 64,
                        taglineMinLength: 1,
                        taglineMaxLength: 128
                    };
                }
            }

            // Ensure originalConfig has all required fields with defaults
            ['easy', 'medium', 'hard'].forEach(difficulty => {
                if (!originalConfig[difficulty]) {
                    originalConfig[difficulty] = {};
                }
                // Set defaults for any missing fields
                const defaults = {
                    holeCount: 1,
                    spawnRate: 1000,
                    maxSpeed: 1.5,
                    penalty: 5,
                    defenseBonus: 5,
                    gameTimeSeconds: 60,
                    adblockDepletionRate: 20,
                    trapGrantingEnemyChance: 0,
                    adblockRegenerationRate: 10,
                    adblockTimeoutAfterUse: 5,
                    holesWander: false
                };
                Object.keys(defaults).forEach(key => {
                    if (originalConfig[difficulty][key] === undefined) {
                        originalConfig[difficulty][key] = defaults[key];
                    }
                });
            });
            
            // Reset change tracking AFTER populating and normalizing
            hasUnsavedChanges = false;
            // Don't call updateChangeIndicators here - wait for it to be called naturally
            // to avoid false positives. Instead, manually reset the UI state.
            unsavedIndicator.style.display = 'none';
            saveConfigBtn.disabled = true;
            document.querySelectorAll('.config-input').forEach(input => {
                input.classList.remove('changed');
            });
        } catch (error) {
            configStatus.textContent = 'Error loading config. Are you logged in?';
        }
    }

    // Listen for input changes
    document.querySelectorAll('.config-input').forEach(input => {
        input.addEventListener('input', updateChangeIndicators);
        input.addEventListener('change', updateChangeIndicators);
    });
    
    // Listen for validation input changes
    ['validation-corporationNameMinLength', 'validation-corporationNameMaxLength', 'validation-taglineMinLength', 'validation-taglineMaxLength'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                updateChangeIndicators();
                updateValidationChangeIndicators();
            });
            input.addEventListener('change', () => {
                updateChangeIndicators();
                updateValidationChangeIndicators();
            });
        }
    });

    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!hasUnsavedChanges) {
            configStatus.textContent = 'No changes to save';
            return;
        }
        
        configStatus.textContent = 'Saving...';
        saveConfigBtn.disabled = true;

        const config = getCurrentConfig();

        try {
            const response = await fetch('/api/game-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (response.ok) {
                configStatus.textContent = 'Config Saved!';
                configStatus.className = 'success';
                
                // Update original config to match saved values
                originalConfig = JSON.parse(JSON.stringify(config));
                
                // Reset change indicators
                updateChangeIndicators();
                
                // Remove changed class from all inputs
                document.querySelectorAll('.config-input').forEach(input => {
                    input.classList.remove('changed');
                });
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            configStatus.textContent = 'Error saving config. Are you logged in?';
            configStatus.className = '';
            updateChangeIndicators(); // Re-enable button if save failed
        }
    });

    // Warn before leaving page with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        }
    });

    // --- Players Management ---
    const refreshPlayersBtn = document.getElementById('refresh-players-btn');
    const playersSearchInput = document.getElementById('players-search-input');
    const bulkDeletePlayersBtn = document.getElementById('bulk-delete-players-btn');
    const deleteAllPlayersBtn = document.getElementById('delete-all-players-btn');
    const selectAllPlayersCheckbox = document.getElementById('select-all-players');
    const playersLoading = document.getElementById('players-loading');
    const playersTable = document.getElementById('players-table');
    const playersTbody = document.getElementById('players-tbody');
    const playersEmpty = document.getElementById('players-empty');
    const playersStatus = document.getElementById('players-status');
    const playersPagination = document.getElementById('players-pagination');
    
    let currentPlayersPage = 1;
    let currentPlayersSearch = '';
    let playersPaginationInfo = null;
    let selectedPlayerUuids = new Set();

    if (refreshPlayersBtn) {
        refreshPlayersBtn.addEventListener('click', () => {
            loadPlayers(1);
        });
    }

    if (playersSearchInput) {
        let searchTimeout;
        playersSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPlayersSearch = e.target.value;
                loadPlayers(1);
            }, 300); // Debounce search
        });
    }

    if (selectAllPlayersCheckbox) {
        selectAllPlayersCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.player-select-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const uuid = cb.dataset.uuid;
                if (e.target.checked) {
                    selectedPlayerUuids.add(uuid);
                } else {
                    selectedPlayerUuids.delete(uuid);
                }
            });
            updateBulkDeleteButton();
        });
    }

    if (bulkDeletePlayersBtn) {
        bulkDeletePlayersBtn.addEventListener('click', async () => {
            if (selectedPlayerUuids.size === 0) return;
            
            if (!confirm(`Are you sure you want to delete ${selectedPlayerUuids.size} player(s)? This action cannot be undone.`)) {
                return;
            }

            try {
                playersStatus.textContent = 'Deleting players...';
                playersStatus.style.color = 'black';
                
                const response = await fetch('/api/players/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uuids: Array.from(selectedPlayerUuids) })
                });

                if (response.ok) {
                    const result = await response.json();
                    playersStatus.textContent = `Deleted ${result.deleted} player(s)`;
                    playersStatus.style.color = 'green';
                    selectedPlayerUuids.clear();
                    updateBulkDeleteButton();
                    loadPlayers(currentPlayersPage);
                } else {
                    const error = await response.json();
                    playersStatus.textContent = `Error: ${error.error || 'Failed to delete players'}`;
                    playersStatus.style.color = 'red';
                }
            } catch (error) {
                playersStatus.textContent = 'Failed to delete players';
                playersStatus.style.color = 'red';
            }
        });
    }

    if (deleteAllPlayersBtn) {
        deleteAllPlayersBtn.addEventListener('click', async () => {
            // Double confirmation for deleting all players
            if (!confirm('⚠️ WARNING: This will delete ALL players from the database. This action cannot be undone!')) {
                return;
            }
            
            if (!confirm('Are you ABSOLUTELY SURE? This will permanently delete every player account.')) {
                return;
            }

            try {
                playersStatus.textContent = 'Deleting all players...';
                playersStatus.style.color = 'black';
                
                const response = await fetch('/api/players', {
                    method: 'DELETE'
                });

                if (response.ok) {
                    const result = await response.json();
                    playersStatus.textContent = result.message || `Deleted ${result.deleted} player(s)`;
                    playersStatus.style.color = 'green';
                    selectedPlayerUuids.clear();
                    updateBulkDeleteButton();
                    loadPlayers(1); // Reload to show empty list
                } else {
                    const error = await response.json();
                    playersStatus.textContent = `Error: ${error.error || 'Failed to delete all players'}`;
                    playersStatus.style.color = 'red';
                }
            } catch (error) {
                playersStatus.textContent = 'Failed to delete all players';
                playersStatus.style.color = 'red';
            }
        });
    }

    function updateBulkDeleteButton() {
        if (bulkDeletePlayersBtn) {
            bulkDeletePlayersBtn.disabled = selectedPlayerUuids.size === 0;
        }
        if (selectAllPlayersCheckbox) {
            const checkboxes = document.querySelectorAll('.player-select-checkbox');
            selectAllPlayersCheckbox.checked = checkboxes.length > 0 && checkboxes.length === selectedPlayerUuids.size;
        }
    }

    async function loadPlayers(page = 1) {
        try {
            playersLoading.style.display = 'block';
            playersTable.style.display = 'none';
            playersEmpty.style.display = 'none';
            playersStatus.textContent = '';

            const searchParam = currentPlayersSearch ? `&search=${encodeURIComponent(currentPlayersSearch)}` : '';
            const response = await fetch(`/api/players?page=${page}&limit=20${searchParam}`);
            if (!response.ok) throw new Error('Failed to load players');
            const data = await response.json();

            playersPaginationInfo = data.pagination;
            currentPlayersPage = page;

            if (data.players.length === 0) {
                playersLoading.style.display = 'none';
                playersEmpty.style.display = 'block';
                playersTable.style.display = 'none';
            } else {
                playersTbody.innerHTML = data.players.map(player => {
                    const uuidShort = player.uuid.substring(0, 8);
                    const corpName = player.productName || '(none)';
                    const tagline = player.tagline || '(none)';
                    const isSelected = selectedPlayerUuids.has(player.uuid);
                    return `
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 8px;">
                                <input type="checkbox" class="player-select-checkbox" data-uuid="${player.uuid}" ${isSelected ? 'checked' : ''} />
                            </td>
                            <td style="padding: 8px; font-family: monospace; font-size: 0.9em;">${uuidShort}</td>
                            <td style="padding: 8px;">
                                <span class="editable-field" data-uuid="${player.uuid}" data-field="productName" contenteditable="false">${corpName}</span>
                            </td>
                            <td style="padding: 8px;">
                                <span class="editable-field" data-uuid="${player.uuid}" data-field="tagline" contenteditable="false">${tagline}</span>
                            </td>
                            <td style="padding: 8px;">
                                <div style="width: 30px; height: 20px; background-color: ${player.color}; border: 1px solid #ddd; display: inline-block;"></div>
                                <span style="margin-left: 5px; font-family: monospace; font-size: 0.9em;">${player.color}</span>
                            </td>
                            <td style="padding: 8px;">${player.totalScore || 0}</td>
                            <td style="padding: 8px;">
                                <button class="edit-player-btn" data-uuid="${player.uuid}" style="padding: 4px 8px; font-size: 0.9em;">Edit</button>
                                <button class="save-player-btn" data-uuid="${player.uuid}" style="padding: 4px 8px; font-size: 0.9em; display: none;">Save</button>
                                <button class="cancel-player-btn" data-uuid="${player.uuid}" style="padding: 4px 8px; font-size: 0.9em; display: none;">Cancel</button>
                                <button class="delete-player-btn" data-uuid="${player.uuid}" style="padding: 4px 8px; font-size: 0.9em; background-color: #dc3545; color: white; margin-left: 5px;">Delete</button>
                            </td>
                        </tr>
                    `;
                }).join('');

                // Add event listeners for checkboxes
                document.querySelectorAll('.player-select-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', (e) => {
                        const uuid = e.target.dataset.uuid;
                        if (e.target.checked) {
                            selectedPlayerUuids.add(uuid);
                        } else {
                            selectedPlayerUuids.delete(uuid);
                        }
                        updateBulkDeleteButton();
                    });
                });

                // Add event listeners for delete buttons
                document.querySelectorAll('.delete-player-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const uuid = e.target.dataset.uuid;
                        const uuidShort = uuid.substring(0, 8);
                        
                        if (!confirm(`Are you sure you want to delete player ${uuidShort}? This action cannot be undone.`)) {
                            return;
                        }

                        try {
                            playersStatus.textContent = 'Deleting player...';
                            playersStatus.style.color = 'black';
                            
                            const response = await fetch(`/api/players/${uuid}`, {
                                method: 'DELETE'
                            });

                            if (response.ok) {
                                playersStatus.textContent = 'Player deleted successfully';
                                playersStatus.style.color = 'green';
                                selectedPlayerUuids.delete(uuid);
                                updateBulkDeleteButton();
                                loadPlayers(currentPlayersPage);
                            } else {
                                const error = await response.json();
                                playersStatus.textContent = `Error: ${error.error || 'Failed to delete player'}`;
                                playersStatus.style.color = 'red';
                            }
                        } catch (error) {
                            playersStatus.textContent = 'Failed to delete player';
                            playersStatus.style.color = 'red';
                        }
                    });
                });

                // Add event listeners for edit buttons
                document.querySelectorAll('.edit-player-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const uuid = e.target.dataset.uuid;
                        const row = e.target.closest('tr');
                        const productNameField = row.querySelector('[data-field="productName"]');
                        const taglineField = row.querySelector('[data-field="tagline"]');
                        
                        productNameField.contentEditable = 'true';
                        taglineField.contentEditable = 'true';
                        productNameField.style.border = '1px solid #007bff';
                        taglineField.style.border = '1px solid #007bff';
                        productNameField.style.padding = '2px';
                        taglineField.style.padding = '2px';
                        
                        e.target.style.display = 'none';
                        row.querySelector(`.save-player-btn[data-uuid="${uuid}"]`).style.display = 'inline-block';
                        row.querySelector(`.cancel-player-btn[data-uuid="${uuid}"]`).style.display = 'inline-block';
                    });
                });

                document.querySelectorAll('.save-player-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const uuid = e.target.dataset.uuid;
                        const row = e.target.closest('tr');
                        const productNameField = row.querySelector('[data-field="productName"]');
                        const taglineField = row.querySelector('[data-field="tagline"]');
                        
                        const productName = productNameField.textContent.trim() === '(none)' ? '' : productNameField.textContent.trim();
                        const tagline = taglineField.textContent.trim() === '(none)' ? '' : taglineField.textContent.trim();
                        
                        try {
                            const response = await fetch(`/api/players/${uuid}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ productName, tagline })
                            });
                            
                            if (response.ok) {
                                playersStatus.textContent = 'Player updated successfully';
                                playersStatus.style.color = 'green';
                                loadPlayers(currentPlayersPage);
                            } else {
                                const error = await response.json();
                                playersStatus.textContent = `Error: ${error.error || 'Failed to update player'}`;
                                playersStatus.style.color = 'red';
                            }
                        } catch (error) {
                            playersStatus.textContent = 'Failed to update player';
                            playersStatus.style.color = 'red';
                        }
                    });
                });

                document.querySelectorAll('.cancel-player-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        loadPlayers(currentPlayersPage);
                    });
                });

                // Update pagination display
                if (playersPaginationInfo) {
                    const { page, totalPages, total } = playersPaginationInfo;
                    playersPagination.innerHTML = `Page ${page} of ${totalPages} (${total} total) `;
                    
                    // Clear existing pagination buttons
                    const existingButtons = playersPagination.querySelectorAll('button');
                    existingButtons.forEach(btn => btn.remove());
                    
                    if (page > 1) {
                        const prevBtn = document.createElement('button');
                        prevBtn.textContent = 'Previous';
                        prevBtn.style.marginLeft = '10px';
                        prevBtn.addEventListener('click', () => loadPlayers(page - 1));
                        playersPagination.appendChild(prevBtn);
                    }
                    
                    if (page < totalPages) {
                        const nextBtn = document.createElement('button');
                        nextBtn.textContent = 'Next';
                        nextBtn.style.marginLeft = '10px';
                        nextBtn.addEventListener('click', () => loadPlayers(page + 1));
                        playersPagination.appendChild(nextBtn);
                    }
                }

                playersLoading.style.display = 'none';
                playersTable.style.display = 'table';
            }
        } catch (error) {
            playersLoading.style.display = 'none';
            playersStatus.textContent = 'Error loading players';
            playersStatus.style.color = 'red';
        }
    }
});
