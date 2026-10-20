/* v46: after "i do not know" / "yes or no?", a line that is itself a new question replaces the
   pending teach slot instead of being saved as the answer. Plain lines still teach; skip cancels.
   Repros from the Jarvis QA run (nova_qa.json). */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

const facts = (n) => JSON.parse(n.localStorage.getItem("nova-facts-v1") || "{}");

test("QA repro: a question with a comma clause is not saved as the meaning", () => {
  const n = boot();
  assert.equal(n.say("what is a zorp"), "i do not know zorp. what do you mean by it?");
  const r = n.say("if all cats are animals and tom is a cat, is tom an animal");
  assert.ok(!/^got it|^saved/.test(r), r);
  assert.ok(!facts(n).zorp, "zorp must not get that line as its meaning");
  assert.equal(n.say("what is a zorp"), "i do not know zorp. what do you mean by it?");
  n.stop();
});

test("new questions after 'yes or no?' and 'i do not know' replace the slot", () => {
  const n = boot();
  for (const q of ["why is the sky blue", "why do we need sleep", "so should i go", "ok can you swim", "is it raining?", "explain this?"]) {
    n.say("can you count");
    const r = n.say(q);
    assert.ok(!/^got it|^lesson saved/.test(r), q + " => " + r);
    n.say("skip");
  }
  assert.ok(!n.lessons().some((l) => /sky|sleep|should i go|swim|raining|explain/.test(l.nova)), JSON.stringify(n.lessons()));
  n.stop();
});

test("the replacing question is the one a plain next line teaches", () => {
  const n = boot();
  n.say("why is the sky green");
  assert.equal(n.say("why is the sky purple"), "i do not know.");
  assert.equal(n.say("it is not purple"), "got it. next time i'll say: it is not purple");
  assert.equal(n.say("why is the sky purple"), "it is not purple");
  n.stop();
});

test("approved behavior kept: plain lines teach, yes/no answers, skip cancels", () => {
  const n = boot();
  assert.equal(n.say("what is a blorp"), "i do not know blorp. what do you mean by it?");
  assert.equal(n.say("a made up word"), "got it. next time i'll say: a made up word");
  assert.equal(n.say("what is a blorp"), "a made up word");
  assert.equal(n.say("can you count"), "yes or no?");
  assert.equal(n.say("yes"), "got it. next time i'll say: yes");
  assert.equal(n.say("can you fly"), "yes or no?");
  assert.match(n.say("no, i only run here"), /^got it/);
  assert.equal(n.say("why is grass green"), "i do not know.");
  assert.equal(n.say("skip"), "ok. skipped.");
  assert.equal(n.say("tell me a joke"), "i do not know.", "after skip nothing is pending");
  n.stop();
});
