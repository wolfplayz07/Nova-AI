/* v45: self-generated word problems with known answers, checked against Nova's own solvers
   (novaMath for plain/percent math, novaWordMath for word problems). Deterministic seed, so a
   failure is reproducible. Shapes the solver is known not to read are listed in UNSUPPORTED with a
   note; they must still fall through honestly (null), never a wrong number. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

function rng(seed) { /* mulberry32 */
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(45045);
const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const pick = (a) => a[Math.floor(R() * a.length)];

const NAMES = [["Jon", "he", "him"], ["Mary", "she", "her"], ["Sam", "he", "him"], ["Ann", "she", "her"],
  ["Tom", "he", "him"], ["Lily", "she", "her"], ["Ben", "he", "him"], ["Zoe", "she", "her"]];
const OBJ = [["apple", "apples"], ["cookie", "cookies"], ["pencil", "pencils"], ["marble", "marbles"],
  ["card", "cards"], ["egg", "eggs"], ["shell", "shells"], ["sticker", "stickers"], ["candy", "candies"], ["book", "books"]];
const BOX = ["bags", "boxes", "packs", "jars", "baskets"];
const PEOPLE = [["kid", "kids"], ["friend", "friends"], ["student", "students"]];
const SUB = ["ate", "lost", "gave away", "used"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const say = (n) => (R() < 0.25 && n <= 12 ? WORDS[n] : String(n));
const cnt = (n, o) => n + " " + (n === 1 ? o[0] : o[1]);
const fmt = (x) => (Math.abs(x - Math.round(x)) < 1e-10 ? String(Math.round(x)) : String(Math.round(x * 1e6) / 1e6));

const SHAPES = {
  add() {
    const [nm, , obj] = pick(NAMES), [other] = pick(NAMES.filter((x) => x[0] !== nm)), o = pick(OBJ);
    const a = int(1, 50), b = int(1, 50);
    return [`${nm} has ${a === 1 ? "1 " + o[0] : say(a) + " " + o[1]} and ${other} gives ${obj} ${say(b)}, how many now?`, `${nm} has ${cnt(a + b, o)} now.`];
  },
  sub() {
    const [nm] = pick(NAMES), o = pick(OBJ), a = int(2, 60), b = int(1, a - 1);
    return [`${nm} has ${say(a)} ${o[1]} and ${pick(SUB)} ${say(b)}. How many are left?`, `${nm} has ${cnt(a - b, o)} left.`];
  },
  subTooMany() {
    const [nm] = pick(NAMES), o = pick(OBJ), a = int(1, 20), b = int(a + 1, 40);
    return [`${nm} has ${cnt(a, o)} and ate ${b}, how many left?`, `${nm} only had ${cnt(a, o)}. that does not add up.`];
  },
  mul() {
    const [nm, pro] = pick(NAMES), o = pick(OBJ), a = int(2, 12), b = int(2, 12);
    return [`${nm} has ${say(a)} ${pick(BOX)} with ${say(b)} ${o[1]} each. How many ${o[1]} does ${pro} have?`, `${nm} has ${cnt(a * b, o)}.`];
  },
  div() {
    const o = pick(OBJ), p = pick(PEOPLE), k = int(2, 12), q = int(1, 12);
    return [`${k * q} ${o[1]} shared equally among ${k} ${p[1]}. How many does each ${p[0]} get?`, `Each ${p[0]} gets ${cnt(q, o)}.`];
  },
  leftover() {
    const o = pick(OBJ), p = pick(PEOPLE), k = int(2, 9), q = int(1, 12), r = int(1, k - 1);
    return [`${k * q + r} ${o[1]} split between ${k} ${p[1]}`,
      `Each ${p[0]} gets ${cnt(q, o)}. ${cnt(r, o)} ${r === 1 ? "is" : "are"} left over.`];
  },
  percent() {
    const p = pick([5, 10, 15, 20, 25, 30, 40, 50, 75, 80, 100, 150]), m = int(1, 80) * 10;
    return [R() < 0.5 ? `what is ${p}% of ${m}` : `${p} percent of ${m}`, fmt((p / 100) * m) + "."];
  },
  plain() {
    const a = int(1, 500), b = int(1, 500), op = pick([["plus", (x, y) => x + y], ["minus", (x, y) => x - y], ["times", (x, y) => x * y]]);
    return [`what is ${a} ${op[0]} ${b}`, fmt(op[1](a, b)) + "."];
  }
};
const PER_SHAPE = 500;

/* Known-unsupported shapes (v42 solver). Each must give null (honest fall-through), not a wrong answer. */
const UNSUPPORTED = [
  // multi-step: a group eats N each, out of a total ("8 slices, 3 people eat 2 each")
  ["A pizza has 8 slices. 3 people eat 2 slices each. How many slices are left?", "group-each subtraction"],
  // rates and units
  ["a train goes 60 miles per hour for 2 hours. how far?", "rate x time"],
  // comparison questions
  ["Jon has 5 apples and Mary has 8 apples. How many more apples does Mary have than Jon?", "comparison"],
  // percent inside a story
  ["Sam has 200 cards and gives away 25 percent of them. How many are left?", "percent of a story amount"],
];

/* Known WRONG answers the generator found (v42 solver). Marked todo: they run and are reported, but
   do not fail the suite. Fix each in its own PR, then drop the todo. Nova never patches itself. */
const KNOWN_BUGS = [
  ["Ann has 5 dollars and spends 2 dollars 50 cents. How much is left?", "Ann has 2.5 dollars left.",
    "cents are ignored: says 3 dollars"],
  ["Ann has 1 eggs and Mary gives her 41, how many now?", "Ann has 42 eggs now.",
    "ungrammatical '1 eggs' input: number right, plural printed as 'eggses'"]
];

const solverFor = () => {
  const n = boot({ files: ["word-math.js", "math-boot.js"] });
  return {
    n,
    solve(t) {
      n.ctx.NovaWordMath.reset();
      const plain = n.ctx.novaMath(t);
      return plain || n.ctx.novaWordMath(t);
    }
  };
};

for (const shape of Object.keys(SHAPES)) {
  test(`generated ${shape}: ${PER_SHAPE} problems match the known answer`, () => {
    const { solve } = solverFor();
    const bad = [];
    for (let i = 0; i < PER_SHAPE; i++) {
      const [q, want] = SHAPES[shape]();
      const got = solve(q);
      if (got !== want) bad.push({ q, want, got });
    }
    assert.deepEqual(bad.slice(0, 5), [], `${bad.length}/${PER_SHAPE} wrong`);
  });
}

test("known-unsupported shapes fall through (null), never a wrong number", () => {
  const { solve } = solverFor();
  for (const [q, why] of UNSUPPORTED) assert.equal(solve(q), null, why + ": " + q);
});

for (const [q, want, why] of KNOWN_BUGS) {
  test(`known bug (todo): ${why}`, { todo: true }, () => {
    const { solve } = solverFor();
    assert.equal(solve(q), want);
  });
}

test("generated problems through the full send() path: solved, never logged as misses", () => {
  const n = boot({ files: ["train.js", "lookup.js", "app.js", "word-math.js", "math-boot.js", "new-words.js", "dict.js", "math-misses.js"] });
  for (let i = 0; i < 200; i++) {
    const [q, want] = SHAPES[pick(["add", "sub", "mul", "div", "leftover", "percent"])]();
    vmReset(n);
    const got = n.say(q);
    assert.ok(got === want || got === want + ".", q + " => " + got);
  }
  assert.equal(n.say("math misses"), "no math misses yet.");
  n.stop();
});
function vmReset(n) { n.ctx.NovaWordMath.reset(); }
