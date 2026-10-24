/* v50 self-learning switch, journal and auto-looked-up words. */
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
const BASE = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "math-misses.js"];
export const startSelf = (extra = [], seed) => boot({ files: [...BASE, "self-learn.js", ...extra], globals: { XMLHttpRequest: XHR }, seed });
const twice = (n) => { n.say("the reactor hums"); n.say("skip"); n.say("the reactor glows"); n.say("skip"); };
const facts = (n) => JSON.parse(n.localStorage.getItem("nova-facts-v1") || "{}");

test("off by default: replies are exactly the same as without self-learn.js", () => {
  const lines = ["hello", "my reactor is hot", "the reactor hums", "how are you", "what is a river", "no",
    "can you count", "yes", "what is a zorp", "skip", "what is 2 plus 2", "reactor reactor"];
  const a = boot({ files: BASE, globals: { XMLHttpRequest: XHR } }), b = startSelf();
  for (const l of lines) assert.equal(b.say(l), a.say(l), l);
  assert.equal(b.say("self-learning status"), "self-learning off.");
  assert.equal(b.ctx.NovaSelf.entries().length, 0, "nothing journaled while off");
  a.stop(); b.stop();
});

test("learn on your own: looks a twice-said word up, journals it, asks once, yes saves", () => {
  const n = startSelf();
  assert.match(n.say("learn on your own"), /^ok\. self-learning is on/);
  assert.equal(n.say("is self learning on"), "self-learning on.");
  twice(n);
  assert.equal(n.ctx.NovaSelf.words().reactor.found, true);
  const ask = n.say("how are you");
  assert.match(ask, /^i am here\.\nby the way, you have said "reactor" 2 times\. dictionary says: reactor \(noun\): .+ want me to remember it\? \(skip is fine\)$/);
  assert.match(n.say("yes"), /^saved\. reactor means /);
  assert.ok(facts(n).reactor.user, "saved only after yes");
  const j = n.say("what did you learn on your own");
  assert.match(j, /looked up "reactor" in my dictionary/);
  assert.match(j, /asked you what "reactor" means/);
  assert.match(j, /you said yes/);
  assert.equal(n.say("how are you"), "i am here.", "at most one ask per day");
  n.stop();
});

test("skip snoozes, no meaning is saved, and the real reply is never replaced", () => {
  const n = startSelf();
  n.say("learn on your own");
  twice(n);
  assert.match(n.say("how are you"), /^i am here\.\nby the way/);
  assert.equal(n.say("skip"), "ok. not saved.");
  assert.equal(facts(n).reactor, undefined);
  assert.match(n.say("show journal"), /you skipped "reactor"/);
  n.stop();
});

test("no ask during i do not know, yes or no?, what-is, math, or commands", () => {
  const n = startSelf();
  n.say("learn on your own");
  twice(n);
  assert.equal(n.say("why is the sky green"), "i do not know.");
  n.say("skip");
  assert.equal(n.say("can you fly"), "yes or no?");
  n.say("skip");
  assert.equal(n.say("what is 2 plus 2"), "4.");
  assert.doesNotMatch(n.say("brain status"), /by the way/);
  assert.match(n.say("hello"), /by the way/, "then at a calm moment");
  n.stop();
});

test("stop learning turns it off and it stays off across relaunch until start learning", () => {
  const n = startSelf();
  n.say("learn on your own");
  n.say("stop learning");
  assert.equal(n.say("self-learning status"), "self-learning off.");
  twice(n); n.say("hello");
  assert.equal(n.ctx.NovaSelf.words().reactor, undefined, "no lookups while off");
  const store = n.localStorage.getItem("nova-self-learn-v1");
  n.stop();
  const m = startSelf([], { "nova-self-learn-v1": store });
  assert.equal(m.say("self-learning status"), "self-learning off.");
  m.say("start learning");
  assert.equal(m.say("self-learning status"), "self-learning on.");
  assert.match(m.say("brain status"), /Self-learning: on\.$/);
  m.stop();
});

test("don't ask me words stops asking but still looks up; journal clears; by-the-way is never a lesson", () => {
  const n = startSelf();
  n.say("start learning");
  n.say("learn on your own");
  assert.match(n.say("don't ask me words"), /^ok\. i will not ask/);
  twice(n);
  assert.equal(n.say("hello"), n.say("hello"));
  assert.doesNotMatch(n.say("hello"), /by the way/);
  assert.equal(n.ctx.NovaSelf.words().reactor.found, true);
  n.say("ask me words");
  const out = n.say("how are you");
  assert.match(out, /by the way/);
  assert.ok(n.lessons().every((l) => !/by the way|dictionary says/.test(l.nova)), JSON.stringify(n.lessons()));
  assert.equal(n.say("skip"), "ok. not saved.");
  assert.equal(n.say("clear journal"), "ok. journal cleared.");
  assert.match(n.say("what did you learn on your own"), /^my journal is empty\. self-learning is on\.$/);
  n.stop();
});

test("unknown words still get an honest i do not know", () => {
  const n = startSelf();
  n.say("learn on your own");
  assert.match(n.say("what does flurbix do"), /^i do not know/);
  n.stop();
});
