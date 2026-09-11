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
  const badgeTotalScore = document.getElementById("badge-total-score") as HTMLSpanElement;
  const btnLogout = document.getElementById("btn-logout") as HTMLButtonElement;
  const btnOpenLogin = document.getElementById("btn-open-login") as HTMLButtonElement;
  const btnOpenLeaderboard = document.getElementById("btn-open-leaderboard") as HTMLButtonElement;
  const btnCloseLeaderboard = document.getElementById("btn-close-leaderboard") as HTMLButtonElement;
  const modalLeaderboard = document.getElementById("leaderboard-modal") as HTMLDivElement;
  const leaderboardTableBody = document.getElementById("leaderboard-table-body") as HTMLTableSectionElement;
  const btnBgm = document.getElementById("btn-bgm") as HTMLButtonElement;
  const btnSfx = document.getElementById("btn-sfx") as HTMLButtonElement;

  const updateSessionUI = (username: string, totalScore?: number) => {
    if (sessionInfo && badgeUsername) {
      badgeUsername.innerText = `👤 ${username}`;
      if (badgeTotalScore && totalScore !== undefined) {
        badgeTotalScore.innerText = `⭐ Total: ${totalScore.toLocaleString()} Poin`;
      }
      sessionInfo.style.display = "flex";
      if (btnOpenLogin) btnOpenLogin.style.display = "none";
    }
  };

  const fetchAndShowLeaderboard = async () => {
    if (modalLeaderboard) modalLeaderboard.style.display = "flex";
    if (leaderboardTableBody) {
      leaderboardTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 14px;">⏳ Memuat klasemen karyawan dari database...</td></tr>`;
    }

    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      if (data && data.leaderboard && data.leaderboard.length > 0) {
        leaderboardTableBody.innerHTML = data.leaderboard.map((item: any, idx: number) => {
          let rankClass = "";
          let medal = `${idx + 1}`;
          if (idx === 0) { rankClass = "rank-gold"; medal = "🥇 1"; }
          else if (idx === 1) { rankClass = "rank-silver"; medal = "🥈 2"; }
          else if (idx === 2) { rankClass = "rank-bronze"; medal = "🥉 3"; }

          return `
            <tr class="${rankClass}">
              <td>${medal}</td>
              <td><strong>${item.username}</strong></td>
              <td style="color: #ffd700; font-weight: bold;">⭐ ${item.totalScore.toLocaleString()}</td>
              <td style="color: #38bdf8;">${item.highestScore.toLocaleString()}</td>
              <td style="color: #94a3b8;">${item.gamesPlayed}x</td>
            </tr>
          `;
        }).join("");
      } else {
        leaderboardTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 14px;">Belum ada rekor permainan tersimpan. Jadilah yang pertama!</td></tr>`;
      }
    } catch (err) {
      console.error("Gagal memuat leaderboard:", err);
      if (leaderboardTableBody) {
        leaderboardTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 14px;">Gagal mengambil data klasemen dari server.</td></tr>`;
      }
    }
  };

  if (btnOpenLeaderboard) {
    btnOpenLeaderboard.addEventListener("click", fetchAndShowLeaderboard);
  }

  if (btnCloseLeaderboard) {
    btnCloseLeaderboard.addEventListener("click", () => {
      if (modalLeaderboard) modalLeaderboard.style.display = "none";
    });
  }

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

  const modalLobby = document.getElementById("lobby-modal") as HTMLDivElement;
  const lobbyProfileUsername = document.getElementById("lobby-profile-username") as HTMLDivElement;
  const lobbyStatTotal = document.getElementById("lobby-stat-total") as HTMLSpanElement;
  const lobbyStatBest = document.getElementById("lobby-stat-best") as HTMLSpanElement;
  const lobbyStatGames = document.getElementById("lobby-stat-games") as HTMLSpanElement;
  const roomsGrid = document.getElementById("rooms-grid") as HTMLDivElement;
  const btnRefreshRooms = document.getElementById("btn-refresh-rooms") as HTMLButtonElement;
  const btnChangeRoom = document.getElementById("btn-change-room") as HTMLButtonElement;

  const touchControls = document.getElementById("touch-controls") as HTMLDivElement;

  let currentAuthData: { serverUrl: string; email: string; password?: string; token?: string; username: string } | null = null;
  let selectedRoomNumber: number = 1;

  const showModal = (show: boolean) => {
    if (modalLogin) {
      modalLogin.style.display = show ? "flex" : "none";
    }
    if (btnOpenLogin) {
      btnOpenLogin.style.display = show ? "none" : (ssoToken ? "none" : "block");
    }
    if (touchControls && show) {
      touchControls.style.display = "none";
    }
  };

  const showLobby = async (show: boolean) => {
    if (modalLobby) {
      modalLobby.style.display = show ? "flex" : "none";
    }
    if (show) {
      if (modalLogin) modalLogin.style.display = "none";
      if (touchControls) touchControls.style.display = "none";
      if (btnChangeRoom) btnChangeRoom.style.display = "none";
      if (currentAuthData) {
        await fetchProfile(currentAuthData.username);
      }
      await fetchRooms();
    }
  };

  const fetchProfile = async (username: string) => {
    try {
      const res = await fetch(`/api/profile?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (data && data.profile) {
        const p = data.profile;
        if (lobbyProfileUsername) lobbyProfileUsername.innerText = p.username;
        if (lobbyStatTotal) lobbyStatTotal.innerText = `⭐ ${p.totalScore.toLocaleString()} Pts`;
        if (lobbyStatBest) lobbyStatBest.innerText = `🏆 ${p.highestScore.toLocaleString()} Pts`;
        if (lobbyStatGames) lobbyStatGames.innerText = `🎮 ${p.gamesPlayed}x`;
        updateSessionUI(p.username, p.totalScore);
      }
    } catch (e) {
      console.warn("Gagal memuat profil:", e);
    }
  };

  const fetchRooms = async () => {
    if (!roomsGrid) return;
    roomsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 20px;">⏳ Memuat kapasitas 10 Sektor...</div>`;

    try {
      const res = await fetch("/api/rooms");
      const data = await res.json();
      if (data && data.rooms) {
        roomsGrid.innerHTML = data.rooms.map((r: any) => {
          const isFull = r.clients >= r.maxClients;
          let badgeClass = "room-badge-available";
          if (isFull) badgeClass = "room-badge-full";
          else if (r.clients > 0) badgeClass = "room-badge-active";

          return `
            <div class="room-card ${isFull ? 'room-full' : ''}" data-room="${r.roomNumber}">
              <div class="room-title">Sektor ${r.roomNumber}</div>
              <span class="room-badge-status ${badgeClass}">${r.status}</span>
              <div class="room-capacity">👥 ${r.clients}/${r.maxClients}</div>
              <button class="btn-join-room" data-room="${r.roomNumber}" ${isFull ? 'disabled' : ''}>
                ${isFull ? 'PENUH' : 'GABUNG'}
              </button>
            </div>
          `;
        }).join("");

        // Pasang event listener ke setiap tombol room
        roomsGrid.querySelectorAll(".btn-join-room").forEach((elem) => {
          elem.addEventListener("click", (e) => {
            e.stopPropagation();
            sounds.unlockAudio();
            const target = e.currentTarget as HTMLElement;
            const roomNum = parseInt(target.getAttribute("data-room") || "1");
            joinRoom(roomNum);
          });
        });

        roomsGrid.querySelectorAll(".room-card").forEach((elem) => {
          elem.addEventListener("click", (e) => {
            sounds.unlockAudio();
            const target = e.currentTarget as HTMLElement;
            if (target.classList.contains("room-full")) return;
            const roomNum = parseInt(target.getAttribute("data-room") || "1");
            joinRoom(roomNum);
          });
        });
      }
    } catch (err) {
      roomsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 20px;">Gagal memuat status room.</div>`;
    }
  };

  const joinRoom = async (roomNumber: number) => {
    if (!currentAuthData) return;
    selectedRoomNumber = roomNumber;
    showLobby(false);
    showModal(false);

    if (btnChangeRoom) btnChangeRoom.style.display = "inline-block";
    if (touchControls) touchControls.style.display = "flex";

    try {
      const scene = game.scene.getScene("GameScene") as GameScene;
      if (scene) {
        await scene.connectToServer({
          ...currentAuthData,
          roomNumber: selectedRoomNumber
        });
      }
    } catch (e: any) {
      console.error("Gagal masuk ke room:", e);
      alert(e.message || "Gagal masuk ke room.");
      showLobby(true);
    }
  };

  if (btnRefreshRooms) {
    btnRefreshRooms.addEventListener("click", () => {
      sounds.unlockAudio();
      fetchRooms();
    });
  }

  if (btnChangeRoom) {
    btnChangeRoom.addEventListener("click", () => {
      sounds.unlockAudio();
      const scene = game.scene.getScene("GameScene") as GameScene;
      if (scene) {
        scene.cleanupEntities();
      }
      showLobby(true);
    });
  }

  // Handler Submit Login Form
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      sounds.unlockAudio();
      loginError.style.display = "none";
      btnSubmit.disabled = true;
      btnSubmit.innerText = "⏳ MEMVERIFIKASI AKUN...";

      const serverUrl = inputServer.value.trim() || "ws://localhost:2567";
      const rawUser = inputUsername.value.trim().toLowerCase();
      const username = rawUser.includes("@") ? rawUser.split("@")[0] : rawUser;
      const fullEmail = `${username}@smk.baktinusantara666.sch.id`;
      const password = inputPassword.value;

      try {
        currentAuthData = {
          serverUrl,
          email: fullEmail,
          password,
          username
        };

        localStorage.setItem("baknus_username", username);
        showModal(false);
        await showLobby(true);
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
      const username = savedUsername || "Karyawan";
      const fullEmail = `${username}@smk.baktinusantara666.sch.id`;
      currentAuthData = {
        serverUrl,
        email: fullEmail,
        token: ssoToken,
        username
      };
      showModal(false);
      await showLobby(true);
    }, 400);
  }

  // Tombol Ganti Akun / Logout
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      localStorage.removeItem("baknus_token");
      currentAuthData = null;
      if (sessionInfo) sessionInfo.style.display = "none";
      if (modalLobby) modalLobby.style.display = "none";
      const scene = game.scene.getScene("GameScene") as GameScene;
      if (scene) scene.cleanupEntities();
      showModal(true);
    });
  }

  // Tombol Buka Modal Login
  if (btnOpenLogin) {
    btnOpenLogin.addEventListener("click", () => showModal(true));
  }

  // ==========================================
  // 📱 BIND VIRTUAL JOYSTICK & FIRE GLASS (SMARTPHONE)
  // ==========================================
  const getScene = (): GameScene | undefined => {
    return game.scene.getScene("GameScene") as GameScene;
  };

  // Pastikan AudioContext smartphone aktif sejak sentuhan / interaksi pertama
  window.addEventListener("touchstart", () => sounds.unlockAudio(), { passive: true });
  window.addEventListener("touchend", () => sounds.unlockAudio(), { passive: true });
  window.addEventListener("click", () => sounds.unlockAudio(), { passive: true });

  const joystickZone = document.getElementById("virtual-joystick-zone");
  const joystickBase = document.getElementById("joystick-base");
  const joystickKnob = document.getElementById("joystick-knob");
  const btnFire = document.getElementById("touch-fire");

  let joystickTouchId: number | null = null;
  let isMouseDraggingJoystick = false;
  let stepUpTriggered = false;
  let stepDownTriggered = false;

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joystickBase || !joystickKnob) return;
    const rect = joystickBase.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = rect.width * 0.35; // Batas radius gerak knob

    if (dist > maxRadius && dist > 0) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

    const scene = getScene();
    if (!scene) return;

    // 1. Kemudi Horizontal (Kiri / Kanan) dengan deadzone halus
    const deadzoneX = 10;
    if (dx < -deadzoneX) {
      scene.touchInput.left = true;
      scene.touchInput.right = false;
    } else if (dx > deadzoneX) {
      scene.touchInput.right = true;
      scene.touchInput.left = false;
    } else {
      scene.touchInput.left = false;
      scene.touchInput.right = false;
    }

    // 2. Kemudi Vertikal (Maju / Mundur 2 langkah) dengan step lock
    const stepThreshold = 18;
    if (dy < -stepThreshold) {
      if (!stepUpTriggered) {
        scene.touchInput.up = true;
        stepUpTriggered = true;
      } else {
        scene.touchInput.up = false;
      }
      scene.touchInput.down = false;
      stepDownTriggered = false;
    } else if (dy > stepThreshold) {
      if (!stepDownTriggered) {
        scene.touchInput.down = true;
        stepDownTriggered = true;
      } else {
        scene.touchInput.down = false;
      }
      scene.touchInput.up = false;
      stepUpTriggered = false;
    } else {
      // Kembali ke zona tengah -> reset step lock agar bisa melangkah lagi
      scene.touchInput.up = false;
      scene.touchInput.down = false;
      stepUpTriggered = false;
      stepDownTriggered = false;
    }
  };

  const resetJoystick = () => {
    if (joystickKnob) {
      joystickKnob.style.transform = "translate(0px, 0px)";
    }
    joystickTouchId = null;
    isMouseDraggingJoystick = false;
    stepUpTriggered = false;
    stepDownTriggered = false;

    const scene = getScene();
    if (scene) {
      scene.touchInput.left = false;
      scene.touchInput.right = false;
      scene.touchInput.up = false;
      scene.touchInput.down = false;
    }
  };

  if (joystickZone) {
    joystickZone.addEventListener("touchstart", (e: TouchEvent) => {
      e.preventDefault();
      sounds.unlockAudio();
      if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        joystickTouchId = touch.identifier;
        updateJoystick(touch.clientX, touch.clientY);
      }
    }, { passive: false });

    joystickZone.addEventListener("touchmove", (e: TouchEvent) => {
      e.preventDefault();
      if (joystickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
          updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    }, { passive: false });

    joystickZone.addEventListener("touchend", (e: TouchEvent) => {
      e.preventDefault();
      resetJoystick();
    }, { passive: false });

    joystickZone.addEventListener("touchcancel", (e: TouchEvent) => {
      e.preventDefault();
      resetJoystick();
    }, { passive: false });

    // Fallback mouse untuk pengujian di browser desktop
    joystickZone.addEventListener("mousedown", (e: MouseEvent) => {
      isMouseDraggingJoystick = true;
      sounds.unlockAudio();
      updateJoystick(e.clientX, e.clientY);
    });

    window.addEventListener("mousemove", (e: MouseEvent) => {
      if (isMouseDraggingJoystick) {
        updateJoystick(e.clientX, e.clientY);
      }
    });

    window.addEventListener("mouseup", () => {
      if (isMouseDraggingJoystick) {
        resetJoystick();
      }
    });
  }

  // Tombol Tembak Kaca Transparan (Fire Glass)
  if (btnFire) {
    const startShoot = (e: Event) => {
      e.preventDefault();
      sounds.unlockAudio();
      const scene = getScene();
      if (scene) scene.touchInput.shoot = true;
    };

    const stopShoot = (e: Event) => {
      e.preventDefault();
      const scene = getScene();
      if (scene) scene.touchInput.shoot = false;
    };

    btnFire.addEventListener("touchstart", startShoot, { passive: false });
    btnFire.addEventListener("touchend", stopShoot, { passive: false });
    btnFire.addEventListener("touchcancel", stopShoot, { passive: false });
    btnFire.addEventListener("mousedown", startShoot);
    btnFire.addEventListener("mouseup", stopShoot);
    btnFire.addEventListener("mouseleave", stopShoot);
  }

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
