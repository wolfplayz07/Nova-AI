/* v44: offline dictionary (Princeton WordNet 3.0, see dict/LICENSE-WordNet.txt).
   Shards live in web/dict/<first two letters>.json and are loaded on demand, one small file
   per lookup, with a synchronous same-origin request so reply() keeps returning a string
   (the Jarvis bridge relies on that). The service worker keeps loaded shards for offline use.
   A dictionary meaning is always said as "dictionary says: ..." and is only saved as the
   creator's meaning after an explicit yes. Locked and user facts always win (lookup.js checks
   them first). After "stop learning" it still looks words up but does not offer to save. */
(function (global) {
  var OFFER = "nova-dict-offer-v1";
  var NOSAVE = "nova-dict-nosave-v1";
  var BASE = "dict/";
  var DICT_CACHE = "nova-dict-wn30-v1"; /* must match sw.js */
  var TTL = 10 * 60 * 1000;
  var POS = { n: "noun", v: "verb", a: "adjective", r: "adverb" };
  var shards = {};
  var failedAt = {};

  function clean(s) {
    return String(s || "").toLowerCase().replace(/\u2019/g, "'").replace(/[^a-z0-9' \-.]/g, " ")
      .replace(/\s+/g, " ").replace(/^[\s.'-]+|[\s.'-]+$/g, "");
  }

  function shardKey(w) {
    var k = "", i, ch;
    for (i = 0; i < 2; i++) {
      ch = w.charAt(i) || "_";
      k += ch >= "a" && ch <= "z" ? ch : "_";
    }
    return k;
  }

  function fetchShardSync(k) {
    var X = global.XMLHttpRequest, xhr;
    if (!X) return null;
    try {
      xhr = new X();
      xhr.open("GET", BASE + k + ".json", false);
      xhr.send(null);
      if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) return JSON.parse(xhr.responseText);
    } catch (e) {}
    return null;
  }

  /* Browsers do not send synchronous requests through the service worker, so after an online
     sync load we also ask for the shard once with fetch(); the worker then keeps it in DICT_CACHE. */
  var mirrored = {};
  function mirror(k) {
    if (mirrored[k] || typeof global.fetch !== "function") return;
    var sw = global.navigator && global.navigator.serviceWorker;
    if (!sw || !sw.controller) return;
    mirrored[k] = 1;
    try { global.fetch(BASE + k + ".json").catch(function () {}); } catch (e) {}
  }

  /* Offline: sync requests fail, so load the shards this phone already keeps (every shard after
     "download dictionary") from the worker's cache into memory, a few at a time. */
  var warming = false;
  function warmFromCache() {
    if (warming || !global.caches || typeof global.caches.open !== "function") return;
    warming = true;
    global.caches.open(DICT_CACHE).then(function (cache) {
      return cache.keys().then(function (reqs) {
        var i = 0;
        function next() {
          if (i >= reqs.length) return Promise.resolve();
          var req = reqs[i++], m = /\/dict\/([a-z_]{2})\.json/.exec(req.url);
          if (!m || shards[m[1]]) return next();
          return cache.match(req).then(function (res) { return res ? res.json() : null; })
            .then(function (obj) { if (obj && typeof obj === "object") shards[m[1]] = obj; })
            .catch(function () {}).then(function () { return new Promise(function (r) { setTimeout(r, 0); }); })
            .then(next);
        }
        return next();
      });
    }).catch(function () {}).then(function () { warming = false; });
  }

  function shard(k) {
    if (shards[k]) return shards[k];
    if (failedAt[k] && Date.now() - failedAt[k] < 60000) return null;
    var s = fetchShardSync(k);
    if (s && typeof s === "object") { shards[k] = s; mirror(k); return s; }
    failedAt[k] = Date.now();
    warmFromCache();
    return null;
  }

  function raw(w) {
    if (!w) return null;
    var s = shard(shardKey(w));
    if (!s || !Object.prototype.hasOwnProperty.call(s, w)) return null;
    var v = s[w];
    if (typeof v === "string") { /* irregular form -> base word (mice -> mouse) */
      var b = shard(shardKey(v));
      return b && Array.isArray(b[v]) ? { word: v, senses: b[v] } : null;
    }
    return Array.isArray(v) && v.length ? { word: w, senses: v } : null;
  }

  /* Exact word first, then simple plural / -ing / -ed forms. */
  function entry(term) {
    var w = clean(term), hit, c, i, tries;
    if (!w || w.length > 40 || w.split(" ").length > 4) return null;
    hit = raw(w);
    if (hit) return hit;
    tries = [];
    if (/ies$/.test(w)) tries.push(w.slice(0, -3) + "y");
    if (/(s|x|z|ch|sh)es$/.test(w)) tries.push(w.slice(0, -2));
    if (/s$/.test(w) && !/ss$/.test(w)) tries.push(w.slice(0, -1));
    if (/ing$/.test(w)) tries.push(w.slice(0, -3), w.slice(0, -3) + "e");
    if (/ed$/.test(w)) tries.push(w.slice(0, -2), w.slice(0, -1));
    for (i = 0; i < tries.length; i++) {
      c = tries[i];
      if (c.length >= 2 && (hit = raw(c))) return hit;
    }
    return null;
  }

  function gloss(s) { return String(s || "").replace(/[.\s]+$/, ""); }

  function sense(e, i) {
    var s = e.senses[i] || e.senses[0];
    return e.word + " (" + (POS[s[0]] || "word") + "): " + gloss(s[1]);
  }

  function saving() {
    try { return localStorage.getItem(NOSAVE) !== "1"; } catch (e) { return true; }
  }

  function readOffer() {
    var o;
    try { o = JSON.parse(localStorage.getItem(OFFER) || "null"); } catch (e) { o = null; }
    if (!o || !o.term || !o.entry) return null;
    if (Date.now() - (o.at || 0) > TTL) { clearOffer(); return null; }
    return o;
  }
  function writeOffer(o) { try { localStorage.setItem(OFFER, JSON.stringify(o)); } catch (e) {} }
  function clearOffer() { try { localStorage.removeItem(OFFER); } catch (e) {} }

  /* v56: pick the sense that fits the chat. Content words of the last ~6 lines (stopwords out,
     simple stems) are scored against each sense gloss plus a small built-in synonym list
     (WordNet shards here hold glosses only, not synset lemmas). */
  var STOP = {};
  ("a an the and or but if of to in on at by for with from as is are was were be been being am do does did " +
   "can could will would shall should may might must have has had not no yes so than then that this these those " +
   "it its i me my you your he she they them their we us our what who whom which when where why how there here " +
   "just very too also about into out up down over some any all more most other such only own same ok okay hey nova " +
   "mean means meaning define dictionary says say want remember thing things").split(" ").forEach(function (w) { STOP[w] = 1; });
  var SYN = [
    "talk speak say tell utter voice conversation word words speech",
    "sound noise loud cry call growl bark howl roar yelp woof",
    "dog dogs puppy hound canis wolf canine animal animals pet cat",
    "tree trees wood woody trunk branch plant plants stem stems root roots",
    "water river stream lake sea ocean",
    "money cash bank pay coin",
    "boat ship sail sea"
  ].map(function (g) { return g.split(" "); });
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 3 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function contentWords(text) {
    var out = [];
    clean(text).replace(/[.\-]/g, " ").split(" ").forEach(function (w) {
      w = w.replace(/'s$/, "").replace(/'/g, "");
      if (w.length < 3 || STOP[w] || /\d/.test(w)) return;
      out.push(stem(w));
    });
    return out;
  }
  function expand(words) {
    var set = {};
    words.forEach(function (w) {
      set[w] = 1;
      SYN.forEach(function (g) {
        for (var i = 0; i < g.length; i++) if (stem(g[i]) === w) { g.forEach(function (x) { set[stem(x)] = 1; }); return; }
      });
    });
    return set;
  }
  function recentLines() {
    var msgs = [];
    try { if (typeof global.currentChat === "function") msgs = global.currentChat().messages || []; } catch (e) { msgs = []; }
    return msgs.slice(-7).map(function (m) { return String((m && m.content) || ""); });
  }
  /* Returns { pick: index } for a clear winner, { top: [i, j] } for a tie or no overlap. */
  function pickSense(e, term) {
    var n = e.senses.length, base = stem(clean(term)), self = stem(e.word), ctx = {}, scores = [], i, order;
    if (n < 2) return { pick: 0 };
    recentLines().forEach(function (l) {
      contentWords(l).forEach(function (w) { if (w !== base && w !== self) ctx[w] = 1; });
    });
    if (!Object.keys(ctx).length) return { pick: 0, scores: [] }; /* fresh chat: plain first sense, as before */
    for (i = 0; i < n; i++) {
      var g = expand(contentWords(e.senses[i][1])), sc = 0;
      for (var w in ctx) if (g[w]) sc += 1;
      scores.push(sc);
    }
    order = scores.map(function (s, k) { return k; }).sort(function (a, b) { return scores[b] - scores[a] || a - b; });
    if (scores[order[0]] > 0 && scores[order[0]] > scores[order[1]]) return { pick: order[0], scores: scores };
    return { top: [order[0], order[1]], scores: scores };
  }
  function brief(e, i) {
    var s = e.senses[i];
    return "(" + (POS[s[0]] || "word") + ") " + gloss(s[1]);
  }

  /* Reply for a word Nova has no locked/user meaning for. null when the dictionary has nothing.
     lead set = an auto-words offer (v43/v50): never asks "which one?", uses a clear winner or sense 1. */
  function offer(term, lead) {
    var e = entry(term), p, i;
    if (!e) return null;
    p = pickSense(e, term);
    if (!lead && p.top) {
      writeOffer({ term: clean(term), entry: e, i: p.top[0], choose: p.top, at: Date.now() });
      return "dictionary says " + e.word + " can mean: 1) " + brief(e, p.top[0]) + " 2) " + brief(e, p.top[1]) + ". which one?";
    }
    i = p.pick != null ? p.pick : 0;
    var line = (lead || "") + "dictionary says: " + sense(e, i) + ".";
    if (!saving()) {
      clearOffer();
      return line + " learning is stopped, so i will not save it.";
    }
    writeOffer({ term: clean(term), entry: e, i: i, seen: [i], auto: !!lead, at: Date.now() });
    return line + " want me to remember it?";
  }

  function isYes(q) { return /^(yes|y|yeah|yep|yup|yea|sure|ok|okay|yes please|please|remember it|save it|remember that|save that|do it)$/.test(q); }
  function isNo(q) { return /^(no|n|nope|nah|no thanks|no thank you|dont|don't|do not|skip|nevermind|never mind|cancel|forget it|not now)$/.test(q); }
  function isPick(q) {
    if (/^(1|one|first|the first|first one|the first one|number 1|number one)$/.test(q)) return 0;
    if (/^(2|two|second|the second|second one|the second one|number 2|number two)$/.test(q)) return 1;
    return -1;
  }
  function isMore(q) { return /^(what else|other meaning|another meaning|next meaning|any other meaning|what else does it mean)$/.test(q); }

  function saveMeaning(o) {
    var L = global.NovaLookup, s = o.entry.senses[o.i] || o.entry.senses[0], ok = false;
    if (!L || typeof L.saveUser !== "function") return false;
    ok = L.saveUser(o.term, s[1]);
    if (o.entry.word !== o.term) L.saveUser(o.entry.word, s[1]);
    return ok;
  }

  /* Owner reply to "want me to remember it?". null means: not an answer, carry on normally. */
  function answerOffer(text) {
    var o = readOffer();
    if (!o) return null;
    var q = clean(text).replace(/[.!?]+$/, ""), k, n;
    if (o.choose) { /* v56: "which one?" is open */
      k = isPick(q);
      if (k >= 0) {
        o.i = o.choose[k];
        o.seen = [o.i];
        delete o.choose;
        o.at = Date.now();
        if (!saving()) { clearOffer(); return "dictionary says: " + sense(o.entry, o.i) + ". learning is stopped, so i will not save it."; }
        writeOffer(o);
        return "dictionary says: " + sense(o.entry, o.i) + ". want me to remember it?";
      }
      if (isNo(q)) { clearOffer(); return "ok. not saved."; }
      if (isYes(q)) return "which one? say 1 or 2.";
      if (isMore(q)) {
        o.seen = o.choose.slice(); delete o.choose;
        for (n = 0; n < o.entry.senses.length; n++) if (o.seen.indexOf(n) === -1) break;
        if (n >= o.entry.senses.length) { o.at = Date.now(); o.choose = o.seen; writeOffer(o); return "those are the only meanings i have from the dictionary. say 1 or 2."; }
        o.i = n; o.seen.push(n); o.at = Date.now(); writeOffer(o);
        return "dictionary also says: " + sense(o.entry, o.i) + ". want me to remember it?";
      }
      clearOffer();
      return null;
    }
    if (isYes(q)) {
      clearOffer();
      if (!saving()) return "learning is stopped, so i did not save it.";
      if (!saveMeaning(o)) return "i could not save that.";
      try { if (global.NovaNewWords && global.NovaNewWords.list) global.NovaNewWords.list(); } catch (e) {} /* prunes the saved word */
      return "saved. " + o.term + " means " + gloss(o.entry.senses[o.i] ? o.entry.senses[o.i][1] : o.entry.senses[0][1]) + ".";
    }
    if (isNo(q)) {
      clearOffer();
      /* v56: a plain "no" opens a teach slot so the next line can be the creator's own meaning.
         "skip" / "never mind" / "cancel" still just drop it. */
      if (!/^(skip|nevermind|never mind|cancel|forget it|not now)$/.test(q)) {
        var L = global.NovaLookup;
        try { if (L && L.setPending) L.setPending({ question: "what is " + o.term, term: o.term, dictNo: true }); } catch (e2) {}
        return "ok. not saved. tell me what " + o.term + " means if you like.";
      }
      return "ok. not saved.";
    }
    if (isMore(q)) {
      o.seen = o.seen || [o.i];
      for (n = 0; n < o.entry.senses.length; n++) if (o.seen.indexOf(n) === -1) break;
      if (n < o.entry.senses.length) {
        o.i = n;
        o.seen.push(n);
        o.at = Date.now();
        writeOffer(o);
        return "dictionary also says: " + sense(o.entry, o.i) + ". want me to remember it?";
      }
      return "that is the only meaning i have from the dictionary. want me to remember it?";
    }
    clearOffer();
    /* v56: any other line (not a new question or owner command) is the creator's own meaning:
       "actually a bark is a loud sound a dog makes" -> bark = "a loud sound a dog makes". */
    var mine = ownMeaning(text, o);
    if (mine) {
      var L2 = global.NovaLookup;
      if (L2 && L2.saveUser && L2.saveUser(o.term, mine, text)) {
        if (o.entry.word !== o.term) L2.saveUser(o.entry.word, mine, text);
        try { if (L2.clearPending) L2.clearPending(); } catch (e3) {}
        return "got it. " + o.term + " means " + mine + ".";
      }
    }
    return null;
  }

  function ownMeaning(text, o) {
    var raw = String(text || "").trim(), L = global.NovaLookup, T = global.NovaTrain, t, words, w, i, terms;
    if (!raw || /\?\s*$/.test(raw) || /\d/.test(raw)) return null;
    t = clean(raw).replace(/[.!]+$/, "");
    if (/^(when i say|lock |edit |define |teach |read |remember|show |what |who |why |how |where |when |download |brain status|train status|stop|pause|learn|start|export|reset|practice|sample)/.test(t)) return null;
    if (T && T.isLearnCommand && T.isLearnCommand(raw)) return null;
    if (L && L.isNewQuestion && L.isNewQuestion(raw)) return null;
    t = t.replace(/^(actually|no|nope|wrong|not quite|well)[,:]?\s+/, "").replace(/^(it|that)\s+(is|means)\s+/, "");
    terms = [o.term, o.entry.word];
    for (i = 0; i < terms.length; i++) {
      w = terms[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      t = t.replace(new RegExp("^(?:(?:a|an|the)\\s+)?" + w + "s?\\s+(?:is|are|means)\\s+"), "");
    }
    t = t.trim();
    words = t.split(" ").filter(Boolean);
    if (words.length < 2 || t.length > 180) return null;
    if (T && T.wordSalad && T.wordSalad(t)) return null;
    return t;
  }

  function learnCmd(text) {
    var t = String(text || "").toLowerCase().trim().replace(/[.!?]+$/g, "").trim();
    if (/^(pause|stop|pause train|stop train|stop training|stop learning|pause learning|stop learn)$/.test(t)) {
      try { localStorage.setItem(NOSAVE, "1"); } catch (e) {}
      clearOffer();
    } else if (/^(train|train a little|start training|start learning|learn from me|start learn|learn)$/.test(t)) {
      try { localStorage.removeItem(NOSAVE); } catch (e2) {}
    }
  }

  /* "download dictionary": fetch every shard once so the service worker keeps them all offline. */
  function downloadAll(done) {
    if (typeof global.fetch !== "function") { done("this browser cannot download the dictionary."); return; }
    global.fetch(BASE + "index.json").then(function (r) { return r.json(); }).then(function (ix) {
      var list = (ix && ix.shards) || [], next = 0, got = 0, bad = 0;
      function one() {
        if (next >= list.length) return Promise.resolve();
        var k = list[next++];
        return global.fetch(BASE + k + ".json").then(function (r) { if (r.ok) got++; else bad++; })
          .catch(function () { bad++; }).then(one);
      }
      return Promise.all([one(), one(), one(), one()]).then(function () {
        done(bad ? "dictionary download stopped early: " + got + " of " + list.length + " parts saved. try again on wi-fi."
          : "dictionary saved on this phone: " + got + " parts. lookups now work offline.");
      });
    }).catch(function () { done("could not download the dictionary. try again when online."); });
  }

  function command(text) {
    var q = clean(text).replace(/[.!?]+$/, "");
    if (/^(download dictionary|download the dictionary|save dictionary offline|get dictionary)$/.test(q)) {
      downloadAll(function (msg) { if (typeof global.note === "function") global.note(msg); });
      return "downloading the dictionary to this phone (about 14 mb). i will tell you when it is done.";
    }
    return null;
  }

  /* A dictionary line is not a lesson: it comes from the file each time. */
  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._dict) return;
    var orig = T.learnPair;
    var g = function (user, nova) {
      if (/^(dictionary says|dictionary also says|dictionary says [a-z' -]+ can mean|which one\? say|those are the only meanings|you have said .* dictionary says|ok\. not saved|that is the only meaning|downloading the dictionary|learning is stopped, so i)/.test(String(nova || "").toLowerCase())) return false;
      return orig.apply(this, arguments);
    };
    g._dict = true;
    g._wordMath = orig._wordMath;
    T.learnPair = g;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._dict) return;
    var orig = reply;
    function wrapped(text) {
      var ans = answerOffer(text);
      if (ans) return ans;
      var cmd = command(text);
      if (cmd) return cmd;
      learnCmd(text);
      return orig.apply(this, arguments);
    }
    wrapped._dict = true;
    wrapped._math = orig._math;
    wrapped._newWords = orig._newWords;
    reply = wrapped;
  }

  global.NovaDict = {
    entry: entry, offer: offer, pickSense: pickSense, contentWords: contentWords, answerOffer: answerOffer, readOffer: readOffer, clearOffer: clearOffer,
    saving: saving, shardKey: shardKey, download: downloadAll, OFFER: OFFER, NOSAVE: NOSAVE
  };
  guardLearn();
  wrapReply();
  if (global.navigator && global.navigator.onLine === false) warmFromCache();
  if (global.addEventListener) global.addEventListener("offline", warmFromCache);
  if (global.document && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function () { guardLearn(); wrapReply(); });
  }
})(window);
