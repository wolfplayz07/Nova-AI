/* v43: automatic new-word index ("building blocks").
   Every user line is tokenized; words Nova does not know yet are kept in localStorage with a
   count, first/last seen and up to 3 example lines. The index never invents meanings and never
   changes a reply on its own. Owner commands view it, ask about the top word, or clear it. */
(function (global) {
  var STORE = "nova-new-words-v1";
  var MAX_EXAMPLES = 3;
  var STOP = ("a an the and or but if then so of to in on at by for with from up down out over under " +
    "is am are was were be been being do does did done have has had having i me my mine myself you your yours " +
    "he him his she her hers it its we us our they them their this that these those there here what which who " +
    "whom whose when where why how not no yes yeah ok okay oh hi hello hey please thanks thank can could will " +
    "would shall should may might must just very really too also only all any some more most much many few " +
    "each every other another same such than as into about again off once now still yet ever never always " +
    "im ive id ill youre youve dont doesnt didnt cant wont isnt arent wasnt werent thats whats lets its " +
    "get got go goes going went make made say said see saw know knew think like want need tell give take come " +
    "good bad new old big small little one lot thing things way day time people man woman").split(/\s+/);
  var NUMWORDS = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen " +
    "sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand " +
    "million billion first second third half dozen").split(/\s+/);
  /* Owner-command keywords themselves are never indexed. */
  var CMD = ("train training learn learning pause stop sample speak brain export reset wipe status memory remember " +
    "lock edit define teach means read fix skip cancel nevermind forget words word").split(/\s+/);
  var SKIP_SET = {};
  STOP.concat(NUMWORDS, CMD).forEach(function (w) { SKIP_SET[w] = 1; });

  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE) || "null");
      return o && typeof o === "object" && o.words ? o : { words: {} };
    } catch (e) { return { words: {} }; }
  }
  function saveIdx(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }

  function addWords(set, s) {
    String(s || "").toLowerCase().split(/[^a-z']+/).forEach(function (w) {
      w = w.replace(/'/g, "");
      if (w) set[w] = 1;
    });
  }

  /* Reuses the generate gate's vocabulary (train.js knownWords: base text, canned, lessons,
     reading) and adds lookup canned/lessons and facts keys + meanings. */
  function knownSet() {
    var set = {}, T = global.NovaTrain, L = global.NovaLookup, k, f, list, i;
    try { if (T && typeof T.knownWords === "function") set = T.knownWords() || {}; } catch (e) { set = {}; }
    if (L) {
      try {
        list = (L.canned ? L.canned() : []).concat(L.lessons ? L.lessons() : []);
        for (i = 0; i < list.length; i++) { if (list[i]) { addWords(set, list[i].user); addWords(set, list[i].nova); } }
      } catch (e2) {}
      try {
        f = L.readFacts ? L.readFacts() : {};
        for (k in f) {
          if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
          addWords(set, k);
          if (typeof f[k] === "string") addWords(set, f[k]);
          else if (f[k]) { addWords(set, f[k].user); addWords(set, f[k].locked); }
        }
      } catch (e3) {}
    }
    return set;
  }

  function tokens(line) {
    var out = [], seen = {};
    String(line || "").toLowerCase()
      .replace(/https?:\/\/\S+|www\.\S+|\S+\.(com|org|net|io|app|dev)\S*/g, " ")
      .split(/\s+/).forEach(function (raw) {
        var w = raw.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/'s$/, "").replace(/'/g, "");
        if (!w || seen[w]) return;
        if (!/^[a-z]+$/.test(w)) return; /* numbers, mixed digits, symbols */
        if (w.length < 2 || w.length > 24) return;
        if (SKIP_SET[w]) return;
        seen[w] = 1;
        out.push(w);
      });
    return out;
  }

  function isSkipLine(line) {
    var q = String(line || "").toLowerCase().replace(/[?.!,\s]+$/, "").trim();
    return /^(skip|nevermind|never mind|cancel|forget it)$/.test(q);
  }

  function prune(o, known) {
    var w, changed = false;
    for (w in o.words) {
      if (known[w]) { delete o.words[w]; changed = true; }
    }
    return changed;
  }

  function note(line) {
    if (!line || isSkipLine(line)) return;
    var o = load(), known = knownSet(), now = Date.now(), ex = String(line).replace(/\s+/g, " ").trim();
    if (ex.length > 120) ex = ex.slice(0, 117) + "...";
    var changed = prune(o, known);
    tokens(line).forEach(function (w) {
      if (known[w]) return;
      var e = o.words[w] || { count: 0, firstSeen: now, lastSeen: now, examples: [] };
      e.count += 1;
      e.lastSeen = now;
      if (e.examples.indexOf(ex) === -1 && e.examples.length < MAX_EXAMPLES) e.examples.push(ex);
      o.words[w] = e;
      changed = true;
    });
    if (changed) saveIdx(o);
  }

  function ranked() {
    var o = load(), known = knownSet();
    if (prune(o, known)) saveIdx(o);
    return Object.keys(o.words).map(function (w) { return { word: w, count: o.words[w].count, firstSeen: o.words[w].firstSeen || 0 }; })
      .sort(function (a, b) { return b.count - a.count || a.firstSeen - b.firstSeen; /* stable: ties keep first-heard order */ });
  }

  function command(text) {
    var q = String(text || "").toLowerCase().replace(/\u2019/g, "'").replace(/[?.!,\s]+$/, "").replace(/\s+/g, " ").trim();
    if (/^(what words don'?t you know|what words do you not know|new words|show new words|list new words)$/.test(q)) {
      var top = ranked().slice(0, 10);
      if (!top.length) return "no new words yet.";
      return "words i do not know yet: " + top.map(function (r) { return r.word + " (" + r.count + ")"; }).join(", ") + ".";
    }
    if (/^(teach me new words|ask me a word|ask me about a word|ask me a new word)$/.test(q)) {
      var first = ranked()[0];
      if (!first) return "no new words yet.";
      if (global.NovaLookup && global.NovaLookup.setPending) {
        global.NovaLookup.setPending({ question: "what is " + first.word, term: first.word });
      }
      return "you have said \"" + first.word + "\" " + first.count + " time" + (first.count === 1 ? "" : "s") +
        ". what does " + first.word + " mean?";
    }
    if (/^(forget new words|clear new words)$/.test(q)) {
      saveIdx({ words: {} });
      return "ok. new word list cleared.";
    }
    return null;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._newWords) return;
    var orig = reply;
    function wrapped(text, prior) {
      var cmd = command(text);
      if (cmd) return cmd;
      var out = arguments.length > 1 ? orig(text, prior) : orig(text);
      try { note(text); } catch (e) {}
      return out;
    }
    wrapped._newWords = true;
    wrapped._math = orig._math; /* math-boot re-runs its wrap on DOMContentLoaded */
    reply = wrapped;
  }

  global.NovaNewWords = { note: note, list: ranked, command: command, tokens: tokens, load: load, STORE: STORE };
  wrapReply();
  document.addEventListener("DOMContentLoaded", wrapReply);
})(window);
