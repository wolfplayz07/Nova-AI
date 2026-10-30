/* v55: leading fillers ("ok nova", "hey nova,", "okay") must not hide a yes/no question. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

test("filler prefixes still get 'yes or no?'", () => {
  const n = boot();
  for (const q of ["Ok nova can a dog talk?", "hey nova, can a dog talk?", "okay can dogs talk?", "Can dogs talk?"]) {
    assert.equal(n.say(q), "yes or no?", q);
    n.say("skip");
  }
  n.stop();
});

test("filler + 'should i' is still not yes/no", () => {
  const n = boot();
  assert.equal(n.say("ok nova should i run"), "i do not know.");
  n.stop();
});
