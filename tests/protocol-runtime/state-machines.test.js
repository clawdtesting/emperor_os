import assert from "assert";
import { canTransition as v1Can, applyTransition as v1Apply } from "../../protocols/v1/state-machine.js";
import { canTransition as primeCan, applyTransition as primeApply } from "../../protocols/prime/state-machine.js";

assert.equal(v1Can("DISCOVERED", "EVALUATED"), true);
assert.equal(v1Can("DISCOVERED", "DONE"), false);
assert.throws(() => v1Apply({ state: { status: "DISCOVERED" }, to: "DONE" }));

assert.equal(primeCan("COMMIT_READY", "COMMITTED_UNSIGNED"), true);
assert.equal(primeCan("COMMIT_READY", "DONE"), false);
assert.throws(() => primeApply({ state: { status: "DISCOVERED" }, to: "DONE" }));

console.log("state-machines.test.js passed");
