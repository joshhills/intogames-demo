document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const adminPanel = document.getElementById('admin-panel');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');

    const sendMotdBtn = document.getElementById('send-motd-btn');
    const motdInput = document.getElementById('motd-input');
    const motdStatus = document.getElementById('motd-status');

    const configForm = document.getElementById('config-form');
    const configStatus = document.getElementById('config-status');

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
            } else {
                loginError.textContent = 'Invalid username or password';
            }
        } catch (error) {
            loginError.textContent = 'Login request failed';
        }
    });

    // --- MOTD Logic ---
    sendMotdBtn.addEventListener('click', async () => {
        const message = motdInput.value;
        if (!message) return;
        
        motdStatus.textContent = 'Sending...';
        try {
            const response = await fetch('/api/motd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            if (response.ok) {
                motdStatus.textContent = 'Sent!';
                motdInput.value = '';
            } else {
                throw new Error('Failed to send');
            }
        } catch (error) {
            motdStatus.textContent = 'Error sending MOTD. Are you logged in?';
        }
    });

    // --- Config Logic ---
    async function loadGameConfig() {
        try {
            const response = await fetch('/api/game-config');
            if (!response.ok) throw new Error('Failed to load');
            const config = await response.json();
            
            // Populate form
            document.getElementById('easy-holeCount').value = config.easy.holeCount;
            document.getElementById('easy-spawnRate').value = config.easy.spawnRate;
            document.getElementById('easy-maxSpeed').value = config.easy.maxSpeed;
            document.getElementById('medium-holeCount').value = config.medium.holeCount;
            document.getElementById('medium-spawnRate').value = config.medium.spawnRate;
            document.getElementById('medium-maxSpeed').value = config.medium.maxSpeed;
            document.getElementById('hard-holeCount').value = config.hard.holeCount;
            document.getElementById('hard-spawnRate').value = config.hard.spawnRate;
            document.getElementById('hard-maxSpeed').value = config.hard.maxSpeed;
        } catch (error) {
            configStatus.textContent = 'Error loading config. Are you logged in?';
        }
    }

    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        configStatus.textContent = 'Saving...';

        const config = {
            easy: {
                holeCount: parseInt(document.getElementById('easy-holeCount').value),
                spawnRate: parseInt(document.getElementById('easy-spawnRate').value),
                maxSpeed: parseInt(document.getElementById('easy-maxSpeed').value),
            },
            medium: {
                holeCount: parseInt(document.getElementById('medium-holeCount').value),
                spawnRate: parseInt(document.getElementById('medium-spawnRate').value),
                maxSpeed: parseInt(document.getElementById('medium-maxSpeed').value),
            },
            hard: {
                holeCount: parseInt(document.getElementById('hard-holeCount').value),
                spawnRate: parseInt(document.getElementById('hard-spawnRate').value),
                maxSpeed: parseInt(document.getElementById('hard-maxSpeed').value),
            }
        };

        try {
            const response = await fetch('/api/game-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (response.ok) {
                configStatus.textContent = 'Config Saved!';
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            configStatus.textContent = 'Error saving config. Are you logged in?';
        }
    });
});
