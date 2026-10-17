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

  /* Reply for a word Nova has no locked/user meaning for. null when the dictionary has nothing. */
  function offer(term, lead) {
    var e = entry(term);
    if (!e) return null;
    var line = (lead || "") + "dictionary says: " + sense(e, 0) + ".";
    if (!saving()) {
      clearOffer();
      return line + " learning is stopped, so i will not save it.";
    }
    writeOffer({ term: clean(term), entry: e, i: 0, at: Date.now() });
    return line + " want me to remember it?";
  }

  function isYes(q) { return /^(yes|y|yeah|yep|yup|yea|sure|ok|okay|yes please|please|remember it|save it|remember that|save that|do it)$/.test(q); }
  function isNo(q) { return /^(no|n|nope|nah|no thanks|no thank you|dont|don't|do not|skip|nevermind|never mind|cancel|forget it|not now)$/.test(q); }
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
    var q = clean(text).replace(/[.!?]+$/, "");
    if (isYes(q)) {
      clearOffer();
      if (!saving()) return "learning is stopped, so i did not save it.";
      if (!saveMeaning(o)) return "i could not save that.";
      try { if (global.NovaNewWords && global.NovaNewWords.list) global.NovaNewWords.list(); } catch (e) {} /* prunes the saved word */
      return "saved. " + o.term + " means " + gloss(o.entry.senses[o.i] ? o.entry.senses[o.i][1] : o.entry.senses[0][1]) + ".";
    }
    if (isNo(q)) { clearOffer(); return "ok. not saved."; }
    if (isMore(q)) {
      if (o.entry.senses.length > o.i + 1) {
        o.i += 1;
        o.at = Date.now();
        writeOffer(o);
        return "dictionary also says: " + sense(o.entry, o.i) + ". want me to remember it?";
      }
      return "that is the only meaning i have from the dictionary. want me to remember it?";
    }
    clearOffer();
    return null;
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
      if (/^(dictionary says|dictionary also says|you have said .* dictionary says|ok\. not saved|that is the only meaning|downloading the dictionary|learning is stopped, so i)/.test(String(nova || "").toLowerCase())) return false;
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
    entry: entry, offer: offer, answerOffer: answerOffer, readOffer: readOffer, clearOffer: clearOffer,
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
