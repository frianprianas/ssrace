import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Bullet extends Schema {
  @type("string") id: string = "";
  @type("string") playerId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") email: string = "";
  @type("number") x: number = 400;
  @type("number") y: number = 510; // Zona pertahanan bawah
  @type("number") stepY: number = 1; // 3 Langkah: 0 (bawah: 535), 1 (tengah: 495), 2 (atas: 455)
  @type("number") score: number = 0;
  @type("number") invulnerableTimer: number = 0; // Kebal saat baru tertabrak
  @type("number") colorIndex: number = 0;
}

export class Coin extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = -50;
  @type("number") speedY: number = 100;
  @type("number") value: number = 25; // 25 (Lembur), 50 (Tunjangan), 100 (Bonus KPI)
  @type("string") label: string = "Uang Lembur";
  @type("number") radius: number = 14;
}

export class Enemy extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = -60;
  @type("number") speedX: number = 0;
  @type("number") speedY: number = 110;
  @type("number") hp: number = 1;
  @type("number") radius: number = 22;
}

export class PlaneRaceState extends Schema {
  @type("string") status: string = "waiting"; // "waiting" | "playing" | "finished"
  @type("number") countdown: number = 120; // 120 detik
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([ Bullet ]) bullets = new ArraySchema<Bullet>();
  @type([ Coin ]) coins = new ArraySchema<Coin>();
  @type([ Enemy ]) enemies = new ArraySchema<Enemy>();
  @type("string") winnerName: string = "";
  @type("number") winnerScore: number = 0;
}
