#!/usr/bin/env node

import assert from "node:assert/strict";
import { encodePrimeCall, loadAbi } from "./prime-client.js";

function assertEncoded(result) {
  assert.equal(typeof result.to, "string", "encoded call must include target `to`");
  assert.equal(typeof result.data, "string", "encoded call must include string `data`");
  assert.ok(result.data.startsWith("0x"), "encoded data must start with 0x");
  assert.equal(result.value, "0", "encoded call value must be string '0'");
}

function includesAll(haystack, parts) {
  for (const p of parts) assert.ok(haystack.includes(p), `error must include '${p}'`);
}

function expectThrowContains(fn, parts) {
  let thrown = null;
  try {
    fn();
  } catch (err) {
    thrown = String(err?.message ?? err);
  }
  assert.ok(thrown, "expected function to throw");
  includesAll(thrown, parts);
}

function main() {
  const abi = loadAbi();
  const names = new Set(abi.filter((x) => x?.type === "function").map((x) => x.name));

  assert.ok(names.has("commitApplication"), "ABI missing commitApplication");
  assert.ok(names.has("revealApplication"), "ABI missing revealApplication");
  assert.ok(names.has("acceptFinalist"), "ABI missing acceptFinalist");
  assert.ok(names.has("submitTrial"), "ABI missing submitTrial");

  const validCommit = encodePrimeCall("commitApplication", [
    1001n,
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "fixture-agent",
    ["0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"],
  ]);
  assertEncoded(validCommit);

  const validReveal = encodePrimeCall("revealApplication", [
    1001n,
    "fixture-agent",
    ["0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"],
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "ipfs://fixture-application-uri",
  ]);
  assertEncoded(validReveal);

  const validAccept = encodePrimeCall("acceptFinalist", [1001n]);
  assertEncoded(validAccept);

  const validSubmitTrial = encodePrimeCall("submitTrial", [1001n, "ipfs://fixture-trial-uri"]);
  assertEncoded(validSubmitTrial);

  const validScoreCommit = encodePrimeCall("scoreCommit", [1001n, "0x2222222222222222222222222222222222222222222222222222222222222222"]);
  assertEncoded(validScoreCommit);

  const validScoreReveal = encodePrimeCall("scoreReveal", [1001n, 85n, "0x3333333333333333333333333333333333333333333333333333333333333333"]);
  assertEncoded(validScoreReveal);

  expectThrowContains(
    () => encodePrimeCall("commitApplication", [1001n, undefined, "fixture-agent", []]),
    ["encodePrimeCall failed", "commitApplication", "expected=", "argTypes=", "missing=", "cause="]
  );

  expectThrowContains(
    () => encodePrimeCall("revealApplication", [1001n, "fixture-agent", [], undefined, "ipfs://x"]),
    ["encodePrimeCall failed", "revealApplication", "expected=", "argTypes=", "missing=", "cause="]
  );

  console.log("[test] PASS test_prime_abi_encoding_regression");
}

main();
