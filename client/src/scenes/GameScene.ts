import Phaser from "phaser";
import * as Colyseus from "colyseus.js";
import { sounds } from "../sound";

interface PlayerData {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  exhaust: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  scoreText: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  isLocal: boolean;
}

interface BulletData {
  sprite: Phaser.GameObjects.Graphics;
  targetX: number;
  targetY: number;
}

interface CoinData {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  targetX: number;
  targetY: number;
  value: number;
}

interface EnemyData {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  labelText: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

export class GameScene extends Phaser.Scene {
  private client!: Colyseus.Client;
  private room!: Colyseus.Room;
  private serverUrl: string = "ws://localhost:2567";

  // Entity tracking
  private players: Map<string, PlayerData> = new Map();
  private bullets: Map<string, BulletData> = new Map();
  private coins: Map<string, CoinData> = new Map();
  private enemies: Map<string, EnemyData> = new Map();

  // Background stars
  private stars: { x: number; y: number; speed: number; size: number; alpha: number }[] = [];
  private starGraphics!: Phaser.GameObjects.Graphics;

  // Input state
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private lastInput = { left: false, right: false, up: false, down: false, shoot: false };
  private inputSendTimer: number = 0;
  private localShootCooldown: number = 0;

  // HUD Elements
  private timerText!: Phaser.GameObjects.Text;
  private statusBadge!: Phaser.GameObjects.Text;
  private myScoreText!: Phaser.GameObjects.Text;
  private leaderboardContainer!: Phaser.GameObjects.Container;
  private leaderboardEntries: Phaser.GameObjects.Text[] = [];

  // Finished Modal
  private modalContainer!: Phaser.GameObjects.Container;
  private modalTitle!: Phaser.GameObjects.Text;
  private modalWinner!: Phaser.GameObjects.Text;
  private modalSub!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { serverUrl?: string }) {
    if (data.serverUrl) this.serverUrl = data.serverUrl;
  }

  preload() {
    this.createProceduralTextures();
  }

  create() {
    // 1. Starfield Space Background
    this.initStarfield();

    // 2. Setup Keyboard & Mouse Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    // 3. Setup UI HUD
    this.createHUD();

    // 4. Status Awal Menunggu Login
    this.statusBadge.setText("MENUNGGU LOGIN BAKNUS MAIL");
    this.statusBadge.setColor("#f59e0b");
  }

  private initStarfield() {
    this.starGraphics = this.add.graphics().setDepth(1);
    this.stars = [];
    for (let i = 0; i < 75; i++) {
      this.stars.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        speed: 40 + Math.random() * 120,
        size: Math.random() < 0.2 ? 2.5 : (Math.random() < 0.6 ? 1.8 : 1),
        alpha: 0.3 + Math.random() * 0.7,
      });
    }

    // Garis pertahanan bawah (zona pergerakan pemain)
    const defLine = this.add.graphics().setDepth(2);
    defLine.lineStyle(1, 0x00f0ff, 0.25);
    defLine.lineBetween(0, 440, 800, 440);
    defLine.lineStyle(1, 0x334155, 0.4);
    defLine.lineBetween(0, 560, 800, 560);
  }

  private createProceduralTextures() {
    // 1. Pesawat Pemain Lokal (Space Jet Menghadap Atas)
    const gPlayer = this.make.graphics({ x: 0, y: 0 });
    // Sayap jet
    gPlayer.fillStyle(0x00d2ff, 1);
    gPlayer.fillTriangle(14, 0, 0, 26, 7, 20);
    gPlayer.fillTriangle(14, 0, 21, 20, 28, 26);
    // Bodi utama
    gPlayer.fillStyle(0xffffff, 1);
    gPlayer.fillTriangle(14, 2, 8, 24, 20, 24);
    // Kokpit cyan
    gPlayer.fillStyle(0x00f0ff, 1);
    gPlayer.fillCircle(14, 11, 3.5);
    gPlayer.generateTexture("space_jet_local", 28, 28);

    // 2. Pesawat Pemain Lain (Warna Berbeda)
    const colors = [0xff3366, 0x10b981, 0xa855f7, 0xf59e0b, 0xec4899];
    colors.forEach((col, idx) => {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(col, 1);
      g.fillTriangle(14, 0, 0, 26, 7, 20);
      g.fillTriangle(14, 0, 21, 20, 28, 26);
      g.fillStyle(0xe2e8f0, 1);
      g.fillTriangle(14, 2, 8, 24, 20, 24);
      g.fillStyle(col, 1);
      g.fillCircle(14, 11, 3.5);
      g.generateTexture(`space_jet_remote_${idx}`, 28, 28);
    });

    // 3. Exhaust Api Mesin (Di bagian bawah pesawat)
    const gExhaust = this.make.graphics({ x: 0, y: 0 });
    gExhaust.fillStyle(0x00f0ff, 0.9);
    gExhaust.fillTriangle(4, 0, 0, 10, 8, 10);
    gExhaust.fillStyle(0xffffff, 1);
    gExhaust.fillTriangle(4, 0, 2, 6, 6, 6);
    gExhaust.generateTexture("exhaust_flame", 8, 10);

    // 4. Koin 25 - Uang Lembur
    const gCoin25 = this.make.graphics({ x: 0, y: 0 });
    gCoin25.fillStyle(0xf59e0b, 1);
    gCoin25.fillCircle(13, 13, 12);
    gCoin25.lineStyle(2, 0xffedd5, 0.9);
    gCoin25.strokeCircle(13, 13, 12);
    gCoin25.generateTexture("coin_25", 26, 26);

    // 5. Koin 50 - Tunjangan
    const gCoin50 = this.make.graphics({ x: 0, y: 0 });
    gCoin50.fillStyle(0x06b6d4, 1);
    gCoin50.fillCircle(15, 15, 14);
    gCoin50.lineStyle(2, 0xe0f2fe, 0.95);
    gCoin50.strokeCircle(15, 15, 14);
    gCoin50.generateTexture("coin_50", 30, 30);

    // 6. Koin 100 - Bonus KPI
    const gCoin100 = this.make.graphics({ x: 0, y: 0 });
    gCoin100.fillStyle(0xeab308, 1);
    gCoin100.fillCircle(17, 17, 16);
    gCoin100.lineStyle(3, 0xfef08a, 1);
    gCoin100.strokeCircle(17, 17, 16);
    gCoin100.generateTexture("coin_100", 34, 34);

    // 7. Musuh Korporat (Alien / Hazard Drone Meluncur Turun)
    const gEnemy = this.make.graphics({ x: 0, y: 0 });
    gEnemy.fillStyle(0xef4444, 1);
    gEnemy.fillCircle(22, 22, 20);
    gEnemy.lineStyle(3, 0xffffff, 0.9);
    gEnemy.strokeCircle(22, 22, 20);
    gEnemy.lineStyle(3, 0x7f1d1d, 1);
    gEnemy.lineBetween(14, 14, 30, 30);
    gEnemy.lineBetween(30, 14, 14, 30);
    gEnemy.generateTexture("enemy_alien", 44, 44);
  }

  private createHUD() {
    const hudY = 24;

    // Header Background Bar
    const hudBar = this.add.graphics().setDepth(100);
    hudBar.fillStyle(0x0f172a, 0.85);
    hudBar.fillRoundedRect(20, 14, 760, 44, 8);
    hudBar.lineStyle(1, 0x334155, 0.8);
    hudBar.strokeRoundedRect(20, 14, 760, 44, 8);

    // Status Room
    this.statusBadge = this.add.text(35, hudY + 12, "MENUNGGU REKAN KERJA...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#38bdf8",
    }).setOrigin(0, 0.5).setDepth(101);

    // Countdown Timer
    this.timerText = this.add.text(400, hudY + 12, "WAKTU: 120s", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "18px",
      fontStyle: "bold",
      color: "#ffd700",
    }).setOrigin(0.5, 0.5).setDepth(101);

    // Skor Pemain Lokal
    this.myScoreText = this.add.text(765, hudY + 12, "SKOR: 0", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "16px",
      fontStyle: "bold",
      color: "#00f0ff",
    }).setOrigin(1, 0.5).setDepth(101);

    // Leaderboard Box (Top 5) di kanan atas
    this.leaderboardContainer = this.add.container(620, 68).setDepth(100);
    const lbBg = this.add.graphics();
    lbBg.fillStyle(0x0f172a, 0.88);
    lbBg.fillRoundedRect(0, 0, 160, 140, 8);
    lbBg.lineStyle(1, 0x00f0ff, 0.35);
    lbBg.strokeRoundedRect(0, 0, 160, 140, 8);
    this.leaderboardContainer.add(lbBg);

    const lbTitle = this.add.text(80, 12, "TOP 5 KARYAWAN", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#94a3b8",
    }).setOrigin(0.5, 0);
    this.leaderboardContainer.add(lbTitle);

    for (let i = 0; i < 5; i++) {
      const entryText = this.add.text(12, 34 + i * 20, `${i + 1}. -`, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "11px",
        color: i === 0 ? "#ffd700" : "#cbd5e1",
      });
      this.leaderboardContainer.add(entryText);
      this.leaderboardEntries.push(entryText);
    }

    // Modal Game Over (Finished)
    this.modalContainer = this.add.container(400, 300).setDepth(200).setVisible(false);
    const mBg = this.add.graphics();
    mBg.fillStyle(0x030712, 0.95);
    mBg.fillRoundedRect(-220, -140, 440, 280, 16);
    mBg.lineStyle(2, 0x00f0ff, 0.8);
    mBg.strokeRoundedRect(-220, -140, 440, 280, 16);
    this.modalContainer.add(mBg);

    this.modalTitle = this.add.text(0, -90, "🏆 RACE SURVIVAL SELESAI!", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "24px",
      fontStyle: "bold",
      color: "#ffd700",
    }).setOrigin(0.5);
    this.modalContainer.add(this.modalTitle);

    this.modalWinner = this.add.text(0, -20, "Karyawan Teladan:\n-", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "18px",
      align: "center",
      color: "#ffffff",
    }).setOrigin(0.5);
    this.modalContainer.add(this.modalWinner);

    this.modalSub = this.add.text(0, 60, "Mempersiapkan ronde berikutnya dalam 10 detik...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "12px",
      color: "#94a3b8",
      align: "center",
    }).setOrigin(0.5);
    this.modalContainer.add(this.modalSub);
  }

  async connectToServer(authOptions: { serverUrl?: string; email?: string; password?: string; token?: string }) {
    if (authOptions.serverUrl) this.serverUrl = authOptions.serverUrl;

    try {
      this.statusBadge.setText("MENGHUBUNGKAN KE SERVER...");
      this.statusBadge.setColor("#38bdf8");
      this.client = new Colyseus.Client(this.serverUrl);

      this.room = await this.client.joinOrCreate("race_room", {
        email: authOptions.email,
        password: authOptions.password,
        token: authOptions.token,
      });

      console.log(`[Client] Berhasil bergabung ke room: ${this.room.id} (${this.room.sessionId})`);
      this.statusBadge.setText("TERHUBUNG (BAKNUS AUTH OK)");
      this.statusBadge.setColor("#10b981");

      this.setupRoomListeners();
      return { success: true, room: this.room };
    } catch (err: any) {
      console.error("[Client] Gagal konek ke server Colyseus:", err);
      const msg = err.message || "Gagal terhubung ke server.";
      this.statusBadge.setText("AUTENTIKASI GAGAL");
      this.statusBadge.setColor("#ef4444");
      throw new Error(msg);
    }
  }

  private setupRoomListeners() {
    // 1. Sinkronisasi Pemain (Players)
    this.room.state.players.onAdd((player: any, sessionId: string) => {
      const isLocal = sessionId === this.room.sessionId;
      const textureKey = isLocal ? "space_jet_local" : `space_jet_remote_${player.colorIndex || 0}`;

      const container = this.add.container(player.x, player.y).setDepth(30);

      // Api knalpot mesin di bagian bawah
      const exhaust = this.add.sprite(0, 16, "exhaust_flame");

      // Sprite Pesawat
      const sprite = this.add.sprite(0, 0, textureKey);

      // Label Nama
      const displayName = isLocal ? `★ ${player.name} (YOU)` : player.name;
      const nameText = this.add.text(0, -22, displayName, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: isLocal ? "#00f0ff" : "#f1f5f9",
      }).setOrigin(0.5);

      // Skor kecil
      const scoreText = this.add.text(0, -11, "0", {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "10px",
        color: "#ffd700",
      }).setOrigin(0.5);

      container.add([exhaust, sprite, nameText, scoreText]);

      const playerData: PlayerData = {
        container,
        sprite,
        exhaust,
        nameText,
        scoreText,
        targetX: player.x,
        targetY: player.y,
        isLocal,
      };

      this.players.set(sessionId, playerData);

      player.onChange(() => {
        playerData.targetX = player.x;
        playerData.targetY = player.y;
        playerData.scoreText.setText(`${player.score}`);

        if (isLocal) {
          this.myScoreText.setText(`SKOR: ${player.score}`);
        }

        if (player.invulnerableTimer > 0) {
          playerData.container.setAlpha(0.4);
        } else {
          playerData.container.setAlpha(1.0);
        }
      });
    });

    this.room.state.players.onRemove((_player: any, sessionId: string) => {
      const p = this.players.get(sessionId);
      if (p) {
        p.container.destroy();
        this.players.delete(sessionId);
      }
    });

    // 2. Sinkronisasi Peluru (Bullets)
    this.room.state.bullets.onAdd((bullet: any) => {
      const gfx = this.add.graphics().setDepth(20);
      const isLocal = bullet.playerId === this.room.sessionId;
      gfx.fillStyle(isLocal ? 0x00f0ff : 0xff3366, 1);
      gfx.fillRoundedRect(-2, -7, 4, 14, 2);
      gfx.x = bullet.x;
      gfx.y = bullet.y;

      const bulletData: BulletData = {
        sprite: gfx,
        targetX: bullet.x,
        targetY: bullet.y,
      };

      this.bullets.set(bullet.id, bulletData);

      bullet.onChange(() => {
        bulletData.targetX = bullet.x;
        bulletData.targetY = bullet.y;
      });
    });

    this.room.state.bullets.onRemove((bullet: any) => {
      const b = this.bullets.get(bullet.id);
      if (b) {
        b.sprite.destroy();
        this.bullets.delete(bullet.id);
      }
    });

    // 3. Sinkronisasi Koin (Coins Meluncur Turun)
    this.room.state.coins.onAdd((coin: any) => {
      let texture = "coin_25";
      if (coin.value === 50) texture = "coin_50";
      if (coin.value === 100) texture = "coin_100";

      const container = this.add.container(coin.x, coin.y).setDepth(15);
      const sprite = this.add.sprite(0, 0, texture);

      const valText = this.add.text(0, 0, `${coin.value}`, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: coin.value === 100 ? "12px" : "10px",
        fontStyle: "bold",
        color: "#050b14",
      }).setOrigin(0.5);

      container.add([sprite, valText]);

      const coinData: CoinData = {
        container,
        sprite,
        targetX: coin.x,
        targetY: coin.y,
        value: coin.value,
      };

      this.coins.set(coin.id, coinData);

      coin.onChange(() => {
        coinData.targetX = coin.x;
        coinData.targetY = coin.y;
        coinData.value = coin.value;

        let newTexture = "coin_25";
        if (coin.value === 50) newTexture = "coin_50";
        if (coin.value === 100) newTexture = "coin_100";
        sprite.setTexture(newTexture);
        valText.setText(`${coin.value}`);
      });
    });

    this.room.state.coins.onRemove((coin: any) => {
      const c = this.coins.get(coin.id);
      if (c) {
        c.container.destroy();
        this.coins.delete(coin.id);
      }
    });

    // 4. Sinkronisasi Musuh (Enemies Meluncur Turun)
    this.room.state.enemies.onAdd((enemy: any) => {
      const container = this.add.container(enemy.x, enemy.y).setDepth(25);
      const sprite = this.add.sprite(0, 0, "enemy_alien");

      const labelText = this.add.text(0, 26, enemy.name, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "10px",
        fontStyle: "bold",
        color: "#f87171",
      }).setOrigin(0.5);

      container.add([sprite, labelText]);

      const enemyData: EnemyData = {
        container,
        sprite,
        labelText,
        targetX: enemy.x,
        targetY: enemy.y,
      };

      this.enemies.set(enemy.id, enemyData);

      enemy.onChange(() => {
        enemyData.targetX = enemy.x;
        enemyData.targetY = enemy.y;
      });
    });

    // 5. Sinkronisasi Status Room & Timer
    this.room.state.onChange(() => {
      const status = this.room.state.status;
      const totalPlayers = this.room.state.players.size;

      if (status === "waiting") {
        this.statusBadge.setText(`MENUNGGU PEMAIN (${totalPlayers}/5 - Min 2)`);
        this.statusBadge.setColor("#38bdf8");
        this.timerText.setText("STANDBY");
        this.modalContainer.setVisible(false);
      } else if (status === "playing") {
        this.statusBadge.setText(`SURVIVAL AKTIF (${totalPlayers}/5)`);
        this.statusBadge.setColor("#10b981");
        this.timerText.setText(`WAKTU: ${this.room.state.countdown}s`);
        this.modalContainer.setVisible(false);
      } else if (status === "finished") {
        this.statusBadge.setText("SELESAI");
        this.statusBadge.setColor("#ffd700");
        this.modalWinner.setText(`Karyawan Teladan:\n⭐ ${this.room.state.winnerName} ⭐\nSkor Akhir: ${this.room.state.winnerScore}`);
        this.modalContainer.setVisible(true);
      }

      this.updateLeaderboard();
    });

    // 6. Broadcast Events dari Server
    this.room.onMessage("coin_collected", (data: any) => {
      this.spawnFloatingText(
        data.x, 
        data.y, 
        `+${data.value} ${data.label}!`, 
        data.value === 100 ? "#facc15" : (data.value === 50 ? "#06b6d4" : "#f59e0b")
      );

      if (data.playerId === this.room.sessionId) {
        sounds.playCoin(data.value);
      }
    });

    this.room.onMessage("enemy_destroyed", (data: any) => {
      this.spawnFloatingText(data.x, data.y, `+${data.points} HANCURKAN ${data.enemyName}!`, "#34d399");
      this.createExplosionEffect(data.x, data.y);

      if (data.killerId === this.room.sessionId) {
        sounds.playExplosion();
      }
    });

    this.room.onMessage("player_hit", (data: any) => {
      this.spawnFloatingText(data.x, data.y, `-50 BURNOUT! (${data.enemyName})`, "#ef4444");

      if (data.playerId === this.room.sessionId) {
        this.cameras.main.shake(250, 0.02);
        this.cameras.main.flash(200, 255, 0, 0);
        sounds.playHit();
      }
    });

    this.room.onMessage("game_over", () => {
      sounds.playGameOver();
    });
  }

  private createExplosionEffect(x: number, y: number) {
    const burst = this.add.graphics().setDepth(35);
    burst.fillStyle(0xffaa00, 1);
    burst.fillCircle(x, y, 16);
    burst.fillStyle(0xffff00, 1);
    burst.fillCircle(x, y, 9);

    this.tweens.add({
      targets: burst,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 350,
      ease: "Cubic.easeOut",
      onComplete: () => burst.destroy(),
    });
  }

  private updateLeaderboard() {
    if (!this.room || !this.room.state) return;

    const playerList: { name: string; score: number; isMe: boolean }[] = [];
    this.room.state.players.forEach((p: any, id: string) => {
      playerList.push({
        name: p.name,
        score: p.score,
        isMe: id === this.room.sessionId,
      });
    });

    playerList.sort((a, b) => b.score - a.score);

    for (let i = 0; i < 5; i++) {
      const entry = this.leaderboardEntries[i];
      if (i < playerList.length) {
        const item = playerList[i];
        const medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `${i + 1}.`));
        const meTag = item.isMe ? " [YOU]" : "";
        entry.setText(`${medal} ${item.name.substring(0, 8)}${meTag}: ${item.score}`);
        entry.setColor(item.isMe ? "#00f0ff" : (i === 0 ? "#ffd700" : "#cbd5e1"));
      } else {
        entry.setText(`${i + 1}. -`);
        entry.setColor("#475569");
      }
    }
  }

  private spawnFloatingText(x: number, y: number, message: string, color: string) {
    const text = this.add.text(x, y, message, {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      color: color,
    }).setOrigin(0.5).setDepth(150);

    this.tweens.add({
      targets: text,
      y: y - 25,
      alpha: 0,
      duration: 800,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  update(_time: number, delta: number) {
    const dtSec = delta / 1000;

    // 1. Scroll Starfield
    if (this.starGraphics) {
      this.starGraphics.clear();
      this.stars.forEach((star) => {
        star.y += star.speed * dtSec;
        if (star.y > 600) {
          star.y = 0;
          star.x = Math.random() * 800;
        }
        this.starGraphics.fillStyle(0xffffff, star.alpha);
        this.starGraphics.fillRect(star.x, star.y, star.size, star.size);
      });
    }

    // 2. Tangkap Input Pemain Lokal
    if (this.room && this.cursors) {
      const left = this.cursors.left.isDown || this.wasd.left.isDown;
      const right = this.cursors.right.isDown || this.wasd.right.isDown;
      const up = this.cursors.up.isDown || this.wasd.up.isDown;
      const down = this.cursors.down.isDown || this.wasd.down.isDown;
      const shoot = (this.spaceKey && this.spaceKey.isDown) || this.input.activePointer.isDown;

      if (this.localShootCooldown > 0) {
        this.localShootCooldown -= dtSec;
      }

      if (shoot && this.localShootCooldown <= 0) {
        this.localShootCooldown = 0.22;
        sounds.playLaser();
      }

      this.inputSendTimer += dtSec;
      const hasChanged =
        left !== this.lastInput.left ||
        right !== this.lastInput.right ||
        up !== this.lastInput.up ||
        down !== this.lastInput.down ||
        shoot !== this.lastInput.shoot;

      if (hasChanged || this.inputSendTimer >= 0.04) {
        this.lastInput = { left, right, up, down, shoot };
        this.inputSendTimer = 0;
        this.room.send("input", { left, right, up, down, shoot });
      }
    }

    // 3. Interpolasi Posisi Pemain
    this.players.forEach((p) => {
      p.container.x = Phaser.Math.Linear(p.container.x, p.targetX, 0.35);
      p.container.y = Phaser.Math.Linear(p.container.y, p.targetY, 0.35);
      // Animasi kedip exhaust
      p.exhaust.scaleY = 0.8 + Math.random() * 0.4;
    });

    // 4. Interpolasi Posisi Peluru
    this.bullets.forEach((b) => {
      b.sprite.x = b.targetX;
      b.sprite.y = Phaser.Math.Linear(b.sprite.y, b.targetY, 0.5);
    });

    // 5. Interpolasi Posisi Koin
    this.coins.forEach((c) => {
      c.container.x = Phaser.Math.Linear(c.container.x, c.targetX, 0.25);
      c.container.y = Phaser.Math.Linear(c.container.y, c.targetY, 0.25);
    });

    // 6. Interpolasi Posisi Musuh & Rotasi
    this.enemies.forEach((e) => {
      e.container.x = Phaser.Math.Linear(e.container.x, e.targetX, 0.3);
      e.container.y = Phaser.Math.Linear(e.container.y, e.targetY, 0.3);
      e.sprite.rotation += 2.5 * dtSec;
    });
  }
}
