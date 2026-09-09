/* Exact-then-longest lesson matcher. Loaded after train.js. */
(function (global) {
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
  var stoi = {};
  var i;
  for (i = 0; i < ALPHA.length; i++) stoi[ALPHA.charAt(i)] = i;

  var CANNED = [
    { user: "hello", nova: "hey." },
    { user: "hi", nova: "hey." },
    { user: "hey", nova: "hey." },
    { user: "who are you", nova: "i am nova." },
    { user: "how are you", nova: "i am here." },
    { user: "thanks", nova: "you are welcome." },
    { user: "thank you", nova: "you are welcome." }
  ];

  var SHORT = {
    you: 1, are: 1, do: 1, no: 1, a: 1, i: 1, am: 1, the: 1, is: 1, to: 1
  };

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
    if (words.length === 1 && SHORT[words[0]]) return true;
    return false;
  }

  function lessonsFromStore() {
    try {
      var p = JSON.parse(localStorage.getItem("nova-tiny-brain-v7") || "null");
      if (p && Array.isArray(p.lessons)) return p.lessons;
    } catch (e) {}
    return [];
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

  function wrap() {
    var T = global.NovaTrain;
    if (!T || T._exactLookup) return;
    T.talk = function (t) {
      var hit = lookup(t);
      if (hit) return hit;
      return "i do not know.";
    };
    T.lookup = lookup;
    T._exactLookup = true;
  }

  wrap();
  document.addEventListener("DOMContentLoaded", wrap);
})(window);
