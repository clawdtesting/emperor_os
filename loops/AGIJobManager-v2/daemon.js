import { startDaemon } from "../../app/daemon.js";

startDaemon().catch((err) => {
  console.error("[daemon] fatal:", err);
  process.exit(1);
});
