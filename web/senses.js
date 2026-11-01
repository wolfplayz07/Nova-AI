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
   ("what does it mean", "what is that word").
   v59: usage beats a guess. When the creator's sentence USES the word ("he hit a single",
   "she is single", "their new single", "a single apple"), the sense is picked from how the word
   is used there: its part of speech from the words around it (a/the/their before it and nothing
   after -> noun; a/the before it and a noun after -> adjective in front of a noun; is/am/are
   before it -> adjective after the verb; to/can/will or he/she/they before it, -ed/-ing, or a
   plural noun before it -> verb; he/she + verb before it -> adverb), WordNet's own markers (some adjectives only go in front of a noun), how the word sits
   in each sense's example sentences, and overlap of the sentence's words with each sense's
   gloss, examples and synonyms. Generic: no per-word rules. The sentence is either in the
   question ("what does single mean in she is single") or the creator's line just before a
   question with no wording cue of its own ("she is single" / "what does single mean").
   A question's own wording ("what is a bark") still beats the chat (v58). "which one?" is only
   asked when the sentence gives no clue, and then lists every meaning (pick by number). */
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
    list.push({ gloss: g, source: "taught", kind: cueOf(src, w) || (/^(a|an|to) /.test(g) ? "count" : ""), cues: Object.keys(cues).slice(0, 12), line: clean(src).slice(0, 120), at: Date.now() });
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

  /* full = every dictionary sense (v59 usage scoring); otherwise the two main ones (v57/v58). */
  function allSenses(w, full) {
    var out = [], list = read()[w], e = dictEntry(w), i, n;
    if (Array.isArray(list)) list.forEach(function (s) { out.push({ gloss: s.gloss, source: "taught", kind: s.kind || "", cues: s.cues || [], line: s.line || "" }); });
    n = e ? (full ? e.senses.length : Math.min(2, e.senses.length)) : 0;
    for (i = 0; i < n; i++) {
      var d = e.senses[i];
      out.push({ gloss: String(d[1]).replace(/[.\s]+$/, ""), source: "dict", pos: d[0], idx: i,
        kind: d[0] === "v" ? "count" : d[0] === "n" ? "mass" : "", cues: words(d[1]), word: e.word,
        ex: Array.isArray(d[2]) ? d[2] : [], syn: Array.isArray(d[3]) ? d[3] : [], mark: d[4] || "" });
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


  /* ---- v59: usage. How the word sits in the creator's sentence picks the sense. ---- */
  function set(str) { var o = {}; str.split(" ").forEach(function (x) { o[x] = 1; }); return o; }
  var DET = set("a an the this that these those my your his her its our their one another every each some any no");
  var COP = set("is am are was were be been being isnt arent wasnt werent seem seems seemed feel feels felt stay stays stayed become becomes became");
  var MOD = set("to can could will would should must may might do does did dont didnt doesnt cant cannot wont wouldnt couldnt lets");
  var SUBJ = set("i you we they he she");
  var ADV = set("very so too really quite still not never always just also now pretty totally");
  var LINK = set("of in on at to for with from by and or but is was are were am that which who whom when as than up down out off over into onto about after before because if then so");
  var PERSON = set("i you we they he she him her them me us someone somebody person people man men woman women girl boy guy lady kid");

  function toks(line) { return clean(line).split(" ").filter(Boolean); }
  /* index of the word (or a simple form of it) in the tokens, and the leftover ending */
  function findWord(t, w) {
    var stemE = w.replace(/e$/, ""), last = w.charAt(w.length - 1), i, x, suf;
    for (i = 0; i < t.length; i++) {
      x = t[i].replace(/'s$/, "");
      if (x === w) return { i: i, suf: "" };
      if (x.indexOf(w) === 0) { suf = x.slice(w.length); if (/^(s|es|d|ed|ing)$/.test(suf)) return { i: i, suf: suf }; }
      if (x.indexOf(stemE) === 0 && stemE !== w) { suf = x.slice(stemE.length); if (/^(ed|ing)$/.test(suf)) return { i: i, suf: suf }; }
      if (x.indexOf(w + last) === 0) { suf = x.slice(w.length + 1); if (/^(ed|ing)$/.test(suf)) return { i: i, suf: suf }; }
    }
    return null;
  }
  /* the word's role in a line: { pos: "n"|"v"|"a"|"", attrib, pred, person } or null if absent */
  function frameAt(t, i, suf) {
    var prev = t[i - 1] || "", p2 = t[i - 2] || "", p3 = t[i - 3] || "", next = t[i + 1] || "";
    var f = { pos: "", attrib: false, pred: false, person: false };
    if (suf === "ed" || suf === "d" || suf === "ing") {
      if (DET[prev] && suf === "ing") f.pos = "n"; else f.pos = "v";
      return f;
    }
    /* "married or single" -> same role as "married" */
    if ((prev === "or" || prev === "and") && i >= 2 && !DET[p2]) {
      var g = frameAt(t, i - 2, "");
      if (g.pos) return g;
    }
    /* "the dogs bark": a plural noun right before it -> verb */
    if (suf === "" && DET[p2] && /[^s]s$/.test(prev) && !COP[prev] && !LINK[prev] && !DET[prev]) { f.pos = "v"; return f; }
    /* "she runs fast": he/she + a verb before it -> adverb */
    if (suf === "" && SUBJ[p2] && prev && !COP[prev] && !MOD[prev] && !ADV[prev] && !LINK[prev] && !DET[prev] && (!next || LINK[next])) { f.pos = "r"; return f; }
    var detBefore = DET[prev] || (DET[p2] && prev && !COP[prev] && !MOD[prev] && !LINK[prev]) ||
      (DET[p3] && p2 && prev && !COP[prev] && !COP[p2] && !LINK[prev] && !LINK[p2]);
    if (detBefore) {
      if (suf === "" && next && !LINK[next] && !COP[next] && !MOD[next] && !DET[next] && !SUBJ[next]) { f.pos = "a"; f.attrib = true; }
      else f.pos = "n";
      return f;
    }
    var copAt = COP[prev] ? i - 1 : (ADV[prev] && COP[p2]) ? i - 2 : (SUBJ[prev] && COP[p2]) ? i - 2 : -1;
    if (copAt >= 0 && suf === "") {
      f.pos = "a"; f.pred = true;
      var subj = t[copAt - 1] || "", inv = t[copAt + 1] || "";
      if (PERSON[subj] || PERSON[inv]) f.person = true;
      return f;
    }
    if (MOD[prev] || (SUBJ[prev] && suf !== "es")) { f.pos = "v"; return f; }
    return f;
  }
  function frame(line, w) {
    var t = toks(line), h = findWord(t, w);
    return h ? frameAt(t, h.i, h.suf) : null;
  }
  function sensePos(s) {
    if (s.pos) return s.pos === "s" ? "a" : s.pos;
    if (/^to /.test(s.gloss)) return "v";
    if (/^(a|an|the|one|some) /.test(s.gloss)) return "n";
    return "";
  }
  function personSet(o) { for (var k in PERSON) if (PERSON[k] && k.length > 2) o[k] = 1; o.person = 1; return o; }

  /* score every sense against the usage line. clue = false when the line says nothing. */
  function usageScores(list, line, w, extra) {
    var f = frame(line, w) || { pos: "" }, ctx = {}, clue = !!f.pos, out;
    words(line).concat(extra || []).forEach(function (x) { if (x !== w && x.indexOf(w) !== 0) ctx[x] = 1; });
    if (f.person) ctx.person = 1;
    out = list.map(function (s, k) {
      var sc = 0, sp = sensePos(s), exs = (s.ex || []).concat(s.line ? [s.line] : []), m = 0, ov = 0, tgt, x;
      if (f.pos && sp) sc += sp === f.pos ? 3 : -3;
      if (f.attrib && s.mark === "p") sc -= 3;
      if (f.pred && s.mark === "a") sc -= 3;
      exs.forEach(function (e) {
        var g = frame(e, w);
        if (g && f.pos && g.pos === f.pos && g.attrib === f.attrib && g.pred === f.pred) m++;
      });
      sc += Math.min(m, 2) * 0.75;
      tgt = expandSet(words([s.gloss].concat(s.ex || [], s.syn || []).join(" ")).concat(s.cues || []));
      if (tgt.person || tgt.individual || Object.keys(tgt).some(function (y) { return PERSON[y]; })) personSet(tgt);
      for (x in ctx) if (tgt[x]) ov++;
      if (ov) clue = true;
      sc += Math.min(ov, 3) * 1.5;
      return { s: s, sc: sc, k: k };
    });
    out.sort(function (a, b) { return b.sc - a.sc || a.k - b.k; });
    return { ranked: out, clue: clue, frame: f };
  }

  /* the creator's line just before this question, if it uses the word (not a question, not a lesson) */
  function usageLine(text, w) {
    var msgs = [], last = clean(text), u, i;
    try { if (typeof global.currentChat === "function") msgs = global.currentChat().messages || []; } catch (e) {}
    u = msgs.filter(function (m) { return m && m.role === "user"; }).map(function (m) { return String(m.content || ""); });
    if (u.length && clean(u[u.length - 1]) === last) u.pop();
    if (!u.length) return null;
    var l = u[u.length - 1], c = clean(l);
    if (/\?\s*$/.test(l) || /^(what|whats|who|why|how|where|when|which|define|read|teach|edit|lock|remember|forget|is|are|do|does|can) /.test(c)) return null;
    var W = esc(w);
    if (new RegExp("^(?:actually |no |nope |well )?(?:a |an |the )?" + W + "(?:s)? (?:is|are|means|mean) ").test(c)) return null;
    return findWord(toks(c), w) ? l : null;
  }

  /* "what does single mean in she is single", "what is single in 'he hit a single'" */
  function parseUsage(text) {
    var q = clean(text).replace(/^(?:ok|okay|hey|nova)\b\s*/g, ""), m;
    m = q.match(/^(?:what does|whats|what is|what's) (?:the meaning of |the word )?'?([a-z-]+)'? (?:mean |means )?(?:in|when|as in|like in|if|when i say|if i say|when you say|in the sentence|here) (?:i say |you say |the sentence )?(.+)$/);
    if (m && findWord(toks(m[2]), m[1])) return { word: m[1], cue: "usage", line: m[2].replace(/^'|'$/g, ""), extra: [] };
    return null;
  }

  function usageAnswer(w, line, extra) {
    var list = allSenses(w, true), hasTaught = list.some(function (s) { return s.source === "taught"; }), r, top;
    if (list.length < 2) return null;
    r = usageScores(list, line, w, extra);
    try { if (D() && D().clearOffer) D().clearOffer(); } catch (e0) {}
    if (!r.clue) { /* the sentence gives no clue: ask, with every meaning */
      if (!hasTaught && D() && D().offer) return remember(w, D().offer(w, null, list.map(function (s) { return s.idx; })));
      return remember(w, askAll(w, list));
    }
    top = r.ranked[0].s;
    if (top.source === "dict" && !hasTaught && D() && D().offer) return remember(w, D().offer(w, null, top.idx));
    return remember(w, say(w, top));
  }
  function askAll(w, opts) {
    try { localStorage.setItem(CHOOSE, JSON.stringify({ word: w, options: opts, at: Date.now() })); } catch (e) {}
    return "which one? " + opts.map(function (s, k) { return (k + 1) + ") " + short(s); }).join(" ");
  }

  /* Answer a what-is question by sense. null = not ours (old flow runs). */
  function answer(text) {
    var p = parseUsage(text) || parse(text), L = global.NovaLookup, list, ctx, scored, i, extra = {}, ul;
    if (!p || !p.word) return null;
    var w = p.word;
    if (L && L.readFacts) {
      var f = L.readFacts()[w];
      if (f && typeof f === "object" && f.locked) return null; /* a locked meaning always wins */
    }
    /* v59: a sentence that uses the word decides, unless the question has its own wording cue */
    if (p.cue === "usage") { var ua = usageAnswer(w, p.line, []); if (ua) return ua; }
    else if ((p.cue === "bare" || p.cue === "") && (ul = usageLine(text, w))) {
      var ub = usageAnswer(w, ul, p.extra || []);
      if (ub) return ub;
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
      /* v59: list every close meaning, not just two */
      var opts = scored.filter(function (x) { return scored[0].sc - x.sc < MARGIN; }).map(function (x) { return x.s; });
      return remember(w, askAll(w, opts));
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
    var NUMW = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
    var ORDW = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
    var nq = q.replace(/^(?:the |number )/, "").replace(/ one$/, "");
    if (/^\d{1,2}$/.test(nq)) k = parseInt(nq, 10) - 1;
    else if (NUMW.indexOf(nq) >= 0) k = NUMW.indexOf(nq);
    else if (ORDW.indexOf(nq) >= 0) k = ORDW.indexOf(nq);
    if (k >= c.options.length) k = -1;
    if (k >= 0) { /* picked by number */ }
    else if (/^(skip|never mind|nevermind|cancel|neither|forget it)$/.test(q)) { localStorage.removeItem(CHOOSE); return "ok."; }
    else {
      wq = expandSet(words(q));
      var hits = c.options.map(function (o) { return words(o.gloss).filter(function (x) { return wq[x]; }).length; });
      var best = Math.max.apply(null, hits);
      if (best > 0 && hits.filter(function (h) { return h === best; }).length === 1) k = hits.indexOf(best);
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
    answer: answer, answerChoice: answerChoice, migrate: migrate, cueOf: cueOf, frame: frame, usageScores: usageScores, KEY: KEY };
  migrate();
  wrapReply();
  guardLearn();
  if (global.document && document.addEventListener) document.addEventListener("DOMContentLoaded", function () { migrate(); wrapReply(); guardLearn(); });
})(window);
