/* v60: "remember X means Y" / "X means Y" / "X = Y" / "X stands for Y" teach a meaning (not a "note"),
   meanings stack, the reply repeats key and value, taught yes/no phrases count as yes/no,
   and after "no" to remember-it only a definition-like next line is saved. */
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
const start = (seed) => boot({ files: FILES, globals: { XMLHttpRequest: XHR }, seed });
const yn = (n) => JSON.parse(n.localStorage.getItem("nova-yesno-v1") || "{}");
const facts = (n) => JSON.parse(n.localStorage.getItem("nova-facts-v1") || "{}");

test("the iPhone bug: 'Remember yes means correct' is not saved as note", () => {
  const n = start();
  const out = n.say("Remember yes means correct");
  assert.equal(out, 'Got it. "yes" means "correct".');
  assert.doesNotMatch(out, /note/);
  assert.deepEqual(yn(n).yes, ["correct"]);
  n.stop();
});

for (const line of ["remember yes = correct", "yes means correct", "yes = correct", "yes stands for correct", "remember yes stands for correct", "remember that yes means correct"]) {
  test(`'${line}' parses like remember X is Y`, () => {
    const n = start();
    assert.equal(n.say(line), 'Got it. "yes" means "correct".');
    assert.deepEqual(yn(n).yes, ["correct"]);
    n.stop();
  });
}

test("several meanings stack instead of overwriting", () => {
  const n = start();
  n.say("remember yes means correct");
  n.say("remember yes means right");
  n.say("remember yes means true");
  assert.equal(n.say("remember yes means I want to"), 'Got it. "yes" means "I want to". (yes: correct, right, true, I want to)');
  for (const v of ["wrong", "incorrect", "false", "I don't want to"]) n.say(`remember no means ${v}`);
  assert.deepEqual(yn(n).yes, ["correct", "right", "true", "i want to"]);
  assert.deepEqual(yn(n).no, ["wrong", "incorrect", "false", "i don't want to"]);
  assert.match(n.say("what do you remember"), /yes: correct; right; true; I want to/);
  n.stop();
});

test("a taught meaning for any word is a sense, not a note", () => {
  const n = start();
  assert.equal(n.say("remember brb means be right back"), 'Got it. "brb" means "be right back".');
  assert.equal(n.say("remember brb means bathroom break"), 'Got it. "brb" means "bathroom break". (brb: be right back, bathroom break)');
  const S = JSON.parse(n.localStorage.getItem(n.ctx.NovaSenses.KEY) || "{}");
  assert.deepEqual(S.brb.map((x) => x.gloss), ["be right back", "bathroom break"]);
  n.stop();
});

test("taught yes/no phrases feed yes/no detection; built-ins still win", () => {
  const n = start();
  n.say("remember yes means correct");
  n.say("remember no means wrong");
  n.say("affirmative = yes");
  const L = n.ctx.NovaLookup;
  assert.equal(L.taughtYesNo("correct"), "yes");
  assert.equal(L.taughtYesNo("Wrong."), "no");
  assert.equal(L.taughtYesNo("affirmative"), "yes");
  assert.equal(L.taughtYesNo("banana"), null);
  n.say("remember no means yes"); /* cannot flip a built-in */
  assert.equal(n.ctx.NovaLookup.taughtYesNo("yes"), null);
  n.stop();
});

test("a taught yes answers the dictionary remember-it offer", () => {
  const n = start();
  n.say("remember yes means correct");
  n.say("what is a river");
  assert.match(n.say("correct"), /^saved\. river means /);
  n.stop();
});

test("a taught no declines the dictionary remember-it offer", () => {
  const n = start();
  n.say("remember no means wrong");
  n.say("what is a river");
  assert.equal(n.say("wrong"), "ok. not saved. tell me what river means if you like.");
  n.stop();
});

test("plain built-in yes/no still work without any teaching", () => {
  const n = start();
  n.say("what is a river");
  assert.match(n.say("yes"), /^saved\. river means /);
  n.say("what is a bank");
  assert.match(n.say("no"), /^ok\. not saved\./);
  n.stop();
});

test("old forms unchanged: remember my X is Y, cat means Y, plain note", () => {
  const n = start();
  assert.equal(n.say("remember my favorite color is blue"), 'Got it. Saved "favorite color" on this phone.');
  assert.equal(n.say("cat means a small furry animal"), "saved your meaning.");
  assert.equal(n.say("remember to buy milk"), 'Got it. Saved "note" on this phone.');
  n.stop();
});

for (const line of ["ok", "lol thanks", "i am hungry", "whatever", "you are funny"]) {
  test(`after 'no' to remember-it, '${line}' is not saved as the meaning`, () => {
    const n = start();
    n.say("what is a river");
    n.say("no");
    const out = n.say(line);
    assert.notEqual(out, "saved your meaning of river.");
    assert.ok(!(facts(n).river && facts(n).river.user), JSON.stringify(facts(n).river));
    n.stop();
  });
}

for (const line of ["the creek behind my house", "it means a big stream", "a river is water that flows"]) {
  test(`after 'no' to remember-it, definition '${line}' is saved`, () => {
    const n = start();
    n.say("what is a river");
    n.say("no");
    assert.match(n.say(line), /^saved your meaning/);
    assert.ok(facts(n).river && facts(n).river.user);
    n.stop();
  });
}

test("i do not know stays honest", () => {
  const n = start();
  assert.match(n.say("what is a zxqv"), /i do not know/);
  n.stop();
});
