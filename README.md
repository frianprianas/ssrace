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
- **Autentikasi Eksklusif Baknus Mail:** Menggunakan `onAuth()` hook Colyseus untuk memvalidasi kredensial email/password langsung ke API Baknus Mail (port 5000) atau via JWT token SSO. Hanya email resmi domain (`smk.baktinusantara666.sch.id`, `baknus.sch.id`) yang dapat masuk ke room.
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

## 🚀 4. Cara Memainkan Game

### Mode Produksi / Server Ubuntu (All-in-One Web Game):
Setelah server berjalan via Docker di Ubuntu:
1. Pemain (guru, siswa, atau staf) cukup membuka browser di PC, Laptop, atau HP mereka ke alamat:
   ```text
   http://<IP_SERVER_UBUNTU>:2567
   ```
2. Halaman web game SSRace akan langsung muncul di browser.
3. Form login otomatis mengarahkan koneksi WebSocket ke server tersebut.
4. Masukkan **Email Resmi Baknus Mail** (`@smk.baktinusantara666.sch.id` / `@baknus.sch.id`) dan Password.
5. Klik **🚀 MASUK ARENA BALAP** untuk langsung balapan!

---

### Mode Pengembangan Lokal (PC Developer):
Jika Anda ingin mengembangkan kode di PC lokal:
1. **Jalankan Server:**
   ```bash
   cd server
   npm install
   npm run dev
   ```
2. **Jalankan Client Vite (Opsional jika ingin Hot Reload):**
   ```bash
   cd client
   npm install
   npm run dev
   ```
   Akses `http://localhost:3000` di browser. Buka 2 tab untuk menguji balapan multiplayer 2 pemain!

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

## 🎮 7. Kontrol Game (Desktop & Smartphone Touchscreen)

### Kontrol PC / Laptop:
- **A / D atau Panah Kiri / Kanan:** Menggeser posisi pesawat ke kiri dan ke kanan secara lincah.
- **W / S atau Panah Atas / Bawah:** Maju / Mundur (3 langkah vertikal: Depan, Tengah, Belakang) agar tidak berdesak-desakan.
- **SPASI atau KLIK MOUSE:** Menembakkan laser ke atas untuk menghancurkan musuh korporat (+40 Poin).

### Kontrol Layar Sentuh Smartphone (Mobile-Friendly 📱):
- **D-Pad Virtual Kiri:**
  - Tombol **`◄`** dan **`►`** (ukuran besar): Geser pesawat ke kiri dan kanan.
  - Tombol **`▲ MAJU`** dan **`▼ MUNDUR`**: Berpindah 3 tingkat baris vertikal.
- **Tombol Sentuh Kanan:**
  - Tombol **`🔥 TEMBAK`** (lingkaran merah berdenyut): Menembakkan laser secara instan.
- **Touch Gesture Langsung di Canvas:**
  - Cukup sentuh dan geser jari (*drag*) di layar untuk mengarahkan pesawat.
  - Ketuk (*tap*) di layar kanan untuk menembakkan laser.
- **Responsive Auto-Scale:** Canvas game otomatis menyesuaikan ukuran layar HP secara proporsional (*aspect ratio fit*).

### 🎵 Musik & Audio Lengkap (Web Audio API):
- **BGM Musik Arcade Synthwave:** Melodi dan bassline bertempo 130 BPM bernuansa arcade retro korporat yang berputar otomatis saat ronde dimulai.
- **Efek Suara (SFX):** Suara laser futuristik, dentuman ledakan musuh, arpeggio denting koin emas/tunjangan/lembur, getaran tabrakan, dan melodi juara.
- **Pengaturan Suara:** Tersedia tombol toggle **`🎵 BGM: ON/OFF`** dan **`🔊 SFX: ON/OFF`** terpisah di footer layar.
