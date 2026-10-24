/* v53: self-practice (self-learning feature 4). Needs self-learn.js (NovaSelf) and math-misses.js.
   Nova makes up its own math and word problems with known answers, solves them with its own
   solvers (novaMath, NovaWordMath), checks itself, and logs every miss to the math-misses list
   (marked "practice") and the journal. It never patches its own solver and never trains on its
   own output: misses are only a list for the creator. The creator's word-problem session is saved
   and restored around each quiz, so replies are not affected.
   Runs on "practice math" / "quiz yourself", or by itself when Nova is open, on screen and idle
   for 2 minutes (at most every 30 minutes). Only while self-learning is on. */
(function (global) {
  var IDLE = 2 * 60 * 1000, GAP = 30 * 60 * 1000, N = 20;
  var lastInput = Date.now(), lastRun = 0;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var NAMES = ["Jon", "Mary", "Sam", "Ann", "Tom", "Lily", "Ben", "Zoe"];
  var OBJ = [["apple", "apples"], ["cookie", "cookies"], ["pencil", "pencils"], ["marble", "marbles"], ["card", "cards"], ["book", "books"]];
  var BOX = ["bags", "boxes", "packs", "jars"];
  var PEOPLE = [["kid", "kids"], ["friend", "friends"], ["student", "students"]];
  function cnt(n, o) { return n + " " + (n === 1 ? o[0] : o[1]); }

  /* Each shape returns [problem, expected reply, kind]. "compare" is a stretch shape the solver
     may not read yet; a miss there is honest information for the creator. */
  function shapes(R) {
    function int(lo, hi) { return lo + Math.floor(R() * (hi - lo + 1)); }
    function pick(a) { return a[Math.floor(R() * a.length)]; }
    return {
      add: function () { var nm = pick(NAMES), o = pick(OBJ), a = int(2, 40), b = int(1, 40);
        return [nm + " has " + a + " " + o[1] + " and finds " + b + " more. how many now?", nm + " has " + cnt(a + b, o) + " now.", "word"]; },
      sub: function () { var nm = pick(NAMES), o = pick(OBJ), a = int(2, 50), b = int(1, a - 1);
        return [nm + " has " + a + " " + o[1] + " and lost " + b + ". How many are left?", nm + " has " + cnt(a - b, o) + " left.", "word"]; },
      mul: function () { var nm = pick(NAMES), o = pick(OBJ), a = int(2, 9), b = int(2, 9);
        return [nm + " has " + a + " " + pick(BOX) + " with " + b + " " + o[1] + " each. How many " + o[1] + " does " + nm + " have?", nm + " has " + cnt(a * b, o) + ".", "word"]; },
      div: function () { var o = pick(OBJ), p = pick(PEOPLE), k = int(2, 9), q = int(1, 9);
        return [(k * q) + " " + o[1] + " shared equally among " + k + " " + p[1] + ". How many does each " + p[0] + " get?", "Each " + p[0] + " gets " + cnt(q, o) + ".", "word"]; },
      plain: function () { var a = int(1, 99), b = int(1, 99);
        return ["what is " + a + " plus " + b, (a + b) + ".", "math"]; },
      percent: function () { var p = pick([10, 20, 25, 50]), m = int(1, 40) * 10;
        return ["what is " + p + "% of " + m, String(p * m / 100) + ".", "math"]; },
      compare: function () { var a = pick(NAMES), b = pick(NAMES.filter(function (x) { return x !== a; })), o = pick(OBJ), x = int(1, 20), y = x + int(1, 20);
        return [a + " has " + x + " " + o[1] + " and " + b + " has " + y + " " + o[1] + ". how many more does " + b + " have than " + a + "?", b + " has " + cnt(y - x, o) + " more.", "word"]; }
    };
  }

  function on() { return !!(global.NovaSelf && global.NovaSelf.isOn && global.NovaSelf.isOn()); }

  function solveOne(p) {
    var WM = global.NovaWordMath, out = null;
    if (p[2] === "math" && typeof global.novaMath === "function") {
      try { out = global.novaMath(p[0]); } catch (e) { out = null; }
      return out;
    }
    if (!WM || typeof WM.solve !== "function") return null;
    try { WM.reset(); out = WM.solve(p[0]); } catch (e2) { out = null; }
    return out;
  }

  function run(n, seed) {
    if (!on()) return null;
    var R = rng(seed == null ? (Date.now() & 0x7fffffff) : seed), S = shapes(R), keys = Object.keys(S);
    var WM = global.NovaWordMath, snap = WM && WM.snapshot ? WM.snapshot() : null, res = { right: 0, wrong: 0, none: 0, misses: [] }, i, p, out;
    n = n || N;
    try {
      for (i = 0; i < n; i++) {
        p = S[keys[i % keys.length]]();
        out = solveOne(p);
        if (out && String(out).trim() === p[1]) { res.right++; continue; }
        if (out) res.wrong++; else res.none++;
        res.misses.push({ line: p[0], expected: p[1], got: out || null });
        try { if (global.NovaMathMisses) global.NovaMathMisses.record(p[0], "(practice) " + (out ? "said: " + out : "could not solve") + "; expected: " + p[1]); } catch (e3) {}
      }
    } finally {
      if (WM && WM.restore && snap) WM.restore(snap);
    }
    lastRun = Date.now();
    try {
      global.NovaSelf.log("practice", "practiced " + n + " math problems: " + res.right + " right" +
        (res.wrong ? ", " + res.wrong + " wrong" : "") + (res.none ? ", " + res.none + " i could not do" : "") +
        (res.misses.length ? " (saved in math misses)" : ""));
    } catch (e4) {}
    return res;
  }

  function summary(res, n) {
    var s = "i practiced " + n + " math problems i made up: " + res.right + " right";
    if (res.wrong) s += ", " + res.wrong + " wrong";
    if (res.none) s += ", " + res.none + " i could not do";
    s += ".";
    if (res.misses.length) s += " say \"math misses\" to see them.";
    return s;
  }

  function command(text) {
    var q = String(text || "").toLowerCase().replace(/[?.!,\s]+$/, "").replace(/\s+/g, " ").trim();
    if (!/^(practice math|practice|practice now|quiz yourself|test yourself|do some practice)$/.test(q)) return null;
    if (!on()) return "self-learning is off. say \"learn on your own\" first.";
    var res = run(N);
    return summary(res, N);
  }

  function idleTick() {
    if (!on()) return;
    if (global.document && global.document.hidden === true) return;
    var now = Date.now();
    if (now - lastInput < IDLE || now - lastRun < GAP) return;
    run(N);
  }

  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._practice) return;
    var orig = T.learnPair;
    var g = function (user, nova) {
      if (/^(i practiced \d+ math problems|self-learning is off\. say)/.test(String(nova || "").toLowerCase())) return false;
      return orig.apply(this, arguments);
    };
    for (var k in orig) if (k.charAt(0) === "_") g[k] = orig[k];
    g._practice = true;
    T.learnPair = g;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._practice) return;
    var orig = reply;
    function wrapped(text) {
      lastInput = Date.now();
      var cmd = command(text);
      if (cmd) return cmd;
      return orig.apply(this, arguments);
    }
    for (var k in orig) if (k.charAt(0) === "_") wrapped[k] = orig[k];
    wrapped._practice = true;
    reply = wrapped;
  }

  global.NovaPractice = { run: run, shapes: shapes, idleTick: idleTick, _setLastInput: function (t) { lastInput = t; }, _setLastRun: function (t) { lastRun = t; } };
  guardLearn();
  wrapReply();
  var timer = setInterval(idleTick, 30000);
  if (timer && timer.unref) timer.unref();
  if (global.document && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function () { guardLearn(); wrapReply(); });
  }
})(window);
