import Phaser from "phaser";
import * as Colyseus from "colyseus.js";
import { sounds } from "../sound";

interface PlayerData {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  flame: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  scoreText: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  targetAngle: number;
  isLocal: boolean;
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
  vx: number;
  vy: number;
}

export class GameScene extends Phaser.Scene {
  private client!: Colyseus.Client;
  private room!: Colyseus.Room;
  private serverUrl: string = "ws://localhost:2567";
  private playerName: string = "Karyawan Teladan";

  // Entity tracking
  private players: Map<string, PlayerData> = new Map();
  private coins: Map<string, CoinData> = new Map();
  private enemies: Map<string, EnemyData> = new Map();

  // Input state
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private lastInput = { left: false, right: false, thrust: false };
  private inputSendTimer: number = 0;
  private thrustSoundTimer: number = 0;

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

  init(data: { serverUrl?: string; playerName?: string }) {
    if (data.serverUrl) this.serverUrl = data.serverUrl;
    if (data.playerName) this.playerName = data.playerName;
  }

  preload() {
    this.createProceduralTextures();
  }

  create() {
    // 1. Background Arena Futuristik & Grid Korporat
    this.drawBackground();

    // 2. Setup Keyboard Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    // 3. Setup UI HUD
    this.createHUD();

    // 4. Hubungkan ke Server Colyseus
    this.connectToServer();
  }

  private drawBackground() {
    const bg = this.add.graphics();
    // Warna dasar gelap
    bg.fillStyle(0x0a0f1d, 1);
    bg.fillRect(0, 0, 800, 600);

    // Garis grid korporat
    bg.lineStyle(1, 0x1e293b, 0.4);
    for (let x = 0; x <= 800; x += 40) {
      bg.lineBetween(x, 0, x, 600);
    }
    for (let y = 0; y <= 600; y += 40) {
      bg.lineBetween(0, y, 800, y);
    }

    // Garis batas arena neon
    bg.lineStyle(3, 0x00f0ff, 0.6);
    bg.strokeRect(10, 10, 780, 580);

    // Sudut dekorasi
    bg.fillStyle(0x00f0ff, 0.9);
    bg.fillRect(8, 8, 12, 12);
    bg.fillRect(780, 8, 12, 12);
    bg.fillRect(8, 580, 12, 12);
    bg.fillRect(780, 580, 12, 12);

    // Watermark satir di lantai arena
    const watermark = this.add.text(400, 300, "SSRace - CORPORATE SLIM SURVIVAL", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "26px",
      fontStyle: "bold",
      color: "#1e293b",
    }).setOrigin(0.5).setAlpha(0.35);
    watermark.setDepth(0);
  }

  private createProceduralTextures() {
    // 1. Pesawat Pemain Lokal (Neon Cyan Jet)
    const gPlayer = this.make.graphics({ x: 0, y: 0 });
    // Sayap jet
    gPlayer.fillStyle(0x00d2ff, 1);
    gPlayer.fillTriangle(24, 12, 0, 2, 6, 12);
    gPlayer.fillTriangle(24, 12, 6, 12, 0, 22);
    // Bodi utama
    gPlayer.fillStyle(0xffffff, 1);
    gPlayer.fillTriangle(26, 12, 4, 7, 4, 17);
    // Kokpit
    gPlayer.fillStyle(0x00f0ff, 1);
    gPlayer.fillCircle(15, 12, 3.5);
    gPlayer.generateTexture("plane_local", 28, 24);

    // 2. Pesawat Pemain Lain (Palet Warna Berbeda)
    const remoteColors = [0xff3366, 0x10b981, 0xa855f7, 0xf59e0b, 0xec4899];
    remoteColors.forEach((col, idx) => {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(col, 1);
      g.fillTriangle(24, 12, 0, 2, 6, 12);
      g.fillTriangle(24, 12, 6, 12, 0, 22);
      g.fillStyle(0xe2e8f0, 1);
      g.fillTriangle(26, 12, 4, 7, 4, 17);
      g.fillStyle(col, 1);
      g.fillCircle(15, 12, 3.5);
      g.generateTexture(`plane_remote_${idx}`, 28, 24);
    });

    // 3. Api Thruster
    const gFlame = this.make.graphics({ x: 0, y: 0 });
    gFlame.fillStyle(0xff7700, 1);
    gFlame.fillTriangle(0, 6, 12, 0, 12, 12);
    gFlame.fillStyle(0xffff00, 1);
    gFlame.fillTriangle(3, 6, 12, 3, 12, 9);
    gFlame.generateTexture("thrust_flame", 14, 12);

    // 4. Koin 25 - Uang Lembur (Oranye / Perunggu)
    const gCoin25 = this.make.graphics({ x: 0, y: 0 });
    gCoin25.fillStyle(0xf59e0b, 1);
    gCoin25.fillCircle(12, 12, 11);
    gCoin25.lineStyle(2, 0xffedd5, 0.9);
    gCoin25.strokeCircle(12, 12, 11);
    gCoin25.generateTexture("coin_25", 24, 24);

    // 5. Koin 50 - Tunjangan (Cyan / Perak)
    const gCoin50 = this.make.graphics({ x: 0, y: 0 });
    gCoin50.fillStyle(0x06b6d4, 1);
    gCoin50.fillCircle(14, 14, 13);
    gCoin50.lineStyle(2, 0xe0f2fe, 0.95);
    gCoin50.strokeCircle(14, 14, 13);
    gCoin50.generateTexture("coin_50", 28, 28);

    // 6. Koin 100 - Bonus KPI (Emas Bercahaya)
    const gCoin100 = this.make.graphics({ x: 0, y: 0 });
    gCoin100.fillStyle(0xeab308, 1);
    gCoin100.fillCircle(16, 16, 15);
    gCoin100.lineStyle(3, 0xfef08a, 1);
    gCoin100.strokeCircle(16, 16, 15);
    gCoin100.generateTexture("coin_100", 32, 32);

    // 7. Musuh / Corporate Obstacle (Spiky Danger Hazard Drone)
    const gEnemy = this.make.graphics({ x: 0, y: 0 });
    gEnemy.fillStyle(0xef4444, 1);
    gEnemy.fillCircle(20, 20, 18);
    // Duri hazard
    gEnemy.lineStyle(3, 0xffffff, 0.9);
    gEnemy.strokeCircle(20, 20, 18);
    // Simbol X / bahaya di tengah
    gEnemy.lineStyle(3, 0x7f1d1d, 1);
    gEnemy.lineBetween(13, 13, 27, 27);
    gEnemy.lineBetween(27, 13, 13, 27);
    gEnemy.generateTexture("enemy_drone", 40, 40);
  }

  private createHUD() {
    const hudY = 24;

    // Header Background Bar
    const hudBar = this.add.graphics();
    hudBar.fillStyle(0x0f172a, 0.75);
    hudBar.fillRoundedRect(20, 14, 760, 44, 8);
    hudBar.lineStyle(1, 0x334155, 0.8);
    hudBar.strokeRoundedRect(20, 14, 760, 44, 8);
    hudBar.setDepth(100);

    // Status Room / Countdown Timer
    this.statusBadge = this.add.text(35, hudY + 12, "MENUNGGU REKAN KERJA...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#38bdf8",
    }).setOrigin(0, 0.5).setDepth(101);

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
    lbBg.fillStyle(0x0f172a, 0.85);
    lbBg.fillRoundedRect(0, 0, 160, 140, 8);
    lbBg.lineStyle(1, 0x00f0ff, 0.3);
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

    this.modalTitle = this.add.text(0, -90, "🏆 RACE KERJA SELESAI!", {
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

    this.modalSub = this.add.text(0, 60, "Mempersiapkan ronde lembur berikutnya dalam 10 detik...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "12px",
      color: "#94a3b8",
      align: "center",
    }).setOrigin(0.5);
    this.modalContainer.add(this.modalSub);
  }

  async connectToServer(customUrl?: string, customName?: string) {
    if (customUrl) this.serverUrl = customUrl;
    if (customName) this.playerName = customName;

    try {
      this.statusBadge.setText("MENGHUBUNGKAN KE KANTOR...");
      this.client = new Colyseus.Client(this.serverUrl);

      // Join room atau buat baru jika room penuh (maxClients: 5)
      this.room = await this.client.joinOrCreate("race_room", {
        name: this.playerName,
      });

      console.log(`[Client] Berhasil bergabung ke room: ${this.room.id} (${this.room.sessionId})`);
      this.statusBadge.setText("TERHUBUNG");

      this.setupRoomListeners();
    } catch (err: any) {
      console.error("[Client] Gagal konek ke server Colyseus:", err);
      this.statusBadge.setText("GAGAL TERHUBUNG (Cek Server)");
      this.statusBadge.setColor("#ef4444");
    }
  }

  private setupRoomListeners() {
    // 1. Sinkronisasi Pemain (Players)
    this.room.state.players.onAdd((player: any, sessionId: string) => {
      const isLocal = sessionId === this.room.sessionId;
      const textureKey = isLocal ? "plane_local" : `plane_remote_${player.colorIndex || 0}`;

      const container = this.add.container(player.x, player.y).setDepth(20);

      // Api Thruster
      const flame = this.add.sprite(-14, 0, "thrust_flame").setVisible(false);

      // Pesawat
      const sprite = this.add.sprite(0, 0, textureKey);

      // Label Nama
      const displayName = isLocal ? `★ ${player.name} (YOU)` : player.name;
      const nameText = this.add.text(0, -22, displayName, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: isLocal ? "#00f0ff" : "#f1f5f9",
      }).setOrigin(0.5);

      // Skor Kecil di atas Pesawat
      const scoreText = this.add.text(0, -11, "0", {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "10px",
        color: "#ffd700",
      }).setOrigin(0.5);

      container.add([flame, sprite, nameText, scoreText]);

      const playerData: PlayerData = {
        container,
        sprite,
        flame,
        nameText,
        scoreText,
        targetX: player.x,
        targetY: player.y,
        targetAngle: player.angle,
        isLocal,
      };

      this.players.set(sessionId, playerData);

      // Listen perubahan properti pemain
      player.onChange(() => {
        playerData.targetX = player.x;
        playerData.targetY = player.y;
        playerData.targetAngle = player.angle;
        playerData.flame.setVisible(player.isThrusting);
        playerData.scoreText.setText(`${player.score}`);

        if (isLocal) {
          this.myScoreText.setText(`SKOR: ${player.score}`);
        }

        // Efek blink jika invulnerable
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

    // 2. Sinkronisasi Koin (Coins)
    this.room.state.coins.onAdd((coin: any) => {
      let texture = "coin_25";
      if (coin.value === 50) texture = "coin_50";
      if (coin.value === 100) texture = "coin_100";

      const container = this.add.container(coin.x, coin.y).setDepth(10);
      const sprite = this.add.sprite(0, 0, texture);

      const valText = this.add.text(0, 0, `${coin.value}`, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: coin.value === 100 ? "11px" : "9px",
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

    // 3. Sinkronisasi Musuh (Enemies)
    this.room.state.enemies.onAdd((enemy: any) => {
      const container = this.add.container(enemy.x, enemy.y).setDepth(15);
      const sprite = this.add.sprite(0, 0, "enemy_drone");

      const labelText = this.add.text(0, 24, enemy.name, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "10px",
        fontStyle: "bold",
        color: "#ef4444",
      }).setOrigin(0.5);

      container.add([sprite, labelText]);

      const enemyData: EnemyData = {
        container,
        sprite,
        labelText,
        targetX: enemy.x,
        targetY: enemy.y,
        vx: enemy.vx,
        vy: enemy.vy,
      };

      this.enemies.set(enemy.id, enemyData);

      enemy.onChange(() => {
        enemyData.targetX = enemy.x;
        enemyData.targetY = enemy.y;
        enemyData.vx = enemy.vx;
        enemyData.vy = enemy.vy;
      });
    });

    // 4. Sinkronisasi Status Room & Timer
    this.room.state.onChange(() => {
      const status = this.room.state.status;
      const totalPlayers = this.room.state.players.size;

      if (status === "waiting") {
        this.statusBadge.setText(`MENUNGGU PEMAIN (${totalPlayers}/5 - Min 2)`);
        this.statusBadge.setColor("#38bdf8");
        this.timerText.setText("STANDBY");
        this.modalContainer.setVisible(false);
      } else if (status === "playing") {
        this.statusBadge.setText(`RACE KERJA AKTIF (${totalPlayers}/5)`);
        this.statusBadge.setColor("#10b981");
        this.timerText.setText(`WAKTU: ${this.room.state.countdown}s`);
        this.modalContainer.setVisible(false);
      } else if (status === "finished") {
        this.statusBadge.setText("LEMBUR SELESAI");
        this.statusBadge.setColor("#ffd700");
        this.modalWinner.setText(`Karyawan Teladan:\n⭐ ${this.room.state.winnerName} ⭐\nSkor Akhir: ${this.room.state.winnerScore}`);
        this.modalContainer.setVisible(true);
      }

      this.updateLeaderboard();
    });

    // 5. Pesan Broadcast dari Server
    this.room.onMessage("coin_collected", (data: any) => {
      // Efek floating teks skor
      this.spawnFloatingText(
        data.x, 
        data.y, 
        `+${data.value} ${data.label}!`, 
        data.value === 100 ? "#facc15" : (data.value === 50 ? "#06b6d4" : "#f59e0b")
      );

      // Suara koin
      if (data.playerId === this.room.sessionId) {
        sounds.playCoin(data.value);
      }
    });

    this.room.onMessage("player_hit", (data: any) => {
      // Efek benturan bahaya
      this.spawnFloatingText(data.x, data.y, `-50 BURNOUT! (${data.enemyName})`, "#ef4444");

      if (data.playerId === this.room.sessionId) {
        this.cameras.main.shake(250, 0.015);
        this.cameras.main.flash(200, 255, 0, 0);
        sounds.playHit();
      }
    });

    this.room.onMessage("game_over", () => {
      sounds.playGameOver();
    });
  }

  private updateLeaderboard() {
    if (!this.room || !this.room.state) return;

    // Ambil semua pemain dan urutkan berdasarkan skor tertinggi
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
      y: y - 30,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  update(_time: number, delta: number) {
    const dtSec = delta / 1000;

    // 1. Tangkap Input Pemain Lokal
    if (this.room && this.cursors) {
      const left = this.cursors.left.isDown || this.wasd.left.isDown;
      const right = this.cursors.right.isDown || this.wasd.right.isDown;
      const thrust = this.cursors.up.isDown || this.wasd.up.isDown;

      if (thrust) {
        this.thrustSoundTimer += dtSec;
        if (this.thrustSoundTimer >= 0.12) {
          this.thrustSoundTimer = 0;
          sounds.playThrust();
        }
      }

      // Kirim input ke room Colyseus jika ada perubahan atau berkala
      this.inputSendTimer += dtSec;
      const hasChanged = 
        left !== this.lastInput.left ||
        right !== this.lastInput.right ||
        thrust !== this.lastInput.thrust;

      if (hasChanged || this.inputSendTimer >= 0.05) {
        this.lastInput = { left, right, thrust };
        this.inputSendTimer = 0;
        this.room.send("input", { left, right, thrust });
      }
    }

    // 2. Interpolasi Posisi Pemain yang Halus (Smooth Lerp)
    this.players.forEach((p) => {
      p.container.x = Phaser.Math.Linear(p.container.x, p.targetX, 0.25);
      p.container.y = Phaser.Math.Linear(p.container.y, p.targetY, 0.25);

      // Interpolasi rotasi sudut pesawat
      const currentAngleRad = Phaser.Math.DegToRad(p.sprite.angle);
      const targetAngleRad = Phaser.Math.DegToRad(p.targetAngle);
      const shortestAngle = Phaser.Math.Angle.Wrap(targetAngleRad - currentAngleRad);
      p.sprite.angle += Phaser.Math.RadToDeg(shortestAngle) * 0.3;
      p.flame.angle = p.sprite.angle;
    });

    // 3. Interpolasi Posisi Koin
    this.coins.forEach((c) => {
      c.container.x = Phaser.Math.Linear(c.container.x, c.targetX, 0.2);
      c.container.y = Phaser.Math.Linear(c.container.y, c.targetY, 0.2);
    });

    // 4. Interpolasi Posisi Musuh & Efek Rotasi Drone
    this.enemies.forEach((e) => {
      e.container.x = Phaser.Math.Linear(e.container.x, e.targetX, 0.3);
      e.container.y = Phaser.Math.Linear(e.container.y, e.targetY, 0.3);
      e.sprite.rotation += 4 * dtSec; // Berputar seperti gergaji / drone aktif
    });
  }
}
