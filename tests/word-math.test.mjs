/* v42 word-problem solver (web/word-math.js), driven through the same send() path the iPhone uses.
   It runs right after plain math; anything it cannot read falls through unchanged. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

test("took: 4 cookies, Mary took 2, how many are left", () => {
  const n = boot();
  assert.equal(n.say("If Jon has 4 cookies then Mary took 2, how many are left?"), "Jon has 2 cookies left.");
  n.stop();
});

test("gives him: 4 + 3, how many now, then a follow-up from state", () => {
  const n = boot();
  assert.equal(n.say("Jon has 4 cookies and Mary gives him 3, how many now?"), "Jon has 7 cookies now.");
  assert.equal(n.say("He ate 1. How many does he have now?"), "Jon has 6 cookies now.");
  assert.equal(n.say("how many are left?"), "Jon has 6 cookies left.");
  n.stop();
});

test("multiply: 3 bags with 4 apples each", () => {
  const n = boot();
  assert.equal(n.say("Sam has 3 bags with 4 apples each. How many apples does he have?"), "Sam has 12 apples.");
  const m = boot();
  assert.equal(m.say("3 bags with 4 apples each, how many apples in all?"), "There are 12 apples in all.");
  n.stop(); m.stop();
});

test("divide: 12 candies shared equally among 3 friends", () => {
  const n = boot();
  assert.equal(n.say("12 candies shared equally among 3 friends. How many does each friend get?"), "Each friend gets 4 candies.");
  assert.equal(n.say("13 cookies split between 2 kids"), "Each kid gets 6 cookies. 1 cookie is left over.");
  n.stop();
});

test("number words and a dozen", () => {
  const n = boot();
  assert.equal(n.say("Jon has four cookies and ate one. How many are left?"), "Jon has 3 cookies left.");
  assert.equal(n.say("Tom has a dozen eggs and broke three. How many are left?"), "Tom has 9 eggs left.");
  n.stop();
});

test("gave to someone, found more, I, and honest impossible", () => {
  const n = boot();
  assert.equal(n.say("Ann had 7 pencils. She gave 2 to Bob. How many does Ann have?"), "Ann has 5 pencils now.");
  assert.equal(n.say("Lily found 3 shells and found 2 more, how many shells in all?"), "Lily has 5 shells in all.");
  assert.equal(n.say("I have 5 apples and lost 2, how many left?"), "You have 3 apples left.");
  assert.equal(n.say("Jon has 2 cookies and ate 5, how many left?"), "Jon only had 2 cookies. that does not add up.");
  n.stop();
});

test("non-math lines fall through to the existing behavior", () => {
  const n = boot();
  assert.equal(n.say("how are you"), "i am here.");
  assert.equal(n.say("why is the sky green"), "i do not know.");
  n.say("skip");
  /* solver state exists, but an unrelated how-many question still falls through honestly */
  assert.equal(n.say("Jon has 4 cookies and Mary took 2, how many are left?"), "Jon has 2 cookies left.");
  assert.equal(n.say("how many legs does a spider have"), "i do not know.");
  assert.equal(n.say("how many did mary take?"), "i do not know.");
  n.stop();
});

test("yes/no and what-is teach loops are untouched", () => {
  const n = boot();
  assert.equal(n.say("Jon has 4 cookies and Mary took 2, how many are left?"), "Jon has 2 cookies left.");
  assert.equal(n.say("can you count"), "yes or no?");
  assert.equal(n.say("yes"), "got it. next time i'll say: yes");
  assert.equal(n.say("can you count"), "yes");
  assert.equal(n.say("does jon have 2 cookies"), "yes or no?");
  n.say("skip");
  assert.equal(n.say("what is a cookie"), "i do not know cookie. what do you mean by it?");
  assert.equal(n.say("a sweet snack"), "got it. next time i'll say: a sweet snack");
  assert.equal(n.say("what is a cookie"), "a sweet snack");
  n.stop();
});

test("owner commands and plain math still win over the solver", () => {
  const n = boot();
  assert.equal(n.say("when i say jon ate 2 cookies say yum"), "lesson saved.");
  assert.equal(n.say("jon ate 2 cookies"), "yum");
  assert.equal(n.say("lock dozen as twelve things"), "locked dozen.");
  assert.equal(n.say("what is a dozen"), "twelve things");
  assert.equal(n.say("edit dozen as 12 eggs in a box"), "updated your meaning of dozen.");
  assert.equal(n.say("my dozen"), "12 eggs in a box");
  assert.equal(n.say("what is a dozen"), "twelve things", "locked meaning still wins");
  assert.equal(n.say("snack means 2 cookies i ate"), "saved your meaning.");
  assert.equal(n.say("read gift is 3 apples you got from a friend"), "saved 1 word.");
  assert.equal(n.say("what is 2 plus 2"), "4.");
  assert.equal(n.say("what is 25% of 200"), "50.");
  assert.equal(n.say("10 percent of 50"), "5.");
  assert.match(n.say("remember I live in Denver"), /^Got it\. Saved/);
  assert.match(n.say("what do you remember"), /Denver/);
  assert.match(n.say("start learning"), /^Learning ON/);
  assert.match(n.say("stop learning"), /^Learning OFF/);
  n.stop();
});

test("solved lines are not stored as lessons while learning is on", () => {
  const n = boot();
  n.say("start learning");
  const before = n.lessons().length;
  assert.equal(n.say("Jon has 4 cookies and Mary took 2, how many are left?"), "Jon has 2 cookies left.");
  assert.equal(n.say("how many are left?"), "Jon has 2 cookies left.");
  const keys = n.lessons().slice(before).map((l) => l.user);
  assert.ok(!keys.some((k) => /how many|cookies/.test(k)), JSON.stringify(keys));
  n.say("stop learning");
  n.stop();
});
