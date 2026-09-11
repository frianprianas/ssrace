import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Bullet extends Schema {
  @type("string") id: string = "";
  @type("string") playerId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") isEnemy: boolean = false;
  @type("number") speedX: number = 0;
  @type("number") speedY: number = 680;
}

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") email: string = "";
  @type("number") x: number = 300;
  @type("number") y: number = 820; // Zona pertahanan bawah
  @type("number") stepY: number = 2; // Posisi Netral: 2. Range 0 (Mundur 2 langkah: 900) s/d 4 (Maju 2 langkah: 740)
  @type("number") score: number = 0;
  @type("number") cumulativeScore: number = 0; // Akumulasi total skor dari database
  @type("number") lives: number = 3; // 3 Nyawa tetap
  @type("number") maxLives: number = 3;
  @type("number") hp: number = 5; // Bar darah per nyawa (5x tembakan untuk menghabiskan 1 nyawa)
  @type("number") maxHp: number = 5;
  @type("boolean") isEliminated: boolean = false;
  @type("number") invulnerableTimer: number = 0; // Kebal saat baru tertabrak/tertembak
  @type("number") colorIndex: number = 0;
  @type("number") characterId: number = -1; // -1: belum pilih, 0: BAKTI, 1: NUSA, 2: BAKNUS, 3: TARA, 4: BEEN
  @type("string") characterName: string = "";
  @type("string") shipName: string = "";
  @type("boolean") isReady: boolean = false;
}

export class Coin extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = -50;
  @type("number") speedY: number = 100;
  @type("number") value: number = 25; // 25 (Plasma), 50 (Photon), 100 (Quantum)
  @type("string") label: string = "Plasma Core";
  @type("number") radius: number = 14;
}

export class Enemy extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = -60;
  @type("number") speedX: number = 0;
  @type("number") speedY: number = 100;
  @type("number") hp: number = 1;
  @type("number") radius: number = 22;
  @type("number") shootTimer: number = 0; // Timer tembakan peluru musuh
  @type("number") enemyType: number = 0;
}

export class PlaneRaceState extends Schema {
  @type("string") status: string = "waiting"; // "waiting" | "starting" | "playing" | "finished"
  @type("number") countdown: number = 120; // 120 detik pertempuran
  @type("number") startCountdown: number = 0; // 3, 2, 1 hitung mundur sebelum lepas landas
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([ Bullet ]) bullets = new ArraySchema<Bullet>();
  @type([ Coin ]) coins = new ArraySchema<Coin>();
  @type([ Enemy ]) enemies = new ArraySchema<Enemy>();
  @type("string") winnerName: string = "";
  @type("number") winnerScore: number = 0;
  @type("boolean") isVictory: boolean = false;
  @type("string") victoryMessage: string = "";

  // Kapal Induk Alien Planet TaYa (Boss Pertempuran Akhir)
  @type("boolean") bossActive: boolean = false;
  @type("number") bossHp: number = 0;
  @type("number") bossMaxHp: number = 75;
  @type("number") bossX: number = 300;
  @type("number") bossY: number = -200;
}
