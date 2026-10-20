/* Jarvis contract: the Jarvis phone app loads /Nova-AI/?embed=jarvis in a hidden iframe and runs
   the code below inside Nova's window (copied from jarvis nova-bridge.js). If a Nova update renames
   or breaks any of these globals, Jarvis goes quiet; this test fails first. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { boot } from "./harness.mjs";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const ASK_SRC = '(function(line){' +
  'var prev=state.currentId, chat=null;' +
  'for(var i=0;i<state.conversations.length;i++){if(state.conversations[i].jarvis){chat=state.conversations[i];break;}}' +
  'if(!chat){chat=makeChat("Jarvis voice");chat.jarvis=true;state.conversations.push(chat);}' +
  'state.currentId=chat.id;' +
  'try{send(line);}finally{if(prev&&prev!==chat.id){state.currentId=prev;}save();}' +
  'var m=chat.messages[chat.messages.length-1];' +
  'return m&&m.role==="assistant"?String(m.content):"";' +
  '})';

// idb.js backs up on a 15 s setInterval; track and clear those timers so node can exit.
const timers = [];
const globals = { setInterval: (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; } };
const bootPage = () => boot({ files: pageScripts, globals });
const done = (n) => { n.stop(); timers.splice(0).forEach(clearInterval); };

// Boot the same scripts, in the same order, that index.html (the iframe page) loads.
const pageScripts = [...fs.readFileSync(path.join(WEB, "index.html"), "utf8").matchAll(/<script[^>]*src="([^"?]+)/g)]
  .map((m) => m[1]).filter((f) => fs.existsSync(path.join(WEB, f)));

test("index.html scripts boot and expose the globals the Jarvis bridge polls for", () => {
  assert.ok(pageScripts.includes("app.js"));
  const n = bootPage();
  const g = (s) => vm.runInContext(s, n.ctx);
  assert.equal(g("typeof send"), "function");
  assert.equal(g("typeof makeChat"), "function");
  assert.equal(g("typeof save"), "function");
  assert.equal(g("typeof state"), "object");
  assert.ok(Array.isArray(g("state.conversations")));
  assert.ok(n.ctx.NovaTrain, "window.NovaTrain");
  done(n);
});

test("bridge ask(): math, teach on 'i do not know', recall, chat restored", () => {
  const n = bootPage();
  const ask = vm.runInContext(ASK_SRC, n.ctx);
  const before = vm.runInContext("state.currentId", n.ctx);
  assert.equal(ask("what is 25% of 200"), "50.");
  assert.match(ask("what is a zorp"), /^i do not know zorp\. what do you mean by it\?/);
  assert.match(ask("a made up word"), /^got it/);
  assert.match(ask("what is a zorp"), /a made up word/);
  assert.equal(vm.runInContext("state.currentId", n.ctx), before, "user's own chat is restored");
  assert.equal(vm.runInContext("state.conversations.filter(c => c.jarvis).length", n.ctx), 1);
  done(n);
});

test("bridge ask(): a new question after 'i do not know' is not saved as the answer (v46)", () => {
  const n = bootPage();
  const ask = vm.runInContext(ASK_SRC, n.ctx);
  assert.match(ask("what is a zorp"), /^i do not know zorp\./);
  assert.doesNotMatch(ask("if all cats are animals and tom is a cat, is tom an animal"), /^got it|^saved/);
  assert.match(ask("what is a zorp"), /^i do not know zorp\./);
  assert.equal(ask("what is 25% of 200"), "50.");
  done(n);
});

test("bridge ask(): what is my favorite color reads the saved memory (v47)", () => {
  const n = bootPage();
  const ask = vm.runInContext(ASK_SRC, n.ctx);
  assert.match(ask("remember my favorite color is blue"), /^Got it\. Saved "favorite color"/);
  assert.equal(ask("what is my favorite color"), "your favorite color is blue.");
  done(n);
});

test("bridge ask(): 'should i ...' is not answered with 'yes or no?' (v48)", () => {
  const n = bootPage();
  const ask = vm.runInContext(ASK_SRC, n.ctx);
  assert.equal(ask("should i learn python or javascript first"), "i do not know.");
  assert.equal(ask("can you count"), "yes or no?");
  done(n);
});

test("bridge ask(): word problems use an ordered running total, cents and rates (v49)", () => {
  const n = bootPage();
  const ask = vm.runInContext(ASK_SRC, n.ctx);
  assert.equal(ask("if i have 3 apples and buy 5 more then eat 2 how many do i have"), "You have 6 apples now.");
  assert.equal(ask("a train goes 60 miles per hour for 2.5 hours. how far does it go?"), "That is 150 miles in 2.5 hours.");
  assert.equal(ask("Ann has 5 dollars and spends 2 dollars 50 cents. How much is left?"), "Ann has 2.50 dollars left.");
  assert.equal(ask("what is 25% of 200"), "50.");
  done(n);
});
