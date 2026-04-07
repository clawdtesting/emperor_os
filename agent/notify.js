#!/usr/bin/env node
/**
 * notify.js — Send a Telegram message
 *
 * Usage: node notify.js "your message"
 *    or: echo "message" | node notify.js --stdin
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */
"use strict";

const https = require("https");

const TOKEN   = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID   || "").trim();

if (!TOKEN || !CHAT_ID) {
  console.error("[notify] TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required");
  process.exit(1);
}

function sendMessage(text) {
  const body = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.telegram.org",
      path:     `/bot${TOKEN}/sendMessage`,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try {
          const d = JSON.parse(Buffer.concat(chunks).toString());
          if (!d.ok) reject(new Error(`Telegram error: ${JSON.stringify(d)}`));
          else resolve(d);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Telegram timeout")); });
    req.write(body);
    req.end();
  });
}

async function main() {
  let msg;
  const args = process.argv.slice(2);

  if (args.includes("--stdin")) {
    const chunks = [];
    process.stdin.on("data", c => chunks.push(c));
    msg = await new Promise(r => process.stdin.on("end", () => r(Buffer.concat(chunks).toString().trim())));
  } else {
    msg = args.join(" ").trim();
  }

  if (!msg) { console.error("[notify] No message provided"); process.exit(1); }

  try {
    await sendMessage(msg);
    console.log("[notify] Sent");
  } catch (e) {
    console.error("[notify] Failed:", e.message);
    process.exit(1);
  }
}

main();
