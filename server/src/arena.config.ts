import config from "@colyseus/tools";
import { monitor } from "@colyseus/monitor";
import cors from "cors";
import express from "express";
import path from "path";
import fs from "fs";
import { PlaneRaceRoom } from "./rooms/PlaneRaceRoom";
import { ScoreDatabase } from "./db/scoreDatabase";

export default config({
  getId: () => "ssrace-game-server",

  initializeGameServer: (gameServer) => {
    // Daftarkan room permainan SSRace
    gameServer.define("race_room", PlaneRaceRoom);
  },

  initializeExpress: (app) => {
    app.use(cors());
    app.use(express.json());

    // Lokasi file statis frontend (public/ di production Docker, atau ../../client/dist di lokal)
    const prodPublicDir = path.join(__dirname, "../public");
    const devClientDistDir = path.join(__dirname, "../../client/dist");
    const staticDir = fs.existsSync(prodPublicDir) ? prodPublicDir : devClientDistDir;

    if (fs.existsSync(staticDir)) {
      app.use(express.static(staticDir));
      console.log(`[SSRace Server] Menyajikan frontend web client dari: ${staticDir}`);
    }

    // Health check API endpoint
    app.get("/api/status", (req, res) => {
      res.json({
        name: "SSRace Server (Slim Survival Race)",
        status: "online",
        framework: "Colyseus",
        arena: "800x600",
        version: "1.0.0",
        endpoints: {
          ws: "ws://localhost:2567",
          monitor: "http://localhost:2567/colyseus",
          leaderboard: "http://localhost:2567/api/leaderboard"
        }
      });
    });

    // API Leaderboard Akumulasi Skor Seluruh Karyawan
    app.get("/api/leaderboard", (req, res) => {
      const topLimit = parseInt(req.query.limit as string) || 20;
      const scores = ScoreDatabase.getInstance().getTopLeaderboard(topLimit);
      res.json({
        success: true,
        count: scores.length,
        leaderboard: scores
      });
    });

    // Colyseus Monitor Dashboard
    app.use("/colyseus", monitor());

    // Fallback ke index.html untuk semua akses web browser
    app.get("*", (req, res) => {
      const indexPath = path.join(staticDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.json({
          name: "SSRace Server",
          status: "online",
          endpoints: {
            ws: "ws://localhost:2567",
            monitor: "/colyseus",
            api: "/api/status"
          }
        });
      }
    });
  },

  beforeListen: () => {
    console.log("[SSRace Server] Server siap mendengarkan koneksi di port 2567...");
  }
});
