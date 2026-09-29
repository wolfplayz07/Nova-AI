/* Node harness: boots the real web/*.js scripts in a vm context with a localStorage shim
   and a do-nothing DOM, then drives the same send() path the iPhone uses. */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");

function makeEl() {
  const data = {};
  return new Proxy(function () {}, {
    get(_, p) {
      if (p in data) return data[p];
      if (p === Symbol.toPrimitive) return () => "";
      if (p === "then") return undefined;
      if (p === "hidden") return false;
      if (p === "querySelectorAll") return () => [];
      const child = makeEl();
      data[p] = child;
      return child;
    },
    set(_, p, v) { data[p] = v; return true; },
    apply() { return makeEl(); }
  });
}

export function boot(opts = {}) {
  const files = opts.files || ["train.js", "lookup.js", "app.js", "math-boot.js"];
  const mem = new Map(Object.entries(opts.seed || {}));
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear()
  };
  const ready = [];
  const document = makeEl();
  document.hidden = false;
  document.addEventListener = (type, fn) => { if (type === "DOMContentLoaded") ready.push(fn); };
  document.getElementById = () => makeEl();
  document.createElement = () => makeEl();
  document.querySelectorAll = () => [];
  const ctx = {
    console, localStorage, document, setTimeout, clearTimeout, setInterval, clearInterval,
    Blob, URL, Promise, JSON, Math, Date, Float32Array,
    navigator: { language: "en-US" },
    alert() {}, confirm() { return true; }, prompt() { return null; }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(WEB, f), "utf8"), ctx, { filename: f });
  }
  ready.forEach((fn) => fn());

  const hasApp = files.includes("app.js");
  function say(text) {
    if (!hasApp) return ctx.NovaTrain.handleUser(text) || ctx.NovaTrain.talk(text);
    ctx.__line = text;
    vm.runInContext("send(__line)", ctx);
    const msgs = vm.runInContext("currentChat().messages", ctx);
    return msgs[msgs.length - 1].content;
  }
  function lessons() {
    const p = JSON.parse(localStorage.getItem("nova-tiny-brain-v7") || "{}");
    return Array.isArray(p.lessons) ? p.lessons : [];
  }
  function stop() { try { ctx.NovaTrain.pause(); } catch (e) {} }
  return { ctx, say, lessons, localStorage, stop, T: () => ctx.NovaTrain };
}
