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
    width: 600,
    height: 960
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
      leaderboardTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 14px;">⏳ Memuat klasemen pilot dari database...</td></tr>`;
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

  // ==========================================
  // 📜 MESIN TIK BRIEFING OPERASI RESMI (TYPEWRITER ENGINE)
  // ==========================================
  const briefingPanel = document.getElementById("briefing-panel") as HTMLDivElement;
  const briefingNarrative = document.getElementById("briefing-narrative") as HTMLParagraphElement;
  const briefingAlert = document.getElementById("briefing-alert") as HTMLDivElement;
  const btnSkipBriefing = document.getElementById("btn-skip-briefing") as HTMLButtonElement;

  const BRIEFING_FULL_NARRATIVE = `Koloni Alien dari <strong>Planet TaYa</strong> melancarkan invasi besar-besaran untuk menguasai Bumi! <strong>Anda dan skuadron pilot tempur</strong> dikerahkan ke orbit garis pertahanan terakhir untuk menghadang gempuran armada kapal alien, mengumpulkan inti energi kosmik (<strong>Plasma Core +25</strong>, <strong>Photon Core +50</strong>, & <strong>Quantum Core +100</strong>), dan bersiap menghadapi <strong>Kapal Induk Raksasa Alien Planet TaYa</strong> yang kebal dan bersenjata berat di akhir pertempuran!`;

  const BRIEFING_FULL_ALERT = `⚠️ <strong>PROTOKOL TEMPUR:</strong> Anda dibekali <strong>3 Nyawa</strong> (dengan bar perisai 5x tembakan per nyawa). Hadapi <strong>Kapal Induk Alien Planet TaYa</strong> bersama rekan pilot Anda untuk memenangkan misi!<br>💥 <strong>SENJATA SPESIAL "BOOM" (EMP PLASMA):</strong> Di atas tombol Fire terdapat tombol <strong>BOOM</strong> (atau tekan <strong>B</strong> di keyboard) yang terisi otomatis setiap <strong>15 detik</strong>. Senjata ini menghasilkan gelombang kejut yang <strong>menghilangkan seluruh peluru musuh</strong> dan <strong>memberikan damage luas ke seluruh armada alien</strong>!`;

  const NARRATIVE_PLAIN = `Koloni Alien dari Planet TaYa melancarkan invasi besar-besaran untuk menguasai Bumi! Anda dan skuadron pilot tempur dikerahkan ke orbit garis pertahanan terakhir untuk menghadang gempuran armada kapal alien, mengumpulkan inti energi kosmik (Plasma Core +25, Photon Core +50, & Quantum Core +100), dan bersiap menghadapi Kapal Induk Raksasa Alien Planet TaYa yang kebal dan bersenjata berat di akhir pertempuran!`;

  const ALERT_PLAIN = `⚠️ PROTOKOL TEMPUR: Anda dibekali 3 Nyawa (dengan bar perisai 5x tembakan per nyawa). Hadapi Kapal Induk Alien Planet TaYa bersama rekan pilot Anda untuk memenangkan misi!\n💥 SENJATA SPESIAL "BOOM" (EMP PLASMA): Di atas tombol Fire terdapat tombol BOOM (atau tekan B di keyboard) yang terisi otomatis setiap 15 detik. Senjata ini menghasilkan gelombang kejut yang menghilangkan seluruh peluru musuh dan memberikan damage luas ke seluruh armada alien!`;

  let typewriterTimer: any = null;
  let isTypewriterActive = false;

  const stopBriefingTypewriter = () => {
    if (typewriterTimer) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
    isTypewriterActive = false;
  };

  const skipBriefingTypewriter = () => {
    stopBriefingTypewriter();
    if (briefingNarrative) briefingNarrative.innerHTML = BRIEFING_FULL_NARRATIVE;
    if (briefingAlert) {
      briefingAlert.style.display = "block";
      briefingAlert.innerHTML = BRIEFING_FULL_ALERT;
    }
    if (btnSkipBriefing) {
      btnSkipBriefing.innerText = "✓ SELESAI";
      btnSkipBriefing.style.opacity = "0.6";
    }
  };

  const startBriefingTypewriter = () => {
    stopBriefingTypewriter();
    if (!briefingNarrative || !briefingAlert) return;

    isTypewriterActive = true;
    if (btnSkipBriefing) {
      btnSkipBriefing.innerText = "⏩ LEWATI TEKS";
      btnSkipBriefing.style.opacity = "1";
    }

    briefingNarrative.innerHTML = `<span class="typing-cursor">▌</span>`;
    briefingAlert.innerHTML = "";
    briefingAlert.style.display = "none";

    let nIdx = 0;
    let aIdx = 0;
    let phase = 0; // 0 = narrative, 1 = alert

    typewriterTimer = setInterval(() => {
      if (!isTypewriterActive) {
        stopBriefingTypewriter();
        return;
      }

      if (phase === 0) {
        nIdx += 2;
        const currentText = NARRATIVE_PLAIN.slice(0, nIdx);
        briefingNarrative.innerText = currentText;
        briefingNarrative.innerHTML += `<span class="typing-cursor">▌</span>`;

        if (nIdx % 4 === 0 || nIdx % 4 === 1) {
          sounds.playTypewriter();
        }

        if (nIdx >= NARRATIVE_PLAIN.length) {
          phase = 1;
          briefingNarrative.innerHTML = BRIEFING_FULL_NARRATIVE;
          briefingAlert.style.display = "block";
          briefingAlert.innerHTML = `<span class="typing-cursor">▌</span>`;
        }
      } else if (phase === 1) {
        aIdx += 3;
        const currentAlert = ALERT_PLAIN.slice(0, aIdx).replace(/\n/g, "<br>");
        briefingAlert.innerHTML = currentAlert + `<span class="typing-cursor">▌</span>`;

        if (aIdx % 6 === 0 || aIdx % 6 === 1) {
          sounds.playTypewriter();
        }

        if (aIdx >= ALERT_PLAIN.length) {
          stopBriefingTypewriter();
          briefingAlert.innerHTML = BRIEFING_FULL_ALERT;
          if (btnSkipBriefing) {
            btnSkipBriefing.innerText = "✓ SELESAI";
            btnSkipBriefing.style.opacity = "0.6";
          }
        }
      }
    }, 16);
  };

  if (btnSkipBriefing) {
    btnSkipBriefing.addEventListener("click", (e) => {
      e.stopPropagation();
      skipBriefingTypewriter();
    });
  }

  if (briefingPanel) {
    briefingPanel.addEventListener("click", () => {
      if (isTypewriterActive) {
        skipBriefingTypewriter();
      }
    });
  }

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
      startBriefingTypewriter();
    } else {
      stopBriefingTypewriter();
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

  const CHARACTERS = [
    {
      id: 0,
      name: "BAKTI",
      ship: "Nova Razor",
      color: "#dc2626",
      accent: "#ef4444",
      role: "Assault Interceptor",
      desc: "Jet tempur sergap agresif bersenjata meriam kembar berdaya ledak tinggi.",
      portrait: "/characters/char_0.jpg"
    },
    {
      id: 1,
      name: "NUSA",
      ship: "Triton Spear",
      color: "#2563eb",
      accent: "#38bdf8",
      role: "Tactical Vanguard",
      desc: "Spesialis manuver presisi dengan perisai medan gaya biru terintegrasi.",
      portrait: "/characters/char_1.jpg"
    },
    {
      id: 2,
      name: "BAKNUS",
      ship: "Veridian Claw",
      color: "#16a34a",
      accent: "#22c55e",
      role: "Heavy Dreadnought",
      desc: "Lambung titanium berlapis tebal dengan ketahanan benturan maksimal.",
      portrait: "/characters/char_2.jpg"
    },
    {
      id: 3,
      name: "TARA",
      ship: "Nebula Sting",
      color: "#eab308",
      accent: "#f59e0b",
      role: "Energy Harvester",
      desc: "Dilengkapi penyerap inti plasma frekuensi tinggi untuk serapan energi kilat.",
      portrait: "/characters/char_3.jpg"
    },
    {
      id: 4,
      name: "BEEN",
      ship: "Void Drifter",
      color: "#9333ea",
      accent: "#a855f7",
      role: "Void Infiltrator",
      desc: "Memanfaatkan distorsi ruang ungu untuk kelincahan dan daya tembak mengejutkan.",
      portrait: "/characters/char_4.jpg"
    }
  ];

  // DOM Elements Hangar & Pemilihan Karakter
  const modalHangar = document.getElementById("hangar-modal") as HTMLDivElement;
  const hangarSectorBadge = document.getElementById("hangar-sector-badge") as HTMLSpanElement;
  const hangarReadyPill = document.getElementById("hangar-ready-pill") as HTMLSpanElement;
  const charSelectionGrid = document.getElementById("character-selection-grid") as HTMLDivElement;
  const hangarStatusTitle = document.getElementById("hangar-status-title") as HTMLDivElement;
  const hangarStatusDesc = document.getElementById("hangar-status-desc") as HTMLDivElement;
  const btnLeaveHangar = document.getElementById("btn-leave-hangar") as HTMLButtonElement;

  let activeColyseusRoom: any = null;

  const renderHangarCards = () => {
    if (!activeColyseusRoom || !charSelectionGrid) return;
    const room = activeColyseusRoom;
    const state = room.state;
    if (!state || !state.players) return;

    let readyCount = 0;
    const totalPlayers = state.players.size;

    state.players.forEach((p: any) => {
      if (p.characterId >= 0) readyCount++;
    });

    if (hangarReadyPill) {
      hangarReadyPill.innerText = `👥 Pilot Siap: ${readyCount}/${totalPlayers} Pilot`;
    }

    const myPlayer = state.players.get(room.sessionId);
    const myCharId = myPlayer ? myPlayer.characterId : -1;

    charSelectionGrid.innerHTML = CHARACTERS.map((char) => {
      const isMine = (myCharId === char.id);
      let takenByOtherName = "";

      state.players.forEach((p: any, sId: string) => {
        if (sId !== room.sessionId && p.characterId === char.id) {
          takenByOtherName = p.name;
        }
      });

      const isTaken = !!takenByOtherName;
      let cardClass = "";
      let btnClass = "char-btn-free";
      let btnLabel = "PILIH PILOT";

      if (isMine) {
        cardClass = "char-card-selected";
        btnClass = "char-btn-mine";
        btnLabel = "★ PILOT ANDA";
      } else if (isTaken) {
        cardClass = "char-card-taken";
        btnClass = "char-btn-taken";
        btnLabel = `🔒 DIPILIH: ${takenByOtherName.substring(0, 8)}`;
      }

      return `
        <div class="char-card ${cardClass}" data-char-id="${char.id}" style="--char-glow: ${char.accent}; --char-shadow: ${char.color}40;">
          <div class="char-img-container">
            <img src="${char.portrait}" alt="${char.name}" class="char-portrait" loading="lazy">
            <div class="char-img-overlay"></div>
            <span class="char-badge-id">#0${char.id + 1}</span>
          </div>
          <div class="char-info-body">
            <h3 class="char-name-title" style="color: ${char.accent};">${char.name}</h3>
            <div class="char-ship-name">🚀 ${char.ship}</div>
            <span class="char-role-tag">${char.role}</span>
            <p class="char-desc-text">${char.desc}</p>
            <div class="char-select-btn ${btnClass}">
              ${btnLabel}
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Pasang listener klik / tap ke SELURUH AREA kartu karakter (foto, nama, teks, maupun tombol)
    charSelectionGrid.querySelectorAll(".char-card").forEach((elem) => {
      let touchHandled = false;

      const handleSelect = () => {
        sounds.unlockAudio();
        const charId = parseInt(elem.getAttribute("data-char-id") || "-1");
        if (charId < 0 || elem.classList.contains("char-card-taken")) return;

        elem.classList.add("char-card-pressed");
        setTimeout(() => elem.classList.remove("char-card-pressed"), 180);

        room.send("select_character", { characterId: charId });
      };

      elem.addEventListener("pointerdown", () => {
        touchHandled = true;
        handleSelect();
        setTimeout(() => { touchHandled = false; }, 300);
      });

      elem.addEventListener("click", () => {
        if (touchHandled) return;
        handleSelect();
      });
    });

    // Update status footer & sinkronisasi SEMUA tombol START (bawah & atas smartphone)
    const isAllReady = (totalPlayers > 0 && readyCount === totalPlayers);
    const allStartButtons = document.querySelectorAll(".btn-start-battle-sync") as NodeListOf<HTMLButtonElement>;
    allStartButtons.forEach((btn) => {
      btn.disabled = !isAllReady;
      btn.innerText = isAllReady ? "🚀 MULAI PERTEMPURAN (START)" : "⏳ MENUNGGU SEMUA PILOT SIAP";
    });

    if (isAllReady) {
      if (hangarStatusTitle) {
        hangarStatusTitle.innerText = "SEMUA PILOT TELAH SIAP!";
        hangarStatusTitle.style.color = "#10b981";
      }
      if (hangarStatusDesc) {
        hangarStatusDesc.innerText = "Seluruh pilot skuadron telah memilih karakter. Siapa saja dapat menekan tombol START untuk meluncur!";
      }
    } else {
      if (hangarStatusTitle) {
        hangarStatusTitle.style.color = "#38bdf8";
        if (myCharId < 0) {
          hangarStatusTitle.innerText = "PILIH KARAKTER ANDA";
        } else {
          hangarStatusTitle.innerText = "MENUNGGU REKAN PILOT LAIN";
        }
      }
      if (hangarStatusDesc) {
        if (myCharId < 0) {
          hangarStatusDesc.innerText = "Klik salah satu kartu pilot di atas yang masih tersedia untuk memilih pesawat Anda.";
        } else {
          hangarStatusDesc.innerText = `Menunggu ${totalPlayers - readyCount} pilot lain memilih karakter unik masing-masing...`;
        }
      }
    }
  };

  // Pasang click listener ke SEMUA tombol START (footer dan mobile action bar)
  document.querySelectorAll(".btn-start-battle-sync").forEach((btn) => {
    btn.addEventListener("click", () => {
      sounds.unlockAudio();
      if (activeColyseusRoom) {
        activeColyseusRoom.send("start_game");
      }
    });
  });

  if (btnLeaveHangar) {
    btnLeaveHangar.addEventListener("click", () => {
      sounds.unlockAudio();
      if (modalHangar) modalHangar.style.display = "none";
      const scene = game.scene.getScene("GameScene") as GameScene;
      if (scene) scene.cleanupEntities();
      activeColyseusRoom = null;
      showLobby(true);
    });
  }

  // ==========================================
  // 💥 KONTROL SENJATA PAMUNGKAS "BOOM" (EMP PLASMA)
  // ==========================================
  const btnBomb = document.getElementById("touch-bomb") as HTMLButtonElement;
  const bombCooldownOverlay = document.getElementById("bomb-cooldown-overlay") as HTMLDivElement;
  const bombCooldownBadge = document.getElementById("bomb-cooldown-badge") as HTMLSpanElement;

  const BOMB_MAX_COOLDOWN = 15; // 15 detik
  let bombCooldownSeconds = 0; // Siap saat game mulai

  const updateBombUI = () => {
    if (!btnBomb || !bombCooldownOverlay || !bombCooldownBadge) return;
    if (bombCooldownSeconds <= 0) {
      btnBomb.disabled = false;
      btnBomb.classList.add("ready");
      bombCooldownOverlay.style.height = "0%";
      bombCooldownBadge.innerText = "SIAP";
    } else {
      btnBomb.disabled = true;
      btnBomb.classList.remove("ready");
      const pct = (bombCooldownSeconds / BOMB_MAX_COOLDOWN) * 100;
      bombCooldownOverlay.style.height = `${pct}%`;
      bombCooldownBadge.innerText = `${Math.ceil(bombCooldownSeconds)}s`;
    }
  };

  const triggerUseBomb = () => {
    if (bombCooldownSeconds > 0) return;
    if (!activeColyseusRoom || activeColyseusRoom.state.status !== "playing") return;

    sounds.unlockAudio();
    activeColyseusRoom.send("use_bomb");
    bombCooldownSeconds = BOMB_MAX_COOLDOWN;
    updateBombUI();
  };

  // Timer cooldown 100ms
  setInterval(() => {
    if (activeColyseusRoom && activeColyseusRoom.state.status === "playing") {
      if (bombCooldownSeconds > 0) {
        bombCooldownSeconds = Math.max(0, bombCooldownSeconds - 0.1);
        updateBombUI();
      }
    }
  }, 100);

  const joinRoom = async (roomNumber: number) => {
    if (!currentAuthData) return;
    selectedRoomNumber = roomNumber;
    stopBriefingTypewriter();

    // Langsung buka Modal Hangar seketika agar pemain tidak melihat kanvas game kosong di jeda koneksi
    showLobby(false);
    showModal(false);
    if (modalHangar) modalHangar.style.display = "flex";
    if (touchControls) touchControls.style.display = "none";
    if (hangarSectorBadge) {
      hangarSectorBadge.innerText = `SEKTOR ${selectedRoomNumber} • MEMASUKI HANGAR...`;
    }
    if (charSelectionGrid) {
      charSelectionGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: #38bdf8; padding: 40px 10px; font-weight: 700; font-size: 1.05rem;">
          ⏳ Memasuki Hangar Sektor ${selectedRoomNumber}...
        </div>
      `;
    }

    if (btnChangeRoom) btnChangeRoom.style.display = "inline-block";

    try {
      const scene = game.scene.getScene("GameScene") as GameScene;
      if (scene) {
        const conn = await scene.connectToServer({
          ...currentAuthData,
          roomNumber: selectedRoomNumber
        });

        activeColyseusRoom = conn.room;

        // Pasang callback saat pemain atau game meminta kembali ke Lobby
        scene.onReturnToLobby = () => {
          if (modalHangar) modalHangar.style.display = "none";
          if (touchControls) touchControls.style.display = "none";
          if (activeColyseusRoom) {
            try { activeColyseusRoom.leave(); } catch (e) {}
            activeColyseusRoom = null;
          }
          scene.cleanupEntities();
          showLobby(true);
          fetchRooms();
        };

        if (hangarSectorBadge) {
          hangarSectorBadge.innerText = `SEKTOR ${selectedRoomNumber} • HANGAR SKUADRON`;
        }

        // Tampilkan kartu pemilihan karakter langsung
        if (modalHangar) modalHangar.style.display = "flex";
        if (touchControls) touchControls.style.display = "none";
        renderHangarCards();

        activeColyseusRoom.state.onChange(() => {
          const myPlayer = activeColyseusRoom.state.players.get(activeColyseusRoom.sessionId);
          const hasChosenChar = myPlayer && myPlayer.characterId >= 0;

          // Selama status waiting atau pemain belum pilih karakter, tetap di Hangar!
          if (activeColyseusRoom.state.status === "waiting" || !hasChosenChar) {
            if (modalHangar) modalHangar.style.display = "flex";
            if (touchControls) touchControls.style.display = "none";
            renderHangarCards();
          } else if (activeColyseusRoom.state.status === "starting" || activeColyseusRoom.state.status === "playing") {
            if (modalHangar) modalHangar.style.display = "none";
            if (touchControls) touchControls.style.display = "flex";
            sounds.startBgm();
          }
        });

        activeColyseusRoom.state.players.onAdd(() => renderHangarCards());
        activeColyseusRoom.state.players.onRemove(() => renderHangarCards());

        activeColyseusRoom.onMessage("character_selected", () => {
          renderHangarCards();
        });

        activeColyseusRoom.onMessage("character_error", (data: any) => {
          alert(data.message || "Gagal memilih karakter.");
        });

        activeColyseusRoom.onMessage("countdown_tick", (data: any) => {
          if (modalHangar) modalHangar.style.display = "none";
          if (touchControls) touchControls.style.display = "flex";
          scene.showStartCountdown(data.count);
        });

        activeColyseusRoom.onMessage("match_started", () => {
          if (modalHangar) modalHangar.style.display = "none";
          if (touchControls) touchControls.style.display = "flex";
          sounds.startBgm();
          bombCooldownSeconds = 0;
          updateBombUI();
        });
      }
    } catch (e: any) {
      console.error("Gagal masuk ke room:", e);
      alert(e.message || "Gagal masuk ke room.");
      if (modalHangar) modalHangar.style.display = "none";
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
      if (modalHangar) modalHangar.style.display = "none";
      activeColyseusRoom = null;
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

  // Pastikan AudioContext smartphone & desktop aktif dan BGM mulai sejak interaksi pertama atau web dibuka
  const startAudioAndBgm = () => {
    sounds.unlockAudio();
    sounds.startBgm();
  };
  window.addEventListener("touchstart", startAudioAndBgm, { passive: true });
  window.addEventListener("touchend", startAudioAndBgm, { passive: true });
  window.addEventListener("click", startAudioAndBgm, { passive: true });
  window.addEventListener("pointerdown", startAudioAndBgm, { passive: true });
  window.addEventListener("keydown", startAudioAndBgm, { passive: true });

  // Coba putar BGM otomatis saat halaman web dibuka
  try {
    sounds.startBgm();
  } catch (e) {}

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

    // 1. Kemudi Horizontal (Kiri / Kanan) dengan deadzone nyaman (tidak terlalu sensitif)
    const deadzoneX = 22;
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

    // 2. Kemudi Vertikal (Maju / Mundur 2 langkah) dengan threshold terukur
    const stepThreshold = 32;
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

  // Tombol Bom Gelombang EMP Plasma (BOOM Glass Button)
  if (btnBomb) {
    btnBomb.addEventListener("pointerdown", (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      triggerUseBomb();
    });
    btnBomb.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      triggerUseBomb();
    });
  }

  // Shortcut Keyboard "B" untuk meledakkan BOOM EMP di PC / Laptop
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.code === "KeyB") {
      triggerUseBomb();
    }
  });

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
