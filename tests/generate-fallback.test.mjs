/* When lookup misses, talk may keep a generate() line that passes the gates.
   The real GRU is nondeterministic, so these cases stub NovaTrain.generate.
   Production still calls the real generate unless a test replaces it. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

function stub(n, fn) {
  let calls = 0;
  let lastSeed = "";
  n.T().generate = function (seed) {
    calls += 1;
    lastSeed = String(seed);
    return fn(seed, calls);
  };
  return {
    calls: () => calls,
    seed: () => lastSeed
  };
}

test("accepted generate is spoken and does not arm a correction", () => {
  const n = boot();
  const spy = stub(n, () => "the cat sat on the mat");
  n.say("when i say who is ada say a friend");
  n.say("when i say where is the park say downtown");
  assert.equal(n.say("why is the sky green"), "the cat sat on the mat");
  assert.equal(spy.calls(), 1);
  const seed = spy.seed();
  assert.match(seed, /you: who is ada\nnova: a friend\n/);
  assert.match(seed, /you: where is the park\nnova: downtown\n/);
  assert.ok(seed.endsWith("you: why is the sky green\nnova: "), seed);
  /* Pending must not swallow the next line as a teach. */
  assert.equal(n.say("say something else"), "the cat sat on the mat");
  assert.equal(n.say("nice weather today"), "the cat sat on the mat");
  assert.equal(spy.calls(), 3);
  n.stop();
});

test("seed uses only the last four lessons", () => {
  const n = boot();
  n.say("when i say one say alpha");
  n.say("when i say two say beta");
  n.say("when i say three say gamma");
  n.say("when i say four say delta");
  n.say("when i say five say epsilon");
  const spy = stub(n, () => "i am here");
  assert.equal(n.say("where did the ball go"), "i am here");
  const seed = spy.seed();
  assert.ok(!/you: one\n/.test(seed), seed);
  assert.match(seed, /you: two\nnova: beta\n/);
  assert.match(seed, /you: five\nnova: epsilon\n/);
  assert.ok(seed.endsWith("you: where did the ball go\nnova: "), seed);
  n.stop();
});

test("gibberish, IDK, and learn-commands from generate stay honest IDK and still teach", () => {
  const n = boot();
  const bad = ["tzz52", "i do not know.", "start learning", "b c d", "stop learning", ""];
  let i = 0;
  stub(n, () => bad[i++]);
  assert.equal(n.say("why is the sky purple"), "i do not know.");
  assert.equal(n.say("say bob did"), "got it. next time i'll say: bob did");
  assert.equal(n.say("why is the sky purple"), "bob did");
  n.stop();

  for (const sample of ["i don't know", "learn", "pause", "k!!", "dgyfy"]) {
    const n2 = boot();
    stub(n2, () => sample);
    assert.equal(n2.say("who painted the barn"), "i do not know.", sample);
    assert.equal(n2.say("say the red one"), "got it. next time i'll say: the red one");
    assert.equal(n2.say("who painted the barn"), "the red one");
    n2.stop();
  }
});

test("yes or no questions do not call generate", () => {
  const n = boot();
  const spy = stub(n, () => "the cat sat on the mat");
  assert.equal(n.say("can you swim"), "yes or no?");
  assert.equal(spy.calls(), 0);
  assert.equal(n.say("no"), "got it. next time i'll say: no");
  assert.equal(n.say("can you swim"), "no");
  assert.equal(spy.calls(), 0);
  n.stop();
});

test("exact taught question does not call generate", () => {
  const n = boot();
  assert.equal(n.say("when i say who is bob say my neighbor"), "lesson saved.");
  const spy = stub(n, () => "the cat sat on the mat");
  assert.equal(n.say("who is bob"), "my neighbor");
  assert.equal(spy.calls(), 0);
  assert.equal(n.say("Who is bob?"), "my neighbor");
  assert.equal(spy.calls(), 0);
  n.stop();
});

test("math and locked facts stay ahead of generate", () => {
  const n = boot();
  const spy = stub(n, () => "the cat sat on the mat");
  assert.equal(n.say("what is 2 plus 2"), "4.");
  assert.equal(n.say("cat means a small furry animal"), "saved your meaning.");
  assert.equal(n.say("what is a cat"), "a small furry animal");
  assert.equal(n.say("lock cat as a feline"), "locked cat.");
  assert.equal(n.say("what is a cat"), "a feline");
  assert.equal(spy.calls(), 0);
  n.stop();
});

test("owner commands still work while generate is stubbed", () => {
  const n = boot();
  stub(n, () => "tzz52");
  assert.equal(n.say("when i say hello there say hi kevin"), "lesson saved.");
  assert.equal(n.say("hello there"), "hi kevin");
  assert.equal(n.say("puppy means a young dog that plays"), "saved your meaning.");
  assert.equal(n.say("what is a puppy"), "a young dog that plays");
  assert.equal(n.say("my puppy"), "a young dog that plays");
  assert.equal(n.say("edit puppy as a small dog"), "updated your meaning of puppy.");
  assert.equal(n.say("what is puppy"), "a small dog");
  assert.equal(n.say("lock puppy as a canine"), "locked puppy.");
  assert.equal(n.say("what is puppy"), "a canine");
  assert.equal(n.say("read bird is an animal that flies"), "saved 1 word.");
  assert.match(n.say("start learning"), /^Learning ON/);
  assert.match(n.say("stop learning"), /^Learning OFF/);
  assert.equal(n.say("who built the dock"), "i do not know.");
  assert.equal(n.say("skip"), "ok. skipped.");
  assert.match(n.say("remember I live in Denver"), /^Got it\. Saved/);
  assert.match(n.say("what do you remember"), /Denver/);
  n.stop();
});

test("learning does not store IDK or ack lines", () => {
  const n = boot();
  stub(n, () => "i do not know.");
  assert.match(n.say("start learning"), /^Learning ON/);
  const before = n.lessons().length;
  assert.equal(n.say("why is the pond orange"), "i do not know.");
  assert.equal(n.lessons().length, before);
  assert.equal(n.say("when i say ping say pong"), "lesson saved.");
  assert.equal(n.lessons().filter((l) => l.user === "ping").length, 1);
  assert.ok(!n.lessons().some((l) => /do not know/.test(l.nova)));
  assert.ok(!n.lessons().some((l) => l.user === "when i say ping say pong"));
  n.stop();
});
