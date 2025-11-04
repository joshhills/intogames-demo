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
let bugsKilled = 0; // Bugs pushed off screen

// Adblock ability state
let adblockLevel = 100; // 0-100, starts at 100 (full)
let isAdblockActive = false;
let adblockCanUse = true; // Can only use when full, must regenerate fully after use
let normalPlayerSize = 30;
let enlargedPlayerSize = 65;

// Antivirus trap state
const MAX_TRAPS = 3; // Hardcoded max traps
let trapInventory = 0; // Current inventory (0-3)
let placedTraps = []; // Array of {x, y, placedTime, hitCount, size}
let trapTimeout = 5000; // Milliseconds (from config)
let trapDurability = 1; // Hits before disappearing (from config)
let trapShrinkPercent = 0; // Percent size reduction per hit (from config, 0-100)

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
      if (trapInventory > 0) {
        canvasElement.style.cursor = 'crosshair'; // Show crosshair when traps are available
      } else {
        canvasElement.style.cursor = 'none';
      }
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
  
  // Trap placement on canvas click
  canvasElement.addEventListener('click', (e) => {
    if (gameState === 'MIDGAME' && trapInventory > 0) {
      const x = mouseX;
      const y = mouseY;
      
      // Place trap at mouse position
      placedTraps.push({
        x: x,
        y: y,
        placedTime: Date.now(),
        hitCount: 0,
        size: 50 // Starting size
      });
      
      trapInventory--;
      console.log('Trap placed! Remaining:', trapInventory);
      
      // Update cursor after placing trap (hide if no traps left, show crosshair if still have traps)
      if (window.updateCursorVisibility) {
        window.updateCursorVisibility();
      }
    }
  });
  
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
  playerSprite.color = '#00FF00'; // Always green fill
  playerSprite.collider = 'circle';
  playerSprite.shape = 'circle'; // Make player visually round
  playerSprite.mass = 1000; // High mass so player pushes bugs more effectively
  playerSprite.friction = 0;
  playerSprite.bounciness = 0; // Player doesn't bounce
  playerSprite.layer = 1; // Render player on top of holes
  // We'll draw the outline manually in draw()
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
  
  // Adblock ability - Shift key listener
  let shiftPressed = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift' && gameState === 'MIDGAME') {
      shiftPressed = true;
    }
  });
  
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      shiftPressed = false;
    }
  });
  
  // Store shiftPressed in a global that draw() can access
  window.shiftPressed = () => shiftPressed;
  
  window.addEventListener('profileLoaded', (e) => {
    playerColor = e.detail.color || '#FFFFFF'; // Store for outline color
    // Player sprite fill stays green, outline uses playerColor
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
    // Note: playerSprite.visible will be set to false after manual drawing, but sprite still exists for collisions
    for (let bug of bugs) bug.visible = true;
    // Hide holes from p5.play's automatic rendering - we'll draw them manually
    for (let hole of holes) {
      hole.visible = false; // Hide so p5.play doesn't draw it
    }
    // Player always follows cursor smoothly (constrained to canvas)
    if (playerSprite) {
      const targetX = constrain(mouseX, 15, width - 15);
      const targetY = constrain(mouseY, 15, height - 15);
      // Use lerp for smooth movement - 0.3 gives nice smooth following without lag
      const smoothing = 0.25;
      playerSprite.x = lerp(playerSprite.x, targetX, smoothing);
      playerSprite.y = lerp(playerSprite.y, targetY, smoothing);
      
      // Update player size based on adblock state
      updateAdblockAbility();
      if (isAdblockActive) {
        playerSprite.w = enlargedPlayerSize;
        playerSprite.h = enlargedPlayerSize;
      } else {
        playerSprite.w = normalPlayerSize;
        playerSprite.h = normalPlayerSize;
      }
      
      // Hide the default sprite rendering (we'll draw manually later)
      playerSprite.visible = false;
    } else {
      // Make sprite visible when not in gameplay (handled elsewhere)
      if (playerSprite) playerSprite.visible = true;
    }
    
    // Update bugs - apply steering towards nearest hole
    // (Holes are drawn automatically by p5.play here)
    
    // Draw traps (before player so player appears on top)
    updateTraps();
    drawTraps();
    
    // Draw player manually AFTER holes so player appears on top
    if (playerSprite && gameState === 'MIDGAME') {
      push();
      // Draw green fill
      fill(0, 255, 0);
      noStroke();
      circle(playerSprite.x, playerSprite.y, playerSprite.w);
      
      // Draw colored outline
      stroke(playerColor);
      strokeWeight(3);
      noFill();
      circle(playerSprite.x, playerSprite.y, playerSprite.w);
      pop();
    }
    
    // Draw adblock bar UI
    drawAdblockBar();
    
    // Draw trap inventory UI
    drawTrapInventory();
    
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
        // Use bounds that account for further spawn distance
        if (bug.x < -150 || bug.x > width + 150 || bug.y < -150 || bug.y > height + 150) {
        // If bug was trap-granting, add to inventory (if not full)
        if (bug._isTrapGranting && trapInventory < MAX_TRAPS) {
          trapInventory++;
          console.log('Trap-granting bug killed! Traps:', trapInventory);
          // Update cursor to show crosshair if traps available
          if (window.updateCursorVisibility) {
            window.updateCursorVisibility();
          }
        }
          bug.remove();
          bugsKilled++; // Track bug killed
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
        // Multiply bounce force when adblock is active
        const baseBounceSpeed = 50;
        const bounceSpeed = isAdblockActive ? baseBounceSpeed * 1.75 : baseBounceSpeed;
        bug.velocity.x = normalizedX * bounceSpeed;
        bug.velocity.y = normalizedY * bounceSpeed;
        
        bug.rotationSpeed = 0;
      }
    }
    
    // Update holes - wandering logic if enabled
    if (currentConfig.holesWander) {
      for (let hole of holes) {
        if (hole.removed) continue;
        
        // Initialize velocity if not set
        if (hole.velocity === undefined || (hole.velocity.x === 0 && hole.velocity.y === 0)) {
          // Random initial direction
          const angle = random(0, TWO_PI);
          const speed = 0.75; // Slower constant speed for holes
          hole.velocity.x = cos(angle) * speed;
          hole.velocity.y = sin(angle) * speed;
        }
        
        // No friction - maintain speed
        hole.friction = 0;
        
        // Inner padding to prevent holes from being at the very edge
        // This prevents bugs from spawning off-screen and immediately hitting holes
        const padding = 80; // Padding from edges
        
        // Bounce off walls (with padding)
        if (hole.x <= hole.w / 2 + padding && hole.velocity.x < 0) {
          hole.velocity.x = -hole.velocity.x;
        }
        if (hole.x >= width - hole.w / 2 - padding && hole.velocity.x > 0) {
          hole.velocity.x = -hole.velocity.x;
        }
        if (hole.y <= hole.h / 2 + padding && hole.velocity.y < 0) {
          hole.velocity.y = -hole.velocity.y;
        }
        if (hole.y >= height - hole.h / 2 - padding && hole.velocity.y > 0) {
          hole.velocity.y = -hole.velocity.y;
        }
        
        // Update position
        hole.x += hole.velocity.x;
        hole.y += hole.velocity.y;
        
        // Ensure holes stay within bounds (with padding)
        hole.x = constrain(hole.x, hole.w / 2 + padding, width - hole.w / 2 - padding);
        hole.y = constrain(hole.y, hole.h / 2 + padding, height - hole.h / 2 - padding);
      }
      
      // Check hole-to-hole collisions (bounce off each other)
      for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
          const hole1 = holes[i];
          const hole2 = holes[j];
          if (hole1.removed || hole2.removed) continue;
          
          const dx = hole2.x - hole1.x;
          const dy = hole2.y - hole1.y;
          const distance = sqrt(dx * dx + dy * dy);
          const collisionRadius = (hole1.w / 2) + (hole2.w / 2);
          
          if (distance < collisionRadius && distance > 0) {
            // Normalize direction
            const normalizedX = dx / distance;
            const normalizedY = dy / distance;
            
            // Swap velocities for elastic collision (simplified)
            // Both holes maintain their speed, just change direction
            const speed1 = sqrt(hole1.velocity.x * hole1.velocity.x + hole1.velocity.y * hole1.velocity.y);
            const speed2 = sqrt(hole2.velocity.x * hole2.velocity.x + hole2.velocity.y * hole2.velocity.y);
            
            // Reflect velocities along the collision normal
            hole1.velocity.x = -normalizedX * speed1;
            hole1.velocity.y = -normalizedY * speed1;
            hole2.velocity.x = normalizedX * speed2;
            hole2.velocity.y = normalizedY * speed2;
            
            // Separate holes to prevent overlap
            const overlap = collisionRadius - distance;
            hole1.x -= normalizedX * overlap / 2;
            hole1.y -= normalizedY * overlap / 2;
            hole2.x += normalizedX * overlap / 2;
            hole2.y += normalizedY * overlap / 2;
          }
        }
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
    
    // Draw holes manually BEFORE player (so player appears on top)
    // This ensures proper rendering order since p5.play draws sprites after draw() completes
    for (let hole of holes) {
      if (!hole.removed) {
        push();
        fill(hole.color || '#500050');
        noStroke();
        circle(hole.x, hole.y, hole.w);
        pop();
      }
    }
    
    // Draw player manually AFTER holes
    // This ensures player appears on top of holes
    if (playerSprite && gameState === 'MIDGAME') {
      push();
      // Draw green fill
      fill(0, 255, 0);
      noStroke();
      circle(playerSprite.x, playerSprite.y, playerSprite.w);
      
      // Draw colored outline
      stroke(playerColor);
      strokeWeight(3);
      noFill();
      circle(playerSprite.x, playerSprite.y, playerSprite.w);
      pop();
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

// Track last update time for deltaTime calculation
let lastAdblockUpdateTime = 0;

function updateAdblockAbility() {
  if (gameState !== 'MIDGAME') return;
  
  const depletionRate = currentConfig.adblockDepletionRate || 20; // Percentage per second
  const regenerationRate = currentConfig.adblockRegenerationRate || 10; // Percentage per second
  
  const now = Date.now();
  
  // Calculate actual frame time (deltaTime in seconds)
  let deltaTime = 0;
  if (lastAdblockUpdateTime > 0) {
    deltaTime = (now - lastAdblockUpdateTime) / 1000; // Convert milliseconds to seconds
  } else {
    // First frame - initialize the timer
    lastAdblockUpdateTime = now;
    return; // Skip first frame to establish baseline
  }
  
  // Skip update if deltaTime is too large (e.g., tab was inactive) to prevent huge jumps
  if (deltaTime > 0.2) {
    // Tab was inactive - reset timer
    lastAdblockUpdateTime = now;
    return;
  }
  
  // Update timer for next frame
  lastAdblockUpdateTime = now;
  
  const shiftPressed = window.shiftPressed ? window.shiftPressed() : false;
  
  // Check if adblock can be used (only when full)
  if (adblockLevel >= 100) {
    adblockCanUse = true;
  }
  
  // If shift is pressed and we're currently using adblock, continue using it
  // (allows continuous use until shift is released or bar is depleted)
  if (shiftPressed && isAdblockActive && adblockLevel > 0) {
    // Continue active use - keep depleting
    isAdblockActive = true;
    
    const depletionAmount = depletionRate * deltaTime;
    adblockLevel = max(0, adblockLevel - depletionAmount);
    
    // Mark as unusable after we start using it (can't restart until fully regenerated)
    if (adblockLevel < 100) {
      adblockCanUse = false;
    }
    
    // If depleted, deactivate
    if (adblockLevel <= 0) {
      isAdblockActive = false;
      adblockLevel = 0;
      adblockCanUse = false; // Must regenerate fully before use
    }
  }
  // If shift is pressed but we're not currently active, check if we can start
  else if (shiftPressed && adblockCanUse && adblockLevel >= 100) {
    // Start new adblock activation - can only start when full
    isAdblockActive = true;
    
    const depletionAmount = depletionRate * deltaTime;
    adblockLevel = max(0, adblockLevel - depletionAmount);
    
    // Mark as unusable once we start using it
    if (adblockLevel < 100) {
      adblockCanUse = false;
    }
    
    // If depleted immediately, deactivate
    if (adblockLevel <= 0) {
      isAdblockActive = false;
      adblockLevel = 0;
      adblockCanUse = false;
    }
  }
  // Shift not pressed or can't use - deactivate and regenerate
  else {
    // Deactivate adblock
    isAdblockActive = false;
    
    // Regenerate if not at full
    if (adblockLevel < 100) {
      const regenerationAmount = regenerationRate * deltaTime;
      adblockLevel = min(100, adblockLevel + regenerationAmount);
      
      // Once fully regenerated, can use again
      if (adblockLevel >= 100) {
        adblockLevel = 100; // Ensure it's exactly 100
        adblockCanUse = true;
      }
    }
  }
}

function updateTraps() {
  if (gameState !== 'MIDGAME') return;
  
  const now = Date.now();
  
  // Remove expired traps
  placedTraps = placedTraps.filter(trap => {
    const age = now - trap.placedTime;
    return age < trapTimeout;
  });
  
  // Check trap-bug collisions
  for (let i = placedTraps.length - 1; i >= 0; i--) {
    const trap = placedTraps[i];
    const trapRadius = trap.size / 2; // Use trap's current size
    
    for (let bug of bugs) {
      if (bug.removed) continue;
      
      const dx = bug.x - trap.x;
      const dy = bug.y - trap.y;
      const distance = sqrt(dx * dx + dy * dy);
      
      if (distance < trapRadius + (bug.w / 2)) {
        // Trap kills bug
        console.log('Bug killed by trap!');
        
        // Check if bug was trap-granting BEFORE removing it
        const wasTrapGranting = bug._isTrapGranting;
        
        bug.remove();
        bugsKilled++;
        playerScore += currentConfig.defenseBonus || 5;
        
        // If bug was trap-granting, add to inventory (if not full)
        if (wasTrapGranting && trapInventory < MAX_TRAPS) {
          trapInventory++;
          console.log('Trap-granting bug killed! Traps:', trapInventory);
        }
        
        // Increment trap hit count
        trap.hitCount++;
        
        // Apply size shrinkage
        if (trapShrinkPercent > 0) {
          trap.size = max(10, trap.size * (1 - trapShrinkPercent / 100)); // Minimum size of 10
        }
        
        // Remove trap if it has exceeded durability
        if (trap.hitCount >= trapDurability) {
          placedTraps.splice(i, 1);
          break; // Trap is destroyed, move to next trap
        }
      }
    }
  }
}

function drawTraps() {
  if (gameState !== 'MIDGAME') return;
  
  for (let trap of placedTraps) {
    const now = Date.now();
    const age = now - trap.placedTime;
    const remainingTime = trapTimeout - age;
    const alpha = map(remainingTime, 0, trapTimeout, 0, 255); // Fade out as time expires
    
    push();
    fill(0, 255, 255, alpha); // Cyan color for traps
    stroke(0, 200, 200, alpha);
    strokeWeight(2);
    circle(trap.x, trap.y, trap.size); // Draw trap circle using current size
    
    // Draw inner pulsing effect
    fill(0, 255, 255, alpha * 0.3);
    noStroke();
    const pulseSize = (trap.size * 0.6) + sin(frameCount * 0.1) * 5;
    circle(trap.x, trap.y, pulseSize);
    pop();
  }
}

function drawTrapInventory() {
  if (gameState !== 'MIDGAME') return;
  
  // Draw trap inventory below adblock bar
  const barX = 20;
  const barY = height - 60;
  const inventoryY = barY + 30;
  
  push();
  fill(0, 255, 0);
  textAlign(LEFT, CENTER);
  textSize(14);
  text(`Traps: ${trapInventory}/${MAX_TRAPS}`, barX, inventoryY);
  
  // Show click instruction if traps available
  if (trapInventory > 0) {
    textSize(12);
    fill(0, 255, 255); // Cyan color to match trap theme
    text('Click to place trap', barX, inventoryY + 20);
  }
  pop();
  
  // Draw trap placement indicator at mouse position when traps are available
  if (trapInventory > 0 && mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    push();
    // Draw pulsing crosshair/target indicator
    const pulseSize = 20 + sin(frameCount * 0.2) * 5;
    const alpha = 150 + sin(frameCount * 0.3) * 50;
    
    stroke(0, 255, 255, alpha); // Cyan color
    strokeWeight(2);
    noFill();
    
    // Draw crosshair
    line(mouseX - pulseSize, mouseY, mouseX + pulseSize, mouseY);
    line(mouseX, mouseY - pulseSize, mouseX, mouseY + pulseSize);
    
    // Draw outer circle
    circle(mouseX, mouseY, pulseSize * 1.5);
    
    // Draw inner dot
    fill(0, 255, 255, alpha * 0.5);
    noStroke();
    circle(mouseX, mouseY, 4);
    
    pop();
  }
}

function drawAdblockBar() {
  if (gameState !== 'MIDGAME') return;
  
  const barWidth = 200;
  const barHeight = 20;
  const barX = width / 2 - barWidth / 2;
  const barY = height - 40;
  
  // Draw background
  fill(50, 50, 50, 200);
  rect(barX, barY, barWidth, barHeight, 5);
  
  // Draw fill based on adblock level
  const fillWidth = (adblockLevel / 100) * barWidth;
  if (isAdblockActive) {
    fill(255, 200, 0, 220); // Yellow when active
  } else if (!adblockCanUse || adblockLevel < 100) {
    fill(150, 150, 150, 220); // Gray when regenerating (can't use)
  } else {
    fill(0, 200, 255, 220); // Cyan when fully charged and ready to use
  }
  rect(barX, barY, fillWidth, barHeight, 5);
  
  // Draw border
  stroke(255, 255, 255, 200);
  strokeWeight(2);
  noFill();
  rect(barX, barY, barWidth, barHeight, 5);
  noStroke();
  
  // Draw label
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(12);
  let label = 'Adblock (Shift)';
  if (isAdblockActive) {
    label = 'ADBLOCK ACTIVE (Shift)';
  } else if (!adblockCanUse || adblockLevel < 100) {
    label = 'Regenerating...';
  } else {
    label = 'Adblock Ready (Shift)';
  }
  text(label, width / 2, barY - 15);
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
  // Calculate max trap-granting enemies that can spawn
  const trapGrantingEnemiesOnScreen = bugs.filter(bug => bug._isTrapGranting && !bug.removed).length;
  const totalTrapsOnStage = trapInventory + placedTraps.length + trapGrantingEnemiesOnScreen;
  const canSpawnTrapGranting = totalTrapsOnStage < MAX_TRAPS && trapInventory < MAX_TRAPS;
  
  // Determine if this bug should be trap-granting
  const trapChance = currentConfig.trapGrantingEnemyChance || 0;
  const shouldBeTrapGranting = canSpawnTrapGranting && random(100) < trapChance;
  
  // Determine spawn side (0=top, 1=right, 2=bottom, 3=left)
  const side = floor(random(4));
  let x, y;
  
  switch(side) {
    case 0: // Top
      x = random(width);
      y = -150; // Further off-screen for more lead-in time
      break;
    case 1: // Right
      x = width + 150; // Further off-screen for more lead-in time
      y = random(height);
      break;
    case 2: // Bottom
      x = random(width);
      y = height + 150; // Further off-screen for more lead-in time
      break;
    case 3: // Left
      x = -150; // Further off-screen for more lead-in time
      y = random(height);
      break;
  }
  
  bugsSpawned++; // Track bug spawned
  const bug = new bugs.Sprite(x, y, 20, 20, 'dynamic');
  
  // Visual distinction for trap-granting enemies (slightly different color)
  if (shouldBeTrapGranting) {
    bug.color = '#FF6600'; // Orange color for trap-granting enemies
    bug._isTrapGranting = true; // Mark as trap-granting
  } else {
    bug.color = '#FF0000'; // Regular red
    bug._isTrapGranting = false;
  }
  
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
  bugsKilled = 0;
  
  // Reset adblock ability
  adblockLevel = 100;
  isAdblockActive = false;
  adblockCanUse = true; // Can use immediately at start
  lastAdblockUpdateTime = 0; // Reset timing tracker
  
  // Reset trap state
  trapInventory = 0;
  placedTraps = [];
  trapTimeout = gameConfig.trapTimeout || 5000; // Load from config
  trapDurability = gameConfig.trapDurability || 1; // Load from config
  trapShrinkPercent = gameConfig.trapShrinkPercent || 0; // Load from config
  
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
        const hole = new holes.Sprite(x, y, holeSize, holeSize, currentConfig.holesWander ? 'dynamic' : 'static');
        hole.color = '#500050';
        hole.collider = 'circle';
        hole.shape = 'circle';
        hole.layer = 0; // Holes render below player
        
        // If wandering, set up physics properties
        if (currentConfig.holesWander) {
          hole.friction = 0; // No friction to maintain speed
          hole.bounciness = 1; // Full bounce
          hole.mass = 1;
          // Don't bounce off player or bugs (set up collision groups if needed)
          // For now, we handle collisions manually in draw()
        }
        
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
  
  submitMatchScore(playerScore, currentDifficulty, successRatio, bugsKilled, bugsReachedHoles);
  
  // Resume loop to show POSTGAME screen
  loop();
  
  // Don't auto-reset - let user refresh browser to play again
}

function updateUI() {
  // Get UI elements
  const bugsKilledEl = document.getElementById('bugs-killed');
  const bugsExploitedEl = document.getElementById('bugs-exploited');
  const bugsStatsEl = document.getElementById('bugs-stats');
  const statusEl = document.getElementById('game-status');
  const scoreEl = document.getElementById('local-score');
  const timerEl = document.getElementById('game-timer');
  const startBtn = document.getElementById('start-game-btn');
  const diffSelect = document.getElementById('difficulty-selector');
  
  if (gameState === 'PREGAME') {
    // Pre-game: hide bug stats (useless when both are 0), show waiting message
    statusEl.textContent = 'Waiting for game...';
    statusEl.style.display = 'block';
    scoreEl.style.display = 'none';
    timerEl.style.display = 'none';
    if (bugsStatsEl) {
      bugsStatsEl.style.display = 'none'; // Hide bug stats pre-game
    }
    startBtn.style.display = 'block';
    diffSelect.style.display = 'block';
  } else if (gameState === 'MIDGAME') {
    // Mid-game: hide status (no need to show "State: MIDGAME"), show score and timer, show bug stats
    statusEl.style.display = 'none'; // Hide status during gameplay
    scoreEl.textContent = `Score: ${playerScore.toLocaleString('en-US')}`;
    scoreEl.style.display = 'block';
    timerEl.textContent = `Time: ${gameTimer}`;
    timerEl.style.display = 'block';
    if (bugsStatsEl) {
      bugsStatsEl.style.display = 'block'; // Show bug stats during gameplay
    }
    if (bugsKilledEl) {
      bugsKilledEl.textContent = `Bugs Squashed: ${bugsKilled}`;
    }
    if (bugsExploitedEl) {
      bugsExploitedEl.textContent = `Bugs Let In: ${bugsReachedHoles}`;
    }
    startBtn.style.display = 'none';
    diffSelect.style.display = 'none';
  } else if (gameState === 'POSTGAME') {
    // Post-game: hide status (already shown in-canvas), hide bug stats, show start button
    statusEl.style.display = 'none'; // Hide status - redundant (shown in-canvas)
    scoreEl.style.display = 'none';
    timerEl.style.display = 'none';
    if (bugsStatsEl) {
      bugsStatsEl.style.display = 'none'; // Hide bug stats post-game (info already shown in-canvas)
    }
    startBtn.style.display = 'block';
    diffSelect.style.display = 'block';
  }
}

// Removed click-to-destroy functionality - bugs now bounce via physics collisions only
