/* v45 math-misses log: word-problem-looking lines no solver answered are listed for the creator.
   The log never changes a reply, never patches the solver, and stops after "stop learning". */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

const BASE = ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js"];
const start = () => boot({ files: [...BASE, "math-misses.js"] });
const log = (n) => JSON.parse(n.localStorage.getItem("nova-math-misses-v1") || '{"misses":[]}').misses;
const PIZZA = "A pizza has 8 slices. 3 people eat 2 slices each. How many slices are left?";
const TRAIN = "Jon has 5 apples and Mary has 8 apples. how many more does Mary have than Jon?"; /* comparison: unsupported */

test("unsolved word problems are logged; 'math misses' lists newest first with counts", () => {
  const n = start();
  assert.equal(n.say("math misses"), "no math misses yet.");
  assert.equal(n.say(PIZZA), "i do not know.");
  n.say("skip");
  n.say(TRAIN); n.say("skip");
  n.say(PIZZA); n.say("skip");
  assert.equal(log(n).length, 2);
  assert.equal(n.say("math misses"), `math i could not do yet: "${PIZZA}" (2), "${TRAIN}".`);
  assert.equal(n.say("what math couldn't you do?"), n.say("show math misses"));
  assert.equal(n.say("clear math misses"), "ok. math misses cleared.");
  assert.equal(n.say("what math can't you do"), "no math misses yet.");
  n.stop();
});

test("solved math and non-math lines are not logged", () => {
  const n = start();
  assert.equal(n.say("what is 25% of 200"), "50.");
  assert.equal(n.say("what is 2 plus 2"), "4.");
  assert.equal(n.say("Jon has 4 cookies and Mary took 2, how many are left?"), "Jon has 2 cookies left.");
  assert.equal(n.say("how many are left?"), "Jon has 2 cookies left.");
  assert.equal(n.say("13 cookies split between 2 kids"), "Each kid gets 6 cookies. 1 cookie is left over.");
  assert.equal(n.say("how are you"), "i am here.");
  assert.equal(n.say("how many legs does a spider have"), "i do not know.");
  n.say("skip");
  assert.equal(log(n).length, 0);
  n.stop();
});

test("replies are exactly the same with and without the log", () => {
  const lines = [PIZZA, "skip", "what is a zorp", "skip", "Sam has 3 bags with 4 apples each. How many apples does he have?",
    TRAIN, "3 more", "can you count", "yes", "hello"];
  const a = boot({ files: BASE }), b = start();
  for (const l of lines) assert.equal(b.say(l), a.say(l), l);
  a.stop(); b.stop();
});

test("teach answers and owner commands with numbers are not logged", () => {
  const n = start();
  n.say(TRAIN);
  assert.match(n.say("3 more in total"), /^got it/);
  assert.equal(n.say(TRAIN), "3 more in total", "the creator's lesson answers next time");
  n.say("when i say 3 kids each get 2 say 6 in total");
  n.say("lock dozen as 12 eggs each");
  n.say("half means 1 of 2 equal parts");
  assert.equal(log(n).length, 1, JSON.stringify(log(n)));
  n.stop();
});

test("stop learning: no logging until start learning", () => {
  const n = start();
  n.say("stop learning");
  n.say(PIZZA); n.say("skip");
  assert.equal(log(n).length, 0);
  assert.equal(n.say("math misses"), "no math misses yet.", "commands still work");
  n.say("start learning");
  n.say(PIZZA); n.say("skip");
  assert.equal(log(n).length, 1);
  n.say("stop learning");
  n.stop();
});

test("log is capped at 50, repeats bump the count, and lists are never saved as lessons", () => {
  const n = start();
  n.say("start learning");
  for (let i = 0; i < 55; i++) { n.say(`Jon has ${i + 10} apples and Mary has 8 apples. how many more does Jon have than Mary?`); n.say("skip"); }
  assert.equal(log(n).length, 50);
  assert.match(n.say("math misses"), /^math i could not do yet: "Jon has 64 apples/);
  assert.ok(!n.lessons().some((l) => /math i could not do|math misses/.test(l.nova + l.user)));
  n.say("stop learning");
  n.stop();
});
