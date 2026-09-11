import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { sounds } from "./sound";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#070913",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 600
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  input: {
    activePointers: 3 // Dukungan multi-touch gesture smartphone
  },
  scene: [GameScene]
};

window.addEventListener("DOMContentLoaded", () => {
  const game = new Phaser.Game(config);

  // DOM Elements
  const modalLogin = document.getElementById("login-modal") as HTMLDivElement;
  const formLogin = document.getElementById("form-login") as HTMLFormElement;
  const inputServer = document.getElementById("server-url") as HTMLInputElement;
  const inputUsername = document.getElementById("input-username") as HTMLInputElement;
  const inputPassword = document.getElementById("input-password") as HTMLInputElement;
  const loginError = document.getElementById("login-error") as HTMLDivElement;
  const btnSubmit = document.getElementById("btn-submit-login") as HTMLButtonElement;

  const sessionInfo = document.getElementById("session-info") as HTMLDivElement;
  const badgeUsername = document.getElementById("badge-username") as HTMLSpanElement;
  const badgeEmail = document.getElementById("badge-email") as HTMLSpanElement;
  const btnLogout = document.getElementById("btn-logout") as HTMLButtonElement;
  const btnOpenLogin = document.getElementById("btn-open-login") as HTMLButtonElement;
  const btnBgm = document.getElementById("btn-bgm") as HTMLButtonElement;
  const btnSfx = document.getElementById("btn-sfx") as HTMLButtonElement;

  // Inisialisasi Server URL dari host browser otomatis
  if (inputServer) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    if (window.location.port === "3000") {
      // Dibuka via Vite dev server lokal
      inputServer.value = `${protocol}//${window.location.hostname}:2567`;
    } else if (window.location.host) {
      // Dibuka langsung via All-in-One server (port 2567 atau domain publik)
      inputServer.value = `${protocol}//${window.location.host}`;
    } else {
      inputServer.value = "ws://localhost:2567";
    }
  }

  // Cek token tersimpan atau URL param SSO (?token=...)
  const urlParams = new URLSearchParams(window.location.search);
  const ssoToken = urlParams.get("token") || localStorage.getItem("baknus_token");
  const savedUsername = localStorage.getItem("baknus_username");

  if (savedUsername && inputUsername) {
    inputUsername.value = savedUsername;
  }

  const touchControls = document.getElementById("touch-controls") as HTMLDivElement;

  const showModal = (show: boolean) => {
    if (modalLogin) {
      modalLogin.style.display = show ? "flex" : "none";
    }
    if (btnOpenLogin) {
      btnOpenLogin.style.display = show ? "none" : (ssoToken ? "none" : "block");
    }
    if (touchControls) {
      touchControls.style.display = show ? "none" : "flex";
    }
  };

  const updateSessionUI = (email: string, name?: string) => {
    if (sessionInfo && badgeUsername && badgeEmail) {
      badgeUsername.innerText = `👤 ${name || email.split("@")[0]}`;
      badgeEmail.innerText = email;
      sessionInfo.style.display = "flex";
      if (btnOpenLogin) btnOpenLogin.style.display = "none";
    }
  };

  // Handler Submit Login Form
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      loginError.style.display = "none";
      btnSubmit.disabled = true;
      btnSubmit.innerText = "⏳ MEMVERIFIKASI AKUN...";

      const serverUrl = inputServer.value.trim() || "ws://localhost:2567";
      const rawUser = inputUsername.value.trim().toLowerCase();
      const username = rawUser.includes("@") ? rawUser.split("@")[0] : rawUser;
      const fullEmail = `${username}@smk.baktinusantara666.sch.id`;
      const password = inputPassword.value;

      try {
        const scene = game.scene.getScene("GameScene") as GameScene;
        if (!scene) throw new Error("Game engine belum siap.");

        await scene.connectToServer({ 
          serverUrl, 
          email: fullEmail,
          password 
        });

        localStorage.setItem("baknus_username", username);
        showModal(false);
        updateSessionUI(fullEmail, username);
      } catch (err: any) {
        console.error("Login gagal:", err);
        loginError.innerText = err.message || "Gagal masuk. Periksa username dan password Baknus Mail.";
        loginError.style.display = "block";
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "🚀 MASUK ARENA BALAP";
      }
    });
  }

  // Auto-login jika ada token SSO
  if (ssoToken) {
    setTimeout(async () => {
      const serverUrl = inputServer?.value.trim() || "ws://localhost:2567";
      const scene = game.scene.getScene("GameScene") as GameScene;
      if (scene) {
        try {
          await scene.connectToServer({ serverUrl, token: ssoToken });
          const fullEmail = savedUsername ? `${savedUsername}@smk.baktinusantara666.sch.id` : "Karyawan Baknus";
          showModal(false);
          updateSessionUI(fullEmail, savedUsername || "Karyawan");
        } catch (e) {
          console.warn("SSO Token kedaluwarsa, tampilkan modal login.", e);
          localStorage.removeItem("baknus_token");
          showModal(true);
        }
      }
    }, 500);
  }

  // Tombol Ganti Akun / Logout
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      localStorage.removeItem("baknus_token");
      if (sessionInfo) sessionInfo.style.display = "none";
      showModal(true);
    });
  }

  // Tombol Buka Modal Login
  if (btnOpenLogin) {
    btnOpenLogin.addEventListener("click", () => showModal(true));
  }

  // ==========================================
  // 📱 BIND VIRTUAL TOUCH CONTROLS (SMARTPHONE)
  // ==========================================
  const getScene = (): GameScene | undefined => {
    return game.scene.getScene("GameScene") as GameScene;
  };

  const bindButtonTouch = (elementId: string, actionKey: "left" | "right" | "up" | "down" | "shoot") => {
    const btn = document.getElementById(elementId);
    if (!btn) return;

    const startAction = (e: Event) => {
      e.preventDefault();
      const scene = getScene();
      if (scene) scene.touchInput[actionKey] = true;
    };

    const stopAction = (e: Event) => {
      e.preventDefault();
      const scene = getScene();
      if (scene) scene.touchInput[actionKey] = false;
    };

    btn.addEventListener("touchstart", startAction, { passive: false });
    btn.addEventListener("touchend", stopAction, { passive: false });
    btn.addEventListener("touchcancel", stopAction, { passive: false });
    btn.addEventListener("mousedown", startAction);
    btn.addEventListener("mouseup", stopAction);
    btn.addEventListener("mouseleave", stopAction);
  };

  bindButtonTouch("touch-left", "left");
  bindButtonTouch("touch-right", "right");
  bindButtonTouch("touch-up", "up");
  bindButtonTouch("touch-down", "down");
  bindButtonTouch("touch-fire", "shoot");

  // ==========================================
  // 🎵 AUDIO CONTROLS (BGM & SFX TOGGLE)
  // ==========================================
  if (btnBgm) {
    btnBgm.addEventListener("click", () => {
      const active = sounds.toggleBgm();
      btnBgm.innerText = active ? "🎵 BGM: ON" : "🔇 BGM: OFF";
      btnBgm.style.opacity = active ? "1" : "0.6";
    });
  }

  if (btnSfx) {
    btnSfx.addEventListener("click", () => {
      const active = sounds.toggleSfx();
      btnSfx.innerText = active ? "🔊 SFX: ON" : "🔇 SFX: OFF";
      btnSfx.style.opacity = active ? "1" : "0.6";
    });
  }
});
