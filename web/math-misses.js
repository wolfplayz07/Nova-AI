/* v45: math-misses log. A line that looks like a word problem (a number plus a math cue such as
   "how many", "left", "each", "percent") but that neither plain math (novaMath) nor the word-problem
   solver (novaWordMath) answered is kept on this phone in localStorage, with a count and the time.
   It is only a list for the creator to read: Nova never changes its own solver from it, and it
   never changes a reply. Nothing is logged after "stop learning" (the same remembered switch the
   v44 dictionary uses) until "start learning". */
(function (global) {
  var STORE = "nova-math-misses-v1";
  var NOSAVE = "nova-dict-nosave-v1"; /* set by "stop learning", cleared by "start learning" (dict.js) */
  var MAX = 50;
  var NUMWORD = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|" +
    "sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|half";
  var HAS_NUM = new RegExp("\\d|\\b(" + NUMWORD + ")\\b");
  var CUE = /\bhow (many|much)\b|\b(left|left over|leftover|each|total|altogether|in all|remain|remaining|percent|times|divided|split|shared?|per|more than|less than|fewer than|twice|double|half of)\b|%/;

  function norm(s) { return String(s || "").toLowerCase().replace(/\u2019/g, "'").replace(/\s+/g, " ").trim(); }

  function looksLikeProblem(text) {
    var q = norm(text);
    if (!q || q.length > 240) return false;
    /* Owner teach commands are not problems, even with numbers in them. */
    if (/^(when i say|lock |edit |define |teach |read |remember|fix[:\s]|no[,:]|say[:\s]|the answer is)/.test(q) || /\bmeans\b/.test(q)) return false;
    return HAS_NUM.test(q) && CUE.test(q);
  }

  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE) || "null");
      return o && Array.isArray(o.misses) ? o : { misses: [] };
    } catch (e) { return { misses: [] }; }
  }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }

  function logging() {
    try { return localStorage.getItem(NOSAVE) !== "1"; } catch (e) { return false; }
  }

  function record(text, answer) {
    if (!logging()) return false;
    var line = String(text || "").replace(/\s+/g, " ").trim(), key = norm(text).replace(/[?.!,\s]+$/, ""), o = load(), i, e;
    if (line.length > 160) line = line.slice(0, 157) + "...";
    for (i = 0; i < o.misses.length; i++) {
      if (o.misses[i].key === key) { e = o.misses.splice(i, 1)[0]; break; }
    }
    e = e || { key: key, line: line, count: 0, firstSeen: Date.now() };
    e.count += 1;
    e.lastSeen = Date.now();
    e.reply = String(answer || "").slice(0, 80);
    o.misses.push(e);
    if (o.misses.length > MAX) o.misses = o.misses.slice(-MAX);
    save(o);
    return true;
  }

  function list() { return load().misses.slice().reverse(); }

  function command(text) {
    var q = norm(text).replace(/[?.!,\s]+$/, "");
    if (/^(math misses|show math misses|list math misses|what math couldn'?t you do|what math could you not do|what math can'?t you do|what math can you not do)$/.test(q)) {
      var top = list().slice(0, 10);
      if (!top.length) return "no math misses yet.";
      return "math i could not do yet: " + top.map(function (m) {
        return "\"" + m.line + "\"" + (m.count > 1 ? " (" + m.count + ")" : "");
      }).join(", ") + ".";
    }
    if (/^(clear math misses|forget math misses)$/.test(q)) {
      save({ misses: [] });
      return "ok. math misses cleared.";
    }
    return null;
  }

  /* A line typed as the answer to "i do not know" / "yes or no?" is a teach, not a problem. */
  function pendingTeach() {
    var L = global.NovaLookup, T = global.NovaTrain, p = null;
    try { p = L && L.getPending ? L.getPending() : null; } catch (e) { p = null; }
    if (p && Date.now() - (p.at || 0) <= 10 * 60 * 1000) return true;
    try { if (T && T.pendingQuestion && T.pendingQuestion()) return true; } catch (e2) {}
    return false;
  }

  /* Watch the solver this turn without calling it a second time (word-math keeps session state). */
  var wordHit = false;
  function watchWordMath() {
    var f = global.novaWordMath;
    if (typeof f !== "function" || f._misses) return;
    var g = function () {
      var out = f.apply(this, arguments);
      if (out) wordHit = true;
      return out;
    };
    g._misses = true;
    global.novaWordMath = g;
  }

  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._misses) return;
    var orig = T.learnPair;
    var g = function (user, nova) {
      if (/^(math i could not do yet|no math misses yet|ok\. math misses cleared)/.test(String(nova || "").toLowerCase())) return false;
      return orig.apply(this, arguments);
    };
    g._misses = true;
    g._dict = orig._dict;
    g._wordMath = orig._wordMath;
    T.learnPair = g;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._misses) return;
    var orig = reply;
    function wrapped(text) {
      var cmd = command(text);
      if (cmd) return cmd;
      /* After "i do not know" a plain line is the creator's answer; a new how-many question is not. */
      var problem = looksLikeProblem(text) && (/\?|\bhow (many|much)\b/.test(norm(text)) || !pendingTeach()), plain = null;
      if (problem && typeof global.novaMath === "function") {
        try { plain = global.novaMath(text); } catch (e) { plain = null; } /* pure: no state */
      }
      wordHit = false;
      var out = orig.apply(this, arguments);
      if (problem && !plain && !wordHit) { try { record(text, out); } catch (e2) {} }
      wordHit = false;
      return out;
    }
    wrapped._misses = true;
    wrapped._dict = orig._dict;
    wrapped._math = orig._math;
    wrapped._newWords = orig._newWords;
    reply = wrapped;
  }

  global.NovaMathMisses = { list: list, record: record, looksLikeProblem: looksLikeProblem, command: command, STORE: STORE };
  watchWordMath();
  guardLearn();
  wrapReply();
  if (global.document && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function () { watchWordMath(); guardLearn(); wrapReply(); });
  }
})(window);
