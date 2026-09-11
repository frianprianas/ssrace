import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { sounds } from "./sound";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "game-container",
  backgroundColor: "#070913",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [GameScene]
};

window.addEventListener("DOMContentLoaded", () => {
  const game = new Phaser.Game(config);

  // Bind HTML Controls
  const btnConnect = document.getElementById("btn-connect") as HTMLButtonElement;
  const inputServer = document.getElementById("server-url") as HTMLInputElement;
  const inputName = document.getElementById("player-name") as HTMLInputElement;
  const btnSound = document.getElementById("btn-sound") as HTMLButtonElement;

  if (btnConnect && inputServer && inputName) {
    btnConnect.addEventListener("click", () => {
      const url = inputServer.value.trim() || "ws://localhost:2567";
      const name = inputName.value.trim() || "Karyawan Teladan";

      const scene = game.scene.getScene("GameScene") as GameScene;
      if (scene) {
        scene.connectToServer(url, name);
      }
    });
  }

  if (btnSound) {
    btnSound.addEventListener("click", () => {
      sounds.enabled = !sounds.enabled;
      btnSound.innerText = sounds.enabled ? "🔊 Sound: ON" : "🔇 Sound: OFF";
      btnSound.style.opacity = sounds.enabled ? "1" : "0.6";
    });
  }
});
