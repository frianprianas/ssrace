import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("number") x: number = 400;
  @type("number") y: number = 300;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") angle: number = 0; // dalam derajat 0 - 360
  @type("number") score: number = 0;
  @type("boolean") isThrusting: boolean = false;
  @type("number") invulnerableTimer: number = 0; // Detik kebal saat baru kena tabrak musuh
  @type("number") colorIndex: number = 0; // Palet warna identitas pemain
}

export class Coin extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") value: number = 25; // 25 (Lembur), 50 (Tunjangan), 100 (Bonus KPI)
  @type("string") label: string = "Uang Lembur";
  @type("number") radius: number = 12;
}

export class Enemy extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") radius: number = 20;
}

export class PlaneRaceState extends Schema {
  @type("string") status: string = "waiting"; // "waiting" | "playing" | "finished"
  @type("number") countdown: number = 120; // 120 detik
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([ Coin ]) coins = new ArraySchema<Coin>();
  @type([ Enemy ]) enemies = new ArraySchema<Enemy>();
  @type("string") winnerName: string = "";
  @type("number") winnerScore: number = 0;
}
