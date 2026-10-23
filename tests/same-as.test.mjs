/* v52 "same as ...?": confirmed aliases only, only on the leftover i do not know path. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "./harness.mjs";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
class XHR {
  open(m, url) { this.url = url; }
  send() {
    const p = path.join(WEB, this.url.split("?")[0]);
    if (fs.existsSync(p)) { this.status = 200; this.responseText = fs.readFileSync(p, "utf8"); }
    else { this.status = 404; this.responseText = ""; }
  }
}
const BASE = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "math-misses.js", "self-learn.js", "corrections.js"];
const start = (files = [...BASE, "same-as.js"]) => boot({ files, globals: { XMLHttpRequest: XHR } });
const ASK = 'do you mean the same as "who is ada"? yes or no?';

test("off by default: replies unchanged", () => {
  const a = start(BASE), b = start();
  const lines = ["when i say who is ada say my best friend", "tell me about ada", "yes", "can you fly", "no", "what is a zorp", "skip", "hello"];
  for (const l of lines) assert.equal(b.say(l), a.say(l), l);
  a.stop(); b.stop();
});

test("yes links the line to the taught answer word for word", () => {
  const n = start();
  n.say("learn on your own"); n.say("don't ask me words");
  n.say("when i say who is ada say you are my best friend");
  assert.equal(n.say("tell me about ada"), ASK);
  assert.equal(n.say("yes"), 'ok. "tell me about ada" now gets the same answer as "who is ada".');
  assert.equal(n.say("tell me about ada"), "you are my best friend", "no you->I rewriting");
  assert.match(n.say("what did you learn on your own"), /you said "tell me about ada" means the same as "who is ada", so i linked them/);
  n.stop();
});

test("no remembers the pair and never asks it again; honest i do not know after", () => {
  const n = start();
  n.say("learn on your own"); n.say("don't ask me words");
  n.say("when i say who is ada say my best friend");
  assert.equal(n.say("tell me about ada"), ASK);
  assert.equal(n.say("no"), "ok. i will not link them.");
  assert.equal(n.say("tell me about ada"), "i do not know.");
  n.say("skip");
  assert.equal(n.say("what does flurbix mean"), n.say("what does flurbix mean"));
  n.stop();
});

test("never replaces yes or no?, the what-is prompt, or a lesson hit; any other line carries on", () => {
  const n = start();
  n.say("learn on your own"); n.say("don't ask me words");
  n.say("when i say can you do math say yes i can");
  assert.equal(n.say("can you do some math"), "yes or no?");
  n.say("skip");
  assert.match(n.say("what is a zorp"), /what do you mean by it\?$|^i do not know/);
  n.say("skip");
  n.say("when i say who is ada say my best friend");
  assert.equal(n.say("who is ada"), "my best friend");
  assert.equal(n.say("tell me about ada"), ASK);
  assert.equal(n.say("how are you"), "i am here.", "a new line drops the suggestion");
  n.say("yes");
  assert.ok(!n.lessons().some((l) => l.user === "tell me about ada"), "a stale yes is not a link");
  assert.ok(!n.lessons().some((l) => /same as/.test(l.nova)));
  n.stop();
});

test("stop learning: no suggestions", () => {
  const n = start();
  n.say("learn on your own");
  n.say("when i say who is ada say my best friend");
  n.say("stop learning");
  assert.equal(n.say("tell me about ada"), "i do not know.");
  n.stop();
});
