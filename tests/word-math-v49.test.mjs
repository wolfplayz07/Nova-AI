/* v49: ordered running total, dollars and cents, simple rates. Repros from nova_qa.json. */
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./harness.mjs";

test("QA repro: 3 apples, buy 5 more, then eat 2 gives 6", () => {
  const n = boot();
  assert.equal(n.say("if i have 3 apples and buy 5 more then eat 2 how many do i have"), "You have 6 apples now.");
  assert.equal(n.say("I have 3 apples and buy 5 more, how many?"), "You have 8 apples now.");
  assert.equal(n.say("Jon has 10 cards, gives 3 to Mary, then finds 4. how many does Jon have?"), "Jon has 11 cards now.");
  n.stop();
});

test("QA repro: a train goes 60 miles per hour for 2.5 hours", () => {
  const n = boot();
  assert.equal(n.say("a train goes 60 miles per hour for 2.5 hours. how far does it go?"), "That is 150 miles in 2.5 hours.");
  assert.equal(n.say("it earns 2.5 per hour for 3 hours, how much in total?"), "That is 7.5 in 3 hours.");
  assert.equal(n.say("she reads 20 pages each day for 7 days. how many pages?"), "That is 140 pages in 7 days.");
  assert.equal(n.say("he earns 8 dollars an hour for 5 hours, how much in total?"), "That is 40 dollars in 5 hours.");
  assert.equal(n.say("a car goes 50 miles per hour for 2 days, how far?"), "i do not know.", "units differ: no guess");
  n.stop();
});

test("dollars and cents", () => {
  const n = boot();
  assert.equal(n.say("Ann has 5 dollars and spends 2 dollars 50 cents. How much is left?"), "Ann has 2.50 dollars left.");
  assert.equal(n.say("Tom has $10 and buys a toy for $3.75. how much is left?"), "Tom has 6.25 dollars left.");
  assert.equal(n.say("I have 4 dollars and find 75 cents. how much do i have?"), "You have 4.75 dollars now.");
  assert.equal(n.say("Sam has $2 and spends $5, how much is left?"), "Sam only had 2 dollars. that does not add up.");
  n.stop();
});

test("decimals in plain stories and earlier shapes unchanged", () => {
  const n = boot();
  assert.equal(n.say("Lily has 2.5 pies and eats 1.5, how many are left?"), "Lily has 1 pie left.");
  assert.equal(n.say("Jon has 4 cookies and Mary gives him 3, how many now?"), "Jon has 7 cookies now.");
  assert.equal(n.say("13 cookies split between 2 kids"), "Each kid gets 6 cookies. 1 cookie is left over.");
  assert.equal(n.say("Ann has 1 eggs and Mary gives her 41, how many now?"), "Ann has 42 eggs now.");
  assert.equal(n.say("what is 17 times 23"), "391.");
  n.stop();
});
