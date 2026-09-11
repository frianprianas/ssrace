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

  // DOM Elements
  const modalLogin = document.getElementById("login-modal") as HTMLDivElement;
  const formLogin = document.getElementById("form-login") as HTMLFormElement;
  const inputServer = document.getElementById("server-url") as HTMLInputElement;
  const inputEmail = document.getElementById("input-email") as HTMLInputElement;
  const inputPassword = document.getElementById("input-password") as HTMLInputElement;
  const loginError = document.getElementById("login-error") as HTMLDivElement;
  const btnSubmit = document.getElementById("btn-submit-login") as HTMLButtonElement;

  const sessionInfo = document.getElementById("session-info") as HTMLDivElement;
  const badgeUsername = document.getElementById("badge-username") as HTMLSpanElement;
  const badgeEmail = document.getElementById("badge-email") as HTMLSpanElement;
  const btnLogout = document.getElementById("btn-logout") as HTMLButtonElement;
  const btnOpenLogin = document.getElementById("btn-open-login") as HTMLButtonElement;
  const btnSound = document.getElementById("btn-sound") as HTMLButtonElement;

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
  const savedEmail = localStorage.getItem("baknus_email");

  if (savedEmail && inputEmail) {
    inputEmail.value = savedEmail;
  }

  const showModal = (show: boolean) => {
    if (modalLogin) {
      modalLogin.style.display = show ? "flex" : "none";
    }
    if (btnOpenLogin) {
      btnOpenLogin.style.display = show ? "none" : (ssoToken ? "none" : "block");
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
      const email = inputEmail.value.trim();
      const password = inputPassword.value;

      try {
        const scene = game.scene.getScene("GameScene") as GameScene;
        if (!scene) throw new Error("Game engine belum siap.");

        await scene.connectToServer({ serverUrl, email, password });

        // Simpan sesi
        localStorage.setItem("baknus_email", email);
        showModal(false);
        updateSessionUI(email);
      } catch (err: any) {
        console.error("Login gagal:", err);
        loginError.innerText = err.message || "Gagal masuk. Periksa email dan password Baknus Mail.";
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
          showModal(false);
          updateSessionUI(savedEmail || "Karyawan Baknus");
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

  // Toggle Sound
  if (btnSound) {
    btnSound.addEventListener("click", () => {
      sounds.enabled = !sounds.enabled;
      btnSound.innerText = sounds.enabled ? "🔊 Sound: ON" : "🔇 Sound: OFF";
      btnSound.style.opacity = sounds.enabled ? "1" : "0.6";
    });
  }
});
