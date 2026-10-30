/* v57: word senses. A word can mean more than one thing ("a bark" = the sound a dog makes,
   "bark" / "a piece of bark" = tree covering). Store: nova-senses-v1 = { word: [{ gloss,
   source: "taught", kind: "count"|"mass"|"", cues: [] }] }. Dictionary senses are read from the
   offline dictionary each time (source "dict"), so a taught meaning is only ever APPENDED: it never
   replaces a dictionary sense, and the same meaning taught twice is a no-op. The old single
   meaning in nova-facts-v1 stays where it was (my X, locks, brain status keep working).
   Picking: wording cues ("a bark", "barks", "barking", "bark at" -> count/verb senses; bare "bark",
   "piece of bark", "the bark of", "tree bark" -> mass senses) + overlap with the recent chat.
   Close scores -> "which one? 1) ... 2) ..."; the pick answers and never teaches.
   v58: explicit wording always wins over context. When the senses split on wording (some mass,
   some count), "bark" -> mass, "a bark" / "barks" -> count, "piece of bark" -> mass, whatever the
   chat was about. Recent chat (the creator's lines only, never Nova's answers) only breaks ties
   among senses the wording allows, or decides when there is no wording cue at all
   ("what does it mean", "what is that word"). */
(function (global) {
  var KEY = "nova-senses-v1";
  var CHOOSE = "nova-sense-choose-v1";
  var MIGRATED = "nova-senses-migrated-v1";
  var LAST = "nova-sense-last-v1";
  var TTL = 10 * 60 * 1000;
  var MARGIN = 1;
  var POS = { n: "noun", v: "verb", a: "adjective", r: "adverb" };

  function clean(s) {
    return String(s || "").toLowerCase().replace(/\u2019/g, "'").replace(/[^a-z0-9' \-]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function norm(g) { return clean(g).replace(/^(a|an|the)\s+/, ""); }
  function esc(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function D() { return global.NovaDict; }
  function words(text) {
    var d = D();
    if (d && d.contentWords) return d.contentWords(text);
    return clean(text).split(" ").filter(function (w) { return w.length > 2; });
  }

  function read() {
    try { var m = JSON.parse(localStorage.getItem(KEY) || "{}"); return m && typeof m === "object" ? m : {}; }
    catch (e) { return {}; }
  }
  function write(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {} }

  /* Wording cue of a line about WORD: "count" (a/an W, Ws, Wing, W at), "mass" (piece of W,
     the W of, some W, tree W), or "" (bare W, which leans mass only in a question). */
  function cueOf(line, w) {
    var t = " " + clean(line) + " ", W = esc(w);
    if (new RegExp(" (?:piece|pieces|bit|bits|chunk|strip|layer|some|much) of (?:the )?" + W + " ").test(t)) return "mass";
    if (new RegExp(" the " + W + " (?:of|on|from) ").test(t)) return "mass";
    if (new RegExp(" (?:a|an) " + W + " ").test(t)) return "count";
    if (new RegExp(" " + W + "(?:s|es|ing|ed) ").test(t) || new RegExp(" " + W + " (?:at|to) ").test(t)) return "count";
    return "";
  }

  /* Add a taught sense. line = the creator's teaching line (cues are learned from it). */
  function addTaught(word, gloss, line) {
    var w = clean(word).replace(/^(a|an|the)\s+/, ""), g = clean(gloss), m, list, i, n;
    if (!w || !g || w.split(" ").length > 4) return false;
    n = norm(g);
    m = read();
    list = Array.isArray(m[w]) ? m[w] : [];
    for (i = 0; i < list.length; i++) if (norm(list[i].gloss) === n) return false; /* same meaning: no-op */
    var e = dictEntry(w);
    if (e) for (i = 0; i < e.senses.length; i++) if (norm(e.senses[i][1]) === n) return false;
    var src = line || g, cues = {};
    words(src + " " + g).forEach(function (x) { if (x !== w && x !== w.replace(/s$/, "")) cues[x] = 1; });
    list.push({ gloss: g, source: "taught", kind: cueOf(src, w) || (/^(a|an|to) /.test(g) ? "count" : ""), cues: Object.keys(cues).slice(0, 12), at: Date.now() });
    m[w] = list;
    write(m);
    return true;
  }

  /* "edit X as Y" changes the newest taught sense instead of adding one. */
  function editTaught(word, gloss, line) {
    var w = clean(word).replace(/^(a|an|the)\s+/, ""), m = read(), list = m[w];
    if (!Array.isArray(list) || !list.length) return addTaught(word, gloss, line);
    list.pop();
    m[w] = list;
    write(m);
    return addTaught(word, gloss, line);
  }

  /* One-time: every taught word meaning in nova-facts-v1 becomes a taught sense (facts untouched). */
  function migrate() {
    var L = global.NovaLookup, f, k, v;
    try { if (localStorage.getItem(MIGRATED) === "1") return; } catch (e) { return; }
    f = L && L.readFacts ? L.readFacts() : {};
    for (k in f) {
      if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
      v = f[k];
      v = typeof v === "string" ? v : (v && v.user) || "";
      if (v && !/^my /.test(k)) addTaught(k, v, v);
    }
    try { localStorage.setItem(MIGRATED, "1"); } catch (e2) {}
  }

  function dictEntry(w) {
    var d = D();
    try { return d && d.entry ? d.entry(w) : null; } catch (e) { return null; }
  }

  function allSenses(w) {
    var out = [], list = read()[w], e = dictEntry(w), i;
    if (Array.isArray(list)) list.forEach(function (s) { out.push({ gloss: s.gloss, source: "taught", kind: s.kind || "", cues: s.cues || [] }); });
    if (e) for (i = 0; i < e.senses.length; i++) {
      out.push({ gloss: String(e.senses[i][1]).replace(/[.\s]+$/, ""), source: "dict", pos: e.senses[i][0],
        kind: e.senses[i][0] === "v" ? "count" : e.senses[i][0] === "n" ? "mass" : "", cues: words(e.senses[i][1]), word: e.word });
    }
    return out;
  }

  /* "what is a bark" -> { word: "bark", cue: "count" }; "what is a piece of bark" -> mass;
     "what is the bark of a tree" -> mass + extra context "tree"; "what is tree bark" -> mass + "tree". */
  function lastWord() {
    try { var o = JSON.parse(localStorage.getItem(LAST) || "null"); return o && Date.now() - (o.at || 0) < TTL ? o.word : null; }
    catch (e) { return null; }
  }
  function parse(text) {
    var q = clean(text).replace(/^(?:ok|okay|hey|nova)\b\s*/g, "").replace(/^(?:ok|okay|hey|nova)\b\s*/g, "").replace(/^what's /, "whats ");
    /* v58: no wording cue: "what does it mean", "what is that word" -> the word just asked about */
    if (/^(?:so )?(?:what does (?:it|that|that word|this word) mean|whats that mean|what is that word|whats that word|what is that|what is it|what does that one mean)$/.test(q)) {
      var lw = lastWord();
      return lw ? { word: lw, cue: "", extra: [] } : null;
    }
    var m = q.match(/^(?:what does|whats the meaning of|what is the meaning of|whats|what is|what are|define|meaning of|look up|lookup)\s+(.+?)(?:\s+mean)?$/);
    if (!m || /\bmy\b/.test(m[1])) return null;
    var p = m[1], x;
    if ((x = p.match(/^(?:a |an |the |some )?(?:piece|pieces|bit|bits|chunk|strip|layer) of (?:the )?([a-z'-]+)$/))) return { word: x[1], cue: "mass", extra: [] };
    if ((x = p.match(/^the ([a-z'-]+) (?:of|on|from) (?:a |an |the )?(.+)$/))) return { word: x[1], cue: "mass", extra: words(x[2]) };
    if ((x = p.match(/^(?:a|an) ([a-z'-]+)$/))) return { word: x[1], cue: "count", extra: [] };
    if ((x = p.match(/^([a-z'-]+)$/))) return { word: x[1], cue: "bare", extra: [] };
    /* "tree bark": only after what is / define, when the two words are not a known phrase themselves */
    if (/^(?:whats|what is|define) /.test(q) && (x = p.match(/^(?:the )?([a-z'-]+) ([a-z'-]+)$/)) && words(x[1]).length &&
        !read()[x[1] + " " + x[2]] && !dictEntry(x[1] + " " + x[2]) && allSenses(x[2]).length > 1) return { word: x[2], cue: "mass", extra: words(x[1]), compound: true };
    return null;
  }

  function context(text, w, userOnly) {
    var msgs = [], ctx = {}, last = clean(text);
    try { if (typeof global.currentChat === "function") msgs = global.currentChat().messages || []; } catch (e) {}
    msgs = msgs.slice(-7).filter(function (m) { return !userOnly || (m && m.role === "user"); })
      .map(function (m) { return String((m && m.content) || ""); });
    if (msgs.length && clean(msgs[msgs.length - 1]) === last) msgs.pop();
    msgs.forEach(function (l) { if (/^(which one\?|dictionary says)/.test(clean(l))) return; words(l).forEach(function (x) { ctx[x] = 1; }); });
    delete ctx[w]; delete ctx[w.replace(/s$/, "")];
    return ctx;
  }

  function expandSet(list) {
    var d = D(), set = {};
    list.forEach(function (x) { set[x] = 1; });
    /* small built-in synonym groups (stems, as contentWords gives them) */
    var SYN = ["sound noise loud cry call growl bark howl roar yelp woof", "dog puppy hound wolf canine animal pet",
      "tree wood woody trunk branch plant stem root oak pine", "boat ship sail vessel"];
    SYN.forEach(function (g) {
      var gs = g.split(" ");
      if (gs.some(function (y) { return set[y] || set[y + "s"]; })) gs.forEach(function (y) { set[y] = 1; });
    });
    return set;
  }

  function score(s, cue, ctx) {
    var sc = 0, k, cs;
    if (cue === "count" && s.kind === "count") sc += 2;
    /* "piece of bark", "the bark of", "tree bark" say which sense outright; "bark" only leans. */
    if (cue === "mass") sc += s.kind === "mass" ? 4 : s.kind === "count" ? -1 : 0;
    if (cue === "bare" && s.kind === "mass") sc += 1.5;
    if (cue === "bare" && s.source === "taught" && s.kind === "count") sc -= 0.5; /* "bark" is not "a bark" */
    if (s.source === "taught") sc += 1;
    cs = expandSet(s.cues);
    var ov = 0;
    for (k in ctx) if (cs[k]) ov++;
    return sc + Math.min(ov, 3);
  }

  function short(s) {
    var g = s.gloss.split(" ").slice(0, 8).join(" ");
    return g + (s.gloss.split(" ").length > 8 ? "..." : "");
  }

  function say(w, s) {
    if (s.source === "taught") return s.gloss;
    return "dictionary says: " + (s.word || w) + " (" + (POS[s.pos] || "word") + "): " + s.gloss + ".";
  }

  /* Answer a what-is question by sense. null = not ours (old flow runs). */
  function answer(text) {
    var p = parse(text), L = global.NovaLookup, list, ctx, scored, i, extra = {};
    if (!p || !p.word) return null;
    var w = p.word;
    if (L && L.readFacts) {
      var f = L.readFacts()[w];
      if (f && typeof f === "object" && f.locked) return null; /* a locked meaning always wins */
    }
    var taught = read()[w];
    var hasTaught = Array.isArray(taught) && taught.length;
    if (!hasTaught && !(p.cue === "mass")) return null; /* dictionary only: v56 flow */
    list = allSenses(w);
    if (!list.length) return null;
    if (list.length === 1) return hasTaught ? remember(w, say(w, list[0])) : null;
    /* v58: wording first. Senses split on wording when some are mass and some count. */
    var want = p.cue === "count" ? "count" : (p.cue === "mass" || p.cue === "bare") ? "mass" : "";
    var split = list.some(function (s) { return s.kind === "mass"; }) && list.some(function (s) { return s.kind === "count"; });
    var cued = !!want && split;
    if (cued) {
      var keep = list.filter(function (s) { return s.kind === want; });
      if (keep.length) list = keep;
      if (list.length === 1) { try { if (D() && D().clearOffer) D().clearOffer(); } catch (e0) {} return remember(w, say(w, list[0])); }
    }
    /* context: for wording-cued lines only the creator's own lines count (never Nova's answers) */
    ctx = context(text, w, cued);
    (p.extra || []).forEach(function (x) { ctx[x] = 1; });
    scored = list.map(function (s, k) { return { s: s, sc: score(s, p.cue, ctx), k: k }; })
      .sort(function (a, b) { return b.sc - a.sc || a.k - b.k; });
    if (scored[0].sc - scored[1].sc < MARGIN) {
      try { localStorage.setItem(CHOOSE, JSON.stringify({ word: w, options: [scored[0].s, scored[1].s], at: Date.now() })); } catch (e) {}
      try { if (D() && D().clearOffer) D().clearOffer(); } catch (e2) {}
      return remember(w, "which one? 1) " + short(scored[0].s) + " 2) " + short(scored[1].s));
    }
    try { if (D() && D().clearOffer) D().clearOffer(); } catch (e3) {}
    return remember(w, say(w, scored[0].s));
  }
  function remember(w, out) {
    try { localStorage.setItem(LAST, JSON.stringify({ word: w, at: Date.now() })); } catch (e) {}
    return out;
  }

  /* The line after "which one?": 1/2/first/second or words from one meaning. Never teaches. */
  function answerChoice(text) {
    var c, q = clean(text).replace(/[.!?]+$/, ""), k = -1, a, b, wq;
    try { c = JSON.parse(localStorage.getItem(CHOOSE) || "null"); } catch (e) { c = null; }
    if (!c || !c.options) return null;
    if (Date.now() - (c.at || 0) > TTL) { localStorage.removeItem(CHOOSE); return null; }
    if (/^(1|one|first|the first|first one|the first one|number 1|number one)$/.test(q)) k = 0;
    else if (/^(2|two|second|the second|second one|the second one|number 2|number two)$/.test(q)) k = 1;
    else if (/^(skip|never mind|nevermind|cancel|neither|forget it)$/.test(q)) { localStorage.removeItem(CHOOSE); return "ok."; }
    else {
      wq = expandSet(words(q));
      a = words(c.options[0].gloss).filter(function (x) { return wq[x]; }).length;
      b = words(c.options[1].gloss).filter(function (x) { return wq[x]; }).length;
      if (a > b) k = 0; else if (b > a) k = 1;
    }
    localStorage.removeItem(CHOOSE);
    if (k < 0) return null;
    return say(c.word, c.options[k]);
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._senses) return;
    var orig = reply, p;
    function wrapped(text) {
      var a = answerChoice(text);
      if (a) return a;
      return orig.apply(this, arguments);
    }
    for (p in orig) if (Object.prototype.hasOwnProperty.call(orig, p)) wrapped[p] = orig[p];
    wrapped._senses = true;
    reply = wrapped;
  }

  /* Dictionary lines and "which one?" are not lessons. */
  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._senses) return;
    var orig = T.learnPair, p;
    var g = function (user, nova) {
      if (/^which one\? 1\) /.test(String(nova || "").toLowerCase())) return false;
      return orig.apply(this, arguments);
    };
    for (p in orig) if (Object.prototype.hasOwnProperty.call(orig, p)) g[p] = orig[p];
    g._senses = true;
    T.learnPair = g;
  }

  global.NovaSenses = { read: read, addTaught: addTaught, editTaught: editTaught, allSenses: allSenses, parse: parse,
    answer: answer, answerChoice: answerChoice, migrate: migrate, cueOf: cueOf, KEY: KEY };
  migrate();
  wrapReply();
  guardLearn();
  if (global.document && document.addEventListener) document.addEventListener("DOMContentLoaded", function () { migrate(); wrapReply(); guardLearn(); });
})(window);
