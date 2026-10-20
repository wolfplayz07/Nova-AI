/* v47: "what is my X" reads saved memories and facts before the dictionary or the what-is prompt. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "./harness.mjs";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
class XHR {
  open(m, u) { this.u = u; }
  send() { const p = path.join(WEB, this.u); if (fs.existsSync(p)) { this.status = 200; this.responseText = fs.readFileSync(p, "utf8"); } else this.status = 404; }
}
const FULL = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "math-misses.js"];
const start = () => boot({ files: FULL, globals: { XMLHttpRequest: XHR } });

test("QA repro: remember my favorite color is blue, then what is my favorite color", () => {
  const n = start();
  assert.equal(n.say("remember my favorite color is blue"), 'Got it. Saved "favorite color" on this phone.');
  assert.equal(n.say("what is my favorite color"), "your favorite color is blue.");
  assert.equal(n.say("what's my favorite color?"), "your favorite color is blue.");
  assert.equal(n.say("what do you remember"), "- favorite color: blue");
  n.stop();
});

test("my name, my WORD facts, and an earlier what-is answer for 'my X'", () => {
  const n = start();
  n.say("remember my name is Tony");
  assert.equal(n.say("what is my name"), "your name is Tony.");
  n.say("edit dozen as 12 eggs in a box");
  assert.equal(n.say("what is my dozen"), "12 eggs in a box");
  assert.equal(n.say("my dozen"), "12 eggs in a box", "owner command unchanged");
  assert.equal(n.say("what is my car"), "i do not know my car. what do you mean by it?", "nothing saved: approved prompt");
  assert.match(n.say("a red truck"), /^got it/);
  assert.equal(n.say("what is my car"), "a red truck");
  n.stop();
});

test("saved memory wins over the dictionary; non-'my' words still use it", () => {
  const n = start();
  n.say("remember my river is the creek out back");
  assert.equal(n.say("what is my river"), "your river is the creek out back.");
  assert.match(n.say("what is a river"), /^dictionary says: river \(noun\)/);
  n.say("no");
  n.stop();
});
