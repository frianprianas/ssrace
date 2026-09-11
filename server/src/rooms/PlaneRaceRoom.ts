import { Room, Client, ServerError } from "colyseus";
import { PlaneRaceState, Player, Coin, Enemy, Bullet } from "./schema/PlaneRaceState";
import { authenticateBaknusUser, BaknusUser } from "../auth/baknusAuth";
import { ScoreDatabase } from "../db/scoreDatabase";

// Definisi 5 Karakter Resmi Skuadron SSRace Sesuai karakter.jpg
export const CHARACTERS_SERVER = [
  { id: 0, name: "BAKTI", ship: "Nova Razor", colorIndex: 0 },
  { id: 1, name: "NUSA", ship: "Triton Spear", colorIndex: 1 },
  { id: 2, name: "BAKNUS", ship: "Veridian Claw", colorIndex: 2 },
  { id: 3, name: "TARA", ship: "Nebula Sting", colorIndex: 3 },
  { id: 4, name: "BEEN", ship: "Void Drifter", colorIndex: 4 }
];

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
  private playerBumpTimes: Map<string, number> = new Map();
  private fastEnemyTimer: number = 0;
  private fastEnemyIndex: number = 0;
  private fastEnemyNames = [
    "",
    "",
    "",
    ""
  ];

  // Profil Pesawat Tempur Alien Planet TaYa (Tanpa Label Nama Sesuai Permintaan)
  private enemyTemplates = [
    { name: "", speedY: 90, shootInterval: 2.2, type: 0 },
    { name: "", speedY: 105, shootInterval: 1.8, type: 1 },
    { name: "", speedY: 80, shootInterval: 2.5, type: 2 },
    { name: "", speedY: 110, shootInterval: 2.0, type: 3 },
    { name: "", speedY: 95, shootInterval: 2.4, type: 4 }
  ];

  // Mekanisme Kapal Induk Alien Planet TaYa (Boss Pertempuran Akhir)
  private bossSpawned: boolean = false;
  private bossDirection: number = 1;
  private bossShootTimer: number = 0;

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
    const roomNumber = parseInt(options.roomNumber) || 1;
    this.setMetadata({ roomNumber });
    console.log(`[Room] Room diinisialisasi untuk Sektor ${roomNumber}`);

    this.setState(new PlaneRaceState());

    // Inisialisasi koin (8 koin meluncur bergantian dari atas)
    this.initCoins(8);

    // Inisialisasi pesawat musuh (5 pesawat tempur korporat)
    this.initEnemies();

    // Pemilihan Karakter Eksklusif (1 Karakter untuk 1 Pemain di dalam Room)
    this.onMessage("select_character", (client, data: { characterId: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      if (this.state.status !== "waiting") {
        client.send("character_error", { message: "Pertempuran sedang berlangsung, tidak dapat mengubah karakter!" });
        return;
      }

      const charId = Number(data.characterId);
      if (isNaN(charId) || charId < 0 || charId > 4) return;

      // Cek apakah karakter sudah diambil oleh pemain lain di room ini
      let takenBy = "";
      this.state.players.forEach((other, sId) => {
        if (sId !== client.sessionId && other.characterId === charId) {
          takenBy = other.name;
        }
      });

      if (takenBy) {
        client.send("character_error", { message: `Karakter ini sudah dipilih oleh ${takenBy}!` });
        return;
      }

      const charDef = CHARACTERS_SERVER[charId];
      player.characterId = charId;
      player.characterName = charDef.name;
      player.shipName = charDef.ship;
      player.colorIndex = charId;
      player.isReady = true;

      console.log(`[Room] ${player.name} memilih karakter: ${charDef.name} (${charDef.ship})`);

      this.broadcast("character_selected", {
        sessionId: client.sessionId,
        playerName: player.name,
        characterId: charId,
        characterName: charDef.name,
        shipName: charDef.ship
      });
    });

    // Mulai Pertempuran (Dapat ditekan oleh SIAPA SAJA begitu seluruh pilot yang ada telah memilih karakter)
    this.onMessage("start_game", (client) => {
      if (this.state.status !== "waiting") return;

      const totalPlayers = this.state.players.size;
      if (totalPlayers < 1) {
        client.send("character_error", { message: "Belum ada pemain di dalam room!" });
        return;
      }

      let unreadyNames: string[] = [];
      this.state.players.forEach((p) => {
        if (p.characterId < 0) {
          unreadyNames.push(p.name);
        }
      });

      if (unreadyNames.length > 0) {
        client.send("character_error", { 
          message: `Menunggu ${unreadyNames.join(", ")} memilih karakter!` 
        });
        return;
      }

      const starter = this.state.players.get(client.sessionId);
      console.log(`[Room] 🚀 START GAME ditekan oleh ${starter ? starter.name : client.sessionId}! Memulai race 120s...`);

      this.state.status = "playing";
      this.state.countdown = 120;
      this.timerAccumulator = 0;

      this.broadcast("match_started", {
        startedBy: starter ? starter.name : "Pilot Skuadron"
      });
    });

    // Terima input pemain
    this.onMessage("input", (client, data: PlayerInput) => {
      const prev = this.prevUpDown.get(client.sessionId) || { up: false, down: false };
      const player = this.state.players.get(client.sessionId);

      if (player && !player.isEliminated) {
        // Kontrol Maju-Mundur Vertikal (Posisi Netral: 2, Maju 2 langkah s/d 4, Mundur 2 langkah s/d 0)
        if (data.up && !prev.up) {
          player.stepY = Math.min(4, player.stepY + 1);
        }
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
    const userName = auth?.name || (options && options.name) || "Pilot Pertahanan Bumi";
    const userEmail = auth?.email || "";
    console.log(`[Room] Player joined: ${client.sessionId} - ${userName} (${userEmail})`);

    const player = new Player();
    player.id = client.sessionId;
    player.name = userName;
    player.email = userEmail;
    
    // Muat rekor skor terakumulasi dari database
    const dbRecord = ScoreDatabase.getInstance().getRecord(userName);
    player.cumulativeScore = dbRecord ? dbRecord.totalScore : 0;

    // Inisialisasi posisi dan status: SEMUA pemain mulai di row netral yang sama (stepY = 2)
    const totalCurrent = this.state.players.size;
    player.x = 120 + (totalCurrent * 90) % 360;
    player.stepY = 2; // Posisi netral seragam untuk semua pemain
    player.y = this.getStepYCoordinate(player.stepY);
    player.colorIndex = totalCurrent % 5;
    player.score = 0;
    player.lives = 3; // 3 Nyawa tetap
    player.maxLives = 3;
    player.hp = 5; // Bar darah per nyawa (5x tembakan sebelum 1 nyawa hilang)
    player.maxHp = 5;
    player.isEliminated = false;
    player.characterId = -1; // Menunggu pemilihan karakter di Hangar
    player.characterName = "";
    player.shipName = "";
    player.isReady = false;

    this.state.players.set(client.sessionId, player);
    this.playerInputs.set(client.sessionId, { left: false, right: false, up: false, down: false, shoot: false });
    this.prevUpDown.set(client.sessionId, { up: false, down: false });

    this.checkGameLifecycle();
  }

  onLeave(client: Client, consented?: boolean) {
    console.log(`[Room] Player left: ${client.sessionId}`);
    const player = this.state.players.get(client.sessionId);
    
    // Jika keluar saat permainan aktif dan belum tereliminasi, simpan skor yang didapat
    if (player && player.score > 0 && !player.isEliminated) {
      ScoreDatabase.getInstance().addMatchScore(player.name, player.email, player.score);
    }

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
    this.playerBumpTimes.clear();
  }

  private getStepYCoordinate(step: number): number {
    // Step 0: Mundur 2 langkah (900)
    // Step 1: Mundur 1 langkah (860)
    // Step 2: Posisi Netral / Default untuk SEMUA pemain (820)
    // Step 3: Maju 1 langkah (780)
    // Step 4: Maju 2 langkah (740)
    const clamped = Math.max(0, Math.min(4, step));
    return 820 - (clamped - 2) * 40;
  }

  private checkGameLifecycle() {
    let activePlayers = 0;
    this.state.players.forEach((p) => {
      if (!p.isEliminated) activePlayers++;
    });

    if (this.state.status === "playing") {
      if (activePlayers < 1) {
        console.log("[Room] Seluruh pemain tereliminasi / keluar. Mengembalikan state ke waiting...");
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
      this.randomizeCoin(coin, -40 - (i * 70));
      this.state.coins.push(coin);
    }
  }

  private randomizeCoin(coin: Coin, customY?: number) {
    coin.x = 40 + Math.random() * 520;
    coin.y = customY !== undefined ? customY : -40 - Math.random() * 120;
    coin.speedY = 75 + Math.random() * 50;

    const roll = Math.random();
    if (roll < 0.60) {
      coin.value = 25;
      coin.label = "Plasma Core";
      coin.radius = 13;
    } else if (roll < 0.90) {
      coin.value = 50;
      coin.label = "Photon Core";
      coin.radius = 15;
    } else {
      coin.value = 100;
      coin.label = "Quantum Core";
      coin.radius = 18;
    }
  }

  private initEnemies() {
    this.state.enemies.clear();
    for (let i = 0; i < this.enemyTemplates.length; i++) {
      const template = this.enemyTemplates[i];
      const enemy = new Enemy();
      enemy.id = `enemy_${i}`;
      enemy.name = "";
      enemy.radius = 24;
      enemy.enemyType = template.type;
      enemy.shootTimer = Math.random() * 1.5; // Stagger tembakan awal
      this.respawnEnemy(enemy, -70 - (i * 100), template.speedY);
      this.state.enemies.push(enemy);
    }

    // Tambahkan 1 Pesawat Tempur Penyelam Kilat Khusus (Fast Diver Interceptor)
    const fastEnemy = new Enemy();
    fastEnemy.id = "enemy_fast_diver";
    fastEnemy.name = "";
    fastEnemy.radius = 24;
    fastEnemy.enemyType = 0;
    fastEnemy.x = 300;
    fastEnemy.y = -600; // Parkir di luar layar sampai dipanggil meluncur
    fastEnemy.speedY = 0;
    fastEnemy.speedX = 0;
    fastEnemy.hp = 1;
    this.state.enemies.push(fastEnemy);
  }

  private launchFastDiverEnemy() {
    const fastEnemy = this.state.enemies.find(e => e.id === "enemy_fast_diver");
    if (!fastEnemy) return;

    fastEnemy.name = "";
    fastEnemy.x = 60 + Math.random() * 480;
    fastEnemy.y = -70;
    fastEnemy.speedY = 380 + Math.random() * 70; // Meluncur sangat cepat (380 - 450 px/detik)
    fastEnemy.speedX = (Math.random() - 0.5) * 50;
    fastEnemy.hp = 1;
    fastEnemy.shootTimer = 0.4;

    this.broadcast("fast_enemy_incoming", {
      x: fastEnemy.x,
      name: ""
    });

    console.log(`[Room] Alien Penyelam Kilat MELUNCUR di X=${Math.round(fastEnemy.x)}, SpeedY=${Math.round(fastEnemy.speedY)}`);
  }

  private respawnEnemy(enemy: Enemy, customY?: number, baseSpeed: number = 95) {
    enemy.x = 50 + Math.random() * 500;
    enemy.y = customY !== undefined ? customY : -70 - Math.random() * 140;
    enemy.speedY = baseSpeed + (Math.random() * 25 - 12);
    enemy.speedX = (Math.random() - 0.5) * 50;
    enemy.hp = 1;
    enemy.shootTimer = Math.random() * 1.0;
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

        // Kapal Induk Alien Planet TaYa muncul di akhir level (40 detik tersisa)
        if (this.state.countdown <= 40 && !this.bossSpawned) {
          this.bossSpawned = true;
          this.state.bossActive = true;
          this.state.bossHp = 75;
          this.state.bossMaxHp = 75;
          this.state.bossX = 300;
          this.state.bossY = -120;
          this.broadcast("boss_spawned", {
            hp: this.state.bossHp,
            maxHp: this.state.bossMaxHp,
            x: this.state.bossX,
            y: this.state.bossY
          });
          console.log("[Room] 🚨 KAPAL INDUK ALIEN PLANET TAYA MEMASUKI ARENA! HP: 75");
        }

        if (this.state.countdown === 0) {
          this.endGame();
        }
      }

      // Setiap 5.5 detik sekali meluncurkan musuh penyelam kilat
      this.fastEnemyTimer += dtSec;
      if (this.fastEnemyTimer >= 5.5) {
        this.fastEnemyTimer = 0;
        this.launchFastDiverEnemy();
      }
    } else if (this.state.status === "finished") {
      this.finishedTimer += dtSec;
      if (this.finishedTimer >= 10.0) {
        this.resetGame();
      }
    }

    // Update Pergerakan & Serangan Kapal Induk Alien (Boss Akhir Level)
    if (this.state.bossActive) {
      if (this.state.bossY < 140) {
        this.state.bossY += 60 * dtSec;
      } else {
        // Patroli horizontal alien mothership
        this.state.bossX += this.bossDirection * 95 * dtSec;
        if (this.state.bossX >= 470) {
          this.state.bossX = 470;
          this.bossDirection = -1;
        } else if (this.state.bossX <= 130) {
          this.state.bossX = 130;
          this.bossDirection = 1;
        }

        // Salvo tembakan plasma kapal induk setiap 1.35 detik
        if (this.state.status !== "finished") {
          this.bossShootTimer += dtSec;
          if (this.bossShootTimer >= 1.35) {
            this.bossShootTimer = 0;
            this.spawnBossBarrage();
          }
        }
      }

      // Tabrakan Fisik Kapal Induk Alien dengan Pesawat Pemain
      if (this.state.status !== "finished") {
        this.state.players.forEach((player, sessionId) => {
          if (!player.isEliminated && player.invulnerableTimer <= 0) {
            if (Math.abs(player.x - this.state.bossX) < 85 && Math.abs(player.y - this.state.bossY) < 55) {
              this.damagePlayer(player, sessionId, "Tabrakan Kapal Induk Alien");
            }
          }
        });
      }
    }

    // 2. Update Pergerakan & Tembakan Pemain (Kecepatan geser 210 agar lebih terkendali dan tidak terlalu sensitif)
    const moveSpeedX = 210;
    const playerRadius = 22; // Ukuran pesawat diperbesar (sebelumnya 18)

    this.state.players.forEach((player, sessionId) => {
      if (player.isEliminated) return;

      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dtSec);
      }

      if (this.state.status !== "finished") {
        const input = this.playerInputs.get(sessionId) || { left: false, right: false, up: false, down: false, shoot: false };

        if (input.left) {
          player.x -= moveSpeedX * dtSec;
        }
        if (input.right) {
          player.x += moveSpeedX * dtSec;
        }

        player.x = Math.max(35, Math.min(565, player.x));

        // Transisi Halus Maju/Mundur 3 Langkah Vertikal
        const targetY = this.getStepYCoordinate(player.stepY);
        player.y += (targetY - player.y) * 12 * dtSec;

        // Mekanisme Menembak Laser Pemain
        if (input.shoot) {
          const lastShoot = this.lastShootTimes.get(sessionId) || 0;
          if (now - lastShoot >= 220) {
            this.lastShootTimes.set(sessionId, now);
            this.spawnPlayerBullet(player);
          }
        }
      }
    });

    // 3. Deteksi Tabrakan Antar Pemain (Efek Fisika Beradu & Terpental)
    const playerArray: Player[] = [];
    this.state.players.forEach((p) => {
      if (!p.isEliminated) playerArray.push(p);
    });

    for (let i = 0; i < playerArray.length; i++) {
      for (let j = i + 1; j < playerArray.length; j++) {
        const p1 = playerArray[i];
        const p2 = playerArray[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const minDist = 44; // Jarak benturan fisik antar sayap/badan pesawat yang diperbesar

        if (dist < minDist && dist > 0.001) {
          const overlap = (minDist - dist);
          const nx = (p1.x - p2.x) / dist;
          const ny = (p1.y - p2.y) / dist;

          // Gaya tolak fisika (pantulan elastis antar pesawat)
          const pushForce = overlap * 0.7 + 8;
          p1.x += nx * pushForce;
          p1.y += ny * (pushForce * 0.5);
          p2.x -= nx * pushForce;
          p2.y -= ny * (pushForce * 0.5);

          p1.x = Math.max(35, Math.min(565, p1.x));
          p2.x = Math.max(35, Math.min(565, p2.x));
          p1.y = Math.max(720, Math.min(920, p1.y));
          p2.y = Math.max(720, Math.min(920, p2.y));

          // Broadcast efek fisika ke semua client (dibatasi 220ms per pasangan)
          const pairKey = p1.id < p2.id ? `${p1.id}_${p2.id}` : `${p2.id}_${p1.id}`;
          const lastBump = this.playerBumpTimes.get(pairKey) || 0;
          if (now - lastBump > 220) {
            this.playerBumpTimes.set(pairKey, now);
            this.broadcast("player_bump", {
              x: (p1.x + p2.x) / 2,
              y: (p1.y + p2.y) / 2,
              p1Id: p1.id,
              p2Id: p2.id,
              p1Name: p1.name,
              p2Name: p2.name,
              nx,
              ny,
              force: Math.min(30, pushForce * 1.5)
            });
          }
        }
      }
    }

    // 4. Update Pesawat Musuh & Tembakan Peluru Musuh
    this.state.enemies.forEach((enemy) => {
      enemy.y += enemy.speedY * dtSec;
      enemy.x += enemy.speedX * dtSec;

      // Pantulan horizontal
      if (enemy.x <= enemy.radius + 15) {
        enemy.x = enemy.radius + 15;
        enemy.speedX = Math.abs(enemy.speedX);
      } else if (enemy.x >= 600 - enemy.radius - 15) {
        enemy.x = 600 - enemy.radius - 15;
        enemy.speedX = -Math.abs(enemy.speedX);
      }

      // Tembakan Peluru Pesawat Musuh (Menjangkau seluruh arena pertahanan pemain)
      if (this.state.status !== "finished" && enemy.y > 20 && enemy.y < 800) {
        enemy.shootTimer += dtSec;
        const shootInterval = 1.8; // Menembak peluru plasma setiap 1.8 detik
        if (enemy.shootTimer >= shootInterval) {
          enemy.shootTimer = 0;
          this.spawnEnemyBullet(enemy);
        }
      }

      // Respawn jika lewat bawah layar
      if (enemy.y > 1000) {
        if (enemy.id === "enemy_fast_diver") {
          enemy.y = -800; // Parkir di luar layar sampai peluncuran berikutnya
          enemy.speedY = 0;
          enemy.speedX = 0;
        } else {
          this.respawnEnemy(enemy, undefined, 95);
        }
      }

      // Tabrakan Langsung Pesawat Musuh dengan Pemain
      if (this.state.status !== "finished") {
        this.state.players.forEach((player, sessionId) => {
          if (!player.isEliminated && player.invulnerableTimer <= 0) {
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (dist < (playerRadius + enemy.radius + 10)) {
              this.damagePlayer(player, sessionId, enemy.name);
              if (enemy.id === "enemy_fast_diver") {
                enemy.y = -800;
                enemy.speedY = 0;
                enemy.speedX = 0;
              } else {
                this.respawnEnemy(enemy, undefined, 95);
              }
            }
          }
        });
      }
    });

    // 5. Update Semua Peluru (Pemain, Armada Alien, & Kapal Induk)
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      if (!b) continue;

      if (b.isEnemy) {
        // Peluru musuh meluncur ke bawah dan menyebar diagonal sesuai speedX
        b.y += (b.speedY || 240) * dtSec;
        b.x += (b.speedX || 0) * dtSec;

        // Hapus jika lewat batas arena
        if (b.y > 1020 || b.x < -40 || b.x > 640) {
          this.state.bullets.splice(i, 1);
          continue;
        }

        // Tabrakan Peluru Musuh dengan Pemain
        let hitPlayer = false;
        if (this.state.status !== "finished") {
          this.state.players.forEach((player, sessionId) => {
            if (!hitPlayer && !player.isEliminated && player.invulnerableTimer <= 0) {
              const dist = Math.hypot(b.x - player.x, b.y - player.y);
              if (dist < (playerRadius + 16)) {
                hitPlayer = true;
                this.damagePlayer(player, sessionId, "Peluru Plasma Alien");
              }
            }
          });
        }

        if (hitPlayer) {
          this.state.bullets.splice(i, 1);
          continue;
        }

      } else {
        // Peluru laser pemain meluncur cepat ke atas (680 px/detik)
        b.y -= (b.speedY || 680) * dtSec;

        // Hapus jika lewat atas layar
        if (b.y < -30) {
          this.state.bullets.splice(i, 1);
          continue;
        }

        // A. Tabrakan Peluru Pemain dengan Kapal Induk Alien (Boss)
        if (this.state.bossActive && this.state.bossY > 30) {
          if (Math.abs(b.x - this.state.bossX) < 75 && Math.abs(b.y - this.state.bossY) < 45) {
            this.state.bossHp = Math.max(0, this.state.bossHp - 1);

            const shooter = this.state.players.get(b.playerId);
            if (shooter && !shooter.isEliminated) {
              shooter.score += 15; // Setiap tembakan ke kapal induk memberi 15 poin
            }

            this.broadcast("boss_damaged", {
              hp: this.state.bossHp,
              maxHp: this.state.bossMaxHp,
              x: b.x,
              y: b.y,
              shooterId: b.playerId
            });

            if (this.state.bossHp <= 0) {
              this.state.bossActive = false;
              if (shooter && !shooter.isEliminated) {
                shooter.score += 600; // Bonus besar penghancur kapal induk
              }
              // Bonus kontribusi tim untuk semua pilot yang bertahan
              this.state.players.forEach((p) => {
                if (!p.isEliminated && p.id !== b.playerId) {
                  p.score += 300;
                }
              });

              this.broadcast("boss_defeated", {
                x: this.state.bossX,
                y: this.state.bossY,
                killerId: b.playerId,
                killerName: shooter ? shooter.name : "Skuadron Pertahanan Bumi"
              });
              console.log(`[Room] 💥 KAPAL INDUK PLANET TAYA HANCUR oleh ${shooter ? shooter.name : "Pilot"}!`);
            }

            this.state.bullets.splice(i, 1);
            continue;
          }
        }

        // B. Tabrakan Peluru Pemain dengan Pesawat Armada Alien
        let hitEnemy = false;
        for (let j = 0; j < this.state.enemies.length; j++) {
          const enemy = this.state.enemies[j];
          if (!enemy) continue;

          if (enemy.y > 0 && Math.hypot(b.x - enemy.x, b.y - enemy.y) < (enemy.radius + 18)) {
            const isFast = enemy.id === "enemy_fast_diver";
            const points = isFast ? 75 : 40;

            const shooter = this.state.players.get(b.playerId);
            if (shooter && !shooter.isEliminated) {
              shooter.score += points;
            }

            this.broadcast("enemy_destroyed", {
              x: enemy.x,
              y: enemy.y,
              enemyName: enemy.name || "Pesawat Alien",
              killerId: b.playerId,
              points: points
            });

            if (isFast) {
              enemy.y = -800;
              enemy.speedY = 0;
              enemy.speedX = 0;
            } else {
              this.respawnEnemy(enemy, undefined, 95);
            }
            hitEnemy = true;
            break;
          }
        }

        if (hitEnemy) {
          this.state.bullets.splice(i, 1);
          continue;
        }
      }
    }

    // 6. Update Koin (Meluncur Turun ke Bawah)
    this.state.coins.forEach((coin) => {
      coin.y += coin.speedY * dtSec;

      if (coin.y > 990) {
        this.randomizeCoin(coin);
      }

      if (this.state.status !== "finished") {
        this.state.players.forEach((player, sessionId) => {
          if (!player.isEliminated) {
            const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
            if (dist < (playerRadius + coin.radius + 16)) {
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
          }
        });
      }
    });
  }

  private spawnPlayerBullet(player: Player) {
    const bullet = new Bullet();
    bullet.id = `bullet_${this.bulletIdCounter++}`;
    bullet.playerId = player.id;
    bullet.x = player.x;
    bullet.y = player.y - 18;
    bullet.isEnemy = false;
    bullet.speedY = 680;
    this.state.bullets.push(bullet);
  }

  private spawnEnemyBullet(enemy: Enemy) {
    const bullet = new Bullet();
    bullet.id = `ebullet_${this.bulletIdCounter++}`;
    bullet.playerId = "";
    bullet.x = enemy.x;
    bullet.y = enemy.y + enemy.radius + 4;
    bullet.isEnemy = true;
    bullet.speedY = 240; // Peluru meluncur mantap ke bawah sampai mencapai pemain
    this.state.bullets.push(bullet);

    this.broadcast("enemy_shoot", {
      x: bullet.x,
      y: bullet.y
    });
  }

  /**
   * Salvo Peluru Plasma Kapal Induk Alien Planet TaYa (Boss)
   * 3 peluru menyebar sudut dari inti tengah + 2 meriam berat sayap
   */
  private spawnBossBarrage() {
    if (!this.state.bossActive) return;

    // 1. Tembakan 3 arah plasma dari inti tengah
    const centerAngles = [-80, 0, 80];
    for (const speedX of centerAngles) {
      const bullet = new Bullet();
      bullet.id = `bbullet_${this.bulletIdCounter++}`;
      bullet.playerId = "";
      bullet.x = this.state.bossX;
      bullet.y = this.state.bossY + 42;
      bullet.isEnemy = true;
      bullet.speedX = speedX;
      bullet.speedY = 270;
      this.state.bullets.push(bullet);
    }

    // 2. Meriam plasma sayap kiri dan kanan
    const wingOffsets = [-60, 60];
    for (const ox of wingOffsets) {
      const bullet = new Bullet();
      bullet.id = `bbullet_${this.bulletIdCounter++}`;
      bullet.playerId = "";
      bullet.x = this.state.bossX + ox;
      bullet.y = this.state.bossY + 30;
      bullet.isEnemy = true;
      bullet.speedX = ox < 0 ? -35 : 35;
      bullet.speedY = 290;
      this.state.bullets.push(bullet);
    }

    this.broadcast("boss_shoot", {
      x: this.state.bossX,
      y: this.state.bossY
    });
  }

  /**
   * Logika Pengurangan Darah (HP) & Nyawa (Lives):
   * Nyawa pemain tetap 3. Setiap nyawa memiliki bar darah 5x tembakan.
   * Jika bar darah habis (5x hit), 1 nyawa hilang dan darah di-reset kembali 5/5.
   * Jika ke-3 nyawa habis, barulah pemain tereliminasi (Game Over).
   */
  private damagePlayer(player: Player, sessionId: string, sourceName: string) {
    player.hp = Math.max(0, player.hp - 1);
    player.invulnerableTimer = 1.2; // Kebal 1.2 detik saat terkena tembakan biasa
    player.score = Math.max(0, player.score - 20);
    player.stepY = Math.max(0, player.stepY - 1); // Terpental mundur 1 langkah
    player.y = this.getStepYCoordinate(player.stepY);

    let lifeLost = false;

    // Jika bar darah habis (5x tembakan untuk nyawa ini)
    if (player.hp <= 0) {
      player.lives = Math.max(0, player.lives - 1);
      lifeLost = true;

      if (player.lives > 0) {
        // Reset bar darah kembali penuh (5/5) untuk nyawa berikutnya
        player.hp = player.maxHp;
        player.invulnerableTimer = 2.5; // Kebal darurat 2.5 detik saat nyawa berkurang
        console.log(`[Room] Player ${player.name} KEHILANGAN 1 NYAWA! Sisa Nyawa: ${player.lives}/${player.maxLives}, Darah di-reset: 5/5`);
      }
    }

    console.log(`[Room] Player ${player.name} terkena ${sourceName}. Darah: ${player.hp}/${player.maxHp}, Nyawa: ${player.lives}/${player.maxLives}`);

    this.broadcast("player_damaged", {
      playerId: sessionId,
      playerName: player.name,
      hpRemaining: player.hp,
      maxHp: player.maxHp,
      livesRemaining: player.lives,
      maxLives: player.maxLives,
      lifeLost: lifeLost,
      source: sourceName,
      x: player.x,
      y: player.y
    });

    // Jika seluruh 3 nyawa habis, pemain tereliminasi!
    if (player.lives <= 0) {
      this.eliminatePlayer(player, sessionId, sourceName);
    }
  }

  /**
   * Menangani Eliminasi Pemain, Akumulasi Poin ke Database, dan Auto-Kick
   */
  private eliminatePlayer(player: Player, sessionId: string, killerSource: string) {
    player.isEliminated = true;

    // Simpan akumulasi skor ke database persisten
    const record = ScoreDatabase.getInstance().addMatchScore(player.name, player.email, player.score);
    player.cumulativeScore = record.totalScore;

    console.log(`[Room] Player ${player.name} TERELIMINASI! Skor match: ${player.score}, Total akumulasi baru: ${record.totalScore}`);

    this.broadcast("player_eliminated", {
      playerId: sessionId,
      playerName: player.name,
      matchScore: player.score,
      totalScore: record.totalScore,
      highestScore: record.highestScore,
      killer: killerSource,
      x: player.x,
      y: player.y
    });

    // Hapus pesawat pemain dari state permainan seketika agar objeknya lenyap dan tidak membekas di arena!
    this.state.players.delete(sessionId);
    this.playerInputs.delete(sessionId);
    this.prevUpDown.delete(sessionId);
    this.lastShootTimes.delete(sessionId);

    const client = this.clients.find(c => c.sessionId === sessionId);
    if (client) {
      // Kirim pesan langsung ke klien yang bersangkutan
      client.send("you_are_eliminated", {
        message: `Seluruh 3 Nyawa Pesawat Anda habis terkena serangan ${killerSource}!`,
        matchScore: player.score,
        totalScore: record.totalScore,
        highestScore: record.highestScore,
        gamesPlayed: record.gamesPlayed
      });

      // Beri jeda 1 detik agar animasi ledakan dan popup game over di klien terlihat
      this.clock.setTimeout(() => {
        try {
          console.log(`[Room] Menendang socket ${player.name} keluar room karena tereliminasi.`);
          client.leave(4001); // 4001: Game Over / Eliminated
        } catch (e) {}
      }, 1000);
    }

    this.checkGameLifecycle();
  }

  private endGame() {
    this.state.status = "finished";
    this.finishedTimer = 0;

    let topScore = -1;
    let winner = "Tidak Ada";

    // Akumulasikan skor seluruh pemain yang bertahan ke database
    this.state.players.forEach((p) => {
      if (!p.isEliminated && p.score > 0) {
        const record = ScoreDatabase.getInstance().addMatchScore(p.name, p.email, p.score);
        p.cumulativeScore = record.totalScore;
      }

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

    // Reset status Kapal Induk Alien (Boss)
    this.bossSpawned = false;
    this.bossShootTimer = 0;
    this.bossDirection = 1;
    this.state.bossActive = false;
    this.state.bossHp = 0;
    this.state.bossMaxHp = 75;
    this.state.bossX = 300;
    this.state.bossY = -200;

    let idx = 0;
    this.state.players.forEach((player) => {
      player.score = 0;
      player.lives = 3;
      player.maxLives = 3;
      player.hp = 5;
      player.maxHp = 5;
      player.isEliminated = false;
      player.stepY = 2; // Posisi netral seragam untuk semua pemain
      player.x = 120 + (idx * 90) % 360;
      player.y = this.getStepYCoordinate(player.stepY);
      player.invulnerableTimer = 2.0;
      idx++;
    });

    this.initCoins(8);
    this.initEnemies();

    let active = 0;
    this.state.players.forEach(p => { if (!p.isEliminated) active++; });

    // Selalu kembali ke Hangar (status waiting) agar pemain dapat konfirmasi/ganti karakter dan klik START
    this.state.status = "waiting";

    console.log("[Room] Ronde baru disiapkan, kembali ke Hangar Skuadron!");
  }
}
