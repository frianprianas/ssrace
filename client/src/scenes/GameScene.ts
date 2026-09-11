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

  // Kapal Induk Alien Planet TaYa (Boss)
  private bossContainer?: Phaser.GameObjects.Container;
  private bossSprite?: Phaser.GameObjects.Sprite;
  private bossCoreGlow?: Phaser.GameObjects.Graphics;
  private bossHudContainer?: Phaser.GameObjects.Container;
  private bossHpFill?: Phaser.GameObjects.Graphics;
  private bossHpText?: Phaser.GameObjects.Text;
  private bossNameBadge?: Phaser.GameObjects.Text;

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

  // Start Countdown Visual Overlay (Hitung Mundur 3.. 2.. 1.. GO!)
  private countdownContainer: Phaser.GameObjects.Container | null = null;
  private countdownText: Phaser.GameObjects.Text | null = null;
  private countdownSubText: Phaser.GameObjects.Text | null = null;

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
      if (pointer.x > 380 && pointer.y < 750) {
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
      // Kendali geser halus dengan deadzone 40px agar tidak over-steering di smartphone
      if (pointer.isDown && pointer.x <= 450 && pointer.y < 750) {
        const myPlayer = this.players.get(this.room?.sessionId || "");
        if (myPlayer) {
          const diff = pointer.x - myPlayer.container.x;
          if (Math.abs(diff) > 40) {
            this.touchInput.left = diff < 0;
            this.touchInput.right = diff > 0;
          } else {
            this.touchInput.left = false;
            this.touchInput.right = false;
          }
        }
      }
    });

    // 4. Setup UI HUD & Boss Bar
    this.createHUD();
    this.createBossHUD();

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
    for (let i = 0; i < 140; i++) {
      this.stars.push({
        x: Math.random() * 600,
        y: Math.random() * 960,
        speed: 40 + Math.random() * 180,
        size: Math.random() < 0.25 ? 2.6 : (Math.random() < 0.6 ? 1.8 : 1),
        alpha: 0.3 + Math.random() * 0.7,
      });
    }

    // Garis pertahanan neon bawah untuk arena balap 600x960
    const defLine = this.add.graphics().setDepth(2);
    defLine.lineStyle(1.5, 0x00f0ff, 0.4);
    defLine.lineBetween(0, 720, 600, 720);
    defLine.lineStyle(1, 0x334155, 0.55);
    defLine.lineBetween(0, 920, 600, 920);
  }

  /**
   * Pembuatan tekstur grafis prosedural berkualitas tinggi (Zero byte eksternal)
   */
  private createProceduralTextures() {
    // 1. Pesawat 5 Karakter Skuadron SSRace Sesuai karakter.jpg:
    // 0: BAKTI (Nova Razor - Red Crimson)
    // 1: NUSA (Triton Spear - Blue Azure)
    // 2: BAKNUS (Veridian Claw - Green Emerald)
    // 3: TARA (Nebula Sting - Golden Amber)
    // 4: BEEN (Void Drifter - Purple Violet)
    const characterConfigs = [
      { // 0: BAKTI - Nova Razor
        wing: 0xdc2626, body: 0xffffff, accent: 0xef4444, canard: 0x991b1b, cockpit: 0xff4500, trim: 0xfca5a5, exhaust: 0xff3300
      },
      { // 1: NUSA - Triton Spear
        wing: 0x2563eb, body: 0xe0f2fe, accent: 0x38bdf8, canard: 0x1e3a8a, cockpit: 0x00f0ff, trim: 0x93c5fd, exhaust: 0x00f0ff
      },
      { // 2: BAKNUS - Veridian Claw
        wing: 0x16a34a, body: 0x1e293b, accent: 0x22c55e, canard: 0x14532d, cockpit: 0x86efac, trim: 0x4ade80, exhaust: 0x22c55e
      },
      { // 3: TARA - Nebula Sting
        wing: 0xeab308, body: 0xfef08a, accent: 0xf59e0b, canard: 0x78350f, cockpit: 0xffffff, trim: 0xfde047, exhaust: 0xfacc15
      },
      { // 4: BEEN - Void Drifter
        wing: 0x9333ea, body: 0x1e1b4b, accent: 0xa855f7, canard: 0x3b0764, cockpit: 0xd8b4fe, trim: 0xc084fc, exhaust: 0xd946ef
      }
    ];

    characterConfigs.forEach((c, idx) => {
      const g = this.make.graphics({ x: 0, y: 0 });

      // Sayap Luar Pesawat
      g.fillStyle(c.wing, 1);
      g.fillTriangle(18, 0, 0, 32, 9, 24);
      g.fillTriangle(18, 0, 27, 24, 36, 32);

      // Canards / Sirip Depan
      g.fillStyle(c.canard, 1);
      g.fillTriangle(18, 4, 4, 18, 10, 18);
      g.fillTriangle(18, 4, 26, 18, 32, 18);

      // Bodi Tengah / Sasis Utama
      g.fillStyle(c.body, 1);
      g.fillTriangle(18, 2, 10, 28, 26, 28);

      // Aksen Garis & Pelat Armor
      g.fillStyle(c.accent, 1);
      g.fillRect(15, 10, 6, 14);

      // Kokpit Helm Pilot Sesuai Karakter
      g.fillStyle(c.cockpit, 1);
      g.fillCircle(18, 14, 4);

      // Detail Moncong Laser Kembar
      g.fillStyle(0xffffff, 1);
      g.fillRect(10, 26, 2, 6);
      g.fillRect(24, 26, 2, 6);

      // Garis Aksen Trim
      g.lineStyle(1.5, c.trim, 0.9);
      g.lineBetween(18, 4, 18, 26);

      g.generateTexture(`character_ship_${idx}`, 36, 36);

      // Exhaust Api Mesin Spesifik Karakter
      const gEx = this.make.graphics({ x: 0, y: 0 });
      gEx.fillStyle(c.exhaust, 0.95);
      gEx.fillTriangle(2, 0, 0, 10, 4, 10);
      gEx.fillTriangle(8, 0, 6, 10, 10, 10);
      gEx.fillStyle(0xffffff, 1);
      gEx.fillTriangle(2, 0, 1, 6, 3, 6);
      gEx.fillTriangle(8, 0, 7, 6, 9, 6);
      gEx.generateTexture(`exhaust_flame_${idx}`, 12, 10);
    });

    // Fallback space_jet_local dan exhaust_flame
    const gDefault = this.make.graphics({ x: 0, y: 0 });
    gDefault.fillStyle(0x00f0ff, 1);
    gDefault.fillTriangle(18, 0, 0, 32, 9, 24);
    gDefault.fillTriangle(18, 0, 27, 24, 36, 32);
    gDefault.fillStyle(0xffffff, 1);
    gDefault.fillTriangle(18, 2, 10, 28, 26, 28);
    gDefault.fillStyle(0x0077ff, 1);
    gDefault.fillRect(15, 10, 6, 14);
    gDefault.fillStyle(0x38bdf8, 1);
    gDefault.fillCircle(18, 14, 4);
    gDefault.generateTexture("space_jet_local", 36, 36);

    const gExFallback = this.make.graphics({ x: 0, y: 0 });
    gExFallback.fillStyle(0x00f0ff, 0.9);
    gExFallback.fillTriangle(2, 0, 0, 10, 4, 10);
    gExFallback.fillTriangle(8, 0, 6, 10, 10, 10);
    gExFallback.fillStyle(0xffffff, 1);
    gExFallback.fillTriangle(2, 0, 1, 6, 3, 6);
    gExFallback.fillTriangle(8, 0, 7, 6, 9, 6);
    gExFallback.generateTexture("exhaust_flame", 12, 10);

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

    // 6. Inti Energi Kosmik 25 - Plasma Core (Cyan / Neon Blue Berkilau)
    const gCoin25 = this.make.graphics({ x: 0, y: 0 });
    gCoin25.fillStyle(0x00f0ff, 0.9);
    gCoin25.fillCircle(14, 14, 13);
    gCoin25.lineStyle(2, 0xe0f2fe, 1);
    gCoin25.strokeCircle(14, 14, 13);
    gCoin25.lineStyle(1.5, 0x0284c7, 0.85);
    gCoin25.strokeCircle(14, 14, 8);
    gCoin25.fillStyle(0xffffff, 0.9);
    gCoin25.fillCircle(14, 14, 4);
    gCoin25.generateTexture("coin_25", 28, 28);

    // 7. Inti Energi Kosmik 50 - Photon Core (Ungu / Magenta Berenergi)
    const gCoin50 = this.make.graphics({ x: 0, y: 0 });
    gCoin50.fillStyle(0xd946ef, 0.95);
    gCoin50.fillCircle(16, 16, 15);
    gCoin50.lineStyle(2.5, 0xfae8ff, 1);
    gCoin50.strokeCircle(16, 16, 15);
    gCoin50.lineStyle(1.5, 0xa21caf, 0.85);
    gCoin50.strokeCircle(16, 16, 9);
    gCoin50.fillStyle(0xffffff, 0.9);
    gCoin50.fillCircle(16, 16, 5);
    gCoin50.generateTexture("coin_50", 32, 32);

    // 8. Inti Energi Kosmik 100 - Quantum Core (Emas Supernova Bersinar)
    const gCoin100 = this.make.graphics({ x: 0, y: 0 });
    gCoin100.fillStyle(0xeab308, 1);
    gCoin100.fillCircle(18, 18, 17);
    gCoin100.lineStyle(3, 0xfef08a, 1);
    gCoin100.strokeCircle(18, 18, 17);
    gCoin100.fillStyle(0xfef08a, 0.9);
    gCoin100.fillCircle(18, 18, 8);
    gCoin100.fillStyle(0xffffff, 1);
    gCoin100.fillCircle(18, 18, 4);
    gCoin100.generateTexture("coin_100", 36, 36);

    // 9. Kapal Induk Alien Planet TaYa (Dreadnought Mothership Boss 160x80)
    const gBoss = this.make.graphics({ x: 0, y: 0 });

    // Sayap Luar Dreadnought (Obsidian Titanium Armor Plating)
    gBoss.fillStyle(0x1e1b4b, 1);
    gBoss.fillTriangle(80, 75, 0, 15, 30, 0);
    gBoss.fillTriangle(80, 75, 130, 0, 160, 15);

    // Armor Lapis Dalam (Deep Crimson / Void Purple)
    gBoss.fillStyle(0x4c0519, 1);
    gBoss.fillTriangle(80, 70, 20, 18, 50, 8);
    gBoss.fillTriangle(80, 70, 110, 8, 140, 18);

    // Rangka Bodi Pusat
    gBoss.fillStyle(0x0f172a, 1);
    gBoss.fillRoundedRect(55, 10, 50, 55, 6);

    // Garis Energi / Neon Runes (Alien Conduit Glowing Lines)
    gBoss.lineStyle(2, 0xd946ef, 0.9);
    gBoss.lineBetween(80, 12, 80, 68);
    gBoss.lineBetween(35, 18, 65, 45);
    gBoss.lineBetween(125, 18, 95, 45);

    // Pintu Hanggar & Meriam Sayap Kiri dan Kanan
    gBoss.fillStyle(0xef4444, 1);
    gBoss.fillRect(20, 25, 6, 12);
    gBoss.fillRect(134, 25, 6, 12);

    // Moncong Meriam Utama Inti Plasma (Tengah Bawah)
    gBoss.fillStyle(0xffffff, 1);
    gBoss.fillRect(77, 66, 6, 10);
    gBoss.lineStyle(1.5, 0xff0055, 1);
    gBoss.strokeRect(76, 65, 8, 11);

    // Inti Reaktor Alien (Pulsing Plasma Core)
    gBoss.fillStyle(0xff0055, 1);
    gBoss.fillCircle(80, 38, 11);
    gBoss.fillStyle(0xfef08a, 1);
    gBoss.fillCircle(80, 38, 6);
    gBoss.fillStyle(0xffffff, 1);
    gBoss.fillCircle(80, 38, 3);

    // Pendorong Ion Ganda (Thruster Nozzles Atas)
    gBoss.fillStyle(0x00f0ff, 0.85);
    gBoss.fillRoundedRect(60, 2, 12, 8, 2);
    gBoss.fillRoundedRect(88, 2, 12, 8, 2);

    gBoss.generateTexture("mothership_boss", 160, 80);
  }

  private createHUD() {
    const hudY = 24;

    // Header Background Bar
    const hudBar = this.add.graphics().setDepth(100);
    hudBar.fillStyle(0x0f172a, 0.9);
    hudBar.fillRoundedRect(8, 10, 584, 46, 8);
    hudBar.lineStyle(1, 0x00f0ff, 0.35);
    hudBar.strokeRoundedRect(8, 10, 584, 46, 8);

    // 1. Status Room (Kiri)
    this.statusBadge = this.add.text(18, hudY + 11, "STANDBY", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#38bdf8",
    }).setOrigin(0, 0.5).setDepth(101);

    // 2. Health / Darah Progress Bar (Pemain Lokal)
    const hpBox = this.add.graphics().setDepth(101);
    hpBox.fillStyle(0x050b14, 0.95);
    hpBox.fillRoundedRect(165, hudY + 4, 94, 16, 4);
    hpBox.lineStyle(1, 0x334155, 0.8);
    hpBox.strokeRoundedRect(165, hudY + 4, 94, 16, 4);

    this.myHpBarFill = this.add.graphics().setDepth(102);

    this.myHpText = this.add.text(158, hudY + 11, "🛡️", {
      fontSize: "12px"
    }).setOrigin(1, 0.5).setDepth(103);

    this.myHpValText = this.add.text(212, hudY + 11, "5/5 (100%)", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "9.5px",
      fontStyle: "bold",
      color: "#ffffff"
    }).setOrigin(0.5, 0.5).setDepth(103);

    // 3. Countdown Timer (Tengah)
    this.timerText = this.add.text(320, hudY + 11, "WAKTU: 120s", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#ffd700",
    }).setOrigin(0.5, 0.5).setDepth(101);

    // 4. Skor Match Ini
    this.myScoreText = this.add.text(435, hudY + 11, "MATCH: 0", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#00f0ff",
    }).setOrigin(0.5, 0.5).setDepth(101);

    // 5. Total Akumulasi Skor Kantor (Kanan)
    this.myCumulativeText = this.add.text(582, hudY + 11, "TOTAL: 0", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#a855f7",
    }).setOrigin(1, 0.5).setDepth(101);

    // Inisialisasi awal render HUD health bar (5 bar darah, 3 nyawa)
    this.updateHUDHealthBar(5, 5, 3, 3);

    // Leaderboard Match Box (Top 5) di kanan atas
    this.leaderboardContainer = this.add.container(444, 64).setDepth(100);
    const lbBg = this.add.graphics();
    lbBg.fillStyle(0x0f172a, 0.88);
    lbBg.fillRoundedRect(0, 0, 146, 114, 8);
    lbBg.lineStyle(1, 0x00f0ff, 0.35);
    lbBg.strokeRoundedRect(0, 0, 146, 114, 8);
    this.leaderboardContainer.add(lbBg);

    const lbTitle = this.add.text(73, 12, "🏆 LIVE MATCH", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "11px",
      fontStyle: "bold",
      color: "#00f0ff",
    }).setOrigin(0.5);
    this.leaderboardContainer.add(lbTitle);

    this.leaderboardEntries = [];
    for (let i = 0; i < 5; i++) {
      const entry = this.add.text(10, 28 + i * 16, `${i + 1}. -`, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "9px",
        color: "#94a3b8",
      });
      this.leaderboardContainer.add(entry);
      this.leaderboardEntries.push(entry);
    }
  }

  private createFinishedModal() {
    this.modalContainer = this.add.container(300, 460).setDepth(500).setVisible(false);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x050b14, 0.92);
    backdrop.fillRoundedRect(-200, -140, 400, 280, 16);
    backdrop.lineStyle(2, 0xffd700, 0.85);
    backdrop.strokeRoundedRect(-200, -140, 400, 280, 16);
    this.modalContainer.add(backdrop);

    const title = this.add.text(0, -95, "🏁 RACE SURVIVAL SELESAI! 🏁", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "20px",
      fontStyle: "bold",
      color: "#ffd700",
    }).setOrigin(0.5);
    this.modalContainer.add(title);

    this.modalWinner = this.add.text(0, -15, "Menghitung skor...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#fff",
      align: "center",
    }).setOrigin(0.5);
    this.modalContainer.add(this.modalWinner);

    const sub = this.add.text(0, 75, "Poin Anda telah diakumulasikan ke Database Kantor!\nRonde berikutnya dimulai otomatis...", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "11px",
      color: "#94a3b8",
      align: "center",
    }).setOrigin(0.5);
    this.modalContainer.add(sub);
  }

  private createEliminatedModal() {
    this.eliminatedModal = this.add.container(300, 460).setDepth(600).setVisible(false);

    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x0a0508, 0.95);
    backdrop.fillRoundedRect(-220, -165, 440, 330, 16);
    backdrop.lineStyle(2.5, 0xef4444, 0.9);
    backdrop.strokeRoundedRect(-220, -165, 440, 330, 16);
    this.eliminatedModal.add(backdrop);

    const title = this.add.text(0, -112, "💥 TERELIMINASI! (GAME OVER) 💥", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "20px",
      fontStyle: "bold",
      color: "#ef4444",
    }).setOrigin(0.5);
    this.eliminatedModal.add(title);

    this.elimReasonText = this.add.text(0, -60, "Pesawat Anda terkena tembakan musuh 5x!", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "13px",
      color: "#fca5a5",
      align: "center",
    }).setOrigin(0.5);
    this.eliminatedModal.add(this.elimReasonText);

    this.elimScoreText = this.add.text(0, 5, "Skor Match: 0 Poin\nTotal Akumulasi Kantor: 0 Poin", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#ffd700",
      align: "center",
      lineSpacing: 8,
    }).setOrigin(0.5);
    this.eliminatedModal.add(this.elimScoreText);

    // Tombol Masuk Arena Balap Lagi
    const btnRejoin = this.add.graphics();
    btnRejoin.fillStyle(0x00f0ff, 1);
    btnRejoin.fillRoundedRect(-140, 80, 280, 44, 8);
    this.eliminatedModal.add(btnRejoin);

    const btnText = this.add.text(0, 102, "🚀 MASUK ARENA BALAP LAGI", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#050b14",
    }).setOrigin(0.5);
    this.eliminatedModal.add(btnText);

    const hitZone = this.add.zone(0, 102, 280, 44).setInteractive({ cursor: "pointer" });
    hitZone.on("pointerdown", () => {
      this.eliminatedModal.setVisible(false);
      this.reconnect();
    });
    this.eliminatedModal.add(hitZone);
  }

  /**
   * Tampilan Animasi Hitung Mundur 3, 2, 1, GO!
   */
  public showStartCountdown(count: number) {
    if (!this.countdownContainer) {
      this.countdownContainer = this.add.container(300, 480).setDepth(800);

      const glowCircle = this.add.graphics();
      glowCircle.fillStyle(0x0f172a, 0.85);
      glowCircle.fillCircle(0, 0, 110);
      glowCircle.lineStyle(3.5, 0x00f0ff, 0.9);
      glowCircle.strokeCircle(0, 0, 110);
      this.countdownContainer.add(glowCircle);

      this.countdownText = this.add.text(0, -12, "", {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "80px",
        fontStyle: "bold",
        color: "#00f0ff"
      }).setOrigin(0.5, 0.5);
      this.countdownContainer.add(this.countdownText);

      this.countdownSubText = this.add.text(0, 52, "", {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#ffffff"
      }).setOrigin(0.5, 0.5);
      this.countdownContainer.add(this.countdownSubText);
    }

    this.countdownContainer.setVisible(true);
    this.countdownContainer.setScale(0.5);
    this.countdownContainer.setAlpha(1);

    if (count > 0) {
      sounds.playCountdownBeep(false);

      let color = "#38bdf8";
      let sub = "BERSIAP DI KOKPIT...";
      if (count === 2) {
        color = "#eab308";
        sub = "REAKTOR PLASMA AKTIF!";
      } else if (count === 1) {
        color = "#ef4444";
        sub = "MESIN JET TERKUNCI!";
      }

      this.countdownText?.setText(`${count}`).setColor(color);
      this.countdownSubText?.setText(sub).setColor(color);

      this.tweens.killTweensOf(this.countdownContainer);
      this.tweens.add({
        targets: this.countdownContainer,
        scale: 1.15,
        duration: 250,
        ease: "Back.easeOut",
        yoyo: true,
        hold: 450,
        onComplete: () => {
          this.countdownContainer?.setScale(1.0);
        }
      });
    } else {
      // 0 = Detik Peluncuran / GO!
      sounds.playCountdownBeep(true);
      sounds.startBgm();

      this.countdownText?.setText("GO!").setColor("#10b981");
      this.countdownSubText?.setText("🚀 LUNCURKAN MISI!").setColor("#34d399");

      this.tweens.killTweensOf(this.countdownContainer);
      this.tweens.add({
        targets: this.countdownContainer,
        scale: 1.45,
        alpha: 0,
        duration: 700,
        ease: "Power2",
        onComplete: () => {
          this.countdownContainer?.setVisible(false);
          this.countdownContainer?.setScale(1.0);
          this.countdownContainer?.setAlpha(1);
        }
      });
    }
  }

  private createBossHUD() {
    this.bossHudContainer = this.add.container(300, 78).setDepth(110).setVisible(false);

    // Background Bar Kaca Gelap Merah/Ungu
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0512, 0.92);
    bg.fillRoundedRect(-170, -18, 340, 36, 6);
    bg.lineStyle(1.5, 0xd946ef, 0.7);
    bg.strokeRoundedRect(-170, -18, 340, 36, 6);

    // Badge Nama Boss
    this.bossNameBadge = this.add.text(-160, -9, "👾 KAPAL INDUK PLANET TAYA", {
      fontFamily: "'Outfit', sans-serif",
      fontSize: "10.5px",
      fontStyle: "bold",
      color: "#f43f5e"
    }).setOrigin(0, 0.5);

    // HP Value text
    this.bossHpText = this.add.text(160, -9, "75/75 (100%)", {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "9.5px",
      fontStyle: "bold",
      color: "#fca5a5"
    }).setOrigin(1, 0.5);

    // Slot bar kesehatan
    const barSlot = this.add.graphics();
    barSlot.fillStyle(0x1e1b4b, 0.95);
    barSlot.fillRoundedRect(-160, 4, 320, 10, 3);
    barSlot.lineStyle(1, 0x475569, 0.7);
    barSlot.strokeRoundedRect(-160, 4, 320, 10, 3);

    // Fill bar
    this.bossHpFill = this.add.graphics();

    this.bossHudContainer.add([bg, barSlot, this.bossHpFill, this.bossNameBadge, this.bossHpText]);
  }

  private updateBossHUD(hp: number, maxHp: number = 75) {
    if (!this.bossHpFill || !this.bossHpText) return;
    this.bossHpFill.clear();

    const clamped = Math.max(0, Math.min(maxHp, hp));
    const ratio = clamped / maxHp;
    const barWidth = Math.round(318 * ratio);

    let color = 0xef4444;
    if (ratio > 0.6) color = 0xd946ef;
    else if (ratio > 0.3) color = 0xf59e0b;

    if (barWidth > 0) {
      this.bossHpFill.fillStyle(color, 1);
      this.bossHpFill.fillRoundedRect(-159, 5, barWidth, 8, 2);
    }

    const pct = Math.round(ratio * 100);
    this.bossHpText.setText(`${clamped}/${maxHp} (${pct}%)`);
  }

  private getOrCreateBossContainer(): Phaser.GameObjects.Container {
    if (!this.bossContainer) {
      this.bossContainer = this.add.container(this.room?.state?.bossX || 300, this.room?.state?.bossY || -200).setDepth(28);

      // Core glow aura
      this.bossCoreGlow = this.add.graphics();
      this.bossCoreGlow.fillStyle(0xff0055, 0.35);
      this.bossCoreGlow.fillCircle(0, 0, 34);

      this.bossSprite = this.add.sprite(0, 0, "mothership_boss");

      // Floating mini tag
      const bossMiniLabel = this.add.text(0, -48, "☠️ MOTHERSHIP TAYA ☠️", {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "10.5px",
        fontStyle: "bold",
        color: "#f43f5e"
      }).setOrigin(0.5);

      this.bossContainer.add([this.bossCoreGlow, this.bossSprite, bossMiniLabel]);
    }
    return this.bossContainer;
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

    if (this.bossContainer) {
      try { this.bossContainer.destroy(); } catch (e) {}
      this.bossContainer = undefined;
    }
    if (this.bossHudContainer) {
      this.bossHudContainer.setVisible(false);
    }
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
      const charId = (player.characterId >= 0 && player.characterId <= 4) ? player.characterId : (player.colorIndex % 5);
      const textureKey = `character_ship_${charId}`;
      const exhaustKey = `exhaust_flame_${charId}`;

      const container = this.add.container(player.x, player.y).setDepth(30);

      // A. PENANDA KHUSUS PESAWAT SENDIRI (Halo Neon Berdenyut Sesuai Karakter)
      let beaconRing: Phaser.GameObjects.Graphics | undefined;
      let markerTag: Phaser.GameObjects.Text | undefined;

      const beaconColors = [0xef4444, 0x00f0ff, 0x22c55e, 0xfacc15, 0xd946ef];
      const beaconColor = beaconColors[charId] || 0x00f0ff;

      if (isLocal) {
        beaconRing = this.add.graphics();
        beaconRing.lineStyle(2.5, beaconColor, 0.85);
        beaconRing.strokeCircle(0, 0, 36);
        beaconRing.fillStyle(beaconColor, 0.15);
        beaconRing.fillCircle(0, 0, 36);
        container.add(beaconRing);

        // Label Tag Panah "▼ ANDA" di atas kepala pesawat
        markerTag = this.add.text(0, -52, "▼ ANDA", {
          fontFamily: "'Outfit', sans-serif",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#00f0ff",
        }).setOrigin(0.5);
        container.add(markerTag);
      }

      // Api knalpot mesin sesuai karakter
      const exhaust = this.add.sprite(0, 22, exhaustKey);
      exhaust.setScale(1.35);

      // Sprite Pesawat Pemain Sesuai Karakter (Diperbesar agar gagah & jelas di smartphone)
      const sprite = this.add.sprite(0, 0, textureKey);
      sprite.setScale(1.4);

      // Label Nama dengan Badge Karakter
      const charTag = player.characterName ? `[${player.characterName}] ` : "";
      const displayName = isLocal ? `★ ${charTag}${player.name}` : `${charTag}${player.name}`;
      const nameText = this.add.text(0, -36, displayName, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: isLocal ? "#00f0ff" : "#f1f5f9",
      }).setOrigin(0.5);

      // Mini Health Bar mengambang LEBIH TINGGI di atas badan pesawat (Progress Darah 5x tembakan)
      const hpBarGfx = this.add.graphics();
      this.renderShipHpBar(hpBarGfx, player.hp || 5, 5);

      // Ikon 3 Nyawa Hati (Tetap 3 Nyawa)
      const initialLives = player.lives !== undefined ? player.lives : 3;
      const hpHearts = "❤️".repeat(Math.max(0, initialLives)) + "🖤".repeat(Math.max(0, 3 - initialLives));
      const hpText = this.add.text(0, -10, hpHearts, {
        fontSize: "8.5px"
      }).setOrigin(0.5);

      // Skor kecil
      const scoreText = this.add.text(0, 30, "0", {
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
        this.updateHUDHealthBar(player.hp || 5, 5, initialLives, 3);
      }

      player.onChange(() => {
        playerData.targetX = player.x;
        playerData.targetY = player.y;
        playerData.scoreText.setText(`⭐ ${player.score}`);

        // Update tekstur pesawat dan exhaust sesuai karakter pilihan
        const cId = (player.characterId >= 0 && player.characterId <= 4) ? player.characterId : (player.colorIndex % 5);
        playerData.sprite.setTexture(`character_ship_${cId}`);
        playerData.exhaust.setTexture(`exhaust_flame_${cId}`);

        const cTag = player.characterName ? `[${player.characterName}] ` : "";
        const updatedName = isLocal ? `★ ${cTag}${player.name}` : `${cTag}${player.name}`;
        playerData.nameText.setText(updatedName);

        if (playerData.hpBarGfx) {
          this.renderShipHpBar(playerData.hpBarGfx, player.hp, player.maxHp || 5);
        }

        const pLives = player.lives !== undefined ? player.lives : 3;
        const currentHearts = "❤️".repeat(Math.max(0, pLives)) + "🖤".repeat(Math.max(0, 3 - pLives));
        playerData.hpText.setText(currentHearts);

        if (isLocal) {
          this.myScoreText.setText(`MATCH: ${player.score}`);
          this.myCumulativeText.setText(`TOTAL: ${player.cumulativeScore || 0}`);
          this.updateHUDHealthBar(player.hp, player.maxHp || 5, pLives, player.maxLives || 3);

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
        // Peluru Musuh: Orb Plasma Merah/Oranye Mematikan dengan Aura Cahaya Terang
        gfx.fillStyle(0xef4444, 0.35);
        gfx.fillCircle(0, 0, 8.5); // Outer glowing aura
        gfx.fillStyle(0xff2200, 0.95);
        gfx.fillCircle(0, 0, 5.5);
        gfx.fillStyle(0xfef08a, 1);
        gfx.fillCircle(0, 0, 3);
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

    // 4. Sinkronisasi Pesawat Tempur Alien (Tanpa Label Nama)
    this.room.state.enemies.onAdd((enemy: any) => {
      const container = this.add.container(enemy.x, enemy.y).setDepth(25);
      const textureKey = `enemy_spaceship_${enemy.enemyType || 0}`;

      // Api mesin musuh (mengarah ke atas)
      const exhaust = this.add.sprite(0, -18, "enemy_exhaust_flame");
      const sprite = this.add.sprite(0, 0, textureKey);

      // Pesawat musuh tidak dinamai
      container.add([exhaust, sprite]);

      const enemyData: EnemyData = {
        container,
        sprite,
        exhaust,
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
        this.statusBadge.setText(`HANGAR SKUADRON (${totalPlayers}/5 Pilot)`);
        this.statusBadge.setColor("#38bdf8");
        this.timerText.setText("PILIH KARAKTER");
        this.modalContainer.setVisible(false);
        if (this.bossHudContainer) this.bossHudContainer.setVisible(false);
        // Putar musik BGM saat di Hangar / Game dimulai
        sounds.startBgm();
      } else if (status === "starting") {
        this.statusBadge.setText(`SIAP LEPAS LANDAS!`);
        this.statusBadge.setColor("#f59e0b");
        this.timerText.setText(`HITUNG: ${this.room.state.startCountdown || 3}`);
        this.modalContainer.setVisible(false);
        if (this.bossHudContainer) this.bossHudContainer.setVisible(false);
        sounds.startBgm();
      } else if (status === "playing") {
        this.statusBadge.setText(`MISI AKTIF (${totalPlayers}/5)`);
        this.statusBadge.setColor("#10b981");
        this.timerText.setText(`WAKTU: ${this.room.state.countdown}s`);
        this.modalContainer.setVisible(false);
        sounds.startBgm();

        // Sinkronisasi Bar Kapal Induk Alien
        if (this.room.state.bossActive) {
          if (this.bossHudContainer) {
            this.bossHudContainer.setVisible(true);
            this.updateBossHUD(this.room.state.bossHp, this.room.state.bossMaxHp || 75);
          }
        } else {
          if (this.bossHudContainer) this.bossHudContainer.setVisible(false);
        }
      } else if (status === "finished") {
        this.statusBadge.setText("MISI SELESAI");
        this.statusBadge.setColor("#ffd700");
        this.modalWinner.setText(`Pahlawan Pertahanan Bumi:\n⭐ ${this.room.state.winnerName} ⭐\nSkor Akhir: ${this.room.state.winnerScore}`);
        this.modalContainer.setVisible(true);
        if (this.bossHudContainer) this.bossHudContainer.setVisible(false);
      }

      this.updateLeaderboard();
    });

    // 6. Broadcast Events dari Server
    this.room.onMessage("countdown_tick", (data: any) => {
      this.showStartCountdown(data.count);
    });
    this.room.onMessage("coin_collected", (data: any) => {
      this.spawnFloatingText(
        data.x, 
        data.y, 
        `+${data.value} ${data.label}! (${data.playerName})`, 
        data.value === 100 ? "#facc15" : (data.value === 50 ? "#d946ef" : "#00f0ff")
      );

      if (data.playerId === this.room.sessionId) {
        sounds.playCoin(data.value);
      }
      this.updateLeaderboard();
    });

    this.room.onMessage("enemy_destroyed", (data: any) => {
      this.spawnFloatingText(data.x, data.y, `💥 +${data.points} ALIEN HANCUR!`, "#34d399");
      this.createExplosionEffect(data.x, data.y, false);
      sounds.playExplosion(false);
      this.updateLeaderboard();
    });

    this.room.onMessage("enemy_shoot", () => {
      sounds.playEnemyLaser();
    });

    this.room.onMessage("fast_enemy_incoming", (data: any) => {
      // Peringatan radar musuh kilat meluncur cepat dari atas
      this.spawnFloatingText(data.x, 85, "⚠️ AWAS ALIEN KILAT!", "#f43f5e");
      sounds.playEnemyLaser();
      this.cameras.main.shake(120, 0.007);
    });

    // Event Kapal Induk Alien Planet TaYa (Boss)
    this.room.onMessage("boss_spawned", (data: any) => {
      this.cameras.main.shake(600, 0.025);
      this.cameras.main.flash(350, 255, 0, 80);
      sounds.playExplosion(true);
      sounds.playEnemyLaser();
      this.spawnFloatingText(300, 180, "🚨 AWAS! KAPAL INDUK PLANET TAYA MEMASUKI ORBIT! 🚨", "#f43f5e");
      if (this.bossHudContainer) {
        this.bossHudContainer.setVisible(true);
        this.updateBossHUD(data.hp, data.maxHp);
      }
    });

    this.room.onMessage("boss_damaged", (data: any) => {
      this.updateBossHUD(data.hp, data.maxHp);
      this.createPhysicsBumpEffect(data.x, data.y, (Math.random() - 0.5) * 2, -1);
      sounds.playEnemyLaser();
      if (this.bossSprite) {
        this.bossSprite.setTint(0xffffff);
        this.time.delayedCall(70, () => {
          if (this.bossSprite) this.bossSprite.clearTint();
        });
      }
    });

    this.room.onMessage("boss_defeated", (data: any) => {
      this.cameras.main.shake(800, 0.04);
      this.cameras.main.flash(500, 255, 255, 255);
      sounds.playExplosion(true);

      // Multi-explosion supernova chain
      for (let i = 0; i < 8; i++) {
        this.time.delayedCall(i * 130, () => {
          const offsetX = (Math.random() - 0.5) * 120;
          const offsetY = (Math.random() - 0.5) * 60;
          this.createExplosionEffect(data.x + offsetX, data.y + offsetY, true);
          sounds.playExplosion(true);
        });
      }

      this.spawnFloatingText(300, 210, `🎉 KAPAL INDUK ALIEN HANCUR!\nPenghancur: ${data.killerName} (+600 Pts)`, "#facc15");
      if (this.bossContainer) this.bossContainer.setVisible(false);
      if (this.bossHudContainer) this.bossHudContainer.setVisible(false);
      this.updateLeaderboard();
    });

    this.room.onMessage("boss_shoot", () => {
      sounds.playEnemyLaser();
    });

    this.room.onMessage("player_damaged", (data: any) => {
      this.createExplosionEffect(data.x, data.y, data.lifeLost);
      sounds.playExplosion(data.lifeLost);

      if (data.lifeLost) {
        this.spawnFloatingText(data.x, data.y, `💔 1 NYAWA HILANG! (Sisa: ${data.livesRemaining}/3 Nyawa)`, "#f43f5e");
      } else {
        this.spawnFloatingText(data.x, data.y, `💥 -1 PERISAI! (Sisa: ${data.hpRemaining}/5)`, "#ef4444");
      }

      if (data.playerId === this.room.sessionId) {
        this.cameras.main.shake(data.lifeLost ? 400 : 200, data.lifeLost ? 0.035 : 0.015);
        this.cameras.main.flash(data.lifeLost ? 300 : 160, 255, 0, 0);
        this.updateHUDHealthBar(data.hpRemaining, data.maxHp || 5, data.livesRemaining, data.maxLives || 3);
      }
    });

    this.room.onMessage("player_eliminated", (data: any) => {
      this.createBigExplosionEffect(data.x, data.y);
      sounds.playExplosion(true);
      this.spawnFloatingText(data.x, data.y, `💥 ${data.playerName} HANCUR TOTAL (3 NYAWA HABIS)!`, "#f43f5e");

      const elimP = this.players.get(data.playerId);
      if (elimP) {
        elimP.container.destroy();
        this.players.delete(data.playerId);
      }
      this.updateLeaderboard();
    });

    // Khusus untuk pemain ini jika tereliminasi (seluruh 3 nyawa habis)
    this.room.onMessage("you_are_eliminated", (data: any) => {
      sounds.playExplosion(true);
      sounds.playGameOver();
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

      this.elimReasonText.setText(data.message || "Seluruh 3 Nyawa Pesawat Anda telah habis!");
      this.elimScoreText.setText(
        `Skor Misi Ini: ${data.matchScore} Poin\n` +
        `Total Akumulasi Poin: ${data.totalScore} Poin\n` +
        `Skor Terbaik: ${data.highestScore} | Misi Dimainkan: ${data.gamesPlayed}`
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
    // 1. Screen Shake Haptic Punch
    this.cameras.main.shake(isBig ? 240 : 150, isBig ? 0.015 : 0.008);

    // 2. Kilatan Cahaya Putih Inti Meledak (Instant Blinding Flash)
    const flash = this.add.graphics().setDepth(45);
    flash.fillStyle(0xffffff, 1);
    flash.fillCircle(x, y, isBig ? 32 : 20);
    this.tweens.add({
      targets: flash,
      scaleX: 1.6,
      scaleY: 1.6,
      alpha: 0,
      duration: 120,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy(),
    });

    // 3. Shockwave Rings (Cincin Gelombang Kejut Api & Neon Meledak)
    const shockwave1 = this.add.graphics().setDepth(44);
    shockwave1.lineStyle(isBig ? 4 : 2.5, 0xff7700, 1);
    shockwave1.strokeCircle(x, y, isBig ? 20 : 14);
    this.tweens.add({
      targets: shockwave1,
      scaleX: isBig ? 4.0 : 3.0,
      scaleY: isBig ? 4.0 : 3.0,
      alpha: 0,
      duration: isBig ? 450 : 340,
      ease: "Cubic.easeOut",
      onComplete: () => shockwave1.destroy(),
    });

    const shockwave2 = this.add.graphics().setDepth(44);
    shockwave2.lineStyle(isBig ? 2.5 : 1.5, 0x00f0ff, 0.85);
    shockwave2.strokeCircle(x, y, isBig ? 12 : 8);
    this.tweens.add({
      targets: shockwave2,
      scaleX: isBig ? 3.2 : 2.2,
      scaleY: isBig ? 3.2 : 2.2,
      alpha: 0,
      duration: isBig ? 380 : 280,
      ease: "Quad.easeOut",
      onComplete: () => shockwave2.destroy(),
    });

    // 4. Multi-stage Fireball Clusters (Bola Api Bergumpal Meletup Bertahap)
    const clusterOffsets = [
      { dx: 0, dy: 0, r: isBig ? 28 : 18, color: 0xff3300, delay: 0 },
      { dx: -10, dy: -6, r: isBig ? 22 : 14, color: 0xf59e0b, delay: 40 },
      { dx: 8, dy: 8, r: isBig ? 20 : 13, color: 0xef4444, delay: 70 },
      { dx: 6, dy: -8, r: isBig ? 18 : 11, color: 0xffd700, delay: 100 },
    ];

    clusterOffsets.forEach((cl) => {
      this.time.delayedCall(cl.delay, () => {
        const ball = this.add.graphics().setDepth(43);
        ball.fillStyle(cl.color, 0.95);
        ball.fillCircle(x + cl.dx, y + cl.dy, cl.r);
        ball.fillStyle(0xffffff, 0.85);
        ball.fillCircle(x + cl.dx, y + cl.dy, cl.r * 0.45);

        this.tweens.add({
          targets: ball,
          scaleX: 1.7,
          scaleY: 1.7,
          alpha: 0,
          duration: isBig ? 360 : 260,
          ease: "Quad.easeOut",
          onComplete: () => ball.destroy(),
        });
      });
    });

    // 5. Pecahan Logam Rangka Pesawat yang Terlempar Berputar (Shrapnel)
    const shrapnelCount = isBig ? 14 : 9;
    const shrapnelColors = [0xf87171, 0xfbbf24, 0x94a3b8, 0xef4444, 0xffffff];

    for (let i = 0; i < shrapnelCount; i++) {
      const shrapnel = this.add.graphics().setDepth(46);
      const col = shrapnelColors[i % shrapnelColors.length];
      shrapnel.fillStyle(col, 1);

      // Bentuk segitiga pecahan logam tajam
      const sz = 4 + Math.random() * 5;
      shrapnel.fillTriangle(-sz, sz, sz, sz, 0, -sz * 1.5);
      shrapnel.x = x;
      shrapnel.y = y;

      const angle = (i / shrapnelCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const speed = (isBig ? 65 : 45) + Math.random() * (isBig ? 80 : 55);

      this.tweens.add({
        targets: shrapnel,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        angle: (Math.random() - 0.5) * 720,
        alpha: 0,
        scale: 0.3,
        duration: 380 + Math.random() * 220,
        ease: "Cubic.easeOut",
        onComplete: () => shrapnel.destroy(),
      });
    }

    // 6. Asap Hitam Kelabu Sisa Ledakan
    const smokeCount = isBig ? 6 : 4;
    for (let s = 0; s < smokeCount; s++) {
      const smoke = this.add.graphics().setDepth(42);
      smoke.fillStyle(0x1e293b, 0.7);
      smoke.fillCircle(0, 0, 10 + Math.random() * 8);
      smoke.x = x + (Math.random() - 0.5) * 16;
      smoke.y = y + (Math.random() - 0.5) * 16;

      this.tweens.add({
        targets: smoke,
        y: smoke.y - (20 + Math.random() * 25),
        scaleX: 2.2,
        scaleY: 2.2,
        alpha: 0,
        duration: 500 + Math.random() * 250,
        ease: "Quad.easeOut",
        onComplete: () => smoke.destroy(),
      });
    }

    // 7. Percikan Bunga Api Menyala (Sparks)
    const sparkCount = isBig ? 16 : 10;
    for (let i = 0; i < sparkCount; i++) {
      const spark = this.add.graphics().setDepth(47);
      spark.fillStyle(Math.random() < 0.6 ? 0xffd700 : 0xff3300, 1);
      spark.fillCircle(0, 0, Math.random() < 0.5 ? 2.5 : 1.8);
      spark.x = x;
      spark.y = y;

      const angle = Math.random() * Math.PI * 2;
      const dist = (isBig ? 55 : 35) + Math.random() * (isBig ? 45 : 30);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 320 + Math.random() * 180,
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

    const playerList: { name: string; score: number; isMe: boolean; hp: number; lives: number; characterName: string }[] = [];
    this.room.state.players.forEach((p: any, id: string) => {
      playerList.push({
        name: p.name,
        score: p.score,
        hp: p.hp,
        lives: p.lives !== undefined ? p.lives : 3,
        isMe: id === this.room.sessionId,
        characterName: p.characterName || "",
      });
    });

    playerList.sort((a, b) => b.score - a.score);

    for (let i = 0; i < 5; i++) {
      const entry = this.leaderboardEntries[i];
      if (i < playerList.length) {
        const item = playerList[i];
        const medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `${i + 1}.`));
        const meTag = item.isMe ? " [YOU]" : "";
        const charTag = item.characterName ? `[${item.characterName}] ` : "";
        const heart = "❤️".repeat(Math.max(0, item.lives));
        entry.setText(`${medal} ${charTag}${item.name.substring(0, 6)}${meTag} ${heart}: ${item.score}`);
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

    // 1. Scroll Starfield (Melayang santai saat persiapan Hangar, melesat cepat saat pertempuran)
    if (this.starGraphics) {
      this.starGraphics.clear();
      const speedMult = (this.room && this.room.state.status === "playing") ? 1.0 : 0.35;
      this.stars.forEach((star) => {
        star.y += star.speed * speedMult * dtSec;
        if (star.y > 960) {
          star.y = 0;
          star.x = Math.random() * 600;
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

      if (shoot && this.localShootCooldown <= 0 && this.room.state.status === "playing") {
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

    // 4. Interpolasi Posisi Peluru (Termasuk tembakan menyebar / diagonal)
    this.bullets.forEach((b) => {
      b.sprite.x = Phaser.Math.Linear(b.sprite.x, b.targetX, 0.55);
      b.sprite.y = Phaser.Math.Linear(b.sprite.y, b.targetY, 0.55);
    });

    // 5. Interpolasi Posisi Koin Inti Energi
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

    // 7. Interpolasi Posisi Kapal Induk Alien Planet TaYa (Boss)
    if (this.room && this.room.state && this.room.state.bossActive) {
      const bContainer = this.getOrCreateBossContainer();
      bContainer.setVisible(true);
      bContainer.x = Phaser.Math.Linear(bContainer.x, this.room.state.bossX, 0.25);
      bContainer.y = Phaser.Math.Linear(bContainer.y, this.room.state.bossY, 0.25);

      if (this.bossCoreGlow) {
        this.bossCoreGlow.alpha = 0.35 + Math.sin(time * 0.008) * 0.25;
        const scaleVal = 1.0 + Math.sin(time * 0.005) * 0.2;
        this.bossCoreGlow.setScale(scaleVal);
      }

      if (this.bossHudContainer) {
        this.bossHudContainer.setVisible(true);
        this.updateBossHUD(this.room.state.bossHp, this.room.state.bossMaxHp || 75);
      }
    } else {
      if (this.bossContainer) {
        this.bossContainer.setVisible(false);
      }
      if (this.bossHudContainer) {
        this.bossHudContainer.setVisible(false);
      }
    }
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
   * - Progress bar menampilkan 5 bar darah untuk nyawa saat ini
   * - Menampilkan sisa 3 Nyawa (Lives ❤️)
   */
  private updateHUDHealthBar(hp: number, maxHp: number = 5, lives: number = 3, maxLives: number = 3) {
    if (!this.myHpBarFill) return;
    this.myHpBarFill.clear();

    const clampedHp = Math.max(0, Math.min(maxHp, hp));
    const ratio = clampedHp / maxHp;
    const barWidth = Math.round(90 * ratio);

    let fillColor = 0x10b981; // Hijau (5/5)
    if (clampedHp === 4) fillColor = 0x34d399; // Emerald (4/5)
    else if (clampedHp === 3) fillColor = 0xfacc15; // Kuning (3/5)
    else if (clampedHp === 2) fillColor = 0xf97316; // Oranye (2/5)
    else if (clampedHp <= 1) fillColor = 0xef4444; // Merah Kritis (1/5)

    if (barWidth > 0) {
      this.myHpBarFill.fillStyle(fillColor, 0.92);
      this.myHpBarFill.fillRoundedRect(167, 28 + 2, barWidth, 12, 3);
    }

    const clampedLives = Math.max(0, Math.min(maxLives, lives));

    if (this.myHpText) {
      this.myHpText.setText(clampedLives <= 1 ? "⚠️" : "🛡️");
    }

    if (this.myHpValText) {
      this.myHpValText.setText(`${clampedHp}/${maxHp} (${clampedLives}❤️)`);
      this.myHpValText.setColor(clampedHp <= 1 || clampedLives <= 1 ? "#fca5a5" : "#ffffff");
    }
  }

  /**
   * Render Mini Health Bar mengambang LEBIH TINGGI di atas masing-masing pesawat
   * Diposisikan di y = -24 dengan frame kontras tinggi agar terlihat jelas di smartphone
   */
  private renderShipHpBar(gfx: Phaser.GameObjects.Graphics, hp: number, maxHp: number = 5) {
    gfx.clear();
    const clampedHp = Math.max(0, Math.min(maxHp, hp));
    const ratio = clampedHp / maxHp;

    const barW = 44;
    const barH = 6;
    const barX = -barW / 2;
    const barY = -25; // Sedikit ke atas lagi di area pesawat agar tidak terhalang hidung & kokpit pesawat

    // Background slot gelap dengan border cyan bercahaya
    gfx.fillStyle(0x020617, 0.95);
    gfx.fillRoundedRect(barX, barY, barW, barH, 2);
    gfx.lineStyle(1, 0x00f0ff, 0.75);
    gfx.strokeRoundedRect(barX, barY, barW, barH, 2);

    // Isi bar
    let fillColor = 0x10b981;
    if (clampedHp === 4) fillColor = 0x34d399;
    else if (clampedHp === 3) fillColor = 0xfacc15;
    else if (clampedHp === 2) fillColor = 0xf97316;
    else if (clampedHp <= 1) fillColor = 0xef4444;

    const fillWidth = Math.max(0, Math.round((barW - 2) * ratio));
    if (fillWidth > 0) {
      gfx.fillStyle(fillColor, 1);
      gfx.fillRoundedRect(barX + 1, barY + 1, fillWidth, barH - 2, 1.5);
    }
  }
}
