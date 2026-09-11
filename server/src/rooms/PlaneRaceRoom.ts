import { Room, Client, ServerError } from "colyseus";
import { PlaneRaceState, Player, Coin, Enemy, Bullet } from "./schema/PlaneRaceState";
import { authenticateBaknusUser, BaknusUser } from "../auth/baknusAuth";

interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  shoot: boolean;
}

export class PlaneRaceRoom extends Room<PlaneRaceState> {
  maxClients = 5;

  private playerInputs: Map<string, PlayerInput> = new Map();
  private lastShootTimes: Map<string, number> = new Map();
  private prevUpDown: Map<string, { up: boolean; down: boolean }> = new Map();
  private timerAccumulator: number = 0;
  private finishedTimer: number = 0;
  private bulletIdCounter: number = 0;

  private enemyTemplates = [
    { name: "Deadline Dadakan", speedY: 105 },
    { name: "Revisi Jam 12 Malam", speedY: 125 },
    { name: "Audit Pajak", speedY: 95 },
    { name: "Micromanagement", speedY: 135 },
    { name: "Meeting Tanpa Hasil", speedY: 110 }
  ];

  async onAuth(client: Client, options: any): Promise<BaknusUser> {
    try {
      const user = await authenticateBaknusUser(options);
      console.log(`[Room Auth] Autentikasi Berhasil: ${user.name} (${user.email})`);
      return user;
    } catch (err: any) {
      console.warn(`[Room Auth] Akses Ditolak untuk ${client.sessionId}:`, err.message);
      throw new ServerError(401, err.message || "Kredensial Baknus Mail tidak valid!");
    }
  }

  onCreate(options: any) {
    this.setState(new PlaneRaceState());

    // Inisialisasi koin (8 koin meluncur bergantian dari atas)
    this.initCoins(8);

    // Inisialisasi musuh (5 rintangan korporat meluncur ke bawah)
    this.initEnemies();

    // Terima input pemain
    this.onMessage("input", (client, data: PlayerInput) => {
      const prev = this.prevUpDown.get(client.sessionId) || { up: false, down: false };
      const player = this.state.players.get(client.sessionId);

      if (player) {
        // Kontrol 3 Langkah Maju-Mundur Vertikal (Step 0: Bawah, 1: Tengah, 2: Atas)
        // Naik (Maju 1 langkah)
        if (data.up && !prev.up) {
          player.stepY = Math.min(2, player.stepY + 1);
        }
        // Turun (Mundur 1 langkah)
        if (data.down && !prev.down) {
          player.stepY = Math.max(0, player.stepY - 1);
        }
      }

      this.prevUpDown.set(client.sessionId, { up: !!data.up, down: !!data.down });
      this.playerInputs.set(client.sessionId, {
        left: !!data.left,
        right: !!data.right,
        up: !!data.up,
        down: !!data.down,
        shoot: !!data.shoot
      });
    });

    // Update loop 50 FPS (20ms)
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), 1000 / 50);
  }

  onJoin(client: Client, options?: any, auth?: any) {
    const userName = auth?.name || (options && options.name) || "Karyawan Baknus";
    const userEmail = auth?.email || "";
    console.log(`[Room] Player joined: ${client.sessionId} - ${userName} (${userEmail})`);

    const player = new Player();
    player.id = client.sessionId;
    player.name = userName;
    player.email = userEmail;
    
    // Posisi awal di sebar horizontal sepanjang area bawah
    const totalCurrent = this.state.players.size;
    player.x = 160 + (totalCurrent * 120) % 500;
    player.stepY = (totalCurrent % 3); // Berbeda tingkat langkah awal agar tidak bertumpuk
    player.y = this.getStepYCoordinate(player.stepY);
    player.colorIndex = totalCurrent % 5;
    player.score = 0;
    player.invulnerableTimer = 2.0; // Kebal 2 detik saat baru join

    this.state.players.set(client.sessionId, player);
    this.playerInputs.set(client.sessionId, { left: false, right: false, up: false, down: false, shoot: false });
    this.prevUpDown.set(client.sessionId, { up: false, down: false });

    this.checkGameLifecycle();
  }

  onLeave(client: Client, consented?: boolean) {
    console.log(`[Room] Player left: ${client.sessionId}`);
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    this.prevUpDown.delete(client.sessionId);
    this.lastShootTimes.delete(client.sessionId);

    this.checkGameLifecycle();
  }

  onDispose() {
    this.playerInputs.clear();
    this.prevUpDown.clear();
    this.lastShootTimes.clear();
  }

  private getStepYCoordinate(step: number): number {
    // Step 0: Paling Belakang (535)
    // Step 1: Tengah (495)
    // Step 2: Paling Depan (455)
    if (step === 2) return 455;
    if (step === 0) return 535;
    return 495;
  }

  private checkGameLifecycle() {
    const totalPlayers = this.state.players.size;

    if (this.state.status === "waiting") {
      if (totalPlayers >= 2) {
        console.log("[Room] Minimal 2 pemain terpenuhi! Memulai race survival 120s...");
        this.state.status = "playing";
        this.state.countdown = 120;
        this.timerAccumulator = 0;
      }
    } else if (this.state.status === "playing") {
      if (totalPlayers < 2) {
        console.log("[Room] Pemain kurang dari 2. Mengembalikan state ke waiting...");
        this.state.status = "waiting";
        this.state.countdown = 120;
      }
    }
  }

  private initCoins(count: number) {
    this.state.coins.clear();
    for (let i = 0; i < count; i++) {
      const coin = new Coin();
      coin.id = `coin_${i}`;
      this.randomizeCoin(coin, -40 - (i * 70)); // Stagger spawn dari atas
      this.state.coins.push(coin);
    }
  }

  private randomizeCoin(coin: Coin, customY?: number) {
    coin.x = 50 + Math.random() * 700;
    coin.y = customY !== undefined ? customY : -40 - Math.random() * 120;
    coin.speedY = 70 + Math.random() * 45;

    // Bobot: 60% Lembur (25), 30% Tunjangan (50), 10% Bonus KPI (100)
    const roll = Math.random();
    if (roll < 0.60) {
      coin.value = 25;
      coin.label = "Uang Lembur";
      coin.radius = 13;
    } else if (roll < 0.90) {
      coin.value = 50;
      coin.label = "Tunjangan";
      coin.radius = 15;
    } else {
      coin.value = 100;
      coin.label = "Bonus KPI";
      coin.radius = 18;
    }
  }

  private initEnemies() {
    this.state.enemies.clear();
    for (let i = 0; i < this.enemyTemplates.length; i++) {
      const template = this.enemyTemplates[i];
      const enemy = new Enemy();
      enemy.id = `enemy_${i}`;
      enemy.name = template.name;
      enemy.radius = 22;
      this.respawnEnemy(enemy, -60 - (i * 90), template.speedY);
      this.state.enemies.push(enemy);
    }
  }

  private respawnEnemy(enemy: Enemy, customY?: number, baseSpeed: number = 110) {
    enemy.x = 70 + Math.random() * 660;
    enemy.y = customY !== undefined ? customY : -60 - Math.random() * 140;
    enemy.speedY = baseSpeed + (Math.random() * 30 - 15);
    enemy.speedX = (Math.random() - 0.5) * 60; // Gerakan meliuk horizontal
    enemy.hp = 1;
  }

  private update(deltaTime: number) {
    const dtSec = deltaTime / 1000;
    const now = Date.now();

    // 1. Update Timer & Game Lifecycle
    if (this.state.status === "playing") {
      this.timerAccumulator += dtSec;
      if (this.timerAccumulator >= 1.0) {
        this.timerAccumulator -= 1.0;
        this.state.countdown = Math.max(0, this.state.countdown - 1);

        if (this.state.countdown === 0) {
          this.endGame();
        }
      }
    } else if (this.state.status === "finished") {
      this.finishedTimer += dtSec;
      if (this.finishedTimer >= 10.0) {
        this.resetGame();
      }
    }

    // 2. Update Pergerakan & Tembakan Pemain
    const moveSpeedX = 330; // Kecepatan geser kiri-kanan
    const playerRadius = 18;

    this.state.players.forEach((player, sessionId) => {
      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dtSec);
      }

      if (this.state.status !== "finished") {
        const input = this.playerInputs.get(sessionId) || { left: false, right: false, up: false, down: false, shoot: false };

        // Geser Kiri / Kanan
        if (input.left) {
          player.x -= moveSpeedX * dtSec;
        }
        if (input.right) {
          player.x += moveSpeedX * dtSec;
        }

        // Batas Arena Kiri-Kanan (800 px)
        player.x = Math.max(35, Math.min(765, player.x));

        // Transisi Halus Maju/Mundur 3 Langkah Vertikal
        const targetY = this.getStepYCoordinate(player.stepY);
        player.y += (targetY - player.y) * 12 * dtSec;

        // Mekanisme Menembak Laser
        if (input.shoot) {
          const lastShoot = this.lastShootTimes.get(sessionId) || 0;
          if (now - lastShoot >= 220) { // Cooldown 220ms
            this.lastShootTimes.set(sessionId, now);
            this.spawnBullet(player);
          }
        }
      }
    });

    // 3. Deteksi Tabrakan Antar Pemain (Efek Terpental / Solid Collision)
    const playerArray: Player[] = [];
    this.state.players.forEach((p) => playerArray.push(p));

    for (let i = 0; i < playerArray.length; i++) {
      for (let j = i + 1; j < playerArray.length; j++) {
        const p1 = playerArray[i];
        const p2 = playerArray[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const minDist = 38; // Jarak aman antar pesawat

        if (dist < minDist && dist > 0.001) {
          const overlap = (minDist - dist);
          const nx = (p1.x - p2.x) / dist;
          const ny = (p1.y - p2.y) / dist;

          // Terpental elastis menjauh satu sama lain
          const push = overlap * 0.6 + 2;
          p1.x += nx * push;
          p1.y += ny * push;
          p2.x -= nx * push;
          p2.y -= ny * push;

          // Pastikan tetap dalam batas arena
          p1.x = Math.max(35, Math.min(765, p1.x));
          p2.x = Math.max(35, Math.min(765, p2.x));
        }
      }
    }

    // 4. Update Peluru (Bergerak Cepat ke Atas)
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      if (!b) continue;

      b.y -= 680 * dtSec;

      // Hapus peluru jika lewat atas layar
      if (b.y < -30) {
        this.state.bullets.splice(i, 1);
        continue;
      }

      // Tabrakan Peluru dengan Musuh
      let hit = false;
      for (let j = 0; j < this.state.enemies.length; j++) {
        const enemy = this.state.enemies[j];
        if (!enemy) continue;

        if (enemy.y > 0 && Math.hypot(b.x - enemy.x, b.y - enemy.y) < enemy.radius + 6) {
          // Berikan skor ke penembak (+40 Poin Lembur/Bonus)
          const shooter = this.state.players.get(b.playerId);
          if (shooter) {
            shooter.score += 40;
          }

          // Efek ledakan ke klien
          this.broadcast("enemy_destroyed", {
            x: enemy.x,
            y: enemy.y,
            enemyName: enemy.name,
            killerId: b.playerId,
            points: 40
          });

          // Respawn musuh kembali di atas
          this.respawnEnemy(enemy, undefined, 110);
          hit = true;
          break;
        }
      }

      if (hit) {
        this.state.bullets.splice(i, 1);
      }
    }

    // 5. Update Musuh (Meluncur Turun ke Bawah)
    this.state.enemies.forEach((enemy) => {
      enemy.y += enemy.speedY * dtSec;
      enemy.x += enemy.speedX * dtSec;

      // Pantulan horizontal musuh
      if (enemy.x <= enemy.radius + 20) {
        enemy.x = enemy.radius + 20;
        enemy.speedX = Math.abs(enemy.speedX);
      } else if (enemy.x >= 800 - enemy.radius - 20) {
        enemy.x = 800 - enemy.radius - 20;
        enemy.speedX = -Math.abs(enemy.speedX);
      }

      // Jika musuh lewat bawah layar, respawn kembali di atas
      if (enemy.y > 640) {
        this.respawnEnemy(enemy, undefined, 110);
      }

      // Tabrakan Musuh dengan Pemain
      if (this.state.status === "playing") {
        this.state.players.forEach((player, sessionId) => {
          if (player.invulnerableTimer <= 0) {
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (dist < (playerRadius + enemy.radius)) {
              // Penalti -50 poin
              player.score = Math.max(0, player.score - 50);
              player.invulnerableTimer = 2.5;

              // Pentalan ke belakang
              player.stepY = 0; // Terpental ke baris paling belakang
              player.y = this.getStepYCoordinate(0);

              // Respawn musuh
              this.respawnEnemy(enemy, undefined, 110);

              this.broadcast("player_hit", {
                playerId: sessionId,
                playerName: player.name,
                enemyName: enemy.name,
                penalty: 50,
                x: player.x,
                y: player.y
              });
            }
          }
        });
      }
    });

    // 6. Update Koin (Meluncur Turun ke Bawah)
    this.state.coins.forEach((coin) => {
      coin.y += coin.speedY * dtSec;

      // Jika koin lewat bawah, respawn kembali di atas
      if (coin.y > 630) {
        this.randomizeCoin(coin);
      }

      // Tabrakan Koin dengan Pemain
      if (this.state.status === "playing") {
        this.state.players.forEach((player, sessionId) => {
          const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
          if (dist < (playerRadius + coin.radius)) {
            player.score += coin.value;

            this.broadcast("coin_collected", {
              playerId: sessionId,
              playerName: player.name,
              x: coin.x,
              y: coin.y,
              value: coin.value,
              label: coin.label
            });

            this.randomizeCoin(coin);
          }
        });
      }
    });
  }

  private spawnBullet(player: Player) {
    const bullet = new Bullet();
    bullet.id = `bullet_${this.bulletIdCounter++}`;
    bullet.playerId = player.id;
    bullet.x = player.x;
    bullet.y = player.y - 18;
    this.state.bullets.push(bullet);
  }

  private endGame() {
    this.state.status = "finished";
    this.finishedTimer = 0;

    let topScore = -1;
    let winner = "Tidak Ada";

    this.state.players.forEach((p) => {
      if (p.score > topScore) {
        topScore = p.score;
        winner = p.name;
      }
    });

    this.state.winnerName = winner;
    this.state.winnerScore = Math.max(0, topScore);

    console.log(`[Room] Selesai! Juara: ${winner} (${topScore} Poin)`);
    this.broadcast("game_over", {
      winnerName: this.state.winnerName,
      winnerScore: this.state.winnerScore
    });
  }

  private resetGame() {
    this.finishedTimer = 0;
    this.timerAccumulator = 0;
    this.state.countdown = 120;
    this.state.bullets.clear();

    let idx = 0;
    this.state.players.forEach((player) => {
      player.score = 0;
      player.stepY = idx % 3;
      player.x = 160 + (idx * 120) % 500;
      player.y = this.getStepYCoordinate(player.stepY);
      player.invulnerableTimer = 2.0;
      idx++;
    });

    this.initCoins(8);
    this.initEnemies();

    if (this.state.players.size >= 2) {
      this.state.status = "playing";
    } else {
      this.state.status = "waiting";
    }

    console.log("[Room] Ronde baru dimulai!");
  }
}
