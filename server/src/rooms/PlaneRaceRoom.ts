import { Room, Client, ServerError } from "colyseus";
import { PlaneRaceState, Player, Coin, Enemy } from "./schema/PlaneRaceState";
import { authenticateBaknusUser, BaknusUser } from "../auth/baknusAuth";

interface PlayerInput {
  left: boolean;
  right: boolean;
  thrust: boolean;
}

export class PlaneRaceRoom extends Room<PlaneRaceState> {
  maxClients = 5;

  private playerInputs: Map<string, PlayerInput> = new Map();
  private timerAccumulator: number = 0;
  private finishedTimer: number = 0;

  private enemyTemplates = [
    { name: "Deadline Dadakan", speed: 130 },
    { name: "Revisi Jam 12 Malam", speed: 145 },
    { name: "Audit Pajak", speed: 120 },
    { name: "Micromanagement", speed: 155 }
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

    // Inisialisasi koin (15 buah)
    this.initCoins(15);

    // Inisialisasi musuh (4 rintangan korporat)
    this.initEnemies();

    // Terima input pemain
    this.onMessage("input", (client, data: PlayerInput) => {
      this.playerInputs.set(client.sessionId, {
        left: !!data.left,
        right: !!data.right,
        thrust: !!data.thrust
      });

      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isThrusting = !!data.thrust;
      }
    });

    // Update loop 50 FPS (20ms) untuk kalkulasi server-authoritative
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
    
    // Spawn di titik acak dengan padding aman
    player.x = 100 + Math.random() * 600;
    player.y = 100 + Math.random() * 400;
    player.angle = Math.floor(Math.random() * 360);
    player.colorIndex = this.state.players.size % 5;
    player.score = 0;
    player.invulnerableTimer = 2.0; // Kebal 2 detik saat baru join

    this.state.players.set(client.sessionId, player);
    this.playerInputs.set(client.sessionId, { left: false, right: false, thrust: false });

    // Evaluasi siklus room saat pemain bertambah
    this.checkGameLifecycle();
  }

  onLeave(client: Client, consented?: boolean) {
    console.log(`[Room] Player left: ${client.sessionId}`);
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);

    // Evaluasi siklus room saat pemain berkurang
    this.checkGameLifecycle();
  }

  onDispose() {
    console.log("[Room] Disposing room...");
    this.playerInputs.clear();
  }

  private checkGameLifecycle() {
    const totalPlayers = this.state.players.size;

    if (this.state.status === "waiting") {
      if (totalPlayers >= 2) {
        console.log("[Room] Minimal 2 pemain terpenuhi! Memulai race 120s...");
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
      coin.id = `coin_${i}_${Date.now()}`;
      this.randomizeCoin(coin);
      this.state.coins.push(coin);
    }
  }

  private randomizeCoin(coin: Coin) {
    coin.x = 40 + Math.random() * 720;
    coin.y = 40 + Math.random() * 520;

    // Bobot kemunculan: 60% Lembur (25), 30% Tunjangan (50), 10% Bonus KPI (100)
    const roll = Math.random();
    if (roll < 0.60) {
      coin.value = 25;
      coin.label = "Uang Lembur";
      coin.radius = 11;
    } else if (roll < 0.90) {
      coin.value = 50;
      coin.label = "Tunjangan";
      coin.radius = 13;
    } else {
      coin.value = 100;
      coin.label = "Bonus KPI";
      coin.radius = 16;
    }
  }

  private initEnemies() {
    this.state.enemies.clear();
    for (let i = 0; i < this.enemyTemplates.length; i++) {
      const template = this.enemyTemplates[i];
      const enemy = new Enemy();
      enemy.id = `enemy_${i}`;
      enemy.name = template.name;
      enemy.radius = 20;

      // Spawn di sekitar area tengah
      enemy.x = 250 + Math.random() * 300;
      enemy.y = 200 + Math.random() * 200;

      // Arah kecepatan acak
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * template.speed;
      enemy.vy = Math.sin(angle) * template.speed;

      this.state.enemies.push(enemy);
    }
  }

  private update(deltaTime: number) {
    const dtSec = deltaTime / 1000;

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
      // Setelah 10 detik di layar selesai, reset race baru
      if (this.finishedTimer >= 10.0) {
        this.resetGame();
      }
    }

    // 2. Simulasi Fisika Pemain
    const turnSpeed = 220; // Derajat per detik
    const acceleration = 420; // px / detik^2
    const maxSpeed = 300;
    const drag = 0.96;

    this.state.players.forEach((player, sessionId) => {
      // Kurangi timer kebal
      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dtSec);
      }

      if (this.state.status !== "finished") {
        const input = this.playerInputs.get(sessionId) || { left: false, right: false, thrust: false };

        // Kemudi (Rotasi)
        if (input.left) {
          player.angle = (player.angle - turnSpeed * dtSec + 360) % 360;
        }
        if (input.right) {
          player.angle = (player.angle + turnSpeed * dtSec) % 360;
        }

        // Thrust (Dorongan Maju)
        if (input.thrust) {
          const rad = (player.angle * Math.PI) / 180;
          player.vx += Math.cos(rad) * acceleration * dtSec;
          player.vy += Math.sin(rad) * acceleration * dtSec;
          player.isThrusting = true;
        } else {
          player.isThrusting = false;
        }

        // Cap kecepatan maksimal
        const currentSpeed = Math.hypot(player.vx, player.vy);
        if (currentSpeed > maxSpeed) {
          const factor = maxSpeed / currentSpeed;
          player.vx *= factor;
          player.vy *= factor;
        }

        // Hambatan udara / inersia
        player.vx *= Math.pow(drag, dtSec * 50);
        player.vy *= Math.pow(drag, dtSec * 50);

        // Update koordinat
        player.x += player.vx * dtSec;
        player.y += player.vy * dtSec;

        // Batas Arena (800 x 600) dengan bantalan pantul
        const padding = 22;
        if (player.x < padding) {
          player.x = padding;
          player.vx = -player.vx * 0.4;
        } else if (player.x > 800 - padding) {
          player.x = 800 - padding;
          player.vx = -player.vx * 0.4;
        }

        if (player.y < padding) {
          player.y = padding;
          player.vy = -player.vy * 0.4;
        } else if (player.y > 600 - padding) {
          player.y = 600 - padding;
          player.vy = -player.vy * 0.4;
        }
      }
    });

    // 3. Simulasi Pergerakan Musuh / Obstacle Korporat
    this.state.enemies.forEach((enemy) => {
      enemy.x += enemy.vx * dtSec;
      enemy.y += enemy.vy * dtSec;

      // Pantulan dinding arena
      const r = enemy.radius;
      if (enemy.x <= r) {
        enemy.x = r;
        enemy.vx = Math.abs(enemy.vx);
      } else if (enemy.x >= 800 - r) {
        enemy.x = 800 - r;
        enemy.vx = -Math.abs(enemy.vx);
      }

      if (enemy.y <= r) {
        enemy.y = r;
        enemy.vy = Math.abs(enemy.vy);
      } else if (enemy.y >= 600 - r) {
        enemy.y = 600 - r;
        enemy.vy = -Math.abs(enemy.vy);
      }
    });

    // Jalankan deteksi tabrakan hanya saat race sedang berlangsung
    if (this.state.status === "playing") {
      this.checkCollisions();
    }
  }

  private checkCollisions() {
    const playerRadius = 18;

    this.state.players.forEach((player, sessionId) => {
      // 1. Tabrakan Pemain dengan Koin (Loot)
      this.state.coins.forEach((coin) => {
        const distCoin = Math.hypot(player.x - coin.x, player.y - coin.y);
        if (distCoin < (playerRadius + coin.radius)) {
          // Tambah skor pemain
          player.score += coin.value;

          // Kirim broadcast event ke klien untuk efek visual & sound popup
          this.broadcast("coin_collected", {
            playerId: sessionId,
            playerName: player.name,
            x: coin.x,
            y: coin.y,
            value: coin.value,
            label: coin.label
          });

          // Respawn koin di koordinat acak dengan nilai baru
          this.randomizeCoin(coin);
        }
      });

      // 2. Tabrakan Pemain dengan Musuh (Obstacle)
      if (player.invulnerableTimer <= 0) {
        this.state.enemies.forEach((enemy) => {
          const distEnemy = Math.hypot(player.x - enemy.x, player.y - enemy.y);
          if (distEnemy < (playerRadius + enemy.radius)) {
            // Pemotongan skor 50 poin
            const penalty = 50;
            player.score = Math.max(0, player.score - penalty);

            // Simpan koordinat benturan untuk efek partikel
            const hitX = player.x;
            const hitY = player.y;

            // Reset posisi pesawat ke titik aman
            player.x = 100 + Math.random() * 600;
            player.y = 100 + Math.random() * 400;
            player.vx = 0;
            player.vy = 0;
            player.invulnerableTimer = 2.5; // Kebal 2.5 detik

            // Kirim notifikasi tabrakan ke klien
            this.broadcast("player_hit", {
              playerId: sessionId,
              playerName: player.name,
              enemyName: enemy.name,
              penalty: penalty,
              x: hitX,
              y: hitY
            });
          }
        });
      }
    });
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

    console.log(`[Room] Race Selesai! Pemenang (Karyawan Teladan): ${winner} dengan skor ${topScore}`);
    this.broadcast("game_over", {
      winnerName: this.state.winnerName,
      winnerScore: this.state.winnerScore
    });
  }

  private resetGame() {
    this.finishedTimer = 0;
    this.timerAccumulator = 0;
    this.state.countdown = 120;

    // Reset skor dan posisi semua pemain
    this.state.players.forEach((player) => {
      player.score = 0;
      player.x = 100 + Math.random() * 600;
      player.y = 100 + Math.random() * 400;
      player.vx = 0;
      player.vy = 0;
      player.invulnerableTimer = 2.0;
    });

    // Acak ulang koin dan musuh
    this.initCoins(15);
    this.initEnemies();

    if (this.state.players.size >= 2) {
      this.state.status = "playing";
    } else {
      this.state.status = "waiting";
    }

    console.log("[Room] Race di-reset untuk babak kerja baru.");
  }
}
