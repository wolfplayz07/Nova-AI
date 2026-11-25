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
  var MARGIN = 1, SHOW = 3, COMPOUND = "nova-compound-ask-v1"; /* v65: 3 senses then more?; compound noun asks */
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
    /* v65: "what is a hospital bill?" — two-word noun phrase, handled as a compound later. */
    if ((x = p.match(/^(?:a|an) ([a-z'-]+) ([a-z'-]+)$/))) return { kind: "compound", mod: x[1], head: x[2], phrase: x[1] + " " + x[2], word: x[2], cue: "count", extra: [x[1]] };
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
    msgs.forEach(function (l) { if (/^(which (?:one|[a-z'-]+)\?|dictionary says)/.test(clean(l))) return; words(l).forEach(function (x) { ctx[x] = 1; }); });
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
  /* v65: verb-meaning questions. "What does it mean when you bill someone", "what is it to bill",
     "what does it mean to bill", and bare "what does bill mean" prefer verb senses. */
  function parseVerb(text) {
    var q = clean(text).replace(/^(?:ok|okay|hey|nova)\b\s*/g, ""), m, rest, w, t;
    m = q.match(/^(?:what does it mean|whats it mean) (?:when you |when someone |when a person |when one |if you |if someone )(.+)$/);
    if (m) {
      rest = m[1].replace(/^(to )/, "");
      w = rest.split(" ")[0].replace(/s$/, "");
      if (w) return { word: w, cue: "usage", line: "you " + rest, extra: [], verbFirst: true };
    }
    m = q.match(/^(?:what is it to|whats it to|what does it mean to|whats it mean to) ([a-z'-]+)\b(.*)$/);
    if (m) return { word: m[1], cue: "usage", line: "to " + m[1] + (m[2] || ""), extra: [], verbFirst: true };
    m = q.match(/^(?:what does|whats) ([a-z'-]+) mean$/);
    if (m && !/^(it|that|this)$/.test(m[1])) return { word: m[1], cue: "verb", line: "", extra: [], verbFirst: true };
    return null;
  }

  function usageAnswer(w, line, extra, verbFirst) {
    var list = allSenses(w, true), hasTaught = list.some(function (s) { return s.source === "taught"; }), r, top, verbs;
    if (verbFirst && !line) {
      verbs = list.filter(function (s) { return s.pos === "v"; });
      if (verbs.length === 1 && verbs[0].source === "dict" && !hasTaught && D() && D().offer) {
        try { if (D() && D().clearOffer) D().clearOffer(); } catch (eV) {}
        return remember(w, D().offer(w, null, verbs[0].idx));
      }
      if (verbs.length > 1 && !hasTaught && D() && D().offer) {
        try { if (D() && D().clearOffer) D().clearOffer(); } catch (eV2) {}
        return remember(w, D().offer(w, null, verbs.map(function (s) { return s.idx; }).filter(function (i) { return i != null; })));
      }
      if (verbs.length) { try { if (D() && D().clearOffer) D().clearOffer(); } catch (eV3) {} return remember(w, say(w, verbs[0])); }
    }
    if (list.length < 2) return null;
    r = usageScores(list, line, w, extra);
    try { if (D() && D().clearOffer) D().clearOffer(); } catch (e0) {}
    if (verbFirst) {
      verbs = r.ranked.filter(function (x) { return x.s.pos === "v"; });
      if (verbs.length && (r.frame && r.frame.pos === "v" || verbs[0].sc >= r.ranked[0].sc - 0.5)) {
        top = verbs[0].s;
        if (top.source === "dict" && !hasTaught && D() && D().offer) return remember(w, D().offer(w, null, top.idx));
        return remember(w, say(w, top));
      }
    }
    if (!r.clue) { /* the sentence gives no clue: ask, with every meaning */
      if (!hasTaught && D() && D().offer) return remember(w, D().offer(w, null, list.map(function (s) { return s.idx; })));
      return remember(w, askAll(w, list));
    }
    top = r.ranked[0].s;
    if (top.source === "dict" && !hasTaught && D() && D().offer) return remember(w, D().offer(w, null, top.idx));
    return remember(w, say(w, top));
  }
  function listOpts(opts, from, to) {
    return opts.slice(from, to).map(function (s, k) { return (from + k + 1) + ") " + short(s); }).join(" ");
  }
  function askAll(w, opts, shown, meta) {
    shown = Math.min(shown == null ? SHOW : shown, opts.length);
    meta = meta || {};
    var which = meta.which || "one";
    try { localStorage.setItem(CHOOSE, JSON.stringify({ word: w, options: opts, shown: shown, which: which, compound: !!meta.compound, at: Date.now() })); } catch (e) {}
    var text = "which " + which + "? " + listOpts(opts, 0, shown);
    if (shown < opts.length) text += ". more?";
    return text;
  }
  function isMore(q) { return /^(more|more\?|what else|other meaning|another meaning|next meaning|any other meaning|what else does it mean)$/.test(q); }
  function parsePicks(q, max) {
    var s = String(q || "").replace(/[.!?]+$/g, "").trim(), parts, out = [], i, k, seen = {}, NUMW, ORDW, nq;
    if (/^(both|both of (?:them|those)|the first two)$/.test(s)) return max >= 2 ? [0, 1] : [0];
    if (/^(all|all of them|every one|every meaning)$/.test(s)) {
      for (i = 0; i < max; i++) out.push(i);
      return out;
    }
    nq = s.replace(/^(?:the |number )/, "");
    if (/^\d+(?:\s*(?:,|&|and)\s*\d+)+$/.test(nq) || /^\d+(?:\s+\d+)+$/.test(nq)) {
      parts = nq.split(/\s*(?:,|&|and)\s*|\s+/);
      for (i = 0; i < parts.length; i++) {
        k = parseInt(parts[i], 10) - 1;
        if (k < 0 || k >= max || seen[k]) continue;
        seen[k] = 1; out.push(k);
      }
      return out.length ? out : null;
    }
    NUMW = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
    ORDW = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
    nq = nq.replace(/ one$/, "");
    if (/^\d{1,2}$/.test(nq)) k = parseInt(nq, 10) - 1;
    else if (NUMW.indexOf(nq) >= 0) k = NUMW.indexOf(nq);
    else if (ORDW.indexOf(nq) >= 0) k = ORDW.indexOf(nq);
    else k = -1;
    if (k >= 0 && k < max) return [k];
    return null;
  }
  function saveChosen(w, opts, indexes, compound) {
    var L = global.NovaLookup, i, s, glosses = [], ok = 0;
    for (i = 0; i < indexes.length; i++) {
      s = opts[indexes[i]];
      if (!s) continue;
      glosses.push(s.gloss);
      try {
        if (L && L.saveUser && L.saveUser(w, s.gloss, s.gloss)) ok++;
        else if (addTaught(w, s.gloss, s.gloss)) ok++;
      } catch (e) {}
    }
    if (!glosses.length) return say(w, opts[0]);
    if (compound || / /.test(w)) {
      if (glosses.length === 1) return (ok ? "saved. " : "") + w + " means " + glosses[0] + ".";
      return (ok ? "saved. " : "") + w + " can mean: " + glosses.map(function (g, k) { return (k + 1) + ") " + g; }).join(" ") + ".";
    }
    if (glosses.length === 1) return (ok ? "saved. " : "") + (opts[indexes[0]].source === "taught" ? glosses[0] : say(w, opts[indexes[0]]));
    return (ok ? "saved. " : "") + w + " can mean: " + glosses.map(function (g, k) { return (k + 1) + ") " + g; }).join(" ") + ".";
  }

  /* Answer a what-is question by sense. null = not ours (old flow runs). */
  function answer(text) {
    var p = parseUsage(text) || parseVerb(text) || parse(text), L = global.NovaLookup, list, ctx, scored, i, extra = {}, ul;
    if (!p) return null;
    if (p.kind === "compound") return compoundAnswer(p);
    if (!p.word) return null;
    var w = p.word;
    if (L && L.readFacts) {
      var f = L.readFacts()[w];
      if (f && typeof f === "object" && f.locked) return null; /* a locked meaning always wins */
    }
    /* v59: a sentence that uses the word decides, unless the question has its own wording cue.
       v65: bare "what does X mean" still uses the prior sentence when it has one; otherwise verb-first. */
    if (p.cue === "usage" && p.line) { var ua = usageAnswer(w, p.line, p.extra || [], p.verbFirst); if (ua) return ua; }
    else if ((p.cue === "bare" || p.cue === "" || p.cue === "verb" || (p.verbFirst && !p.line)) && (ul = usageLine(text, w))) {
      var ub = usageAnswer(w, ul, p.extra || [], p.verbFirst);
      if (ub) return ub;
    }
    if (p.verbFirst && !p.line) { var uv = usageAnswer(w, "", [], true); if (uv) return uv; }
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

  /* The line after "which one?": a number, "both", "all", "1 and 2", "1,2", or gloss text.
     v65: every chosen sense is saved; never falls through to "i do not know". */
  function answerChoice(text) {
    var c, q = clean(text).replace(/[.!?]+$/, ""), picks, L, hits, best, wq;
    try { c = JSON.parse(localStorage.getItem(CHOOSE) || "null"); } catch (e) { c = null; }
    if (!c || !c.options) return null;
    if (Date.now() - (c.at || 0) > TTL) { localStorage.removeItem(CHOOSE); return null; }
    if (/^(skip|never mind|nevermind|cancel|neither|forget it)$/.test(q)) { localStorage.removeItem(CHOOSE); return "ok."; }
    var which = c.which || "one";
    if (isMore(q)) {
      if ((c.shown || 0) < c.options.length) {
        c.shown = c.options.length; c.at = Date.now();
        try { localStorage.setItem(CHOOSE, JSON.stringify(c)); } catch (e2) {}
        return "which " + which + "? " + listOpts(c.options, 0, c.options.length);
      }
      return "those are the only meanings i have. " + "which " + which + "? say a number or both.";
    }
    picks = parsePicks(q, c.options.length);
    if (!picks) {
      wq = expandSet(words(q));
      hits = c.options.map(function (o) { return words(o.gloss).filter(function (x) { return wq[x]; }).length; });
      best = Math.max.apply(null, hits.concat([0]));
      if (best > 0) {
        picks = [];
        hits.forEach(function (h, i) { if (h === best) picks.push(i); });
      }
    }
    if (picks && picks.length) {
      localStorage.removeItem(CHOOSE);
      return saveChosen(c.word, c.options, picks, c.compound);
    }
    try { L = global.NovaLookup; if (L && L.isNewQuestion && L.isNewQuestion(text)) { localStorage.removeItem(CHOOSE); return null; } } catch (e3) {}
    return "which " + which + "? say a number, both, or more.";
  }


  /* v65: modifier bag = its glosses, examples, synonyms, plus related-word groups
     (hospital also brings treatment / payment / money). Head-sense bags are not expanded
     through those groups, so a law-sense of "bill" does not inherit hospital money words. */
  var REL = [
    "talk speak say tell utter voice conversation word words speech",
    "sound noise loud cry call growl bark howl roar yelp woof",
    "dog dogs puppy hound canis wolf canine animal animals pet cat",
    "tree trees wood woody trunk branch plant plants stem stems root roots",
    "water river stream lake sea ocean",
    "money cash bank pay paid payment charge fee invoice account owe owed owing",
    "boat ship sail sea",
    "hospital clinic doctor medical patient treatment treat care health sick injured nurse medicine surgery surgical insurance payment pay paid money charge fee invoice account owe owed service services",
    "phone telephone mobile cell utility electric electricity gas water rent tuition payment pay paid money charge fee invoice account owe owed service services"
  ].map(function (g) { return g.split(" "); });
  function relExpand(set) {
    REL.forEach(function (g) {
      var i, hit = false;
      for (i = 0; i < g.length; i++) if (set[g[i]] || set[g[i].replace(/s$/, "")] || set[g[i] + "s"]) { hit = true; break; }
      if (hit) g.forEach(function (x) { set[x] = 1; if (x.length > 3 && /s$/.test(x)) set[x.slice(0, -1)] = 1; });
    });
    return set;
  }
  function hasNounSense(e) {
    var i;
    if (!e || !e.senses) return false;
    for (i = 0; i < e.senses.length; i++) if (e.senses[i][0] === "n") return true;
    return false;
  }
  function wordBag(term, expandRel, nounOnly) {
    var e = dictEntry(term), set = {}, i, s, t;
    words(term).forEach(function (x) { set[x] = 1; });
    if (e) for (i = 0; i < e.senses.length; i++) {
      s = e.senses[i];
      if (nounOnly && s[0] !== "n") continue;
      t = [s[1]].concat(Array.isArray(s[2]) ? s[2] : [], Array.isArray(s[3]) ? s[3] : []).join(" ");
      words(t).forEach(function (x) { set[x] = 1; });
    }
    return expandRel ? relExpand(set) : set;
  }
  function firstGloss(e, nounOnly) {
    var i, s;
    if (!e || !e.senses || !e.senses.length) return "";
    for (i = 0; i < e.senses.length; i++) {
      s = e.senses[i];
      if (!nounOnly || s[0] === "n") return String(s[1]).replace(/[.\s]+$/, "");
    }
    return String(e.senses[0][1]).replace(/[.\s]+$/, "");
  }
  /* "an" before a vowel sound: an oak, an hour; "a" before a consonant sound: a utility, a university. */
  function article(word) {
    var w = String(word || "").toLowerCase().replace(/^[^a-z]+/, "").split(/[^a-z'-]+/)[0] || "";
    if (/^(hour|honest|honor|honour|heir|herb|herbal)s?$/.test(w) || /^(hour|honest|honor|honour|heir|herb|herbal)-/.test(w)) return "an";
    if (/^(one|once|ones)\b/.test(w) || /^eu/.test(w)) return "a";
    if (/^u/.test(w)) {
      if (/^uni|^unique|^use|^usu|^uto|^ura|^uri|^uke|^uvu|^ubiqu/.test(w)) return "a";
      if (/^u(?:n(?!i)|m|p|g)/.test(w) || /^u[aeiou]/.test(w)) return "an";
      return "a";
    }
    if (/^[aeiou]/.test(w)) return "an";
    return "a";
  }
  function senseBag(s) {
    var set = {}, t = [s[1] || s.gloss || ""].concat(Array.isArray(s[2]) ? s[2] : (s.ex || []), Array.isArray(s[3]) ? s[3] : (s.syn || [])).join(" ");
    words(t).forEach(function (x) { set[x] = 1; });
    return set;
  }
  function scoreHead(modBag, s) {
    var bag = senseBag(s), n = 0, k;
    for (k in bag) if (modBag[k]) n++;
    return { overlap: n, sc: n + ((s.pos || s[0]) === "n" ? 0.2 : 0) };
  }
  function pickCompound(mod, head) {
    var e = dictEntry(head), me = dictEntry(mod), list, scored, bag, best, nouns, clear;
    if (!e || !e.senses.length || !me) return null;
    nouns = hasNounSense(me);
    bag = wordBag(mod, true, nouns);
    list = e.senses.map(function (s, i) { return { pos: s[0], gloss: String(s[1]).replace(/[.\s]+$/, ""), ex: s[2] || [], syn: s[3] || [], idx: i, word: e.word, source: "dict" }; });
    scored = list.map(function (s) { var sc = scoreHead(bag, s); return { s: s, sc: sc.sc, overlap: sc.overlap }; }).sort(function (a, b) { return b.sc - a.sc || a.s.idx - b.s.idx; });
    best = scored[0];
    if (!best) return null;
    clear = best.overlap >= 1 && (scored.length < 2 || best.overlap > scored[1].overlap);
    if (scored.length === 1) clear = true;
    return { head: best.s, modGloss: firstGloss(me, nouns), score: best.sc, overlap: best.overlap, ranked: scored, clear: clear };
  }
  function writeCompound(o) { try { localStorage.setItem(COMPOUND, JSON.stringify(o)); } catch (e) {} }
  function readCompound() {
    var o;
    try { o = JSON.parse(localStorage.getItem(COMPOUND) || "null"); } catch (e) { o = null; }
    if (!o || !o.phrase || Date.now() - (o.at || 0) > TTL) { try { localStorage.removeItem(COMPOUND); } catch (e2) {} return null; }
    return o;
  }
  function clearCompound() { try { localStorage.removeItem(COMPOUND); } catch (e) {} }
  function compoundAnswer(p) {
    var L = global.NovaLookup, phrase = p.phrase, taught, pick, art, reply;
    try { if (L && L.readFacts) { var f = L.readFacts()[phrase]; if (f && ((typeof f === "object" && (f.locked || f.user)) || typeof f === "string")) return null; } } catch (e0) {}
    if (read()[phrase] && read()[phrase].length) return say(phrase, { source: "taught", gloss: read()[phrase][0].gloss });
    if (dictEntry(phrase)) return null;
    if (!dictEntry(p.mod) || !dictEntry(p.head)) return null;
    pick = pickCompound(p.mod, p.head);
    if (!pick) return null;
    try { if (D() && D().clearOffer) D().clearOffer(); } catch (e1) {}
    try { localStorage.removeItem(CHOOSE); } catch (e2) {}
    if (!pick.clear) {
      return askAll(phrase, pick.ranked.map(function (x) { return x.s; }), SHOW, { which: p.head, compound: true });
    }
    art = article(phrase);
    writeCompound({ phrase: phrase, mod: p.mod, head: p.head, gloss: pick.head.gloss, modGloss: pick.modGloss, at: Date.now() });
    return art + " " + phrase + " is probably " + pick.head.gloss + " for " + article(p.mod) + " " + p.mod + " (" + pick.modGloss + "). right?";
  }
  function answerCompound(text) {
    var o = readCompound(), q, L;
    if (!o) return null;
    q = clean(text).replace(/[.!?]+$/, "");
    L = global.NovaLookup;
    if (/^(yes|y|yeah|yep|yup|yea|sure|ok|okay|yes please|right|that's right|thats right|correct)$/.test(q) || (L && L.taughtYesNo && L.taughtYesNo(q) === "yes")) {
      clearCompound();
      try { if (L && L.saveUser && L.saveUser(o.phrase, o.gloss, o.gloss)) return "saved. " + o.phrase + " means " + o.gloss + "."; } catch (e) {}
      addTaught(o.phrase, o.gloss, o.gloss);
      return "saved. " + o.phrase + " means " + o.gloss + ".";
    }
    if (/^(skip|nevermind|never mind|cancel|forget it|not now)$/.test(q)) { clearCompound(); return "ok. skipped."; }
    if (/^(no|n|nope|nah|wrong|not quite|no thanks)$/.test(q) || (L && L.taughtYesNo && L.taughtYesNo(q) === "no")) {
      clearCompound();
      try { if (L && L.setPending) L.setPending({ question: "what is a " + o.phrase, term: o.phrase }); } catch (e2) {}
      return "ok. tell me what " + article(o.phrase) + " " + o.phrase + " means if you like.";
    }
    try { if (L && L.isNewQuestion && L.isNewQuestion(text)) { clearCompound(); return null; } } catch (e3) {}
    return article(o.phrase) + " " + o.phrase + " is probably " + o.gloss + " for " + article(o.mod) + " " + o.mod + " (" + o.modGloss + "). right?";
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._senses) return;
    var orig = reply, p;
    function wrapped(text) {
      var a = answerCompound(text);
      if (a) return a;
      a = answerChoice(text);
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
      if (/^(which (?:one|[a-z'-]+)\? |an? .+ is probably |saved\. )/.test(String(nova || "").toLowerCase())) return false;
      return orig.apply(this, arguments);
    };
    for (p in orig) if (Object.prototype.hasOwnProperty.call(orig, p)) g[p] = orig[p];
    g._senses = true;
    T.learnPair = g;
  }

  global.NovaSenses = { read: read, addTaught: addTaught, editTaught: editTaught, allSenses: allSenses, parse: parse, parseVerb: parseVerb,
    answer: answer, answerChoice: answerChoice, answerCompound: answerCompound, compoundAnswer: compoundAnswer, migrate: migrate, cueOf: cueOf, frame: frame, usageScores: usageScores, KEY: KEY, COMPOUND: COMPOUND, SHOW: SHOW };
  migrate();
  wrapReply();
  guardLearn();
  if (global.document && document.addEventListener) document.addEventListener("DOMContentLoaded", function () { migrate(); wrapReply(); guardLearn(); });
})(window);
