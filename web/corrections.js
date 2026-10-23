/* v51: correction tracking (self-learning feature 2). Needs self-learn.js (NovaSelf).
   Each reply gets a source tag (generate, lesson, other). When the creator explicitly corrects
   the last answer ("no, ...", "fix ...", "say ...", "the answer is ...") Nova counts it in
   nova-confidence-v1 for that question and writes it in the journal. A generated guess that was
   corrected is never said again for any question, and a question whose generated guesses were
   corrected twice gets no more guesses: Nova says "i do not know." there instead.
   This only ever makes Nova MORE careful. Counting needs self-learning on; the careful rules
   already learned keep working after "stop learning". Locked facts are never touched. */
(function (global) {
  var STORE = "nova-confidence-v1";
  var MAXQ = 200, MAXBAD = 200;
  var CORR = /^(no[,:]|fix[:\s]|say[:\s]|the answer is\b|you should say\b|reply[:\s]|answer[:\s]|tell them\b)/;
  var prev = null, curKey = null, lastGen = null;

  function norm(s) { return String(s || "").toLowerCase().replace(/\u2019/g, "'").replace(/\s+/g, " ").trim().replace(/[?.!,\s]+$/, ""); }
  function load() {
    try { var o = JSON.parse(localStorage.getItem(STORE) || "null"); if (o && o.q && Array.isArray(o.bad)) return o; } catch (e) {}
    return { q: {}, bad: [] };
  }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function on() { return !!(global.NovaSelf && global.NovaSelf.isOn && global.NovaSelf.isOn()); }
  function isUnknown(s) { return /^i (do not|don'?t|dont) know\b/.test(String(s || "").toLowerCase()); }

  function blocked(out) {
    var o = load(), a = norm(out);
    if (a && o.bad.indexOf(a) !== -1) return true;
    var e = curKey && o.q[curKey];
    return !!(e && (e.generate || 0) >= 2);
  }

  /* Watch generate() so a reply can be tagged, and refuse guesses that were corrected before. */
  function install() {
    var T = global.NovaTrain;
    if (!T || typeof T.generate !== "function" || T.generate._conf) return;
    var orig = T.generate;
    var g = function () {
      var out = orig.apply(this, arguments);
      if (typeof out === "string" && blocked(out)) return "";
      lastGen = typeof out === "string" ? norm(out) : null;
      return out;
    };
    g._conf = true;
    T.generate = g;
  }

  function sourceOf(out) {
    var a = norm(out), T = global.NovaTrain, L = global.NovaLookup, list = [], i;
    if (lastGen && a === lastGen) return "generate";
    try { list = (L && L.lessons ? L.lessons() : []) || []; } catch (e) { list = []; }
    for (i = 0; i < list.length; i++) if (list[i] && norm(list[i].nova) === a) return "lesson";
    return "other";
  }

  function record(p) {
    var o = load(), e = o.q[p.key] || { count: 0, generate: 0, last: 0, line: p.user.slice(0, 120) };
    e.count += 1;
    if (p.source === "generate") {
      e.generate = (e.generate || 0) + 1;
      if (o.bad.indexOf(norm(p.reply)) === -1) o.bad.push(norm(p.reply));
      if (o.bad.length > MAXBAD) o.bad = o.bad.slice(-MAXBAD);
    }
    e.last = Date.now();
    o.q[p.key] = e;
    var keys = Object.keys(o.q);
    if (keys.length > MAXQ) {
      keys.sort(function (a, b) { return o.q[a].last - o.q[b].last; });
      delete o.q[keys[0]];
    }
    save(o);
    var what = p.source === "generate" ? "a guess" : p.source === "lesson" ? "a lesson" : "an answer";
    try {
      global.NovaSelf.log("correction", "you corrected my answer to \"" + p.user.slice(0, 60) + "\" (" + what + ": \"" + String(p.reply).slice(0, 60) + "\")" +
        (p.source === "generate" ? "; i will not guess that again" : ""));
    } catch (x) {}
  }

  function command(text) {
    var q = norm(text);
    if (/^(what are you unsure about|what are you not sure about|what are you unsure of|where are you weak|what do you get wrong)$/.test(q)) {
      var o = load(), top = Object.keys(o.q).map(function (k) { return o.q[k]; })
        .sort(function (a, b) { return b.count - a.count || b.last - a.last; }).slice(0, 5);
      if (!top.length) return "nothing yet. you have not corrected me.";
      return "you corrected me on: " + top.map(function (e) { return "\"" + e.line + "\"" + (e.count > 1 ? " (" + e.count + " times)" : ""); }).join(", ") + ".";
    }
    if (/^(clear corrections|forget corrections)$/.test(q)) { save({ q: {}, bad: [] }); return "ok. correction notes cleared."; }
    return null;
  }

  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._conf) return;
    var orig = T.learnPair;
    var g = function (user, nova) {
      if (/^(nothing yet\. you have not corrected me|you corrected me on:|ok\. correction notes cleared)/.test(String(nova || "").toLowerCase())) return false;
      return orig.apply(this, arguments);
    };
    for (var k in orig) if (k.charAt(0) === "_") g[k] = orig[k];
    g._conf = true;
    T.learnPair = g;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._conf) return;
    var orig = reply;
    function wrapped(text) {
      install();
      var cmd = command(text);
      if (cmd) { prev = null; return cmd; }
      var q = norm(text), p = prev;
      var isCorr = CORR.test(q) && p && !isUnknown(p.reply) && !/\?$/.test(p.reply);
      curKey = q; lastGen = null;
      var out = orig.apply(this, arguments);
      if (isCorr && /^(lesson saved|got it)/.test(String(out).toLowerCase()) && on()) {
        try { record(p); } catch (e) {}
      }
      prev = typeof out === "string" ? { user: String(text), key: norm(text), reply: out, source: sourceOf(out) } : null;
      curKey = null; lastGen = null;
      return out;
    }
    for (var k in orig) if (k.charAt(0) === "_") wrapped[k] = orig[k];
    wrapped._conf = true;
    reply = wrapped;
  }

  global.NovaConfidence = { load: load, command: command, install: install, STORE: STORE };
  install();
  guardLearn();
  wrapReply();
  if (global.document && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function () { install(); guardLearn(); wrapReply(); });
  }
})(window);
