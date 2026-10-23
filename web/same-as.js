/* v52: "same as ...?" (self-learning feature 3). Needs self-learn.js (NovaSelf).
   Only on the leftover plain "i do not know." path, and only while self-learning is on: when the
   line shares most of its content words with one lesson the creator taught, Nova asks
   do you mean the same as "<lesson>"? yes or no?
   yes  -> saves an alias lesson with the taught answer, word for word (no you->I rewriting).
   no / skip -> remembers the pair and never asks it again.
   It never answers on a guess, never replaces "yes or no?" for yes/no questions or the what-is
   + Skip prompt, and asks at most one suggestion per line. */
(function (global) {
  var STORE = "nova-same-as-v1";
  var TTL = 10 * 60 * 1000;
  var STOP = {};
  ("a an the and or but of to in on at by for with from is am are was were be been do does did have has had " +
    "i me my you your he him his she her it its we us our they them their this that these those there here " +
    "what which who whom whose when where why how can could will would should shall may might must " +
    "tell about please just really so then now some any very much many").split(" ").forEach(function (w) { STOP[w] = 1; });

  function norm(s) { return String(s || "").toLowerCase().replace(/\u2019/g, "'").replace(/\s+/g, " ").trim().replace(/[?.!,\s]+$/, ""); }
  function words(s) {
    var out = {}, n = 0;
    norm(s).split(/[^a-z0-9']+/).forEach(function (w) { w = w.replace(/'/g, ""); if (w && !STOP[w] && !out[w]) { out[w] = 1; n++; } });
    return { set: out, n: n };
  }
  function load() { try { var o = JSON.parse(localStorage.getItem(STORE) || "null"); if (o && Array.isArray(o.no)) return o; } catch (e) {} return { no: [], pending: null }; }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function on() { return !!(global.NovaSelf && global.NovaSelf.isOn && global.NovaSelf.isOn()); }
  function log(t) { try { global.NovaSelf.log("same-as", t); } catch (e) {} }
  function pairKey(a, b) { return norm(a) + "\u0001" + norm(b); }

  /* Best lesson that shares most content words with the line; null if none is close enough. */
  function closest(text) {
    var L = global.NovaLookup, list = [], a = words(text), best = null, bestScore = 0, o = load(), i, b, k, shared, score;
    if (!a.n) return null;
    try { list = (L && L.lessons ? L.lessons() : []) || []; } catch (e) { list = []; }
    for (i = list.length - 1; i >= 0; i--) {
      if (!list[i] || !list[i].user || !list[i].nova) continue;
      if (norm(list[i].user) === norm(text)) continue;
      if (/^i (do not|don'?t) know/.test(String(list[i].nova).toLowerCase())) continue;
      if (o.no.indexOf(pairKey(text, list[i].user)) !== -1) continue;
      b = words(list[i].user);
      if (!b.n) continue;
      shared = 0;
      for (k in a.set) if (b.set[k]) shared++;
      score = shared / (a.n + b.n - shared);
      if (shared >= 1 && score >= 0.5 && score > bestScore) { best = list[i]; bestScore = score; }
    }
    return best;
  }

  function answer(text) {
    var o = load(), p = o.pending, q = norm(text), T = global.NovaTrain;
    if (!p) return null;
    o.pending = null; save(o);
    if (Date.now() - (p.at || 0) > TTL) return null;
    if (/^(yes|y|yeah|yep|yup|yea|sure|ok|okay|yes please)$/.test(q)) {
      if (!on()) return "self-learning is off, so i did not link them.";
      if (!T || typeof T.pushLesson !== "function" || !T.pushLesson(p.line, p.answer)) return "i could not save that.";
      log("you said \"" + p.line.slice(0, 60) + "\" means the same as \"" + p.target.slice(0, 60) + "\", so i linked them");
      return "ok. \"" + p.line + "\" now gets the same answer as \"" + p.target + "\".";
    }
    if (/^(no|n|nope|nah|no thanks|not really|different|skip|nevermind|never mind|cancel|forget it|not now)$/.test(q)) {
      o.no.push(pairKey(p.line, p.target));
      if (o.no.length > 300) o.no = o.no.slice(-300);
      save(o);
      log("you said \"" + p.line.slice(0, 60) + "\" is not the same as \"" + p.target.slice(0, 60) + "\"; i will not ask again");
      return "ok. i will not link them.";
    }
    return null; /* anything else: carry on normally */
  }

  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._same) return;
    var orig = T.learnPair;
    var g = function (user, nova) {
      if (/^(do you mean the same as "|ok\. i will not link them|self-learning is off, so i did not link)|now gets the same answer as "/.test(String(nova || "").toLowerCase())) return false;
      return orig.apply(this, arguments);
    };
    for (var k in orig) if (k.charAt(0) === "_") g[k] = orig[k];
    g._same = true;
    T.learnPair = g;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._same) return;
    var orig = reply;
    function wrapped(text) {
      var a = answer(text);
      if (a) return a;
      var out = orig.apply(this, arguments);
      if (out !== "i do not know." || !on()) return out;
      var hit = null;
      try { hit = closest(text); } catch (e) { hit = null; }
      if (!hit) return out;
      var o = load();
      o.pending = { line: String(text).replace(/\s+/g, " ").trim().replace(/[?.!,\s]+$/, ""), target: norm(hit.user), answer: hit.nova, at: Date.now() };
      save(o);
      try { if (global.NovaLookup && global.NovaLookup.clearPending) global.NovaLookup.clearPending(); } catch (e2) {}
      log("asked if \"" + o.pending.line.slice(0, 60) + "\" means the same as \"" + o.pending.target.slice(0, 60) + "\"");
      return "do you mean the same as \"" + o.pending.target + "\"? yes or no?";
    }
    for (var k in orig) if (k.charAt(0) === "_") wrapped[k] = orig[k];
    wrapped._same = true;
    reply = wrapped;
  }

  global.NovaSameAs = { closest: closest, load: load, STORE: STORE };
  guardLearn();
  wrapReply();
  if (global.document && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function () { guardLearn(); wrapReply(); });
  }
})(window);
