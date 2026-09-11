import { listen } from "@colyseus/tools";
import arenaConfig from "./arena.config";

const PORT = Number(process.env.PORT || 2567);

listen(arenaConfig, PORT).then(() => {
  console.log(`=========================================`);
  console.log(`🚀 SSRace Server berjalan di: http://localhost:${PORT}`);
  console.log(`🎮 Colyseus WebSocket: ws://localhost:${PORT}`);
  console.log(`📊 Monitoring Dashboard: http://localhost:${PORT}/colyseus`);
  console.log(`=========================================`);
}).catch((err) => {
  console.error("Gagal menjalankan server:", err);
});
