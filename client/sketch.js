// Game logic and UI for Firewall Defense

let playerSprite;
let bugs;
let holes;
let gameState = 'PREGAME'; // PREGAME, MIDGAME, POSTGAME
let playerScore = 0;
let gameTimer = 60;
let playerColor = '#FFFFFF';
let currentDifficulty = 'medium';
let currentConfig = {};
let bugSpawnInterval;
let gameTimerInterval;
let bugsSpawned = 0;
let bugsReachedHoles = 0;

let setupComplete = false;

function setup() {
  if (typeof createCanvas === 'undefined') {
    console.error("p5.js not loaded. Check the index.html imports.");
    return;
  }
  
  if (setupComplete) {
    return;
  }
  
  const canvas = createCanvas(800, 600);
  canvas.parent('canvas-container');
  
  // Set up cursor visibility based on game state and mouse position
  const canvasElement = canvas.elt;
  
  // Function to update cursor based on current game state
  const updateCursor = () => {
    if (gameState === 'MIDGAME') {
      canvasElement.style.cursor = 'none';
    } else {
      canvasElement.style.cursor = 'default';
    }
  };
  
  canvasElement.addEventListener('mouseenter', updateCursor);
  canvasElement.addEventListener('mouseleave', () => {
    canvasElement.style.cursor = 'default';
  });
  
  // Store reference for state changes
  window.updateCursorVisibility = updateCursor;
  
  frameRate(60);
  
  // Configure world physics
  world.gravity.y = 0; // No gravity
  
  // Disable world boundaries collision globally - bugs should pass through
  // The world in p5.play might have boundaries, but we'll handle detection manually
  if (typeof world.boundaries !== 'undefined') {
    // Try to disable boundary collision for the world
    world.boundaries.forEach(boundary => {
      if (boundary) boundary.remove();
    });
  }
  
  playerSprite = new Sprite(width / 2, height / 2, 30, 30, 'kinematic');
  playerSprite.color = playerColor;
  playerSprite.collider = 'circle';
  playerSprite.shape = 'circle'; // Make player visually round
  playerSprite.mass = 1000; // High mass so player pushes bugs more effectively
  playerSprite.friction = 0;
  playerSprite.bounciness = 0; // Player doesn't bounce
  playerSprite.layer = 1; // Render player on top of holes
  // Kinematic sprites can still collide but won't be moved by physics
  // This allows the player to push bugs but maintain cursor control
  
  bugs = new Group();
  holes = new Group();
  
  // Create invisible boundary walls that bugs can pass through but player cannot
  // Actually, let's just allow bugs to pass through boundaries
  // We'll handle off-canvas detection manually
  
  document.getElementById('start-game-btn').addEventListener('click', startGame);
  document.getElementById('profile-save-btn').addEventListener('click', saveProfile);
  document.getElementById('start-game-btn').disabled = true;
  
  window.addEventListener('profileLoaded', (e) => {
    playerColor = e.detail.color;
    if (playerSprite) {
      playerSprite.color = playerColor;
      playerSprite.shape = 'circle'; // Ensure player stays round
    }
  });

  enrollAndLogin();
  loop(); // Keep loop running to show PREGAME screen
  updateUI();
  setupComplete = true;
}

function draw() {
  background(0, 10, 0);
  
  if (gameState === 'PREGAME') {
    // Cursor visibility handled by mouseenter/mouseleave events
    
    // Hide all game actors during pregame
    if (playerSprite) playerSprite.visible = false;
    for (let bug of bugs) bug.visible = false;
    for (let hole of holes) hole.visible = false;
    
    // Show waiting screen
    push();
    fill(0, 255, 0);
    textAlign(CENTER, CENTER);
    textSize(24);
    text('Waiting for game...', width / 2, height / 2);
    textSize(16);
    text('Click "Start Game" to begin', width / 2, height / 2 + 40);
    pop();
  } else if (gameState === 'MIDGAME') {
    // Cursor visibility handled by mouseenter/mouseleave events
    // Only hide when mouse is over canvas
    
    // Show all game actors during gameplay
    if (playerSprite) playerSprite.visible = true;
    for (let bug of bugs) bug.visible = true;
    for (let hole of holes) hole.visible = true;
    // Player always follows cursor smoothly (constrained to canvas)
    if (playerSprite) {
      const targetX = constrain(mouseX, 15, width - 15);
      const targetY = constrain(mouseY, 15, height - 15);
      // Use lerp for smooth movement - 0.3 gives nice smooth following without lag
      const smoothing = 0.25;
      playerSprite.x = lerp(playerSprite.x, targetX, smoothing);
      playerSprite.y = lerp(playerSprite.y, targetY, smoothing);
    }
    
    // Update bugs - apply steering towards nearest hole
    for (let bug of bugs) {
      // Always calculate desired direction towards hole
      const nearestHole = getNearestHole(bug);
      if (nearestHole) {
        // Calculate direction vector
        const dx = nearestHole.x - bug.x;
        const dy = nearestHole.y - bug.y;
        const distance = sqrt(dx * dx + dy * dy);
        
        if (distance > 1) {
          // Calculate desired velocity
          const desiredSpeed = (currentConfig.maxSpeed || 2) * (2 / bug.mass);
          const desiredVelocityX = (dx / distance) * desiredSpeed;
          const desiredVelocityY = (dy / distance) * desiredSpeed;
          
          // Apply steering with lower strength for more gradual acceleration
          // This makes bugs take longer to reach max speed, more realistic
          const steeringStrength = 0.1; // Reduced from 0.3 for slower acceleration
          bug.velocity.x += (desiredVelocityX - bug.velocity.x) * steeringStrength;
          bug.velocity.y += (desiredVelocityY - bug.velocity.y) * steeringStrength;
        }
      }
      
      // Draw warning indicator if bug is off-screen
      drawBugWarningIndicator(bug);
      
      // Prevent bugs from getting stuck at canvas edges
      // If bug is at edge and moving towards it, push it through
      if (bug._wasOnScreen && bug._ignoreBoundaries) {
        // Check if bug is stuck at an edge
        const atLeftEdge = bug.x <= 0 && bug.velocity.x < 0;
        const atRightEdge = bug.x >= width && bug.velocity.x > 0;
        const atTopEdge = bug.y <= 0 && bug.velocity.y < 0;
        const atBottomEdge = bug.y >= height && bug.velocity.y > 0;
        
        if (atLeftEdge || atRightEdge || atTopEdge || atBottomEdge) {
          // Push bug further off-screen to ensure it gets destroyed
          if (atLeftEdge) bug.velocity.x = -5;
          if (atRightEdge) bug.velocity.x = 5;
          if (atTopEdge) bug.velocity.y = -5;
          if (atBottomEdge) bug.velocity.y = 5;
        }
      }
      
      // Check if bug was pushed off canvas (but only if it was previously on-screen)
      if (!bug._wasOnScreen) {
        // Check if bug has entered the screen
        if (bug.x >= -50 && bug.x <= width + 50 && bug.y >= -50 && bug.y <= height + 50) {
          bug._wasOnScreen = true;
        }
      } else {
        // Only check for off-canvas removal if bug was previously on-screen
        // Use tighter bounds to catch bugs that are pushed off
        if (bug.x < -100 || bug.x > width + 100 || bug.y < -100 || bug.y > height + 100) {
          bug.remove();
          playerScore += currentConfig.defenseBonus || 5;
          console.log('Bug pushed off canvas! Score:', playerScore);
        }
      }
    }
    
    // Check player-bug collisions manually for reliable detection
    // collides() callback doesn't always work reliably with kinematic sprites
    for (let bug of bugs) {
      if (bug.removed) continue;
      
      // Calculate distance between player and bug
      const dx = bug.x - playerSprite.x;
      const dy = bug.y - playerSprite.y;
      const distance = sqrt(dx * dx + dy * dy);
      const collisionRadius = (playerSprite.w / 2) + (bug.w / 2);
      
      // If colliding, apply bounce
      if (distance < collisionRadius && distance > 0) {
        // Mark bug as having been on screen
        bug._wasOnScreen = true;
        
        // Normalize direction vector
        const normalizedX = dx / distance;
        const normalizedY = dy / distance;
        
        // Apply strong bounce velocity away from player
        const bounceSpeed = 50;
        bug.velocity.x = normalizedX * bounceSpeed;
        bug.velocity.y = normalizedY * bounceSpeed;
        
        bug.rotationSpeed = 0;
      }
    }
    
    // Check bug-hole collisions - check distance manually for more reliable detection
    for (let bug of bugs) {
      if (bug.removed || bug._hitHole) continue;
      
      for (let hole of holes) {
        const distance = dist(bug.x, bug.y, hole.x, hole.y);
        const collisionRadius = bug.w / 2 + hole.w / 2;
        
        // If bug is within collision radius of hole, remove it
        if (distance < collisionRadius) {
          bug._hitHole = true;
          bugsReachedHoles++; // Track bug that reached hole
          
          const penalty = currentConfig.penalty || 10;
          playerScore -= penalty; // Remove Math.max(0, playerScore) - allow negative scores
          
          console.log('Bug hit hole! Penalty:', penalty, 'New score:', playerScore);
          
          bug.remove();
          
          // Visual feedback
          hole.scale = 1.2;
          hole.color = '#FF0000';
          setTimeout(() => {
            if (!hole.removed) {
              hole.scale = 1;
              hole.color = '#500050';
            }
          }, 150);
          
          break; // Only remove one bug per hole per frame
        }
      }
    }
  } else if (gameState === 'POSTGAME') {
    // Cursor visibility handled by mouseenter/mouseleave events
    
    // Hide all game actors during postgame
    if (playerSprite) playerSprite.visible = false;
    for (let bug of bugs) bug.visible = false;
    for (let hole of holes) hole.visible = false;
    
    // Stop all bugs from moving
    for (let bug of bugs) {
      bug.velocity.x = 0;
      bug.velocity.y = 0;
    }
    
    // Show game ended screen
    push();
    fill(0, 255, 0);
    textAlign(CENTER, CENTER);
    textSize(24);
            text('Game Ended!', width / 2, height / 2 - 40);
            textSize(20);
            text(`Final Score: ${playerScore.toLocaleString('en-US')}`, width / 2, height / 2);
            textSize(16);
    text('Click "Start Game" to play again', width / 2, height / 2 + 40);
    pop();
  }
  
  updateUI();
}

function getNearestHole(bug) {
  if (holes.length === 0) return null;
  
  let nearest = holes[0];
  let minDist = Infinity;
  
  for (let hole of holes) {
    const distance = dist(bug.x, bug.y, hole.x, hole.y);
    if (distance < minDist) {
      minDist = distance;
      nearest = hole;
    }
  }
  
  return nearest;
}

function drawBugWarningIndicator(bug) {
  if (bug.x >= 0 && bug.x <= width && bug.y >= 0 && bug.y <= height) {
    return; // Bug is on screen, no indicator needed
  }
  
  // Calculate direction from bug to canvas center
  const centerX = width / 2;
  const centerY = height / 2;
  const dx = bug.x - centerX;
  const dy = bug.y - centerY;
  
  // Determine which edge the bug is approaching from
  let edgeX, edgeY;
  
  if (abs(dx) > abs(dy)) {
    // Horizontal edge
    edgeX = dx > 0 ? width : 0;
    edgeY = constrain(bug.y, 0, height);
  } else {
    // Vertical edge
    edgeX = constrain(bug.x, 0, width);
    edgeY = dy > 0 ? height : 0;
  }
  
  // Draw indicator arrow/triangle at edge
  push();
  stroke(255, 0, 0, 200);
  strokeWeight(3);
  fill(255, 0, 0, 100);
  
  const size = 15;
  const angle = atan2(bug.y - edgeY, bug.x - edgeX);
  
  translate(edgeX, edgeY);
  rotate(angle);
  
  triangle(0, 0, -size, -size/2, -size, size/2);
  
  pop();
}

function spawnBug() {
  // Determine spawn side (0=top, 1=right, 2=bottom, 3=left)
  const side = floor(random(4));
  let x, y;
  
  switch(side) {
    case 0: // Top
      x = random(width);
      y = -100;
      break;
    case 1: // Right
      x = width + 100;
      y = random(height);
      break;
    case 2: // Bottom
      x = random(width);
      y = height + 100;
      break;
    case 3: // Left
      x = -100;
      y = random(height);
      break;
  }
  
  bugsSpawned++; // Track bug spawned
  const bug = new bugs.Sprite(x, y, 20, 20, 'dynamic');
  bug.color = '#FF0000';
  bug.collider = 'circle';
  bug.mass = random(2, 4); // Increased mass for slower acceleration
  bug.rotationSpeed = 0;
  bug.friction = 0.1; // Slightly more friction for smoother deceleration
  bug.bounciness = 0.9; // High bounciness
  bug.damping = 0.98; // Add damping to gradually reduce velocity (more realistic)
  bug._wasOnScreen = false; // Track if bug has entered screen
  
  // Disable collision with world boundaries - try multiple methods
  if (typeof bug.collideWorldBounds !== 'undefined') {
    bug.collideWorldBounds = false;
  }
  // Also try to prevent boundary collisions through the physics body
  if (bug.body && typeof bug.body.setCollisionCategory === 'function') {
    // Set to ignore boundaries if possible
    bug.body.setCollisionCategory(2); // Different category might help
  }
  
  // Manually prevent bugs from bouncing off canvas edges
  // We'll check position and push them further if they're stuck at edges
  bug._ignoreBoundaries = true;
}

function startGame() {
  // Update cursor when game starts
  if (window.updateCursorVisibility) {
    window.updateCursorVisibility();
  }
  currentDifficulty = document.getElementById('difficulty').value;
  currentConfig = gameConfig[currentDifficulty];
  
  if (!currentConfig) {
    showNotification("Error: Game config not loaded! Please reload.");
    return;
  }
  
  playerScore = 0;
  gameTimer = currentConfig.gameTimeSeconds || 60;
  gameState = 'MIDGAME';
  
  // Reset success ratio tracking
  bugsSpawned = 0;
  bugsReachedHoles = 0;
  
  // Clear old game objects
  bugs.removeAll();
  holes.removeAll();
  
  // Ensure player is visible when starting game
  if (playerSprite) playerSprite.visible = true;
  
  // Reset player position
  playerSprite.x = width / 2;
  playerSprite.y = height / 2;
  
  // Spawn holes based on config
  const holeCount = currentConfig.holeCount || 1;
  const INSET = 100;
  
  for (let i = 0; i < holeCount; i++) {
    let placed = false;
    let attempts = 0;
    
    while (!placed && attempts < 20) {
      attempts++;
      const x = random(INSET, width - INSET);
      const y = random(INSET, height - INSET);
      
      // Check distance from other holes
      let tooClose = false;
      for (let otherHole of holes) {
        if (dist(x, y, otherHole.x, otherHole.y) < 120) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        // Make hole bigger than player (player is 30x30, hole should be bigger)
        const holeSize = 50; // Bigger than player's 30 size
        const hole = new holes.Sprite(x, y, holeSize, holeSize, 'static');
        hole.color = '#500050';
        hole.collider = 'circle';
        hole.shape = 'circle';
        hole.layer = 0; // Holes render below player
        placed = true;
      }
    }
  }
  
  // Start game loop
  loop();
  
  // Start bug spawning
  const spawnRate = currentConfig.spawnRate || 1000;
  bugSpawnInterval = setInterval(spawnBug, spawnRate);
  
  // Start timer
  gameTimerInterval = setInterval(() => {
    gameTimer--;
    if (gameTimer <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  gameState = 'POSTGAME';
  // Update cursor when game ends
  if (window.updateCursorVisibility) {
    window.updateCursorVisibility();
  }
  
  clearInterval(bugSpawnInterval);
  clearInterval(gameTimerInterval);
  
  noLoop();
  
  // Calculate success ratio (percentage of bugs prevented from reaching holes)
  const successRatio = bugsSpawned > 0 
    ? ((bugsSpawned - bugsReachedHoles) / bugsSpawned) * 100 
    : 100; // If no bugs spawned, consider it 100% success
  
  submitMatchScore(playerScore, currentDifficulty, successRatio);
  
  // Resume loop to show POSTGAME screen
  loop();
  
  // Don't auto-reset - let user refresh browser to play again
}

function updateUI() {
  const statusEl = document.getElementById('game-status');
  const scoreEl = document.getElementById('local-score');
  const timerEl = document.getElementById('game-timer');
  const startBtn = document.getElementById('start-game-btn');
  const diffSelect = document.getElementById('difficulty-selector');
  
  if (gameState === 'PREGAME') {
    statusEl.textContent = 'Waiting for game...';
    statusEl.style.display = 'block';
    scoreEl.style.display = 'none';
    timerEl.style.display = 'none';
    startBtn.style.display = 'block';
    diffSelect.style.display = 'block';
        } else if (gameState === 'MIDGAME') {
            statusEl.textContent = `State: ${gameState}`;
            statusEl.style.display = 'block';
            scoreEl.textContent = `Score: ${playerScore.toLocaleString('en-US')}`;
            scoreEl.style.display = 'block';
            timerEl.textContent = `Time: ${gameTimer}`;
            timerEl.style.display = 'block';
    startBtn.style.display = 'none';
    diffSelect.style.display = 'none';
          } else if (gameState === 'POSTGAME') {
            statusEl.textContent = `Game ended! Final Score: ${playerScore.toLocaleString('en-US')}`;
            statusEl.style.display = 'block';
    scoreEl.style.display = 'none'; // Hide score during postgame
    timerEl.style.display = 'none'; // Hide timer during postgame
    startBtn.style.display = 'block'; // Show start button to replay
    diffSelect.style.display = 'block'; // Allow selecting difficulty for next game
  }
}

// Removed click-to-destroy functionality - bugs now bounce via physics collisions only
