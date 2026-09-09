/* Rule table first, GRU second, I-do-not-know last. */
(function (global) {
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
  var STORE = "nova-tiny-brain-v7";
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

  function handleTeach(text) {
    var raw = String(text || "").trim();
    var lower = raw.toLowerCase();
    var m = lower.match(/^when i say (.+?) say (.+)$/);
    if (!m) return null;
    var lessons = lessonsFromStore();
    lessons.push({ user: sanitize(m[1]), nova: sanitize(m[2]) });
    writeLessons(lessons);
    return "lesson saved.";
  }

  function ruleThenBrain(origTalk, text) {
    var hit = mathAnswer(text) || lookup(text);
    if (hit) return hit;
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
