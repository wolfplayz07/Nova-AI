/* Rule table first. User meanings are editable. Locked meanings are not. */
(function (global) {
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
  var STORE = "nova-tiny-brain-v7";
  var FACTS = "nova-facts-v1";
  var PENDING = "nova-pending-teach-v1";
  var stoi = {};
  var i;
  for (i = 0; i < ALPHA.length; i++) stoi[ALPHA.charAt(i)] = i;

  var CANNED = [
    { user: "hello", nova: "hey." },
    { user: "hi", nova: "hey." },
    { user: "hey", nova: "hey." },
    { user: "who are you", nova: "i am nova." },
    { user: "what are you", nova: "i am nova." },
    { user: "are you nova", nova: "yes. i am nova." },
    { user: "what is your name", nova: "nova." },
    { user: "whats your name", nova: "nova." },
    { user: "say your name", nova: "nova." },
    { user: "how are you", nova: "i am here." },
    { user: "are you ok", nova: "yes." },
    { user: "are you there", nova: "i am here." },
    { user: "you there", nova: "i am here." },
    { user: "can you hear me", nova: "yes." },
    { user: "good morning", nova: "good morning." },
    { user: "good night", nova: "good night." },
    { user: "goodbye", nova: "bye." },
    { user: "bye", nova: "bye." },
    { user: "thanks", nova: "you are welcome." },
    { user: "thank you", nova: "you are welcome." },
    { user: "where do you live", nova: "on this phone." },
    { user: "do you live here", nova: "yes. on this phone." },
    { user: "leave this phone", nova: "no." },
    { user: "can you leave this phone", nova: "no. i only run here." },
    { user: "what can you do", nova: "i guess the next letter." },
    { user: "do you know everything", nova: "no." },
    { user: "search the web", nova: "no. i only run here." }
  ];

  var SHORT = { you: 1, are: 1, do: 1, no: 1, a: 1, i: 1, am: 1, the: 1, is: 1, to: 1 };

  function sanitize(s) {
    var o = "", ch;
    s = String(s || "").toLowerCase();
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (stoi[ch] != null) o += ch;
    }
    return o.replace(/\s+/g, " ").trim();
  }

  function tooShort(u) {
    if (!u || u.length < 3) return true;
    var words = u.split(" ").filter(Boolean);
    return words.length === 1 && SHORT[words[0]];
  }

  function readPack() {
    try { return JSON.parse(localStorage.getItem(STORE) || "null") || {}; }
    catch (e) { return {}; }
  }

  function writeLessons(lessons) {
    var p = readPack();
    p.lessons = lessons;
    try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) {}
  }

  function lessonsFromStore() {
    var p = readPack();
    return Array.isArray(p.lessons) ? p.lessons : [];
  }

  function readFacts() {
    try { return JSON.parse(localStorage.getItem(FACTS) || "{}") || {}; }
    catch (e) { return {}; }
  }

  function writeFacts(map) {
    try { localStorage.setItem(FACTS, JSON.stringify(map)); } catch (e) {}
  }

  function entryFor(word) {
    var raw = readFacts()[sanitize(word)];
    if (!raw) return { user: "", locked: "" };
    if (typeof raw === "string") return { user: raw, locked: "" };
    return { user: raw.user || "", locked: raw.locked || "" };
  }

  function putEntry(word, entry) {
    word = sanitize(word);
    if (!word) return false;
    var map = readFacts();
    map[word] = { user: entry.user || "", locked: entry.locked || "" };
    writeFacts(map);
    return true;
  }

  function saveUser(word, meaning) {
    word = sanitize(word);
    meaning = sanitize(meaning).slice(0, 180);
    if (!word || !meaning || word.split(" ").length > 4) return false;
    var e = entryFor(word);
    e.user = meaning;
    return putEntry(word, e);
  }

  function saveLocked(word, meaning) {
    word = sanitize(word);
    meaning = sanitize(meaning).slice(0, 180);
    if (!word || !meaning || word.split(" ").length > 4) return false;
    var e = entryFor(word);
    e.locked = meaning;
    return putEntry(word, e);
  }

  function spokenMeaning(word) {
    var e = entryFor(word);
    return e.locked || e.user || "";
  }

  function getPending() {
    try { return JSON.parse(localStorage.getItem(PENDING) || "null"); }
    catch (e) { return null; }
  }

  function setPending(word) {
    try { localStorage.setItem(PENDING, JSON.stringify({ word: word, at: Date.now() })); }
    catch (e) {}
  }

  function clearPending() {
    try { localStorage.removeItem(PENDING); } catch (e) {}
  }

  function allPairs() {
    return lessonsFromStore().concat(CANNED);
  }

  function lookup(text) {
    var q = sanitize(text);
    if (!q) return null;
    var list = allPairs();
    var n, u;
    for (n = list.length - 1; n >= 0; n--) {
      u = sanitize(list[n].user);
      if (u && q === u) return list[n].nova;
    }
    var counts = {};
    var answers = {};
    var key, bestKey = null, bestCount = 0;
    for (n = 0; n < list.length; n++) {
      u = sanitize(list[n].user);
      if (tooShort(u)) continue;
      if (q.indexOf(u) === -1 && !(u.indexOf(q) !== -1 && q.length >= 8)) continue;
      key = u + "\0" + sanitize(list[n].nova);
      counts[key] = (counts[key] || 0) + 1;
      answers[key] = list[n].nova;
      if (counts[key] > bestCount || (counts[key] === bestCount && u.length > (bestKey ? bestKey.split("\0")[0].length : 0))) {
        bestCount = counts[key];
        bestKey = key;
      }
    }
    return bestKey ? answers[bestKey] : null;
  }

  function unknownTerm(text) {
    var q = sanitize(text);
    var m = q.match(/^(?:what does|whats|what is|define|meaning of)\s+(.+?)(?:\s+mean)?$/);
    if (!m) return null;
    var word = m[1].replace(/^a |^an |^the /, "").replace(/\s+mean$/, "").trim();
    if (!word || word.split(" ").length > 4) return null;
    if (/^(your name|you|this|that|it)$/.test(word)) return null;
    return word;
  }

  function lookupFact(text) {
    var q = sanitize(text);
    var mine = q.match(/^(?:my|my definition of|what do i mean by)\s+(.+)$/);
    if (mine) {
      var w = mine[1].replace(/^a |^an |^the /, "").trim();
      var e = entryFor(w);
      return e.user || null;
    }
    var word = unknownTerm(text);
    if (!word) return null;
    return spokenMeaning(word) || null;
  }

  function num(s) {
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function fmt(n) {
    if (Math.abs(n - Math.round(n)) < 1e-10) return String(Math.round(n));
    return String(Math.round(n * 1e6) / 1e6);
  }

  function mathAnswer(text) {
    if (global.novaMath) {
      var fast = global.novaMath(text);
      if (fast) return fast;
    }
    var q = String(text || "").toLowerCase();
    q = q.replace(/[?!,]/g, " ").replace(/\s+/g, " ").trim();
    q = q.replace(/^what is /, "").replace(/^what's /, "").replace(/^whats /, "");
    var ops = [
      { re: /^(-?\d+(?:\.\d+)?) (?:times|x|\*) (-?\d+(?:\.\d+)?)$/, fn: function (a, b) { return a * b; } },
      { re: /^(-?\d+(?:\.\d+)?) (?:plus|\+) (-?\d+(?:\.\d+)?)$/, fn: function (a, b) { return a + b; } },
      { re: /^(-?\d+(?:\.\d+)?) (?:minus|-) (-?\d+(?:\.\d+)?)$/, fn: function (a, b) { return a - b; } },
      { re: /^(-?\d+(?:\.\d+)?) (?:divided by|over|\/) (-?\d+(?:\.\d+)?)$/, fn: function (a, b) { return b === 0 ? null : a / b; } }
    ];
    var m, a, b, r;
    for (i = 0; i < ops.length; i++) {
      m = q.match(ops[i].re);
      if (!m) continue;
      a = num(m[1]);
      b = num(m[2]);
      if (a == null || b == null) return null;
      r = ops[i].fn(a, b);
      if (r == null) return "i cannot divide by zero.";
      return fmt(r) + ".";
    }
    return null;
  }

  function looksLikeQuestion(text) {
    var q = String(text || "").toLowerCase().trim();
    if (!q) return false;
    if (q.indexOf("?") !== -1) return true;
    return /^(what|whats|who|where|when|why|how|can|could|do|does|did|is|are|am|should|would|will|which|define)\b/.test(q);
  }

  function ingestRead(raw) {
    var body = String(raw || "").replace(/^read\s+/i, "");
    var lines = body.split(/[\n.;]+/);
    var added = 0;
    var n, line, m;
    for (n = 0; n < lines.length; n++) {
      line = sanitize(lines[n]);
      if (!line) continue;
      m = line.match(/^([a-z][a-z\- ]{0,24})\s+(?:means|is|:|-)\s+(.{8,180})$/);
      if (!m) continue;
      if (saveUser(m[1], m[2])) added++;
      if (added >= 40) break;
    }
    if (!added) return null;
    return "saved " + added + " word" + (added === 1 ? "" : "s") + ".";
  }

  function cancelPending(text) {
    var q = sanitize(text);
    return /^(skip|nevermind|never mind|no|stop|cancel|forget it)$/.test(q);
  }

  function finishPending(text) {
    var pend = getPending();
    if (!pend || !pend.word) return null;
    if (Date.now() - (pend.at || 0) > 10 * 60 * 1000) {
      clearPending();
      return null;
    }
    if (cancelPending(text)) {
      clearPending();
      return "ok. skipped.";
    }
    if (looksLikeQuestion(text) || /^when i say /.test(sanitize(text)) || /^read /.test(sanitize(text)) || /^lock /.test(sanitize(text))) {
      clearPending();
      return null;
    }
    if (saveUser(pend.word, text)) {
      clearPending();
      return "saved your meaning of " + pend.word + ".";
    }
    clearPending();
    return null;
  }

  function handleTeach(text) {
    var pendingDone = finishPending(text);
    if (pendingDone) return pendingDone;
    var raw = String(text || "").trim();
    var lower = raw.toLowerCase();
    var m = lower.match(/^when i say (.+?) say (.+)$/);
    if (m) {
      var lessons = lessonsFromStore();
      lessons.push({ user: sanitize(m[1]), nova: sanitize(m[2]) });
      writeLessons(lessons);
      return "lesson saved.";
    }
    m = lower.match(/^lock\s+(.+?)\s+(?:as|means|:)\s+(.+)$/);
    if (m && saveLocked(m[1], m[2])) return "locked " + sanitize(m[1]) + ".";
    m = lower.match(/^edit\s+(.+?)\s+(?:as|means|:)\s+(.+)$/);
    if (m) {
      if (saveUser(m[1], m[2])) return "updated your meaning of " + sanitize(m[1]) + ".";
    }
    m = lower.match(/^(?:define|teach)\s+(.+?)\s+(?:as|means|:)\s+(.+)$/);
    if (m && saveUser(m[1], m[2])) return "saved your meaning.";
    m = lower.match(/^(.+?)\s+means\s+(.+)$/);
    if (m && m[1].split(/\s+/).length <= 4 && saveUser(m[1], m[2])) return "saved your meaning.";
    if (/^read\s+/i.test(raw)) {
      var got = ingestRead(raw);
      return got || "no word lines found. use: cat means a small animal.";
    }
    return null;
  }

  function ruleThenBrain(origTalk, text) {
    var pendingDone = finishPending(text);
    if (pendingDone) return pendingDone;
    var hit = mathAnswer(text) || lookup(text) || lookupFact(text);
    if (hit) return hit;
    var term = unknownTerm(text);
    if (term && !spokenMeaning(term) && !mathAnswer(text)) {
      setPending(term);
      return "i do not know " + term + ". what do you mean by it?";
    }
    if (looksLikeQuestion(text)) return "i do not know.";
    if (typeof origTalk === "function") {
      var guessed = origTalk(text);
      if (guessed && String(guessed).trim() && !/^still learning\.?$/i.test(String(guessed).trim())) {
        return guessed;
      }
    }
    return "i do not know.";
  }

  function wrap() {
    if (!global.NovaTrain) {
      global.NovaTrain = {
        start: function () { return "Trainer script is missing. Answers still use the lesson list."; },
        pause: function () { return "Trainer script is missing."; },
        toggle: function () { return "Trainer script is missing."; },
        sample: function () { return "(trainer missing)"; },
        handleUser: handleTeach,
        talk: function (t) { return ruleThenBrain(null, t); },
        status: function () {
          return { running: false, steps: 0, loss: null, lessons: lessonsFromStore().length };
        },
        exportBrain: function () { return "Trainer script is missing."; },
        lookup: lookup,
        _exactLookup: true
      };
      return;
    }
    if (global.NovaTrain._exactLookup) return;
    var T = global.NovaTrain;
    var origHandle = T.handleUser;
    var origTalk = T.talk;
    T.talk = function (t) { return ruleThenBrain(origTalk, t); };
    T.handleUser = function (text, lastUser) {
      var taught = handleTeach(text);
      if (taught) return taught;
      return origHandle ? origHandle(text, lastUser) : null;
    };
    T.lookup = lookup;
    T._exactLookup = true;
  }

  wrap();
  document.addEventListener("DOMContentLoaded", wrap);
})(window);
