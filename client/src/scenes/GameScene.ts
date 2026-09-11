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
      if (pointer.x > 400) {
        this.touchInput.shoot = true;
      }
    });

    this.input.on("pointerup", () => {
      this.touchInput.shoot = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.x <= 500) {
        const myPlayer = this.players.get(this.room?.sessionId || "");
        if (myPlayer) {
          const diff = pointer.x - myPlayer.container.x;
          this.touchInput.left = diff < -15;
          this.touchInput.right = diff > 15;
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
    hudBar.fillStyle(0x0f172a, 0.88);
    hudBar.fillRoundedRect(16, 12, 768, 48, 8);
    hudBar.lineStyle(1, 0x00f0ff, 0.3);
    hudBar.strokeRoundedRect(16, 12, 768, 48, 8);

    // Status Room
    this.statusBadge = this.add.text(28, hudY + 12, "MENUNGGU REKAN KERJA...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#38bdf8",
    }).setOrigin(0, 0.5).setDepth(101);

    // Nyawa Pemain Lokal (❤️❤️❤️)
    this.myHpText = this.add.text(285, hudY + 12, "NYAWA: ❤️❤️❤️", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#f43f5e",
    }).setOrigin(0.5, 0.5).setDepth(101);

    // Countdown Timer
    this.timerText = this.add.text(435, hudY + 12, "WAKTU: 120s", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "17px",
      fontStyle: "bold",
      color: "#ffd700",
    }).setOrigin(0.5, 0.5).setDepth(101);

    // Skor Match Ini
    this.myScoreText = this.add.text(595, hudY + 12, "MATCH: 0", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#00f0ff",
    }).setOrigin(0.5, 0.5).setDepth(101);

    // Total Akumulasi Skor Kantor
    this.myCumulativeText = this.add.text(765, hudY + 12, "TOTAL: 0", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#a855f7",
    }).setOrigin(1, 0.5).setDepth(101);

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

    this.elimReasonText = this.add.text(0, -55, "Pesawat Anda terkena tembakan musuh 3x!", {
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

  async connectToServer(authOptions: { serverUrl?: string; email?: string; password?: string; token?: string }) {
    this.lastAuthOptions = authOptions;
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

  private async reconnect() {
    if (this.lastAuthOptions) {
      try {
        await this.connectToServer(this.lastAuthOptions);
      } catch (e) {
        console.warn("Gagal auto-rejoin:", e);
        // Tampilkan modal login web biasa
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
        beaconRing.strokeCircle(0, 0, 26);
        beaconRing.fillStyle(0x00f0ff, 0.15);
        beaconRing.fillCircle(0, 0, 26);
        container.add(beaconRing);

        // Label Tag Panah "▼ ANDA" di atas kepala pesawat
        markerTag = this.add.text(0, -38, "▼ ANDA", {
          fontFamily: "'Outfit', sans-serif",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#00f0ff",
        }).setOrigin(0.5);
        container.add(markerTag);
      }

      // Api knalpot mesin
      const exhaust = this.add.sprite(0, 16, "exhaust_flame");
      const sprite = this.add.sprite(0, 0, textureKey);

      // Label Nama
      const displayName = isLocal ? `★ ${player.name}` : player.name;
      const nameText = this.add.text(0, -22, displayName, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: isLocal ? "#00f0ff" : "#f1f5f9",
      }).setOrigin(0.5);

      // Ikon Nyawa (❤️❤️❤️) di atas pesawat
      const hpHearts = "❤️".repeat(Math.max(0, player.hp || 3)) + "🖤".repeat(Math.max(0, 3 - (player.hp || 3)));
      const hpText = this.add.text(0, -11, hpHearts, {
        fontSize: "9px"
      }).setOrigin(0.5);

      // Skor kecil
      const scoreText = this.add.text(0, 24, "0", {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "10px",
        color: "#ffd700",
      }).setOrigin(0.5);

      container.add([exhaust, sprite, nameText, hpText, scoreText]);

      const playerData: PlayerData = {
        container,
        sprite,
        exhaust,
        nameText,
        scoreText,
        hpText,
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
        this.myHpText.setText(`NYAWA: ${hpHearts}`);
      }

      player.onChange(() => {
        playerData.targetX = player.x;
        playerData.targetY = player.y;
        playerData.scoreText.setText(`${player.score}`);

        const currentHearts = "❤️".repeat(Math.max(0, player.hp)) + "🖤".repeat(Math.max(0, 3 - player.hp));
        playerData.hpText.setText(currentHearts);

        if (isLocal) {
          this.myScoreText.setText(`MATCH: ${player.score}`);
          this.myCumulativeText.setText(`TOTAL: ${player.cumulativeScore || 0}`);
          this.myHpText.setText(`NYAWA: ${currentHearts}`);
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

    this.room.onMessage("enemy_shoot", () => {
      sounds.playEnemyLaser();
    });

    this.room.onMessage("player_damaged", (data: any) => {
      this.spawnFloatingText(data.x, data.y, `TERKENA! (-1 NYAWA, SISA: ${data.hpRemaining})`, "#ef4444");

      if (data.playerId === this.room.sessionId) {
        this.cameras.main.shake(250, 0.025);
        this.cameras.main.flash(200, 255, 0, 0);
        sounds.playHit();
      }
    });

    this.room.onMessage("player_eliminated", (data: any) => {
      this.createBigExplosionEffect(data.x, data.y);
      this.spawnFloatingText(data.x, data.y, `💥 ${data.playerName} TERELIMINASI!`, "#f43f5e");
    });

    // Khusus untuk pemain ini jika tereliminasi (3x terkena serangan)
    this.room.onMessage("you_are_eliminated", (data: any) => {
      sounds.playExplosion();
      this.cameras.main.shake(400, 0.04);
      this.cameras.main.flash(300, 255, 0, 0);

      this.elimReasonText.setText(data.message || "Pesawat Anda terkena serangan 3x!");
      this.elimScoreText.setText(
        `Skor Pertandingan Ini: ${data.matchScore} Poin\n` +
        `Total Akumulasi Kantor: ${data.totalScore} Poin\n` +
        `Skor Terbaik: ${data.highestScore} | Game Dimainkan: ${data.gamesPlayed}`
      );
      this.eliminatedModal.setVisible(true);
      sounds.stopBgm();
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

  private createBigExplosionEffect(x: number, y: number) {
    const burst = this.add.graphics().setDepth(40);
    burst.fillStyle(0xff2200, 1);
    burst.fillCircle(x, y, 28);
    burst.fillStyle(0xffaa00, 1);
    burst.fillCircle(x, y, 16);

    this.tweens.add({
      targets: burst,
      scaleX: 3.0,
      scaleY: 3.0,
      alpha: 0,
      duration: 500,
      ease: "Cubic.easeOut",
      onComplete: () => burst.destroy(),
    });
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
}
