import config from "@colyseus/tools";
import { monitor } from "@colyseus/monitor";
import cors from "cors";
import express from "express";
import { PlaneRaceRoom } from "./rooms/PlaneRaceRoom";

export default config({
  getId: () => "ssrace-game-server",

  initializeGameServer: (gameServer) => {
    // Daftarkan room permainan SSRace
    gameServer.define("race_room", PlaneRaceRoom);
  },

  initializeExpress: (app) => {
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get("/", (req, res) => {
      res.json({
        name: "SSRace Server (Slim Survival Race)",
        status: "online",
        framework: "Colyseus",
        arena: "800x600",
        version: "1.0.0",
        endpoints: {
          ws: "ws://localhost:2567",
          monitor: "http://localhost:2567/colyseus"
        }
      });
    });

    // Colyseus Monitor Dashboard
    app.use("/colyseus", monitor());
  },

  beforeListen: () => {
    console.log("[SSRace Server] Server siap mendengarkan koneksi di port 2567...");
  }
});
