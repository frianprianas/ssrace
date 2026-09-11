import Phaser from "phaser";
import * as Colyseus from "colyseus.js";
import { sounds } from "../sound";

interface PlayerData {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  exhaust: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  scoreText: Phaser.GameObjects.Text;
  hpText: Phaser.GameObjects.Text;
  hpBarGfx?: Phaser.GameObjects.Graphics;
  beaconRing?: Phaser.GameObjects.Graphics;
  markerTag?: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  isLocal: boolean;
}

interface BulletData {
  sprite: Phaser.GameObjects.Graphics;
  targetX: number;
  targetY: number;
  isEnemy: boolean;
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
  exhaust: Phaser.GameObjects.Sprite;
  labelText: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

export class GameScene extends Phaser.Scene {
  private client!: Colyseus.Client;
  private room!: Colyseus.Room;
  private serverUrl: string = "ws://localhost:2567";
  public lastAuthOptions: any = null;

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

  // Touch input dari smartphone
  public touchInput = { left: false, right: false, up: false, down: false, shoot: false };

  // HUD Elements
  private timerText!: Phaser.GameObjects.Text;
  private statusBadge!: Phaser.GameObjects.Text;
  private myScoreText!: Phaser.GameObjects.Text;
  private myHpText!: Phaser.GameObjects.Text;
  private myHpBarFill!: Phaser.GameObjects.Graphics;
  private myHpValText!: Phaser.GameObjects.Text;
  private myCumulativeText!: Phaser.GameObjects.Text;
  private leaderboardContainer!: Phaser.GameObjects.Container;
  private leaderboardEntries: Phaser.GameObjects.Text[] = [];

  // Match Finished Modal
  private modalContainer!: Phaser.GameObjects.Container;
  private modalWinner!: Phaser.GameObjects.Text;

  // Elimination / Game Over Modal
  private eliminatedModal!: Phaser.GameObjects.Container;
  private elimReasonText!: Phaser.GameObjects.Text;
  private elimScoreText!: Phaser.GameObjects.Text;

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

    // 2. Setup Keyboard Input
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

    // 3. Setup Touch Drag & Tap Langsung di Layar (Smartphone Touchscreen Support)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      sounds.unlockAudio();
      // Hanya jika tap di area kanan atas canvas (bukan area kontrol touch D-Pad)
      if (pointer.x > 480 && pointer.y < 460) {
        this.touchInput.shoot = true;
      }
    });

    this.input.on("pointerup", () => {
      // Selalu batalkan arah geser begitu jari diangkat dari layar agar tidak over-steering!
      this.touchInput.left = false;
      this.touchInput.right = false;
      this.touchInput.shoot = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      // Kendali geser halus dengan deadzone 35px agar tidak over-steering di smartphone
      if (pointer.isDown && pointer.x <= 500 && pointer.y < 460) {
        const myPlayer = this.players.get(this.room?.sessionId || "");
        if (myPlayer) {
          const diff = pointer.x - myPlayer.container.x;
          if (Math.abs(diff) > 35) {
            this.touchInput.left = diff < 0;
            this.touchInput.right = diff > 0;
          } else {
            this.touchInput.left = false;
            this.touchInput.right = false;
          }
        }
      }
    });

    // 4. Setup UI HUD
    this.createHUD();

    // 5. Setup Modals
    this.createFinishedModal();
    this.createEliminatedModal();

    // 6. Status Awal Menunggu Login
    this.statusBadge.setText("MENUNGGU LOGIN BAKNUS MAIL");
    this.statusBadge.setColor("#f59e0b");
  }

  private initStarfield() {
    this.starGraphics = this.add.graphics().setDepth(1);
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        speed: 40 + Math.random() * 160,
        size: Math.random() < 0.25 ? 2.5 : (Math.random() < 0.6 ? 1.8 : 1),
        alpha: 0.3 + Math.random() * 0.7,
      });
    }

    // Garis pertahanan neon bawah
    const defLine = this.add.graphics().setDepth(2);
    defLine.lineStyle(1.5, 0x00f0ff, 0.35);
    defLine.lineBetween(0, 440, 800, 440);
    defLine.lineStyle(1, 0x334155, 0.5);
    defLine.lineBetween(0, 560, 800, 560);
  }

  /**
   * Pembuatan tekstur grafis prosedural berkualitas tinggi (Zero byte eksternal)
   */
  private createProceduralTextures() {
    // 1. Pesawat Pemain Lokal (Cyber Cyan Interceptor)
    const gPlayer = this.make.graphics({ x: 0, y: 0 });
    gPlayer.fillStyle(0x00f0ff, 1);
    gPlayer.fillTriangle(16, 0, 0, 30, 7, 22);
    gPlayer.fillTriangle(16, 0, 25, 22, 32, 30);
    gPlayer.fillStyle(0xffffff, 1);
    gPlayer.fillTriangle(16, 2, 9, 25, 23, 25);
    gPlayer.fillStyle(0x0077ff, 1);
    gPlayer.fillRect(13, 8, 6, 12);
    gPlayer.fillStyle(0x38bdf8, 1);
    gPlayer.fillCircle(16, 12, 3.5);
    gPlayer.generateTexture("space_jet_local", 32, 32);

    // 2. Pesawat Pemain Lain (5 Palet Warna Kontras)
    const palettes = [
      { wing: 0xd97706, body: 0xffedd5, accent: 0xf59e0b }, // Solar Amber
      { wing: 0x059669, body: 0xd1fae5, accent: 0x10b981 }, // Cyber Emerald
      { wing: 0x7c3aed, body: 0xede9fe, accent: 0xa855f7 }, // Royal Amethyst
      { wing: 0xe11d48, body: 0xffe4e6, accent: 0xf43f5e }, // Crimson Rose
      { wing: 0x0891b2, body: 0xcffafe, accent: 0x06b6d4 }  // Electric Blue
    ];

    palettes.forEach((pal, idx) => {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(pal.wing, 1);
      g.fillTriangle(16, 0, 0, 30, 8, 22);
      g.fillTriangle(16, 0, 24, 22, 32, 30);
      g.fillStyle(pal.body, 1);
      g.fillTriangle(16, 2, 9, 26, 23, 26);
      g.fillStyle(pal.accent, 1);
      g.fillRect(14, 10, 4, 12);
      g.fillCircle(16, 12, 3.5);
      g.generateTexture(`space_jet_remote_${idx}`, 32, 32);
    });

    // 3. Exhaust Api Mesin Pemain (Menghadap Bawah)
    const gExhaust = this.make.graphics({ x: 0, y: 0 });
    gExhaust.fillStyle(0x00f0ff, 0.9);
    gExhaust.fillTriangle(2, 0, 0, 10, 4, 10);
    gExhaust.fillTriangle(8, 0, 6, 10, 10, 10);
    gExhaust.fillStyle(0xffffff, 1);
    gExhaust.fillTriangle(2, 0, 1, 6, 3, 6);
    gExhaust.fillTriangle(8, 0, 7, 6, 9, 6);
    gExhaust.generateTexture("exhaust_flame", 12, 10);

    // 4. Exhaust Api Mesin Pesawat Musuh (Menghadap Atas)
    const gEnemyExhaust = this.make.graphics({ x: 0, y: 0 });
    gEnemyExhaust.fillStyle(0xef4444, 0.9);
    gEnemyExhaust.fillTriangle(2, 10, 0, 0, 4, 0);
    gEnemyExhaust.fillTriangle(8, 10, 6, 0, 10, 0);
    gEnemyExhaust.fillStyle(0xffedd5, 1);
    gEnemyExhaust.fillTriangle(2, 10, 1, 4, 3, 4);
    gEnemyExhaust.fillTriangle(8, 10, 7, 4, 9, 4);
    gEnemyExhaust.generateTexture("enemy_exhaust_flame", 12, 10);

    // 5. Pesawat Tempur Musuh (5 Varian Pesawat Menghadap ke Bawah)
    const enemyColors = [
      { wing: 0x991b1b, body: 0x450a0a, cockpit: 0xff0055, trim: 0xf87171 }, // 0: Crimson Destroyer
      { wing: 0x581c87, body: 0x3b0764, cockpit: 0xd946ef, trim: 0xc084fc }, // 1: Void Reaper
      { wing: 0x831843, body: 0x500724, cockpit: 0xf43f5e, trim: 0xfb7185 }, // 2: Shadow Raider
      { wing: 0x78350f, body: 0x451a03, cockpit: 0xf59e0b, trim: 0xfbbf24 }, // 3: Dread Battleship
      { wing: 0x1e293b, body: 0x0f172a, cockpit: 0xef4444, trim: 0x94a3b8 }  // 4: Stealth Interceptor
    ];

    enemyColors.forEach((ec, idx) => {
      const gE = this.make.graphics({ x: 0, y: 0 });
      // Sayap Menghadap ke Bawah
      gE.fillStyle(ec.wing, 1);
      gE.fillTriangle(20, 38, 0, 6, 8, 16);
      gE.fillTriangle(20, 38, 32, 16, 40, 6);

      // Bodi Pesawat
      gE.fillStyle(ec.body, 1);
      gE.fillTriangle(20, 36, 9, 8, 31, 8);

      // Garis Aksen & Armor
      gE.lineStyle(1.5, ec.trim, 0.9);
      gE.lineBetween(20, 10, 20, 34);
      gE.lineBetween(8, 16, 20, 26);
      gE.lineBetween(32, 16, 20, 26);

      // Kokpit Merah Menyala
      gE.fillStyle(ec.cockpit, 1);
      gE.fillCircle(20, 20, 4);

      // Moncong Meriam Tembak
      gE.fillStyle(0xffffff, 1);
      gE.fillRect(18, 34, 4, 6);

      gE.generateTexture(`enemy_spaceship_${idx}`, 40, 40);
    });

    // 6. Koin 25 - Uang Lembur (Oranye / Tembaga Berkilau)
    const gCoin25 = this.make.graphics({ x: 0, y: 0 });
    gCoin25.fillStyle(0xf59e0b, 1);
    gCoin25.fillCircle(14, 14, 13);
    gCoin25.lineStyle(2, 0xffedd5, 1);
    gCoin25.strokeCircle(14, 14, 13);
    gCoin25.lineStyle(1.5, 0xd97706, 0.8);
    gCoin25.strokeCircle(14, 14, 8);
    gCoin25.generateTexture("coin_25", 28, 28);

    // 7. Koin 50 - Tunjangan (Cyan / Perak)
    const gCoin50 = this.make.graphics({ x: 0, y: 0 });
    gCoin50.fillStyle(0x06b6d4, 1);
    gCoin50.fillCircle(16, 16, 15);
    gCoin50.lineStyle(2.5, 0xe0f2fe, 1);
    gCoin50.strokeCircle(16, 16, 15);
    gCoin50.lineStyle(1.5, 0x0891b2, 0.8);
    gCoin50.strokeCircle(16, 16, 9);
    gCoin50.generateTexture("coin_50", 32, 32);

    // 8. Koin 100 - Bonus KPI (Bintang Emas Bersinar)
    const gCoin100 = this.make.graphics({ x: 0, y: 0 });
    gCoin100.fillStyle(0xeab308, 1);
    gCoin100.fillCircle(18, 18, 17);
    gCoin100.lineStyle(3, 0xfef08a, 1);
    gCoin100.strokeCircle(18, 18, 17);
    gCoin100.fillStyle(0xfef08a, 0.85);
    gCoin100.fillCircle(18, 18, 7);
    gCoin100.generateTexture("coin_100", 36, 36);
  }

  private createHUD() {
    const hudY = 24;

    // Header Background Bar
    const hudBar = this.add.graphics().setDepth(100);
    hudBar.fillStyle(0x0f172a, 0.9);
    hudBar.fillRoundedRect(12, 12, 776, 48, 8);
    hudBar.lineStyle(1, 0x00f0ff, 0.35);
    hudBar.strokeRoundedRect(12, 12, 776, 48, 8);

    // 1. Status Room (Kiri)
    this.statusBadge = this.add.text(24, hudY + 12, "STANDBY", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#38bdf8",
    }).setOrigin(0, 0.5).setDepth(101);

    // 2. Health / Darah Progress Bar (Pemain Lokal)
    const hpBox = this.add.graphics().setDepth(101);
    hpBox.fillStyle(0x050b14, 0.95);
    hpBox.fillRoundedRect(190, hudY + 4, 116, 16, 4);
    hpBox.lineStyle(1, 0x334155, 0.8);
    hpBox.strokeRoundedRect(190, hudY + 4, 116, 16, 4);

    this.myHpBarFill = this.add.graphics().setDepth(102);

    this.myHpText = this.add.text(182, hudY + 12, "🛡️", {
      fontSize: "13px"
    }).setOrigin(1, 0.5).setDepth(103);

    this.myHpValText = this.add.text(248, hudY + 12, "5/5 (100%)", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "10px",
      fontStyle: "bold",
      color: "#ffffff"
    }).setOrigin(0.5, 0.5).setDepth(103);

    // 3. Countdown Timer (Tengah)
    this.timerText = this.add.text(395, hudY + 12, "WAKTU: 120s", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#ffd700",
    }).setOrigin(0.5, 0.5).setDepth(101);

    // 4. Skor Match Ini
    this.myScoreText = this.add.text(550, hudY + 12, "MATCH: 0", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#00f0ff",
    }).setOrigin(0.5, 0.5).setDepth(101);

    // 5. Total Akumulasi Skor Kantor (Kanan)
    this.myCumulativeText = this.add.text(772, hudY + 12, "TOTAL: 0", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#a855f7",
    }).setOrigin(1, 0.5).setDepth(101);

    // Inisialisasi awal render HUD health bar
    this.updateHUDHealthBar(5, 5);

    // Leaderboard Match Box (Top 5) di kanan atas
    this.leaderboardContainer = this.add.container(620, 70).setDepth(100);
    const lbBg = this.add.graphics();
    lbBg.fillStyle(0x0f172a, 0.88);
    lbBg.fillRoundedRect(0, 0, 160, 140, 8);
    lbBg.lineStyle(1, 0x00f0ff, 0.35);
    lbBg.strokeRoundedRect(0, 0, 160, 140, 8);
    this.leaderboardContainer.add(lbBg);

    const lbTitle = this.add.text(80, 12, "🏆 LIVE MATCH", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#00f0ff",
    }).setOrigin(0.5);
    this.leaderboardContainer.add(lbTitle);

    this.leaderboardEntries = [];
    for (let i = 0; i < 5; i++) {
      const entry = this.add.text(12, 34 + i * 19, `${i + 1}. -`, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "10px",
        color: "#94a3b8",
      });
      this.leaderboardContainer.add(entry);
      this.leaderboardEntries.push(entry);
    }
  }

  private createFinishedModal() {
    this.modalContainer = this.add.container(400, 300).setDepth(500).setVisible(false);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x050b14, 0.9);
    backdrop.fillRoundedRect(-220, -140, 440, 280, 16);
    backdrop.lineStyle(2, 0xffd700, 0.85);
    backdrop.strokeRoundedRect(-220, -140, 440, 280, 16);
    this.modalContainer.add(backdrop);

    const title = this.add.text(0, -95, "🏁 RACE SURVIVAL SELESAI! 🏁", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#ffd700",
    }).setOrigin(0.5);
    this.modalContainer.add(title);

    this.modalWinner = this.add.text(0, -15, "Menghitung skor...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: "#fff",
      align: "center",
    }).setOrigin(0.5);
    this.modalContainer.add(this.modalWinner);

    const sub = this.add.text(0, 75, "Poin Anda telah diakumulasikan ke Database Kantor!\nRonde berikutnya dimulai otomatis...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "12px",
      color: "#94a3b8",
      align: "center",
    }).setOrigin(0.5);
    this.modalContainer.add(sub);
  }

  private createEliminatedModal() {
    this.eliminatedModal = this.add.container(400, 300).setDepth(600).setVisible(false);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x0a0508, 0.94);
    backdrop.fillRoundedRect(-230, -160, 460, 320, 16);
    backdrop.lineStyle(2.5, 0xef4444, 0.9);
    backdrop.strokeRoundedRect(-230, -160, 460, 320, 16);
    this.eliminatedModal.add(backdrop);

    const title = this.add.text(0, -110, "💥 TERELIMINASI! (GAME OVER) 💥", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#ef4444",
    }).setOrigin(0.5);
    this.eliminatedModal.add(title);

    this.elimReasonText = this.add.text(0, -55, "Pesawat Anda terkena tembakan musuh 5x!", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "14px",
      color: "#fca5a5",
      align: "center",
    }).setOrigin(0.5);
    this.eliminatedModal.add(this.elimReasonText);

    this.elimScoreText = this.add.text(0, 10, "Skor Match: 0 Poin\nTotal Akumulasi Kantor: 0 Poin", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#ffd700",
      align: "center",
      lineSpacing: 8,
    }).setOrigin(0.5);
    this.eliminatedModal.add(this.elimScoreText);

    // Tombol Masuk Arena Balap Lagi
    const btnRejoin = this.add.graphics();
    btnRejoin.fillStyle(0x00f0ff, 1);
    btnRejoin.fillRoundedRect(-150, 85, 300, 44, 8);
    this.eliminatedModal.add(btnRejoin);

    const btnText = this.add.text(0, 107, "🚀 MASUK ARENA BALAP LAGI", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#050b14",
    }).setOrigin(0.5);
    this.eliminatedModal.add(btnText);

    const hitZone = this.add.zone(0, 107, 300, 44).setInteractive({ cursor: "pointer" });
    hitZone.on("pointerdown", () => {
      this.eliminatedModal.setVisible(false);
      this.reconnect();
    });
    this.eliminatedModal.add(hitZone);
  }

  public cleanupEntities() {
    this.players.forEach((p) => {
      try { p.container.destroy(); } catch (e) {}
    });
    this.players.clear();
    this.bullets.forEach((b) => {
      try { b.sprite.destroy(); } catch (e) {}
    });
    this.bullets.clear();
    this.coins.forEach((c) => {
      try { c.container.destroy(); } catch (e) {}
    });
    this.coins.clear();
    this.enemies.forEach((e) => {
      try { e.container.destroy(); } catch (e) {}
    });
    this.enemies.clear();
  }

  async connectToServer(authOptions: { serverUrl?: string; email?: string; password?: string; token?: string; roomNumber?: number }) {
    this.lastAuthOptions = authOptions;
    if (authOptions.serverUrl) this.serverUrl = authOptions.serverUrl;
    const roomNumber = authOptions.roomNumber || 1;

    try {
      this.statusBadge.setText(`SEKTOR ${roomNumber} • MENGHUBUNGKAN...`);
      this.statusBadge.setColor("#38bdf8");

      // Bersihkan room dan objek sebelumnya secara menyeluruh agar tidak ada bekas kapal
      if (this.room) {
        try { this.room.leave(); } catch (e) {}
      }
      this.cleanupEntities();
      if (this.eliminatedModal) this.eliminatedModal.setVisible(false);
      if (this.modalContainer) this.modalContainer.setVisible(false);

      this.client = new Colyseus.Client(this.serverUrl);

      this.room = await this.client.joinOrCreate("race_room", {
        email: authOptions.email,
        password: authOptions.password,
        token: authOptions.token,
        roomNumber: roomNumber,
      });

      console.log(`[Client] Berhasil bergabung ke Sektor ${roomNumber}: ${this.room.id} (${this.room.sessionId})`);
      this.statusBadge.setText(`SEKTOR ${roomNumber} • AKTIF`);
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

  private async reconnect() {
    if (this.eliminatedModal) this.eliminatedModal.setVisible(false);
    this.cleanupEntities();

    if (this.lastAuthOptions) {
      try {
        await this.connectToServer(this.lastAuthOptions);
      } catch (e) {
        console.warn("Gagal auto-rejoin:", e);
        const loginModal = document.getElementById("login-modal");
        if (loginModal) loginModal.style.display = "flex";
      }
    } else {
      const loginModal = document.getElementById("login-modal");
      if (loginModal) loginModal.style.display = "flex";
    }
  }

  private setupRoomListeners() {
    // 1. Sinkronisasi Pemain (Players)
    this.room.state.players.onAdd((player: any, sessionId: string) => {
      const isLocal = sessionId === this.room.sessionId;
      const textureKey = isLocal ? "space_jet_local" : `space_jet_remote_${player.colorIndex || 0}`;

      const container = this.add.container(player.x, player.y).setDepth(30);

      // A. PENANDA KHUSUS PESAWAT SENDIRI (Halo Neon Cyan Berdenyut)
      let beaconRing: Phaser.GameObjects.Graphics | undefined;
      let markerTag: Phaser.GameObjects.Text | undefined;

      if (isLocal) {
        beaconRing = this.add.graphics();
        beaconRing.lineStyle(2.5, 0x00f0ff, 0.85);
        beaconRing.strokeCircle(0, 0, 32);
        beaconRing.fillStyle(0x00f0ff, 0.15);
        beaconRing.fillCircle(0, 0, 32);
        container.add(beaconRing);

        // Label Tag Panah "▼ ANDA" di atas kepala pesawat
        markerTag = this.add.text(0, -44, "▼ ANDA", {
          fontFamily: "'Outfit', sans-serif",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#00f0ff",
        }).setOrigin(0.5);
        container.add(markerTag);
      }

      // Api knalpot mesin
      const exhaust = this.add.sprite(0, 20, "exhaust_flame");
      exhaust.setScale(1.3);

      // Sprite Pesawat Pemain (Diperbesar 35% agar gagah & jelas di smartphone)
      const sprite = this.add.sprite(0, 0, textureKey);
      sprite.setScale(1.35);

      // Label Nama
      const displayName = isLocal ? `★ ${player.name}` : player.name;
      const nameText = this.add.text(0, -28, displayName, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: isLocal ? "#00f0ff" : "#f1f5f9",
      }).setOrigin(0.5);

      // Mini Health Bar mengambang di atas badan pesawat
      const hpBarGfx = this.add.graphics();
      this.renderShipHpBar(hpBarGfx, player.hp || 5, 5);

      // Ikon Nyawa Hati
      const hpHearts = "❤️".repeat(Math.max(0, player.hp || 5)) + "🖤".repeat(Math.max(0, 5 - (player.hp || 5)));
      const hpText = this.add.text(0, -6, hpHearts, {
        fontSize: "8px"
      }).setOrigin(0.5);

      // Skor kecil
      const scoreText = this.add.text(0, 28, "0", {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "10px",
        color: "#ffd700",
      }).setOrigin(0.5);

      container.add([exhaust, sprite, hpBarGfx, nameText, hpText, scoreText]);

      const playerData: PlayerData = {
        container,
        sprite,
        exhaust,
        nameText,
        scoreText,
        hpText,
        hpBarGfx,
        beaconRing,
        markerTag,
        targetX: player.x,
        targetY: player.y,
        isLocal,
      };

      this.players.set(sessionId, playerData);

      // Update HUD awal
      if (isLocal) {
        this.myScoreText.setText(`MATCH: ${player.score}`);
        this.myCumulativeText.setText(`TOTAL: ${player.cumulativeScore || 0}`);
        this.updateHUDHealthBar(player.hp || 5, 5);
      }

      player.onChange(() => {
        playerData.targetX = player.x;
        playerData.targetY = player.y;
        playerData.scoreText.setText(`⭐ ${player.score}`);

        if (playerData.hpBarGfx) {
          this.renderShipHpBar(playerData.hpBarGfx, player.hp, 5);
        }

        const currentHearts = "❤️".repeat(Math.max(0, player.hp)) + "🖤".repeat(Math.max(0, 5 - player.hp));
        playerData.hpText.setText(currentHearts);

        if (isLocal) {
          this.myScoreText.setText(`MATCH: ${player.score}`);
          this.myCumulativeText.setText(`TOTAL: ${player.cumulativeScore || 0}`);
          this.updateHUDHealthBar(player.hp, 5);

          const badgeTotal = document.getElementById("badge-total-score");
          if (badgeTotal) {
            badgeTotal.innerText = `⭐ Total: ${((player.cumulativeScore || 0) + player.score).toLocaleString()} Poin`;
          }
        }

        if (player.invulnerableTimer > 0) {
          playerData.container.setAlpha(0.4);
        } else {
          playerData.container.setAlpha(1.0);
        }

        this.updateLeaderboard();
      });
    });

    this.room.state.players.onRemove((_player: any, sessionId: string) => {
      const p = this.players.get(sessionId);
      if (p) {
        p.container.destroy();
        this.players.delete(sessionId);
      }
    });

    // 2. Sinkronisasi Peluru (Bullets: Laser Pemain & Peluru Musuh)
    this.room.state.bullets.onAdd((bullet: any) => {
      const gfx = this.add.graphics().setDepth(22);
      const isLocal = bullet.playerId === this.room.sessionId;
      const isEnemy = bullet.isEnemy;

      if (isEnemy) {
        // Peluru Musuh: Orb Plasma Merah/Oranye Mematikan
        gfx.fillStyle(0xef4444, 0.95);
        gfx.fillCircle(0, 0, 5);
        gfx.fillStyle(0xfef08a, 1);
        gfx.fillCircle(0, 0, 2.5);
      } else {
        // Peluru Laser Pemain: Balok Laser Cyan / Hijau
        gfx.fillStyle(isLocal ? 0x00f0ff : 0x10b981, 1);
        gfx.fillRoundedRect(-2, -8, 4, 16, 2);
      }

      gfx.x = bullet.x;
      gfx.y = bullet.y;

      const bulletData: BulletData = {
        sprite: gfx,
        targetX: bullet.x,
        targetY: bullet.y,
        isEnemy,
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

    // 3. Sinkronisasi Koin
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

    // 4. Sinkronisasi Pesawat Tempur Musuh
    this.room.state.enemies.onAdd((enemy: any) => {
      const container = this.add.container(enemy.x, enemy.y).setDepth(25);
      const textureKey = `enemy_spaceship_${enemy.enemyType || 0}`;

      // Api mesin musuh (mengarah ke atas)
      const exhaust = this.add.sprite(0, -18, "enemy_exhaust_flame");
      const sprite = this.add.sprite(0, 0, textureKey);

      const labelText = this.add.text(0, 26, enemy.name, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "10px",
        fontStyle: "bold",
        color: "#f87171",
      }).setOrigin(0.5);

      container.add([exhaust, sprite, labelText]);

      const enemyData: EnemyData = {
        container,
        sprite,
        exhaust,
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

    this.room.state.enemies.onRemove((enemy: any) => {
      const e = this.enemies.get(enemy.id);
      if (e) {
        e.container.destroy();
        this.enemies.delete(enemy.id);
      }
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
        sounds.stopBgm();
      } else if (status === "playing") {
        this.statusBadge.setText(`SURVIVAL AKTIF (${totalPlayers}/5)`);
        this.statusBadge.setColor("#10b981");
        this.timerText.setText(`WAKTU: ${this.room.state.countdown}s`);
        this.modalContainer.setVisible(false);
        sounds.startBgm();
      } else if (status === "finished") {
        this.statusBadge.setText("SELESAI");
        this.statusBadge.setColor("#ffd700");
        this.modalWinner.setText(`Karyawan Teladan:\n⭐ ${this.room.state.winnerName} ⭐\nSkor Akhir: ${this.room.state.winnerScore}`);
        this.modalContainer.setVisible(true);
        sounds.stopBgm();
      }

      this.updateLeaderboard();
    });

    // 6. Broadcast Events dari Server
    this.room.onMessage("coin_collected", (data: any) => {
      this.spawnFloatingText(
        data.x, 
        data.y, 
        `+${data.value} ${data.label}! (${data.playerName})`, 
        data.value === 100 ? "#facc15" : (data.value === 50 ? "#06b6d4" : "#f59e0b")
      );

      if (data.playerId === this.room.sessionId) {
        sounds.playCoin(data.value);
      }
      this.updateLeaderboard();
    });

    this.room.onMessage("enemy_destroyed", (data: any) => {
      this.spawnFloatingText(data.x, data.y, `💥 +${data.points} HANCURKAN ${data.enemyName}!`, "#34d399");
      this.createExplosionEffect(data.x, data.y, false);
      sounds.playExplosion(false);
      this.updateLeaderboard();
    });

    this.room.onMessage("enemy_shoot", () => {
      sounds.playEnemyLaser();
    });

    this.room.onMessage("player_damaged", (data: any) => {
      this.createExplosionEffect(data.x, data.y, true);
      sounds.playExplosion(true);
      this.spawnFloatingText(data.x, data.y, `💥 KENA SERANGAN! (-1 DARAH, SISA: ${data.hpRemaining}/5)`, "#ef4444");

      if (data.playerId === this.room.sessionId) {
        this.cameras.main.shake(320, 0.035);
        this.cameras.main.flash(250, 255, 0, 0);
        this.updateHUDHealthBar(data.hpRemaining, 5);
      }
    });

    this.room.onMessage("player_eliminated", (data: any) => {
      this.createBigExplosionEffect(data.x, data.y);
      sounds.playExplosion(true);
      this.spawnFloatingText(data.x, data.y, `💥 ${data.playerName} HANCUR LEBUR!`, "#f43f5e");

      const elimP = this.players.get(data.playerId);
      if (elimP) {
        elimP.container.destroy();
        this.players.delete(data.playerId);
      }
      this.updateLeaderboard();
    });

    // Khusus untuk pemain ini jika tereliminasi (3x terkena serangan)
    this.room.onMessage("you_are_eliminated", (data: any) => {
      sounds.playExplosion(true);
      this.cameras.main.shake(450, 0.05);
      this.cameras.main.flash(350, 255, 0, 0);

      // Hapus container kapal lokal seketika agar tidak tersisa di arena!
      if (this.room) {
        const myP = this.players.get(this.room.sessionId);
        if (myP) {
          myP.container.destroy();
          this.players.delete(this.room.sessionId);
        }
      }

      this.elimReasonText.setText(data.message || "Pesawat Anda terkena serangan 5x!");
      this.elimScoreText.setText(
        `Skor Pertandingan Ini: ${data.matchScore} Poin\n` +
        `Total Akumulasi Kantor: ${data.totalScore} Poin\n` +
        `Skor Terbaik: ${data.highestScore} | Game Dimainkan: ${data.gamesPlayed}`
      );
      this.eliminatedModal.setVisible(true);
      sounds.stopBgm();
      this.updateLeaderboard();
    });

    this.room.onMessage("game_over", () => {
      sounds.playGameOver();
    });

    // 7. Efek Fisika Saat 2 Pesawat Pemain Beradu
    this.room.onMessage("player_bump", (data: any) => {
      sounds.playBump();
      this.createPhysicsBumpEffect(data.x, data.y, data.nx, data.ny);

      const isLocalInvolved = (data.p1Id === this.room.sessionId || data.p2Id === this.room.sessionId);
      if (isLocalInvolved) {
        this.cameras.main.shake(110, 0.006); // Micro haptic shake
      }

      // Animasi sentakan miring & deformasi elastis (squash & stretch)
      const p1Data = this.players.get(data.p1Id);
      const p2Data = this.players.get(data.p2Id);

      if (p1Data && p1Data.container) {
        this.tweens.killTweensOf(p1Data.container);
        this.tweens.add({
          targets: p1Data.container,
          angle: (data.nx >= 0 ? 1 : -1) * 12,
          scaleX: 1.2,
          scaleY: 0.8,
          duration: 75,
          yoyo: true,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (p1Data.container) {
              p1Data.container.angle = 0;
              p1Data.container.setScale(1, 1);
            }
          }
        });
      }

      if (p2Data && p2Data.container) {
        this.tweens.killTweensOf(p2Data.container);
        this.tweens.add({
          targets: p2Data.container,
          angle: (data.nx >= 0 ? -1 : 1) * 12,
          scaleX: 1.2,
          scaleY: 0.8,
          duration: 75,
          yoyo: true,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (p2Data.container) {
              p2Data.container.angle = 0;
              p2Data.container.setScale(1, 1);
            }
          }
        });
      }
    });
  }

  private createExplosionEffect(x: number, y: number, isBig: boolean = false) {
    // 1. Shockwave Ring Meledak Meluas
    const shockwave = this.add.graphics().setDepth(36);
    shockwave.lineStyle(isBig ? 4 : 2.5, 0xff7700, 1);
    shockwave.strokeCircle(x, y, isBig ? 18 : 12);
    this.tweens.add({
      targets: shockwave,
      scaleX: isBig ? 3.5 : 2.5,
      scaleY: isBig ? 3.5 : 2.5,
      alpha: 0,
      duration: isBig ? 450 : 320,
      ease: "Cubic.easeOut",
      onComplete: () => shockwave.destroy(),
    });

    // 2. Bola Api Inti (Fireball Core)
    const core = this.add.graphics().setDepth(37);
    core.fillStyle(0xffff44, 1);
    core.fillCircle(x, y, isBig ? 24 : 15);
    core.fillStyle(0xff3300, 0.9);
    core.fillCircle(x, y, isBig ? 34 : 22);
    this.tweens.add({
      targets: core,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: isBig ? 400 : 280,
      ease: "Quad.easeOut",
      onComplete: () => core.destroy(),
    });

    // 3. Percikan Api Serpihan (Flying Spark Particles)
    const sparkCount = isBig ? 12 : 8;
    for (let i = 0; i < sparkCount; i++) {
      const spark = this.add.graphics().setDepth(38);
      spark.fillStyle(Math.random() < 0.5 ? 0xffd700 : 0xff3300, 1);
      spark.fillCircle(0, 0, Math.random() < 0.5 ? 3 : 2);
      spark.x = x;
      spark.y = y;

      const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = (isBig ? 48 : 28) + Math.random() * (isBig ? 35 : 18);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 350 + Math.random() * 150,
        ease: "Cubic.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private createBigExplosionEffect(x: number, y: number) {
    this.createExplosionEffect(x, y, true);
  }

  private updateLeaderboard() {
    if (!this.room || !this.room.state) return;

    const playerList: { name: string; score: number; isMe: boolean; hp: number }[] = [];
    this.room.state.players.forEach((p: any, id: string) => {
      playerList.push({
        name: p.name,
        score: p.score,
        hp: p.hp,
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
        const heart = "❤️".repeat(Math.max(0, item.hp));
        entry.setText(`${medal} ${item.name.substring(0, 6)}${meTag} ${heart}: ${item.score}`);
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

  update(time: number, delta: number) {
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

    // 2. Input Pemain Lokal
    if (this.room) {
      const left = (this.cursors?.left.isDown || this.wasd?.left.isDown || this.touchInput.left);
      const right = (this.cursors?.right.isDown || this.wasd?.right.isDown || this.touchInput.right);
      const up = (this.cursors?.up.isDown || this.wasd?.up.isDown || this.touchInput.up);
      const down = (this.cursors?.down.isDown || this.wasd?.down.isDown || this.touchInput.down);
      const shoot = (this.spaceKey?.isDown || this.touchInput.shoot);

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

    // 3. Interpolasi Posisi & Animasi Pemain
    this.players.forEach((p) => {
      p.container.x = Phaser.Math.Linear(p.container.x, p.targetX, 0.35);
      p.container.y = Phaser.Math.Linear(p.container.y, p.targetY, 0.35);
      p.exhaust.scaleY = 0.8 + Math.random() * 0.4;

      // Animasi Denyut Halo Beacon Pesawat Sendiri
      if (p.isLocal && p.beaconRing) {
        const pulseScale = 1 + Math.sin(time * 0.007) * 0.16;
        const pulseAlpha = 0.6 + Math.sin(time * 0.007) * 0.3;
        p.beaconRing.setScale(pulseScale);
        p.beaconRing.setAlpha(pulseAlpha);
      }
    });

    // 4. Interpolasi Posisi Peluru
    this.bullets.forEach((b) => {
      b.sprite.x = b.targetX;
      b.sprite.y = Phaser.Math.Linear(b.sprite.y, b.targetY, 0.55);
    });

    // 5. Interpolasi Posisi Koin
    this.coins.forEach((c) => {
      c.container.x = Phaser.Math.Linear(c.container.x, c.targetX, 0.25);
      c.container.y = Phaser.Math.Linear(c.container.y, c.targetY, 0.25);
    });

    // 6. Interpolasi Posisi Pesawat Musuh
    this.enemies.forEach((e) => {
      e.container.x = Phaser.Math.Linear(e.container.x, e.targetX, 0.3);
      e.container.y = Phaser.Math.Linear(e.container.y, e.targetY, 0.3);
      e.exhaust.scaleY = 0.8 + Math.random() * 0.4;
    });
  }

  /**
   * Efek partikel percikan listrik & shockwave cincin energi saat 2 pesawat beradu
   */
  private createPhysicsBumpEffect(x: number, y: number, nx: number, ny: number) {
    // 1. Percikan bunga api listrik (sparks)
    const count = 10;
    for (let i = 0; i < count; i++) {
      const spark = this.add.graphics().setDepth(150);
      const color = i % 2 === 0 ? 0x00f0ff : 0xffd700;
      spark.fillStyle(color, 1);
      spark.fillCircle(0, 0, 2 + Math.random() * 2);
      spark.x = x;
      spark.y = y;

      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      const targetX = x + Math.cos(angle) * speed + nx * 20;
      const targetY = y + Math.sin(angle) * speed + ny * 15;

      this.tweens.add({
        targets: spark,
        x: targetX,
        y: targetY,
        alpha: 0,
        scale: 0.2,
        duration: 220 + Math.random() * 120,
        ease: "Cubic.easeOut",
        onComplete: () => {
          spark.destroy();
        }
      });
    }

    // 2. Cincin shockwave benturan
    const shockwave = this.add.graphics().setDepth(149);
    shockwave.lineStyle(2, 0x00f0ff, 0.9);
    shockwave.strokeCircle(0, 0, 10);
    shockwave.x = x;
    shockwave.y = y;

    this.tweens.add({
      targets: shockwave,
      scaleX: 2.6,
      scaleY: 2.6,
      alpha: 0,
      duration: 200,
      ease: "Quad.easeOut",
      onComplete: () => {
        shockwave.destroy();
      }
    });
  }

  /**
   * Render Health Progress Bar di HUD utama
   */
  private updateHUDHealthBar(hp: number, maxHp: number = 5) {
    if (!this.myHpBarFill) return;
    this.myHpBarFill.clear();

    const clampedHp = Math.max(0, Math.min(maxHp, hp));
    const ratio = clampedHp / maxHp;
    const barWidth = Math.round(112 * ratio);

    let fillColor = 0x10b981; // Hijau (5/5)
    if (clampedHp === 4) fillColor = 0x34d399; // Emerald (4/5)
    else if (clampedHp === 3) fillColor = 0xfacc15; // Kuning (3/5)
    else if (clampedHp === 2) fillColor = 0xf97316; // Oranye (2/5)
    else if (clampedHp <= 1) fillColor = 0xef4444; // Merah Kritis (1/5)

    if (barWidth > 0) {
      this.myHpBarFill.fillStyle(fillColor, 0.92);
      this.myHpBarFill.fillRoundedRect(192, 28 + 2, barWidth, 12, 3);
    }

    if (this.myHpText) {
      this.myHpText.setText(clampedHp <= 1 ? "⚠️" : "🛡️");
    }

    if (this.myHpValText) {
      this.myHpValText.setText(`${clampedHp}/${maxHp} (${Math.round(ratio * 100)}%)`);
      this.myHpValText.setColor(clampedHp <= 1 ? "#fca5a5" : "#ffffff");
    }
  }

  /**
   * Render Mini Health Bar mengambang di atas masing-masing pesawat
   */
  private renderShipHpBar(gfx: Phaser.GameObjects.Graphics, hp: number, maxHp: number = 5) {
    gfx.clear();
    const clampedHp = Math.max(0, Math.min(maxHp, hp));
    const ratio = clampedHp / maxHp;

    // Slot gelap
    gfx.fillStyle(0x0f172a, 0.9);
    gfx.fillRoundedRect(-18, -14, 36, 4, 1.5);
    gfx.lineStyle(0.8, 0x334155, 0.8);
    gfx.strokeRoundedRect(-18, -14, 36, 4, 1.5);

    // Isi bar
    let fillColor = 0x10b981;
    if (clampedHp === 4) fillColor = 0x34d399;
    else if (clampedHp === 3) fillColor = 0xfacc15;
    else if (clampedHp === 2) fillColor = 0xf97316;
    else if (clampedHp <= 1) fillColor = 0xef4444;

    const fillWidth = Math.max(0, Math.round(34 * ratio));
    if (fillWidth > 0) {
      gfx.fillStyle(fillColor, 1);
      gfx.fillRoundedRect(-17, -13, fillWidth, 2, 1);
    }
  }
}
