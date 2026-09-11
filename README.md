# SSRace (Slim Survival Race) 🚀💼
> Game Web Multiplayer 2D Real-time bertema Satir Korporat / Corporate Survival Simulator.

![Game Canvas](https://img.shields.io/badge/Phaser-3.88-blue.svg)
![Backend](https://img.shields.io/badge/Colyseus-0.15-orange.svg)
![Frontend](https://img.shields.io/badge/Vite-5.4-purple.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)

---

## 🏢 1. Latar Belakang & Tema
Dalam **SSRace**, pemain berperan sebagai karyawan korporat yang mengendalikan pesawat jet kantor dalam arena survival berukuran **800 x 600**. Misimu adalah bertahan hidup dan mengumpulkan pundi-pundi rupiah korporat sebanyak-banyaknya dalam batas waktu **120 detik** sebelum mengalami *burnout*.

- **Pundi-pundi Loot:**
  - 🟠 **25 Poin ("Uang Lembur"):** Muncul sering (bobot 60%).
  - 🔵 **50 Poin ("Tunjangan"):** Nilai menengah (bobot 30%).
  - 🟡 **100 Poin ("Bonus KPI"):** Langka dan bernilai tinggi (bobot 10%).
- **Obstacle Korporat (Musuh Bahaya):**
  - Ada 4 musuh melayang yang memantul di dinding arena:
    1. *Deadline Dadakan*
    2. *Revisi Jam 12 Malam*
    3. *Audit Pajak*
    4. *Micromanagement*
  - **Efek Tabrakan:** Skor dipotong **50 poin**, posisi pesawat di-reset ke titik aman dengan efek kebal sementara (*invulnerable* 2.5 detik).
- **Penghargaan Akhir:** Pemain dengan skor tertinggi dinobatkan sebagai **"Karyawan Teladan Bulan Ini (MVP Worker of the Month)"**.

---

## 🛠️ 2. Arsitektur & Spesifikasi Teknis

### Backend (`/server`)
- **Runtime & Bahasa:** Node.js, TypeScript
- **Multiplayer Engine:** Colyseus Framework (`@colyseus/tools`, `colyseus`, `@colyseus/schema`)
- **Server-Authoritative:** Seluruh kalkulasi fisika pesawat (koordinat `x`, `y`, rotasi `angle`, dorongan `thrust`, inersia/drag), pantulan dinding arena, dan tabrakan (`Math.hypot`) dihitung 100% di server dengan tick rate 50 FPS.
- **Kapasitas Room:** Maksimal 5 pemain per room (`maxClients = 5`). Jika ada pemain ke-6 yang masuk, Colyseus otomatis membuatkan room baru.
- **Siklus Hidup Room:**
  - `waiting`: Menunggu hingga minimal 2 pemain bergabung.
  - `playing`: Countdown timer 120 detik aktif.
  - `finished`: Ronde selesai, mengumumkan pemenang, dan restart otomatis setelah jeda selebrasi 10 detik.

### Frontend Client (`/client`)
- **Engine & Bundler:** Phaser 3, Vite, TypeScript
- **Multiplayer Client:** `colyseus.js`
- **Render Visual:** Canvas 800x600 dengan procedural vector textures (tidak memerlukan aset gambar eksternal yang rawan 404).
- **Audio Synthesizer:** Menggunakan Web Audio API terintegrasi untuk suara koin, thrust jet, tabrakan musuh, dan lagu kemenangan tanpa file audio eksternal.
- **HUD & Leaderboard:** Skor live, sisa waktu kerja, serta Top 5 Leaderboard real-time.

---

## 📂 3. Struktur Direktori Proyek

```text
ssrace/
├── .gitignore
├── README.md
├── docker-compose.yml              # Konfigurasi container Docker server port 2567
├── server/                         # Backend Colyseus Server
│   ├── Dockerfile                  # Multi-stage production build (Node 20 Alpine)
│   ├── .dockerignore
│   ├── package.json
│   ├── tsconfig.json
│   ├── arena.config.ts             # Entry point konfigurasi room Colyseus
│   └── src/
│       ├── index.ts                # Bootstrap server listener
│       ├── arena.config.ts
│       └── rooms/
│           ├── PlaneRaceRoom.ts    # Game loop, fisika, deteksi tabrakan, timer
│           └── schema/
│               └── PlaneRaceState.ts # Skema sinkronisasi state jaringan Colyseus
└── client/                         # Frontend Phaser 3 + Vite
    ├── index.html                  # Shell HTML & UI form koneksi
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.ts                 # Inisialisasi Phaser Game & kontrol HTML
        ├── style.css               # Tema dark cyberpunk corporate styling
        ├── sound.ts                # Web Audio API sound synthesizer
        └── scenes/
            └── GameScene.ts        # Scene utama Phaser 3 (render, input, interpolasi)
```

---

## 🚀 4. Cara Menjalankan di Komputer Lokal

### Prasyarat
- Node.js versi 18+ (direkomendasikan Node.js 20 atau 24)
- NPM versi 9+

### Langkah 1: Jalankan Server Colyseus
Buka terminal baru di folder `server`:
```bash
cd server
npm install
npm run dev
```
Server akan aktif di:
- **WebSocket URL:** `ws://localhost:2567`
- **Health Check:** `http://localhost:2567/`
- **Colyseus Monitor Dashboard:** `http://localhost:2567/colyseus`

### Langkah 2: Jalankan Client Phaser 3
Buka terminal baru di folder `client`:
```bash
cd client
npm install
npm run dev
```
Buka browser di alamat yang tertera (biasanya `http://localhost:3000/`).
- Masukkan Nama Karyawan.
- Pastikan WebSocket URL tertulis `ws://localhost:2567`.
- Klik **GABUNG RACE**. Buka 2 tab browser sekaligus untuk menguji multiplayer secara real-time!

---

## 🐳 5. Panduan Deployment ke Ubuntu 24.04 (Docker)

Di server Ubuntu Anda:

### Opsi A: Menggunakan Docker Compose (Sangat Direkomendasikan)
Pastikan Docker dan Docker Compose telah terpasang:
```bash
# Clone repositori ke server
git clone https://github.com/frianprianas/ssrace.git
cd ssrace

# Jalankan container server
docker compose up -d --build
```
Cek status container:
```bash
docker compose ps
docker logs -f ssrace_colyseus_server
```

### Opsi B: Build Docker Image Manual
```bash
cd ssrace/server
docker build -t ssrace-server:latest .
docker run -d --name ssrace-server -p 2567:2567 --restart unless-stopped ssrace-server:latest
```

Port `2567` kini siap menerima koneksi WebSocket dari klien luar. (Jika menggunakan domain / Nginx Reverse Proxy dengan SSL, arahkan WebSocket `wss://yourdomain.com/` ke `http://localhost:2567/`).

---

## 📤 6. Perintah Git untuk Push ke Repositori

Untuk mengunggah seluruh kode sumber proyek ini ke repositori Anda di GitHub:

```bash
# 1. Inisialisasi git di root folder proyek
git init

# 2. Tambahkan remote repository GitHub Anda
git remote add origin https://github.com/frianprianas/ssrace.git

# 3. Masukkan semua perubahan ke staging
git add .

# 4. Buat initial commit
git commit -m "feat: inisialisasi monorepo SSRace (Colyseus backend & Phaser 3 client)"

# 5. Pastikan branch utama bernama main (atau master)
git branch -M main

# 6. Push ke GitHub
git push -u origin main
```

---

## 🎮 7. Kontrol Game
- **W / Panah Atas:** Dorongan Maju (Thrust / Gas Pesawat)
- **A / Panah Kiri:** Belok Kiri
- **D / Panah Kanan:** Belok Kanan
- **Tombol Audio:** Toggle suara efek sintetis di bagian bawah canvas.
