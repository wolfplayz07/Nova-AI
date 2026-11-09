/* v63: rules and short reasoning. Declarative statements become rule edges in nova-rules-v1,
   if/when and should-I questions walk at most 3 hops of taught edges and explain the edges used,
   a missing link asks one question, "what do you know about X" lists rules, "forget that rule" undoes. */
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
  "math-misses.js", "self-learn.js", "corrections.js", "same-as.js"];
FILES.push("rules.js");
const start = (seed) => boot({ files: FILES, globals: { XMLHttpRequest: XHR }, seed });
const rules = (n) => JSON.parse(n.localStorage.getItem("nova-rules-v1") || '{"rules":[]}').rules;
const UMB = "should I bring an umbrella if it rains?";

test("exact creator line: 'An umbrella keeps you dry' is a rule, not i do not know", () => {
  const n = start();
  assert.equal(n.say("An umbrella keeps you dry"), "got it: umbrella \u2192 keeps you dry.");
  const r = rules(n);
  assert.equal(r.length, 1);
  assert.equal(r[0].from, "umbrella"); assert.equal(r[0].rel, "keeps"); assert.equal(r[0].to, "you dry");
  assert.equal(r[0].source, "taught"); assert.equal(r[0].neg, false); assert.equal(r[0].orig, "An umbrella keeps you dry");
  n.stop();
});

test("rain rule missing -> ask -> teach -> answer, and the same answer on re-ask", () => {
  const n = start();
  n.say("An umbrella keeps you dry");
  assert.equal(n.say(UMB), "what happens when it rains?");
  assert.equal(n.say("it makes you wet"), "got it: rain \u2192 makes you wet. yes, because rain makes you wet and an umbrella keeps you dry.");
  assert.equal(n.say(UMB), "yes, because rain makes you wet and an umbrella keeps you dry.");
  assert.equal(n.say("if it rains, should I bring an umbrella?"), "yes, because rain makes you wet and an umbrella keeps you dry.");
  assert.equal(n.say("when it is raining do I need an umbrella?"), "yes, because rain makes you wet and an umbrella keeps you dry.");
  n.stop();
});

test("skip cancels the missing-link question and saves nothing", () => {
  const n = start();
  n.say("An umbrella keeps you dry");
  assert.equal(n.say(UMB), "what happens when it rains?");
  assert.equal(n.say("skip"), "ok. skipped.");
  assert.equal(rules(n).length, 1);
  n.stop();
});

test("an unrelated line after the prompt is not bent onto it", () => {
  const n = start();
  n.say("An umbrella keeps you dry");
  n.say(UMB);
  assert.equal(n.say("a glorp is a tiny robot"), "got it. glorp is a tiny robot.");
  assert.equal(rules(n).length, 1);
  n.stop();
});

test("unknown target side asks what it does", () => {
  const n = start();
  n.say("rain makes you wet");
  assert.equal(n.say("if it rains should I bring a poncho?"), "what does a poncho do?");
  assert.equal(n.say("it keeps you dry"), "got it: poncho \u2192 keeps you dry. yes, because rain makes you wet and a poncho keeps you dry.");
  n.stop();
});

test("3-hop chaining explains every edge", () => {
  const n = start();
  for (const l of ["clouds bring storms", "storms cause rain", "rain makes you wet", "an umbrella keeps you dry"]) n.say(l);
  assert.equal(n.say("if there are clouds will I get wet?"), "yes, because clouds bring storms and storms cause rain and rain makes you wet.");
  assert.equal(n.say("if there is a storm should I bring an umbrella?"), "yes, because storms cause rain and rain makes you wet and an umbrella keeps you dry.");
  n.stop();
});

test("more than 3 hops is not reached", () => {
  const n = start();
  for (const l of ["wind brings clouds", "clouds bring storms", "storms cause rain", "rain makes you wet", "an umbrella keeps you dry"]) n.say(l);
  assert.match(n.say("if there is wind will I get wet?"), /^i do not know/);
  n.say("skip");
  assert.match(n.say("if there are clouds should I bring an umbrella?"), /^i do not know/);
  n.stop();
});

test("opposites: wet/dry links a problem to protection; warm does not fix wet", () => {
  const n = start();
  n.say("rain makes you wet"); n.say("a coat keeps you warm");
  assert.match(n.say("if it rains should I wear a coat?"), /^i do not know/);
  n.say("an umbrella keeps you dry");
  assert.equal(n.say("if it rains should I bring an umbrella?"), "yes, because rain makes you wet and an umbrella keeps you dry.");
  n.stop();
});

test("no false yes for unlinked concepts or bare co-occurrence", () => {
  const n = start();
  n.say("an umbrella keeps you dry"); n.say("snow is cold"); n.say("rain makes you wet");
  assert.match(n.say("if it snows should I bring an umbrella?"), /^i do not know/);
  assert.match(n.say("if it is sunny should I bring an umbrella?"), /^what happens when it is sunny\?$/);
  assert.equal(n.say("skip"), "ok. skipped.");
  n.stop();
});

test("negation is kept and answers no with the reason", () => {
  const n = start();
  assert.equal(n.say("dogs do not like baths"), "got it: dogs \u2192 do not like baths.");
  assert.equal(rules(n)[0].neg, true);
  assert.equal(n.say("do dogs like baths?"), "no, because dogs do not like baths.");
  n.say("wind makes you cold"); n.say("an umbrella does not keep you warm");
  assert.equal(n.say("if there is wind should I bring an umbrella?"), "no, because wind makes you cold and an umbrella does not keep you warm.");
  n.stop();
});

test("qualifiers are kept and soften the answer", () => {
  const n = start();
  assert.equal(n.say("usually rain makes you wet"), "got it: rain \u2192 usually makes you wet.");
  n.say("an umbrella keeps you dry");
  assert.equal(n.say(UMB), "probably yes, because usually rain makes you wet and an umbrella keeps you dry.");
  n.stop();
});

test("if/when statements and 'you need X when A'", () => {
  const n = start();
  assert.equal(n.say("if it rains, then the ground gets wet"), "got it: it rains \u2192 the ground gets wet.");
  assert.equal(n.say("if it rains will the ground get wet?"), "yes, because if it rains, then the ground gets wet.");
  assert.equal(n.say("you need a coat when it is cold"), "got it: it is cold \u2192 you need a coat.");
  assert.equal(n.say("when it is cold should I wear a coat?"), "yes, because you need a coat when it is cold.");
  n.stop();
});

test("question vs statement: questions, definitions, commands are not rules", () => {
  const n = start();
  for (const l of ["does an umbrella keep you dry?", "can dogs bark", "a glorp is a tiny robot", "fire is hot and dangerous",
    "remember yes means correct", "when i say hi say hello", "my dog is cute", "i am hungry", "what is rain", "brain status"]) { n.say(l); n.say("skip"); }
  assert.equal(rules(n).length, 0);
  const m = start();
  assert.equal(m.say("Can dogs bark"), "yes or no?");
  m.stop();
  n.stop();
});

test("statement forms: is/are/has/can/needs", () => {
  const n = start();
  assert.equal(n.say("ice is cold"), "got it: ice \u2192 is cold.");
  assert.equal(n.say("plants need water"), "got it: plants \u2192 need water.");
  assert.equal(n.say("birds can fly"), "got it: birds \u2192 can fly.");
  assert.equal(n.say("cars have wheels"), "got it: cars \u2192 have wheels.");
  assert.equal(rules(n).length, 4);
  n.stop();
});

test("normalizing: plurals and -ing match, words are not mangled", () => {
  const n = start();
  const L = n.ctx.NovaRules.lemma;
  assert.equal(JSON.stringify(["raining", "rains", "rained", "umbrellas", "running", "making", "berries", "boxes", "news", "glass", "bus", "ring", "dry", "wet", "species"].map(L)),
    JSON.stringify(["rain", "rain", "rain", "umbrella", "run", "make", "berry", "box", "news", "glass", "bus", "ring", "dry", "wet", "species"]));
  n.stop();
});

test("exact saved answers keep priority for should-I; if/when questions try rules first", () => {
  const n = start();
  n.say("when i say should i bring an umbrella say only if it is cloudy");
  n.say("rain makes you wet"); n.say("an umbrella keeps you dry");
  assert.equal(n.say("should i bring an umbrella"), "only if it is cloudy");
  assert.equal(n.say(UMB), "yes, because rain makes you wet and an umbrella keeps you dry.");
  n.stop();
});

test("should-I with the condition on the line before", () => {
  const n = start();
  n.say("rain makes you wet"); n.say("an umbrella keeps you dry");
  n.say("it is raining");
  assert.equal(n.say("should I bring an umbrella?"), "yes, because rain makes you wet and an umbrella keeps you dry.");
  n.stop();
});

test("old flows untouched: should-i with nothing taught, word problems, what-is", () => {
  const n = start();
  assert.equal(n.say("should i drink water"), "i do not know.");
  n.say("skip");
  assert.match(n.say("what is a zorp"), /^i do not know zorp/);
  n.say("skip");
  assert.equal(n.say("if i have 3 apples and buy 5 more then eat 2 how many?"), "You have 6 apples now.");
  n.stop();
});

test("what do you know about X lists related rules", () => {
  const n = start();
  n.say("rain makes you wet"); n.say("an umbrella keeps you dry"); n.say("storms cause rain");
  assert.equal(n.say("what do you know about rain?"), "- rain makes you wet\n- storms cause rain");
  assert.equal(n.say("what do you know about umbrellas"), "- an umbrella keeps you dry");
  n.stop();
});

test("forget that rule removes the last taught rule from storage and backup; builtins stay", () => {
  let backups = 0;
  const n = boot({ files: FILES, globals: { XMLHttpRequest: XHR, NovaIDB: { backup() { backups++; } } } });
  n.say("rain makes you wet"); n.say("an umbrella keeps you dry");
  const b0 = backups;
  assert.equal(n.say("forget that rule"), "forgot: an umbrella keeps you dry.");
  assert.ok(backups > b0, "backup refreshed after delete");
  assert.deepEqual(rules(n).map((r) => r.from), ["rain"]);
  n.say("forget that rule");
  assert.equal(n.say("forget that rule"), "there are no taught rules to forget.");
  assert.equal(JSON.stringify(n.ctx.NovaRules.OPP.wet), '["dry"]');
  n.stop();
});

test("rules persist: a fresh boot with the same storage reasons with them; idb backs the key up", () => {
  const n = start();
  n.say("rain makes you wet"); n.say("an umbrella keeps you dry");
  const saved = n.localStorage.getItem("nova-rules-v1");
  n.stop();
  const m = start({ "nova-rules-v1": saved });
  assert.equal(m.say(UMB), "yes, because rain makes you wet and an umbrella keeps you dry.");
  m.stop();
  assert.match(fs.readFileSync(path.join(WEB, "idb.js"), "utf8"), /"nova-rules-v1"/);
});

test("rule replies are not taught to the tiny brain as lessons", () => {
  const n = start();
  n.say("rain makes you wet");
  assert.ok(!n.lessons().some((l) => /got it:/.test(l.nova || "")));
  n.stop();
});

test("bounded reasoning stays fast on a 2000-edge graph", () => {
  const n = start();
  const R = n.ctx.NovaRules, list = [];
  for (let i = 0; i < 2000; i++) list.push({ id: "b" + i, from: "w" + i, rel: "makes", to: "w" + (i + 1), neg: false, qual: "", orig: "w" + i + " makes w" + (i + 1), source: "taught", cond: false, ft: ["w" + i], tt: ["w" + (i + 1)] });
  list.push({ id: "u", from: "umbrella", rel: "keeps", to: "you dry", neg: false, qual: "", orig: "an umbrella keeps you dry", source: "taught", ft: ["umbrella"], tt: ["dry"] });
  n.localStorage.setItem("nova-rules-v1", JSON.stringify({ rules: list }));
  const t0 = performance.now();
  for (let k = 0; k < 20; k++) R.reason(["w5"], ["umbrella"], "need");
  const ms = (performance.now() - t0) / 20;
  assert.ok(ms < 50, "avg " + ms.toFixed(2) + " ms");
  n.stop();
});

test("negative: 'an umbrella does NOT keep you dry' never yields yes", () => {
  const n = start();
  n.say("rain makes you wet");
  assert.equal(n.say("an umbrella does not keep you dry"), "got it: umbrella \u2192 does not keep you dry.");
  const out = n.say(UMB);
  assert.doesNotMatch(out, /^(yes|probably yes)\b/);
  assert.equal(out, "no, because rain makes you wet and an umbrella does not keep you dry.");
  n.stop();
});

test("negative: 'rain usually makes you wet' never becomes certainty", () => {
  const n = start();
  assert.equal(n.say("rain usually makes you wet"), "got it: rain \u2192 usually makes you wet.");
  assert.equal(rules(n)[0].qual, "usually");
  n.say("an umbrella keeps you dry");
  assert.equal(n.say(UMB), "probably yes, because rain usually makes you wet and an umbrella keeps you dry.");
  assert.equal(n.say("if it rains will I get wet?"), "probably yes, because rain usually makes you wet.");
  n.stop();
});

test("negative: unrelated conditions never yield recommendations", () => {
  const n = start();
  for (const l of ["rain makes you wet", "an umbrella keeps you dry", "the sun makes you hot", "music makes you happy"]) n.say(l);
  for (const q of ["if it is sunny should I bring an umbrella?", "if music plays should I bring an umbrella?", "if there is music do I need an umbrella?"]) {
    assert.doesNotMatch(n.say(q), /^(yes|probably yes|no), because/, q);
    n.say("skip");
  }
  n.stop();
});

test("negative: describing a subject (can/is/has) is not an effect, and the subject matters", () => {
  const n = start();
  n.say("birds can fly"); n.say("ice is cold"); n.say("if it rains, then the ground gets wet");
  for (const q of ["if there are birds will I fly?", "if there is ice will I get cold?", "if it rains will I get wet?"]) {
    assert.doesNotMatch(n.say(q), /because/, q);
    n.say("skip");
  }
  n.stop();
});

test("negative: a negated conditional is not a reason to do it", () => {
  const n = start();
  assert.equal(n.say("when it is warm you do not need a coat"), "got it: it is warm \u2192 you do not need a coat.");
  assert.doesNotMatch(n.say("if it is warm should I wear a coat?"), /^(yes|probably yes)\b/);
  n.stop();
});
