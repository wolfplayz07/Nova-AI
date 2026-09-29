/* PR B: when i say A say B overwrites the pair for key A instead of being shadowed by an older lesson. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

const count = (n, key) => n.lessons().filter((l) => l.user.replace(/[?.!,\s]+$/, "") === key).length;

test("bug: new when-i-say reply replaces a lesson taught through the IDK flow", () => {
  const n = boot();
  assert.equal(n.say("who is bob"), "i do not know.");
  assert.equal(n.say("say my uncle"), "got it. next time i'll say: my uncle");
  assert.equal(n.say("who is bob"), "my uncle");
  assert.equal(n.say("when i say who is bob say my neighbor"), "lesson saved.");
  assert.equal(n.say("who is bob"), "my neighbor");
  assert.equal(count(n, "who is bob"), 1);
  n.stop();
});

test("old duplicate pairs no longer win the substring vote", () => {
  const n = boot();
  /* Older builds appended duplicates; simulate two old pairs for the same key. */
  n.T().setLessons([{ user: "tell me a joke", nova: "no jokes" }, { user: "tell me a joke", nova: "no jokes" }]);
  assert.equal(n.say("can you tell me a joke"), "no jokes");
  assert.equal(n.say("when i say tell me a joke say why did the cat sit"), "lesson saved.");
  assert.equal(count(n, "tell me a joke"), 1);
  assert.equal(n.say("tell me a joke"), "why did the cat sit", "exact path");
  assert.equal(n.say("can you tell me a joke"), "why did the cat sit", "substring path");
  assert.equal(n.say("tell me a joke please"), "why did the cat sit", "substring path");
  n.stop();
});

test("second when-i-say for the same key overwrites; trailing ? is the same key", () => {
  const n = boot();
  n.say("when i say how old are you say two");
  assert.equal(n.say("when i say how old are you? say three"), "lesson saved.");
  assert.equal(count(n, "how old are you"), 1);
  assert.equal(n.say("how old are you"), "three");
  assert.equal(n.say("How old are you?"), "three");
  n.say("when i say can you fly say no");
  n.say("when i say can you fly say yes");
  assert.equal(n.say("can you fly"), "yes");
  assert.equal(count(n, "can you fly"), 1);
  n.stop();
});

test("when-i-say lesson survives train.js persist and a reload", () => {
  const n = boot();
  n.say("when i say who is bob say my neighbor");
  n.say("who painted my fence");
  n.say("say bob did"); /* pushLesson -> persist() of train.js memory */
  assert.equal(n.say("who is bob"), "my neighbor");
  const seed = { "nova-tiny-brain-v7": n.localStorage.getItem("nova-tiny-brain-v7") };
  n.stop();
  const again = boot({ seed });
  assert.equal(again.say("who is bob"), "my neighbor");
  assert.equal(again.say("who painted my fence"), "bob did");
  again.stop();
});

test("fallback path (no trainer): correction and when-i-say share the same overwrite", () => {
  const n = boot({ files: ["lookup.js"] });
  assert.equal(n.say("why is it raining"), "i do not know.");
  assert.equal(n.say("say clouds"), "got it. next time i'll say: clouds");
  assert.equal(n.say("why is it raining"), "clouds");
  assert.equal(n.say("when i say why is it raining say weather"), "lesson saved.");
  assert.equal(n.say("why is it raining"), "weather");
  assert.equal(count(n, "why is it raining"), 1);
});
