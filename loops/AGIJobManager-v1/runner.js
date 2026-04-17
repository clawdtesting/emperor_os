import { startDaemon } from "../../app/daemon.js";

startDaemon().catch((err) => {
  console.error("[runner] fatal:", err);
  process.exit(1);
});
