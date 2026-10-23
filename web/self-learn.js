/* v50: self-learning off switch + journal + auto-looked-up words.
   - One saved switch, nova-self-learn-v1. OFF by default. "learn on your own" turns it on.
     "stop learning" turns it (and every self-learning feature) off; it stays off across relaunches
     until "start learning" or "learn on your own".
   - Every self-learning action is written to a short local journal (nova-self-journal-v1).
     "what did you learn on your own" reads it back. Nothing happens silently.
   - Auto words: while on, a word the creator has said 2+ times that Nova does not know is looked
     up (one per turn) in the offline WordNet dictionary (dict.js) and the meaning is kept in
     nova-self-words-v1 as "the dictionary's meaning", never as the creator's. At a calm moment
     (at most once a day, 20+ turns apart) Nova adds one "by the way" line after its real reply
     and asks if it should remember that meaning. Only an explicit yes saves it (dict.js path).
     "skip"/no snoozes that word for 7 days. "don't ask me words" stops the asking.
   Everything stays on this phone. No network beyond the same-origin dictionary files. */
(function (global) {
  var STORE = "nova-self-learn-v1";
  var JOURNAL = "nova-self-journal-v1";
  var WORDS = "nova-self-words-v1";
  var JMAX = 100;
  var DAY = 24 * 60 * 60 * 1000;
  var ASK_GAP_TURNS = 20;
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  var api = { now: function () { return Date.now(); } };

  function read(k, d) {
    try { var o = JSON.parse(localStorage.getItem(k) || "null"); return o && typeof o === "object" ? o : d; }
    catch (e) { return d; }
  }
  function write(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }
  function norm(s) { return String(s || "").toLowerCase().replace(/\u2019/g, "'").replace(/\s+/g, " ").trim().replace(/[?.!,\s]+$/, ""); }

  function settings() {
    var s = read(STORE, null) || {};
    return { on: !!s.on, wasOn: !!s.wasOn, ask: s.ask !== false, turn: s.turn || 0, lastAsk: s.lastAsk || null, snooze: s.snooze || {} };
  }
  function saveSettings(s) { write(STORE, s); }
  function isOn() { return settings().on; }

  function log(kind, text) {
    var j = read(JOURNAL, null);
    j = j && Array.isArray(j.entries) ? j : { entries: [] };
    j.entries.push({ at: api.now(), kind: kind, text: String(text || "").slice(0, 200) });
    if (j.entries.length > JMAX) j.entries = j.entries.slice(-JMAX);
    write(JOURNAL, j);
  }
  function entries() { var j = read(JOURNAL, null); return j && Array.isArray(j.entries) ? j.entries.slice() : []; }
  function day(t) { var d = new Date(t); return MONTHS[d.getMonth()] + " " + d.getDate(); }

  function journalReply() {
    var e = entries().slice(-8).reverse();
    var state = "self-learning is " + (isOn() ? "on" : "off") + ".";
    if (!e.length) return "my journal is empty. " + state + (isOn() ? "" : " say \"learn on your own\" to turn it on.");
    return "here is what i did on my own (newest first): " + e.map(function (x) { return day(x.at) + ": " + x.text; }).join("; ") + ". " + state;
  }

  var STOP_RE = /^(pause|stop|pause train|stop train|stop training|stop learning|pause learning|stop learn)$/;
  var START_RE = /^(train|train a little|start training|start learning|learn from me|start learn|learn)$/;

  function command(text) {
    var q = norm(text), s;
    if (/^(learn on your own|learn by yourself|teach yourself|start self learning|start self-learning|turn on self learning|turn on self-learning)$/.test(q)) {
      s = settings();
      if (!s.on) log("switch", "self-learning turned on");
      s.on = true; s.wasOn = false;
      saveSettings(s);
      return "ok. self-learning is on. say \"what did you learn on your own\" to see my journal, or \"stop learning\" to turn it off.";
    }
    if (/^(self learning status|self-learning status|are you learning on your own|is self learning on|is self-learning on)$/.test(q)) {
      return "self-learning " + (isOn() ? "on" : "off") + ".";
    }
    if (/^(what did you learn on your own|what have you learned on your own|what have you learnt on your own|what did you learn by yourself|show journal|show your journal|your journal|self learning journal|self-learning journal)$/.test(q)) {
      return journalReply();
    }
    if (/^(clear journal|clear your journal|forget journal)$/.test(q)) {
      write(JOURNAL, { entries: [] });
      return "ok. journal cleared.";
    }
    if (/^(don'?t ask me words|do not ask me words|stop asking me words|stop asking about words)$/.test(q)) {
      s = settings(); s.ask = false; saveSettings(s);
      if (s.on) log("switch", "stopped asking about words (you asked)");
      return "ok. i will not ask you about words. i can still look them up.";
    }
    if (/^(ask me words|you can ask me words|ask me about words)$/.test(q)) {
      s = settings(); s.ask = true; saveSettings(s);
      return "ok. i may ask about a word now and then, at most once a day.";
    }
    return null;
  }

  /* "stop learning"/"start learning" keep their normal reply; this only flips the remembered switch. */
  function learnSwitch(text) {
    var q = norm(text), s = settings();
    if (STOP_RE.test(q) && s.on) { s.on = false; s.wasOn = true; saveSettings(s); log("switch", "self-learning turned off (stop learning)"); }
    else if (START_RE.test(q) && s.wasOn && !s.on) { s.on = true; s.wasOn = false; saveSettings(s); log("switch", "self-learning turned back on (start learning)"); }
  }

  /* ---- auto words ---- */
  function wordStore() { var o = read(WORDS, null); return o && o.words ? o : { words: {} }; }
  function lookupOne() {
    var NW = global.NovaNewWords, D = global.NovaDict, list, i, w, o, e, rec;
    if (!NW || !D || typeof NW.list !== "function" || typeof D.entry !== "function") return null;
    try { list = NW.list(); } catch (x) { return null; }
    o = wordStore();
    for (i = 0; i < list.length; i++) {
      w = list[i].word;
      if (list[i].count < 2) continue;
      rec = o.words[w];
      if (rec && (rec.found || api.now() - (rec.at || 0) < DAY)) continue;
      try { e = D.entry(w); } catch (x2) { e = null; }
      if (e && e.senses && e.senses[0]) {
        o.words[w] = { found: true, base: e.word, pos: e.senses[0][0], meaning: String(e.senses[0][1] || "").replace(/[.\s]+$/, ""), at: api.now() };
        log("lookup", "looked up \"" + w + "\" in my dictionary: " + o.words[w].meaning);
      } else {
        o.words[w] = { found: false, at: api.now() };
        log("lookup", "could not find \"" + w + "\" in my dictionary");
      }
      write(WORDS, o);
      return w; /* one lookup per turn */
    }
    return null;
  }

  function calm(text, out) {
    var o = String(out || "").toLowerCase(), q = norm(text), L = global.NovaLookup, T = global.NovaTrain, D = global.NovaDict, p;
    if (!o || /^i do not know|^i don'?t know|yes or no\?$|what do you mean|want me to remember it\?$|\?$/.test(o)) return false;
    if (/\d/.test(q) || /\d/.test(o)) return false; /* math or word problems */
    if (/^(when i say|lock |edit |define |teach |read |remember|fix[:\s]|no[,:]|say[:\s]|the answer is|my |skip|cancel|never ?mind|forget)/.test(q)) return false;
    if (/^(got it|lesson saved|saved|locked|updated|ok\.|learning|added reading)/.test(o)) return false;
    try { p = L && L.getPending ? L.getPending() : null; } catch (e) { p = null; }
    if (p && api.now() - (p.at || 0) <= 10 * 60 * 1000) return false;
    try { if (T && T.pendingQuestion && T.pendingQuestion()) return false; } catch (e2) {}
    try { if (D && D.readOffer && D.readOffer()) return false; } catch (e3) {}
    return true;
  }

  function maybeAsk(text, out) {
    var s = settings(), o, NW = global.NovaNewWords, D = global.NovaDict, counts = {}, w, ask, list;
    if (!s.ask || !D || typeof D.offer !== "function" || !D.saving || !D.saving()) return null;
    if (s.lastAsk && (api.now() - s.lastAsk.at < DAY || s.turn - s.lastAsk.turn < ASK_GAP_TURNS)) return null;
    if (!calm(text, out)) return null;
    try { list = NW.list(); } catch (e) { return null; }
    list.forEach(function (r) { counts[r.word] = r.count; });
    o = wordStore();
    for (w in o.words) {
      if (!o.words[w].found || o.words[w].asked || !counts[w] || counts[w] < 2) continue;
      if (s.snooze[w] && api.now() < s.snooze[w]) continue;
      try { ask = D.offer(w, "by the way, you have said \"" + w + "\" " + counts[w] + " times. "); } catch (e2) { ask = null; }
      if (!ask) continue;
      o.words[w].asked = api.now();
      write(WORDS, o);
      s.lastAsk = { word: w, at: api.now(), turn: s.turn, open: true };
      saveSettings(s);
      log("ask", "asked you what \"" + w + "\" means");
      return ask + " (skip is fine)";
    }
    return null;
  }

  function answerAsk(text) {
    var s = settings(), q = norm(text);
    if (!s.lastAsk || !s.lastAsk.open) return;
    var w = s.lastAsk.word;
    s.lastAsk.open = false;
    if (/^(no|n|nope|nah|no thanks|no thank you|dont|don't|do not|skip|nevermind|never mind|cancel|forget it|not now)$/.test(q)) {
      s.snooze[w] = api.now() + 7 * DAY;
      log("ask", "you skipped \"" + w + "\"; i will not ask again for 7 days");
    } else if (/^(yes|y|yeah|yep|yup|yea|sure|ok|okay|yes please|please|remember it|save it|remember that|save that|do it)$/.test(q)) {
      log("ask", "you said yes, so i saved the meaning of \"" + w + "\"");
    }
    saveSettings(s);
  }

  var TAIL = "\nby the way, ";
  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._self) return;
    var orig = T.learnPair;
    var g = function (user, nova) {
      var n = String(nova || ""), i = n.indexOf(TAIL);
      if (/^(ok\. self-learning|self-learning (on|off)|my journal is empty|here is what i did on my own|ok\. journal cleared|ok\. i will not ask you about words|ok\. i may ask about a word)/.test(n.toLowerCase())) return false;
      if (i !== -1) { var a = [].slice.call(arguments); a[1] = n.slice(0, i); return orig.apply(this, a); }
      return orig.apply(this, arguments);
    };
    for (var k in orig) if (k.charAt(0) === "_") g[k] = orig[k];
    g._self = true;
    T.learnPair = g;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._self) return;
    var orig = reply;
    function wrapped(text) {
      var cmd = command(text);
      if (cmd) return cmd;
      answerAsk(text);
      learnSwitch(text);
      var out = orig.apply(this, arguments);
      if (/^(train status|brain status)$/.test(norm(text)) && typeof out === "string") out += " Self-learning: " + (isOn() ? "on" : "off") + ".";
      if (!isOn() || typeof out !== "string") return out;
      var s = settings(); s.turn += 1; saveSettings(s);
      try { lookupOne(); } catch (e) {}
      var ask = null;
      try { ask = maybeAsk(text, out); } catch (e2) { ask = null; }
      return ask ? out + TAIL + ask.replace(/^by the way, /, "") : out;
    }
    for (var k in orig) if (k.charAt(0) === "_") wrapped[k] = orig[k];
    wrapped._self = true;
    reply = wrapped;
  }

  api.isOn = isOn;
  api.log = log;
  api.entries = entries;
  api.settings = settings;
  api.command = command;
  api.words = function () { return wordStore().words; };
  api.STORE = STORE; api.JOURNAL = JOURNAL; api.WORDS = WORDS;
  global.NovaSelf = api;
  guardLearn();
  wrapReply();
  if (global.document && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function () { guardLearn(); wrapReply(); });
  }
})(window);
