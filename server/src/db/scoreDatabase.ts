import * as fs from "fs";
import * as path from "path";

export interface PlayerScoreRecord {
  username: string;
  email: string;
  totalScore: number;
  highestScore: number;
  gamesPlayed: number;
  lastPlayed: string;
}

export class ScoreDatabase {
  private static instance: ScoreDatabase;
  private dbPath: string;
  private records: Map<string, PlayerScoreRecord> = new Map();
  private isLoaded: boolean = false;

  private constructor() {
    // Jalur penyimpanan database di dalam folder data/
    // Di Docker ini akan dimount ke ./data host sehingga persisten selamanya
    const baseDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    if (!fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });
      } catch (e) {
        console.warn("[ScoreDatabase] Gagal membuat direktori data, fallback ke cwd:", e);
      }
    }
    this.dbPath = path.join(baseDir, "scoreboard.json");
    this.load();
  }

  public static getInstance(): ScoreDatabase {
    if (!ScoreDatabase.instance) {
      ScoreDatabase.instance = new ScoreDatabase();
    }
    return ScoreDatabase.instance;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, "utf-8");
        const data: Record<string, PlayerScoreRecord> = JSON.parse(raw);
        this.records = new Map(Object.entries(data));
        console.log(`[ScoreDatabase] Memuat ${this.records.size} rekor pemain dari ${this.dbPath}`);
      } else {
        console.log(`[ScoreDatabase] Database baru diinisialisasi di ${this.dbPath}`);
        this.save();
      }
    } catch (err) {
      console.error("[ScoreDatabase] Gagal membaca database, inisialisasi ulang memori:", err);
      this.records = new Map();
    }
    this.isLoaded = true;
  }

  private save(): void {
    try {
      const obj: Record<string, PlayerScoreRecord> = {};
      this.records.forEach((value, key) => {
        obj[key] = value;
      });
      // Tulis atomik atau aman
      fs.writeFileSync(this.dbPath, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
      console.error("[ScoreDatabase] Gagal menyimpan ke disk:", err);
    }
  }

  /**
   * Mengambil rekor pemain berdasarkan username
   */
  public getRecord(username: string): PlayerScoreRecord | undefined {
    const key = username.toLowerCase().trim();
    return this.records.get(key);
  }

  /**
   * Mengakumulasikan skor baru ke profil pemain
   */
  public addMatchScore(username: string, email: string, matchScore: number): PlayerScoreRecord {
    const key = username.toLowerCase().trim();
    const existing = this.records.get(key);

    const safeMatchScore = Math.max(0, matchScore);
    const nowIso = new Date().toISOString();

    if (existing) {
      existing.totalScore += safeMatchScore;
      existing.gamesPlayed += 1;
      existing.lastPlayed = nowIso;
      if (safeMatchScore > existing.highestScore) {
        existing.highestScore = safeMatchScore;
      }
      if (email && !existing.email) {
        existing.email = email;
      }
      this.records.set(key, existing);
      this.save();
      return existing;
    } else {
      const newRecord: PlayerScoreRecord = {
        username: key,
        email: email || `${key}@smk.baktinusantara666.sch.id`,
        totalScore: safeMatchScore,
        highestScore: safeMatchScore,
        gamesPlayed: 1,
        lastPlayed: nowIso
      };
      this.records.set(key, newRecord);
      this.save();
      return newRecord;
    }
  }

  /**
   * Mengambil daftar peringkat klasemen akumulasi teratas
   */
  public getTopLeaderboard(limit: number = 20): PlayerScoreRecord[] {
    const list = Array.from(this.records.values());
    list.sort((a, b) => b.totalScore - a.totalScore);
    return list.slice(0, limit);
  }
}
