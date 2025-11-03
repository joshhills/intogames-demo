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

    async function loadFlushInfo() {
        try {
            const response = await fetch('/api/leaderboard-flush-info');
            if (!response.ok) throw new Error('Failed to load');
            flushInfoData = await response.json();
            updateFlushInfoDisplay();
        } catch (error) {
            console.error('Error loading flush info:', error);
        }
    }

    function updateFlushInfoDisplay() {
        if (!flushInfoData) return;
        
        if (flushInfoData.lastFlush) {
            const lastFlushDate = new Date(flushInfoData.lastFlush);
            lastResetTime.textContent = lastFlushDate.toLocaleString();
            
            const now = Date.now();
            const flushIntervalMs = flushInfoData.flushIntervalMinutes * 60 * 1000;
            const nextFlush = flushInfoData.lastFlush + flushIntervalMs;
            const timeUntilFlush = nextFlush - now;
            
            if (timeUntilFlush <= 0) {
                nextResetTime.textContent = 'Resets soon...';
                // Reload flush info if time has elapsed (might have been auto-flushed)
                setTimeout(loadFlushInfo, 2000);
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
        // Load flush info once
        loadFlushInfo();
        
        // Then just update the display every second (no API calls)
        if (flushInfoInterval) {
            clearInterval(flushInfoInterval);
        }
        flushInfoInterval = setInterval(updateFlushInfoDisplay, 1000);
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
        const config = {};
        ['easy', 'medium', 'hard'].forEach(difficulty => {
            config[difficulty] = {
                holeCount: parseInt(document.getElementById(`${difficulty}-holeCount`).value),
                spawnRate: Math.round(1000 / parseFloat(document.getElementById(`${difficulty}-spawnRate`).value)),
                maxSpeed: parseFloat(document.getElementById(`${difficulty}-maxSpeed`).value),
                penalty: parseInt(document.getElementById(`${difficulty}-penalty`).value),
                defenseBonus: parseInt(document.getElementById(`${difficulty}-defenseBonus`).value),
                gameTimeSeconds: parseInt(document.getElementById(`${difficulty}-gameTimeSeconds`).value),
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
        
        for (const difficulty of ['easy', 'medium', 'hard']) {
            // Ensure original config has this difficulty
            if (!originalConfig[difficulty]) {
                return true; // If difficulty is missing, consider it changed
            }
            
            for (const field of ['holeCount', 'spawnRate', 'maxSpeed', 'penalty', 'defenseBonus', 'gameTimeSeconds']) {
                // Special handling for spawnRate (we convert it)
                if (field === 'spawnRate') {
                    const currentSpawnRate = Math.round(1000 / parseFloat(document.getElementById(`${difficulty}-spawnRate`).value));
                    const originalSpawnRate = originalConfig[difficulty].spawnRate;
                    if (currentSpawnRate !== originalSpawnRate) {
                        return true;
                    }
                } else if (field === 'maxSpeed') {
                    // Use tolerance for floating point comparison
                    const currentValue = current[difficulty][field];
                    const originalValue = originalConfig[difficulty][field] || 0;
                    if (!valuesEqual(currentValue, originalValue)) {
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
                ['holeCount', 'maxSpeed', 'penalty', 'defenseBonus', 'gameTimeSeconds'].forEach(field => {
                    const input = document.getElementById(`${difficulty}-${field}`);
                    if (!input) return;
                    
                    if (field === 'maxSpeed') {
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
            });
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
                    { id: `${difficulty}-gameTimeSeconds`, value: level.gameTimeSeconds || 60 }
                ];
                
                inputIds.forEach(({ id, value }) => {
                    const input = document.getElementById(id);
                    if (input) {
                        input.value = value;
                    }
                });
            });
            
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
                    gameTimeSeconds: 60
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
});
