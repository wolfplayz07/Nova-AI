/* Exact-then-longest lesson matcher. Works even if train.js fails to load. */
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
    { user: "bye", nova: "bye." },
    { user: "thanks", nova: "you are welcome." },
    { user: "thank you", nova: "you are welcome." },
    { user: "where do you live", nova: "on this phone." },
    { user: "do you live here", nova: "yes. on this phone." },
    { user: "leave this phone", nova: "no." },
    { user: "can you leave this phone", nova: "no. i only run here." },
    { user: "what can you do", nova: "i guess the next letter." },
    { user: "do you know everything", nova: "no." },
    { user: "search the web", nova: "no. i only run here." },
    { user: "what is 17 times 34", nova: "i do not know." }
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

  function lookup(text) {
    var q = sanitize(text);
    if (!q) return null;
    var list = lessonsFromStore().concat(CANNED);
    var n, u, best = null, bestLen = -1;
    for (n = list.length - 1; n >= 0; n--) {
      u = sanitize(list[n].user);
      if (u && q === u) return list[n].nova;
    }
    for (n = 0; n < list.length; n++) {
      u = sanitize(list[n].user);
      if (tooShort(u)) continue;
      if (q.indexOf(u) !== -1 && u.length > bestLen) {
        bestLen = u.length;
        best = list[n].nova;
      } else if (u.indexOf(q) !== -1 && q.length >= 8 && q.length > bestLen) {
        bestLen = q.length;
        best = list[n].nova;
      }
    }
    return best;
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

  function wrap() {
    if (!global.NovaTrain) {
      global.NovaTrain = {
        start: function () { return "Trainer script is missing. Answers still use the lesson list."; },
        pause: function () { return "Trainer script is missing."; },
        toggle: function () { return "Trainer script is missing."; },
        sample: function () { return "(trainer missing)"; },
        handleUser: handleTeach,
        talk: function (t) { return lookup(t) || "i do not know."; },
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
    T.talk = function (t) { return lookup(t) || "i do not know."; };
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
