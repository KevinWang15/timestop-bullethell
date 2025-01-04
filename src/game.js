// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#222222',
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            // Enable global world bounds event
            worldBounds: {
                x: 0,
                y: 0,
                width: 800,
                height: 600,
                bounce: false
            }
        }
    },
    scene: {
        preload: preload,    // Load assets
        create: create,      // Initialize game objects
        update: update       // Game loop
    }
};

// Initialize the Phaser game
const game = new Phaser.Game(config);

// Global variables
let player;
let cursors;
const maxSpeed = 200;          // Maximum speed of the player
const acceleration = 600;      // Acceleration rate (pixels per second squared)
const deceleration = 200;      // Deceleration rate (pixels per second squared)
let enemySpawnTimer;
let isTimeStopped = true; // Start with time stopped
let enemies;
let bullets;

// New global variable for managing the time stop delay
let timeStopTimer = null;

// Preload assets
function preload() {
    this.load.image('background', 'assets/sprites/background.png');
    this.load.image('player', 'assets/sprites/player.png');
    this.load.image('bullet', 'assets/sprites/bullet.png');
    this.load.image('enemy', 'assets/sprites/enemy.png');
}

// Create game objects
function create() {
    // Add background image
    this.add.image(400, 300, 'background')
        .setDisplaySize(800, 600)
        .setOrigin(0.5);

    // Create the player at the center bottom of the screen
    player = this.physics.add.sprite(400, 500, 'player')
        .setDisplaySize(20, 20)
        .setCollideWorldBounds(true);

    // Initialize player physics properties for smooth movement
    player.setMaxVelocity(maxSpeed);
    player.setDrag(deceleration); // Use the deceleration variable for drag

    // Set up cursor keys for player movement
    cursors = this.input.keyboard.createCursorKeys();

    // Initialize the bullets group with a maximum size
    bullets = this.physics.add.group({
        defaultKey: 'bullet',
        maxSize: 1000
    });

    // Initialize the enemies group
    enemies = this.physics.add.group();

    // Set up enemy spawn timer
    enemySpawnTimer = this.time.addEvent({
        delay: 1000,                // Spawn an enemy every second
        callback: spawnEnemy,
        callbackScope: this,
        loop: true,
        paused: isTimeStopped        // Start paused if time is stopped
    });

    // Set up collision detection between player and bullets
    this.physics.add.overlap(player, bullets, hitPlayer, null, this);

    // Set up a global worldbounds event listener
    this.physics.world.on('worldbounds', function(body) {
        const gameObject = body.gameObject;

        if (enemies.contains(gameObject)) {
            // Handle enemy going out of bounds
            if (gameObject.bulletTimer) {
                gameObject.bulletTimer.remove(false);
            }
            gameObject.destroy();
        } else if (bullets.contains(gameObject)) {
            // Handle bullet going out of bounds
            gameObject.disableBody(true, true);
        }
    });

    // Enable world bounds for existing enemies and bullets (if any)
    enemies.children.iterate(function(enemy) {
        enemy.body.onWorldBounds = true;
    });

    bullets.children.iterate(function(bullet) {
        bullet.body.onWorldBounds = true;
    });

    // Initialize the speedScale manager
    this.speedManager = { scale: 1 };
}

// Game loop: called every frame
function update(time, delta) {
    handlePlayerMovement.call(this); // Handle player input with acceleration
    handleTimeStop.call(this);       // Manage the time-stop mechanic

    // Update enemy movements based on speedScale
    enemies.getChildren().forEach(enemy => {
        enemy.y += enemy.speed * delta / 1000 * this.speedManager.scale;
    });

    // Update bullet movements by scaling their velocities
    bullets.getChildren().forEach(bullet => {
        if (bullet.originalVelocity) {
            bullet.setVelocity(
                bullet.originalVelocity.x * this.speedManager.scale,
                bullet.originalVelocity.y * this.speedManager.scale
            );
        }
    });
}

// Handle player movement based on cursor input with acceleration and deceleration
function handlePlayerMovement() {
    // Determine the direction based on input
    let moveX = 0;
    let moveY = 0;
    let isMoving = false;

    if (cursors.left.isDown) {
        moveX = -1;
        isMoving = true;
    } else if (cursors.right.isDown) {
        moveX = 1;
        isMoving = true;
    }

    if (cursors.up.isDown) {
        moveY = -1;
        isMoving = true;
    } else if (cursors.down.isDown) {
        moveY = 1;
        isMoving = true;
    }

    if (isMoving) {
        // Normalize the direction to prevent faster diagonal movement
        const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
        if (magnitude > 0) {
            moveX /= magnitude;
            moveY /= magnitude;
        }

        // Apply acceleration in the desired direction
        player.setAccelerationX(moveX * acceleration);
        player.setAccelerationY(moveY * acceleration);

        // Ensure time is running
        if (isTimeStopped) {
            isTimeStopped = false;
            handleTimeStop.call(this); // Resume game time
        }

        // If a timeStopTimer is active, cancel it since the player is moving
        if (timeStopTimer) {
            timeStopTimer.remove(false);
            timeStopTimer = null;
        }
    } else {
        // No input: remove acceleration to allow deceleration via drag
        player.setAccelerationX(0);
        player.setAccelerationY(0);

        // Optional: Manually set velocity to zero if it's very low to prevent sliding forever
        if (Math.abs(player.body.velocity.x) < 10) {
            player.setVelocityX(0);
        }
        if (Math.abs(player.body.velocity.y) < 10) {
            player.setVelocityY(0);
        }

        // If the player is not moving and no timer is set, start the delay timer
        if (!timeStopTimer) {
            timeStopTimer = this.time.delayedCall(300, () => {
                isTimeStopped = true;
                handleTimeStop.call(this); // Initiate pause with easing
                timeStopTimer = null; // Reset the timer reference
            }, [], this);
        }
    }
}

// Manage the time-stop mechanic by pausing or resuming enemy spawning and bullet timers with easing
function handleTimeStop() {
    if (!isTimeStopped) {
        // Resume time: Tween speedScale from current value to 1 with ease-in over 300ms
        this.tweens.add({
            targets: this.speedManager,
            scale: 1,
            duration: 300,
            ease: 'Power2.easeIn',
            onStart: () => {
                // Resume enemy spawn timer
                enemySpawnTimer.paused = false;

                // Resume all enemy bullet timers
                enemies.getChildren().forEach(enemy => {
                    if (enemy.bulletTimer) {
                        enemy.bulletTimer.paused = false;
                    }
                });
            },
            onComplete: () => {
                // Additional logic after resuming time can be added here
            }
        });
    } else {
        // Pause time: Tween speedScale from current value to 0 with ease-out over 300ms
        this.tweens.add({
            targets: this.speedManager,
            scale: 0,
            duration: 300,
            ease: 'Power2.easeOut',
            onStart: () => {
                // No immediate action needed at the start of pausing
            },
            onComplete: () => {
                // After tween completes, pause enemySpawnTimer and bulletTimers
                enemySpawnTimer.paused = true;

                enemies.getChildren().forEach(enemy => {
                    if (enemy.bulletTimer) {
                        enemy.bulletTimer.paused = true;
                    }
                });
            }
        });
    }
}

// Spawn an enemy at a random horizontal position at the top of the screen
function spawnEnemy() {
    if (isTimeStopped) return; // Do not spawn enemies if time is stopped

    const x = Phaser.Math.Between(50, 750); // Random x between 50 and 750
    const enemy = enemies.create(x, 50, 'enemy')
        .setDisplaySize(20, 20); // Create enemy
    enemy.speed = 50; // Set enemy speed (pixels per second)

    // Schedule bullet firing for this enemy
    const bulletTimer = this.time.addEvent({
        delay: 500, // Fire bullets every half second
        callback: () => shootBullets.call(this, enemy),
        callbackScope: this,
        loop: true,
        paused: isTimeStopped // Pause if time is stopped
    });

    // Associate the bulletTimer with the enemy for easy access
    enemy.bulletTimer = bulletTimer;

    // Enable world bounds for the enemy
    enemy.body.onWorldBounds = true;
}

// Shoot bullets in a circular pattern from the enemy's position
function shootBullets(enemy) {
    if (isTimeStopped) return; // Do not shoot bullets if time is stopped

    const numberOfBullets = 12;                   // Total bullets to fire
    const angleStep = 360 / numberOfBullets;      // Angle between each bullet

    for (let i = 0; i < numberOfBullets; i++) {
        const bullet = bullets.get(); // Get a bullet from the pool
        bullet.setDisplaySize(5, 10);

        if (bullet) {
            // Enable and position the bullet
            bullet.enableBody(true, enemy.x, enemy.y, true, true);
            bullet.setActive(true);
            bullet.setVisible(true);

            // Calculate velocity based on angle
            const angleDegrees = i * angleStep;
            const angleRadians = Phaser.Math.DegToRad(angleDegrees);
            const velocity = 300;
            const velocityX = Math.cos(angleRadians) * velocity;
            const velocityY = Math.sin(angleRadians) * velocity;

            bullet.setVelocity(velocityX, velocityY);

            // Store the original velocity for pausing and resuming
            bullet.originalVelocity = { x: velocityX, y: velocityY };

            // Rotate the bullet to align with its movement direction
            bullet.setRotation(angleRadians + Phaser.Math.DegToRad(90));

            // Set bullet to be destroyed when it leaves the screen
            bullet.setCollideWorldBounds(true);
            bullet.body.onWorldBounds = true;
        }
    }
}

// Handle collision between player and bullets
function hitPlayer(player, bullet) {
    // Stop all physics and show game over state
    this.physics.pause();
    player.setTint(0xff0000); // Change player color to red

    // Optionally, display a "Game Over" message or restart the game
    this.add.text(400, 300, 'Game Over', { fontSize: '64px', fill: '#ffffff' }).setOrigin(0.5);

    // Restart the game after a delay
    this.time.delayedCall(3000, () => {
        this.scene.restart();
        isTimeStopped = true; // Reset time state

        // Reset speedScale
        this.speedManager.scale = 1;
    }, [], this);
}
