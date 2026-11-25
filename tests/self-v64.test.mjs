/* v64: self-knowledge registry. Questions aimed at Nova are answered from what is
   actually loaded, before yes/no, saved answers, and the rules flow. */
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
const FILES = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "senses.js",
  "math-misses.js", "self-learn.js", "corrections.js", "same-as.js", "rules.js", "self.js"];
const start = (extra = {}) => boot({ files: FILES, globals: { XMLHttpRequest: XHR, ...(extra.globals || {}) }, seed: extra.seed });
const pending = (n) => {
  try { return n.ctx.NovaLookup && n.ctx.NovaLookup.getPending && n.ctx.NovaLookup.getPending(); }
  catch (e) { return null; }
};

test("creator line: 'Can you research yet?' is no, not yes or no?", () => {
  const n = start();
  assert.equal(n.say("Can you research yet?"), "no, I can't research yet. I only know my dictionary and what you teach me.");
  assert.equal(pending(n), null);
  n.stop();
});

test("can you learn, look up words, and see", () => {
  const n = start();
  assert.equal(n.say("can you learn"), "yes, I can learn. tap Learn.");
  assert.equal(n.say("can you look up words"), "yes, I can look up words. try 'what is rain'.");
  assert.equal(n.say("can you see"), "no, I can't see yet. I only know my dictionary and what you teach me.");
  n.stop();
});

test("what can you do lists only available abilities with howTo hints", () => {
  const n = start();
  const out = n.say("what can you do?");
  assert.match(out, /^I can /);
  assert.match(out, /look up words \(try 'what is rain'\)/);
  assert.match(out, /remember what you teach me \(say 'remember rain means water from the sky'\)/);
  assert.match(out, /use rules and reasoning \(tell me something like 'an umbrella keeps you dry'\)/);
  assert.match(out, /learn \(tap Learn\)/);
  assert.doesNotMatch(out, /research|see pictures|\bsee\b|speak|hear|listen|across phones|finish/);
  n.stop();
});

test("unknown verb: no teach slot is opened", () => {
  const n = start();
  assert.equal(n.say("can you teleport"), "I'm not sure I can teleport. I don't have that ability listed.");
  assert.equal(pending(n), null);
  assert.doesNotMatch(n.say("yes"), /^got it/);
  assert.equal(n.say("can you teleport"), "I'm not sure I can teleport. I don't have that ability listed.");
  n.stop();
});

test("can dogs bark still goes to yes or no", () => {
  const n = start();
  assert.equal(n.say("can dogs bark"), "yes or no?");
  assert.equal(n.say("yes"), "got it. next time i'll say: yes");
  assert.equal(n.say("can dogs bark"), "yes");
  n.stop();
});

test("saved answers and the rules flow do not intercept self-questions", () => {
  const n = start();
  n.say("when i say can you research yet say yes of course");
  n.say("research keeps you informed");
  assert.equal(n.say("Can you research yet?"), "no, I can't research yet. I only know my dictionary and what you teach me.");
  assert.equal(n.say("can you learn"), "yes, I can learn. tap Learn.");
  n.stop();
});

test("research flips to yes only when a stub module is present and the phone is online", () => {
  const n = start();
  assert.equal(n.say("Can you research yet?"), "no, I can't research yet. I only know my dictionary and what you teach me.");
  n.ctx.NovaResearch = { howTo: "try asking me to research a topic" };
  n.ctx.navigator.onLine = true;
  assert.equal(n.say("Can you research yet?"), "yes, I can research. try asking me to research a topic.");
  n.ctx.navigator.onLine = false;
  assert.equal(n.say("Can you research yet?"), "no, I can't research yet. I only know my dictionary and what you teach me.");
  n.ctx.navigator.onLine = true;
  delete n.ctx.NovaResearch;
  assert.equal(n.say("Can you research yet?"), "no, I can't research yet. I only know my dictionary and what you teach me.");
  n.stop();
});

test("creator line: 'Finish my sentence' and close variants", () => {
  const n = start();
  assert.equal(n.say("Finish my sentence"), "I can't finish sentences yet.");
  assert.equal(n.say("complete my sentence"), "I can't finish sentences yet.");
  assert.equal(n.say("can you finish my sentence"), "I can't finish sentences yet.");
  assert.equal(pending(n), null);
  assert.doesNotMatch(n.say("Finish my sentence"), /i do not know/i);
  n.stop();
});

test("other self prefixes and fillers still hit the registry", () => {
  const n = start();
  assert.equal(n.say("are you able to research yet?"), "no, I can't research yet. I only know my dictionary and what you teach me.");
  assert.equal(n.say("do you know how to learn"), "yes, I can learn. tap Learn.");
  assert.equal(n.say("could you look up words"), "yes, I can look up words. try 'what is rain'.");
  assert.equal(n.say("ok nova can you see"), "no, I can't see yet. I only know my dictionary and what you teach me.");
  assert.equal(n.say("can nova research"), "no, I can't research yet. I only know my dictionary and what you teach me.");
  n.stop();
});

test("no research module ships in web/, and self.js makes no network calls", () => {
  const files = fs.readdirSync(WEB);
  assert.ok(!files.some((f) => /research/i.test(f)), files.join(","));
  const src = fs.readFileSync(path.join(WEB, "self.js"), "utf8");
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|https?:\/\//);
  nStopCheck(files);
  function nStopCheck() {
    assert.ok(files.includes("self.js"));
  }
});

test("speak stays no if only the browser speechSynthesis API exists; a real module would flip it", () => {
  const n = start();
  n.ctx.speechSynthesis = { speak() {} };
  assert.equal(n.say("can you speak"), "no, I can't speak yet. I only know my dictionary and what you teach me.");
  n.ctx.NovaSpeak = { howTo: "I would speak the reply out loud" };
  assert.equal(n.say("can you speak"), "yes, I can speak. I would speak the reply out loud.");
  n.stop();
});

test("hear is yes only when a speech-recognition API is present", () => {
  const n = start();
  assert.equal(n.say("can you hear"), "no, I can't hear yet. I only know my dictionary and what you teach me.");
  n.ctx.SpeechRecognition = function () {};
  assert.equal(n.say("can you hear"), "yes, I can hear. tap the mic.");
  n.stop();
});
