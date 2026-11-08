/* v63: rules and short reasoning (P4-lite). No neural changes.
   Statements like "An umbrella keeps you dry", "rain makes you wet", "ice is cold",
   "plants need water", "dogs do not like baths", "if it rains, (then) the ground gets wet",
   "you need a coat when it is cold" save a rule edge { from, rel, to, neg, qual, orig, cond,
   source: "taught" } in nova-rules-v1 (OPFS/IndexedDB backup through idb.js).
   Questions "if/when A, should I / do I need / will ... X?" and "should I / do I need X"
   (condition from the question or the creator's line just before) walk taught edges from A,
   at most 3 hops, and answer only from edges that exist: "yes, because rain makes you wet and
   an umbrella keeps you dry." Built-in opposites (wet/dry, ...) only connect a problem reached
   from A to a PROTECTIVE edge of X (keeps/protects/prevents/stops/blocks); never proof alone.
   Missing link with one side unknown -> "what happens when it rains?" and the next line is saved
   as a rule anchored to that prompt (Skip cancels), then the question is answered. Asked once per
   question; otherwise the old flow runs (honest "i do not know"). Exact saved answers keep
   priority for should/do-I-need questions; if/when questions try rules first.
   "what do you know about X" lists rules; "forget that rule" removes the last taught rule. */
(function (global) {
  var KEY = "nova-rules-v1", ASK = "nova-rules-ask-v1", TTL = 10 * 60 * 1000, MAX_HOPS = 3, MAX_VISIT = 400;

  var STOP = {};
  ("a an the you your yours it its i me my mine we us our they them their he she him her this that these those " +
   "to be is are am was were been being get gets got getting will would shall should can could may might must " +
   "do does did of in on at by for with from and or so then there here very really just also some any all " +
   "if when whenever out up").split(" ").forEach(function (w) { STOP[w] = 1; });
  var NEGW = /^(not|no|never|dont|don't|doesnt|doesn't|isnt|isn't|arent|aren't|cant|can't|cannot|wont|won't)$/;
  var KEEP = {};
  ("news bus gas yes this always series species physics glass grass class dress boss less mess loss cactus virus " +
   "bonus lens chaos iris tennis thing king ring sing spring string wing swing bring sting ceiling evening morning " +
   "nothing something red bed shed sled need seed feed speed weed bleed hundred wed").split(" ").forEach(function (w) { KEEP[w] = 1; });
  var IRREG = { kept: "keep", made: "make", got: "get", ran: "run", went: "go", gone: "go", wore: "wear", worn: "wear",
    ate: "eat", eaten: "eat", fell: "fall", fallen: "fall", froze: "freeze", frozen: "freeze", children: "child",
    people: "person", men: "man", women: "woman", feet: "foot", teeth: "tooth", mice: "mouse", geese: "goose",
    leaves: "leaf", knives: "knife", wolves: "wolf", has: "have", had: "have" };
  /* built-in opposites: only link a problem state to a protective edge */
  var OPP = {};
  [["wet", "dry"], ["hot", "cold"], ["warm", "cold"], ["full", "hungry"], ["light", "dark"], ["safe", "hurt"],
   ["safe", "danger"], ["healthy", "sick"], ["awake", "asleep"], ["clean", "dirty"], ["quiet", "loud"],
   ["cool", "hot"], ["calm", "angry"], ["happy", "sad"], ["rested", "tired"]].forEach(function (p) {
    (OPP[p[0]] = OPP[p[0]] || []).push(p[1]); (OPP[p[1]] = OPP[p[1]] || []).push(p[0]);
  });
  var PROTECT = /^(keeps|protects|prevents|stops|blocks|saves|shields)$/;
  var CAUSE = /^(makes|causes|leads to|brings|gives|gets|then|is|can|has)$/;

  function clean(s) { return String(s || "").toLowerCase().replace(/\u2019/g, "'").replace(/[^a-z0-9' ,\-]/g, " ").replace(/\s+/g, " ").trim(); }
  function dictKnows(w) {
    var D = global.NovaDict;
    try { var e = D.entry(w); return !!(e && e.word === w); } catch (x) { return false; }
  }
  /* rains/raining/rained -> rain, umbrellas -> umbrella, running -> run, making -> make, berries -> berry.
     A candidate is used only when the dictionary knows it as a word of its own (or, with no dictionary,
     by the first suffix rule). Short words and a keep-list (news, glass, ring, need ...) are never cut. */
  function lemma(w) {
    w = String(w || "").replace(/'s$/, "").replace(/'/g, "");
    if (IRREG[w]) return IRREG[w];
    if (KEEP[w] || w.length <= 3) return w;
    var c = [], b, d, i, D = global.NovaDict;
    if (/ies$/.test(w)) c.push(w.slice(0, -3) + "y");
    if (/(ss|x|z|ch|sh)es$/.test(w)) c.push(w.slice(0, -2));
    if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) c.push(w.slice(0, -1));
    if (/ing$/.test(w) && w.length > 5) {
      b = w.slice(0, -3);
      if (/([b-df-hj-np-tv-z])\1$/.test(b)) c.push(b.slice(0, -1));
      c.push(b, b + "e");
    }
    if (/ed$/.test(w) && w.length > 4) {
      d = w.slice(0, -2);
      if (/([b-df-hj-np-tv-z])\1$/.test(d)) c.push(d.slice(0, -1));
      c.push(d, w.slice(0, -1));
    }
    if (!c.length) return w;
    if (D && D.entry) {
      for (i = 0; i < c.length; i++) if (dictKnows(c[i])) return c[i];
      return w;
    }
    return c[0];
  }
  function toks(s) {
    var out = [];
    clean(s).replace(/,/g, " ").split(" ").forEach(function (w) {
      if (!w || STOP[w] || /^\d+$/.test(w) || NEGW.test(w)) return;
      out.push(lemma(w));
    });
    return out;
  }
  function uniq(a) { var o = {}, r = []; a.forEach(function (x) { if (x && !o[x]) { o[x] = 1; r.push(x); } }); return r; }
  function subset(a, b) { return a.length > 0 && a.every(function (x) { return b.indexOf(x) !== -1; }); }

  function read() {
    var o; try { o = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { o = null; }
    if (!o || !Array.isArray(o.rules)) o = { rules: [] };
    return o;
  }
  function write(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { return false; }
    try { if (global.NovaIDB && global.NovaIDB.backup) global.NovaIDB.backup(); } catch (e2) {}
    return true;
  }

  var RELS = "keeps|keep|makes|make|causes|cause|leads to|lead to|prevents|prevent|protects|protect|stops|stop|blocks|block|" +
    "needs|need|has|have|can|helps|help|gets|get|brings|bring|gives|give|likes|like|loves|love|hates|hate|eats|eat|wants|want|is|are";
  var QUALS = "usually|often|sometimes|always|mostly|normally|generally|rarely|never";
  var VERB_RE = new RegExp("^(.+?)\\s+(?:(" + QUALS + ")\\s+)?" +
    "(?:(does not|do not|doesn't|don't|doesnt|dont|cannot|can't|cant|can not|is not|are not|isn't|aren't|never)\\s+)?(" + RELS + ")(?:\\s+(not))?\\s+(.+)$");
  var BAD_SUBJ = /^(i|i'm|im|you|you're|youre|he|she|it|we|they|this|that|these|those|there|here|my|your|his|her|our|their|its|what|who|why|how|when|where|which|everything|nothing|someone|somebody|today|tonight|now|life|let's|lets|please|ok|okay|yes|no|hi|hello|hey|thanks)\b/;
  var Q_START = /^(what|whats|what's|who|why|how|where|which|is|are|am|was|were|can|could|do|does|did|should|would|will|shall|may|might|have|has)\b/;
  var CMD = /^(remember|forget|when i say|read|lock|edit|define|teach|fix|say|train|pause|stop|sample|export|import|undo|reset|wipe|brain|learn|look up|lookup|skip|nevermind|never mind|cancel)\b/;

  function stripArt(s) { return String(s).trim().replace(/^(a|an|the|some)\s+/, ""); }
  function normRel(r) {
    return r.replace(/^(keep|make|cause|prevent|protect|stop|block|need|help|get|bring|give|like|love|hate|eat|want)$/, "$1s")
      .replace(/^lead to$/, "leads to").replace(/^have$/, "has").replace(/^are$/, "is");
  }
  function hasNeg(s) { return /\b(not|never|don't|dont|doesn't|doesnt|can't|cant|cannot|won't|wont|isn't|aren't)\b/.test(s); }

  function edge(from, rel, to, neg, qual, orig, cond) {
    var ft = uniq(toks(stripArt(from))), tt = uniq(toks(to));
    if (!ft.length || !tt.length) return null;
    return { from: stripArt(from), rel: rel, to: String(to).trim().replace(/^then\s+/, ""), neg: !!neg, qual: qual || "",
      orig: String(orig).trim().replace(/\s+/g, " ").replace(/[.!]+$/, ""), source: "taught", cond: !!cond, ft: ft, tt: tt };
  }

  /* "An umbrella keeps you dry" -> { from: "umbrella", rel: "keeps", to: "you dry", neg: false } */
  function parseRule(line) {
    var raw = String(line || "").trim(), t = clean(raw).replace(/[.!]+$/, "").replace(/\s*,\s*/g, ", ").trim(), m, a, b;
    if (!t || /\?\s*$/.test(raw) || CMD.test(t) || /\d/.test(t)) return null;
    if (/\bmeans\b|\bstands for\b|=/.test(t)) return null;
    /* if / when A, (then) B  |  when A you need B  |  you need B when A */
    m = t.match(/^(?:if|when|whenever)\s+(.+?)(?:,\s*(?:then\s+)?|\s+then\s+)(.+)$/) ||
      t.match(/^(?:if|when|whenever)\s+(.+?)\s+((?:you|we|i|people|things|everyone)\s+.+)$/);
    if (m) { a = m[1].trim(); b = m[2].trim(); }
    else if ((m = t.match(/^((?:you|we|i|people|everyone)\s+(?:need|should|must|have to|get|will|can)\b.+?)\s+(?:if|when|whenever)\s+(.+)$/))) { a = m[2].trim(); b = m[1].trim(); }
    if (m) {
      if (/^when i say\b/.test(t) || /^(should|do|does|will|can|must|is|are)\s/.test(b) || /^(what|who|why|how)\b/.test(b)) return null;
      if (!toks(a).length || !toks(b).length) return null;
      return edge(a, "then", b, hasNeg(b), "", raw, true);
    }
    if (Q_START.test(t) || BAD_SUBJ.test(t)) return null;
    var lead = t.match(new RegExp("^(" + QUALS + ")\\s+")), qual0 = lead ? lead[1] : "";
    if (lead) t = t.slice(lead[0].length);
    m = t.match(VERB_RE);
    if (!m) return null;
    a = m[1].trim();
    var qual = m[2] || qual0, negw = m[3] || "", rel = m[4], neg2 = m[5], to = m[6].trim();
    if (a.split(" ").length > 4 || BAD_SUBJ.test(a) || !toks(a).length || !toks(to).length) return null;
    if (/^(is|are)$/.test(rel) || /^(is not|are not|isn't|aren't)$/.test(negw)) {
      /* definitions stay with the definition flow: "a glorp is a tiny robot", "fire is hot and dangerous" */
      if (/^(a|an|the|my|your|one|some)\b/.test(to) || (to.split(" ").length > 1 && !neg2 && !negw)) return null;
    }
    return edge(a, normRel(rel), to, !!(negw || neg2 || qual === "never"), qual, raw, false);
  }

  function display(e) { var o = e.orig; return o.charAt(0).toLowerCase() + o.slice(1); }
  function addRule(e) {
    var o = read(), dup = o.rules.filter(function (r) { return r.from === e.from && r.rel === e.rel && r.to === e.to && r.neg === e.neg; })[0];
    if (dup) return dup;
    e.at = Date.now(); e.id = "r" + e.at.toString(36) + o.rules.length.toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    o.rules.push(e); write(o); return e;
  }
  /* "got it: umbrella → keeps you dry", "got it: it rains → the ground gets wet", "got it: dogs → do not like baths" */
  function savedReply(e) {
    var o = clean(e.orig), rest, i;
    if (e.cond) rest = clean(e.to).replace(/^then\s+/, "");
    else {
      i = o.indexOf(clean(e.from));
      rest = i >= 0 ? o.slice(i + clean(e.from).length).trim() : (e.neg ? "not " : "") + e.rel + " " + e.to;
    }
    if (e.qual && (" " + rest + " ").indexOf(" " + e.qual + " ") === -1) rest = e.qual + " " + rest;
    return "got it: " + e.from + " \u2192 " + rest;
  }

  /* ---- reasoning: bounded breadth-first walk over taught edges ---- */
  function oppHit(state, tt) {
    return state.some(function (s) { return (OPP[s] || []).some(function (o) { return tt.indexOf(o) !== -1; }); });
  }
  function protective(state, xt, rules, at, wantNeg) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!!r.neg !== !!wantNeg || !subset(r.ft, xt) || !PROTECT.test(r.rel)) continue;
      var direct = /^(prevents|stops|blocks|protects|shields)$/.test(r.rel) && r.tt.some(function (x) { return state.indexOf(x) !== -1 || at.indexOf(x) !== -1; });
      if (oppHit(state, r.tt) || direct) return r;
    }
    return null;
  }
  function reach(at, rules) {
    var out = [], q = [{ have: at, path: [] }], used = {}, visits = 0, cur, i, r, nx;
    while (q.length && visits < MAX_VISIT) {
      cur = q.shift(); visits++;
      if (cur.path.length >= MAX_HOPS) continue;
      for (i = 0; i < rules.length; i++) {
        r = rules[i];
        if (r.neg || !CAUSE.test(r.rel) || used[r.id] || !subset(r.ft, cur.have)) continue;
        used[r.id] = 1;
        nx = { have: r.tt, path: cur.path.concat([r]) };
        out.push(nx); q.push(nx);
      }
    }
    return out;
  }
  function reason(at, xt, kind) {
    var rules = read().rules, paths = reach(at, rules), i, p, last, hit;
    if (kind === "need") {
      for (i = 0; i < paths.length; i++) {
        p = paths[i]; last = p.path[p.path.length - 1];
        if (last.cond && subset(xt, p.have) && /\b(need|needs|should|must|take|bring|wear|use)\b/.test(clean(last.to))) return { yes: true, path: p.path };
        hit = protective(p.have, xt, rules, at, false);
        if (hit) return { yes: true, path: p.path.concat([hit]) };
      }
      hit = protective(at, xt, rules, at, false); /* "an umbrella protects you from rain" */
      if (hit) return { yes: true, path: [hit] };
      for (i = 0; i < paths.length; i++) { /* "an umbrella does not keep you warm" against a cold problem */
        hit = protective(paths[i].have, xt, rules, at, true);
        if (hit) return { yes: false, path: paths[i].path.concat([hit]) };
      }
      return null;
    }
    for (i = 0; i < paths.length; i++) if (subset(xt, paths[i].have) && subset(paths[i].have, xt)) return { yes: true, path: paths[i].path };
    for (i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.neg && subset(r.ft, at) && subset(xt, r.tt)) return { yes: false, path: [r] };
    }
    return null;
  }
  function knows(t) { return read().rules.some(function (r) { return t.some(function (x) { return r.ft.indexOf(x) !== -1; }); }); }
  function knowsAsSubject(t) { return read().rules.some(function (r) { return subset(r.ft, t); }); }

  /* "if it rains, should I bring an umbrella?" / "should I bring an umbrella if it rains?" /
     "when it rains do I need an umbrella" / "if it rains will I get wet?" / "do dogs like baths?" /
     "should I bring an umbrella" (condition = the creator's line just before, when it is a statement) */
  function parseQuestion(text, prev) {
    var t = clean(text).replace(/[?.!]+$/, "").replace(/^(?:ok|okay|hey|so|nova)\b[ ,]*/, "").trim(), m, cond = "", main = t, ifq = false, kind, target, verb;
    if (/\d/.test(text) || /\bhow (many|much|long|far|old)\b/.test(t)) return null; /* word problems stay with math */
    m = t.match(/^(?:if|when|whenever)\s+(.+?),?\s+((?:should|do|does|will|would|can|must)\s+.+)$/);
    if (m && m[1].indexOf(",") === -1 || (m = m || t.match(/^(?:if|when|whenever)\s+([^,]+),\s*((?:should|do|does|will|would|can|is|are|must)\s+.+)$/))) { cond = m[1]; main = m[2]; ifq = true; }
    else if ((m = t.match(/^((?:should|do|does|will|would|can|is|are|must)\b.+?)\s+(?:if|when|whenever)\s+(.+)$/))) { main = m[1]; cond = m[2]; ifq = true; }
    verb = main.match(/^(?:should|do|must)\s+(?:i|we)\s+(need\s+(?:to\s+)?|have\s+to\s+)?(bring|take|wear|use|get|carry|pack|have|buy)?\s*(.+)$/);
    if (verb && !/^(?:get|be)\s/.test(verb[3]) && !(verb[2] === "get" && OPP[toks(verb[3])[0]])) { kind = "need"; target = verb[3]; }
    else if (ifq && (m = main.match(/^(?:will|would|can|do|does|is|are)\s+(i|we|you|it|the\s+\w+|\w+)\s+(?:get|be|become|stay|feel)?\s*(.+)$/))) {
      kind = "will"; target = (/^(i|we|you|it)$/.test(m[1]) ? "" : m[1] + " ") + m[2];
    } else if (!ifq && (m = main.match(/^(?:does|do|can)\s+(.+?)\s+(make|cause|keep|need|prevent|protect|stop|like|love|hate|eat|want|have|get|bring|give|help)\s+(.+)$/))) {
      kind = "fact"; cond = m[1]; target = m[3];
    } else return null;
    if (!cond && kind === "need" && prev && !Q_START.test(clean(prev)) && !/\?\s*$/.test(prev)) cond = clean(prev);
    var at = uniq(toks(cond)), xt = uniq(toks(target));
    if (!xt.length || (ifq && !at.length)) return null;
    return { kind: kind, cond: cond, target: target, at: at, xt: xt, ifq: ifq };
  }
  function because(path) { return path.map(display).join(" and "); }
  function soft(path) { return path.some(function (r) { return /^(sometimes|often|usually|mostly|normally|generally|rarely)$/.test(r.qual) || r.rel === "can"; }); }
  function answerQuestion(q) {
    var r = q.at.length ? reason(q.at, q.xt, q.kind) : null;
    if (!r) return null;
    return (r.yes ? (soft(r.path) ? "probably yes" : "yes") : "no") + ", because " + because(r.path) + ".";
  }
  function whenPhrase(cond) {
    var c = clean(cond).replace(/^(?:if|when)\s+/, "");
    if (/^(it|you|i|we|they|there)\b/.test(c)) return c;
    return "there is " + (/^(a|an|the)\s/.test(c) ? c.replace(/^the\s/, "a ") : articled(c));
  }
  function articled(t) {
    var c = clean(t).replace(/^(?:an?|the)\s+/, "");
    if (/s$/.test(c) && !/ss$/.test(c)) return c;
    return (/^[aeiou]/.test(c) ? "an " : "a ") + c;
  }
  function readAsk() {
    var o; try { o = JSON.parse(localStorage.getItem(ASK) || "null"); } catch (e) { o = null; }
    return o && Date.now() - (o.at || 0) < TTL ? o : null;
  }
  function clearAsk() { try { localStorage.removeItem(ASK); } catch (e) {} }
  /* one side unknown -> one question. Both sides known but unlinked -> no question (old flow). */
  function askMissing(q) {
    var o = { q: q, at: Date.now() }, msg;
    if (q.at.length && !knows(q.at)) { o.side = "cond"; msg = "what happens when " + whenPhrase(q.cond) + "?"; }
    else if (q.kind === "need" && !knowsAsSubject(q.xt)) { o.side = "target"; msg = "what does " + articled(q.target) + " do?"; }
    else return null;
    try { localStorage.setItem(ASK, JSON.stringify(o)); } catch (e) {}
    return msg;
  }
  /* the line after "what happens when it rains?": "it makes you wet", "you get wet", "rain makes you wet" */
  function answerAsk(text, o) {
    var t = clean(text).replace(/[.!]+$/, ""), e, m, rest, vm, anchor, shown, saved, again;
    if (/^(skip|nevermind|never mind|cancel|forget it|idk|i don't know|i dont know|no idea)$/.test(t)) { clearAsk(); return "ok. skipped."; }
    if (/\?\s*$/.test(text) || Q_START.test(t) || CMD.test(t)) { clearAsk(); return null; }
    anchor = o.side === "cond" ? toks(o.q.cond).join(" ") : stripArt(clean(o.q.target));
    shown = o.side === "cond" ? anchor : articled(o.q.target);
    e = parseRule(text);
    if (e && !e.ft.some(function (x) { return toks(anchor).indexOf(x) !== -1; }) && !e.cond) {
      saved = addRule(e); again = answerQuestion(o.q); clearAsk(); /* a whole rule about something else: saved as said */
      return savedReply(saved) + "." + (again ? " " + again : "");
    }
    if (!e) {
      m = t.match(/^(?:it|that|they|this|he|she)\s+(.+)$/);
      rest = m ? m[1] : t;
      /* only an answer-shaped line: "it ...", "you/people/things ...", or a bare verb phrase ("makes you wet") */
      if (!m && !/^(you|we|people|things|everything|everyone|nothing)\b/.test(t) && !new RegExp("^(?:(?:" + QUALS + ")\\s+)?(?:(?:does not|doesn't|do not|don't|never)\\s+)?(?:" + RELS + ")\\s").test(t)) { clearAsk(); return null; }
      vm = rest.match(new RegExp("^(?:(" + QUALS + ")\\s+)?(?:(does not|doesn't|do not|don't|never)\\s+)?(" + RELS + ")\\s+(.+)$"));
      if (vm) e = edge(anchor, normRel(vm[3]), vm[4], !!vm[2] || vm[1] === "never", vm[1] || "", shown + " " + rest, false);
      else if (toks(rest).length) e = edge(anchor, "then", rest, hasNeg(rest), "", (o.side === "cond" ? "when " + whenPhrase(o.q.cond) : shown) + ", " + rest, true);
    }
    clearAsk();
    if (!e) return null;
    saved = addRule(e); again = answerQuestion(o.q);
    return savedReply(saved) + ". " + (again || "i still do not know how that answers it.");
  }

  function aboutList(text) {
    var m = clean(text).replace(/[?.!]+$/, "").match(/^what (?:do|else do) you know about\s+(.+)$/), t, rules;
    if (!m) return null;
    t = uniq(toks(m[1]));
    rules = read().rules.filter(function (r) { return t.some(function (x) { return r.ft.indexOf(x) !== -1 || r.tt.indexOf(x) !== -1; }); });
    return rules.length ? rules.map(function (r) { return "- " + display(r); }).join("\n") : null;
  }
  function forgetRule() {
    var o = read(), last = -1, i;
    for (i = 0; i < o.rules.length; i++) if (o.rules[i].source === "taught" && (last < 0 || (o.rules[i].at || 0) >= (o.rules[last].at || 0))) last = i;
    if (last < 0) return "there are no taught rules to forget.";
    var r = o.rules.splice(last, 1)[0];
    write(o);
    return "forgot: " + display(r) + ".";
  }

  function blockedByPending() {
    var L = global.NovaLookup, D = global.NovaDict, p, s;
    try { if (L && L.readClarify && L.readClarify()) return true; } catch (e) {}
    try { if (D && D.readOffer && D.readOffer()) return true; } catch (e2) {}
    try { p = L && L.getPending ? L.getPending() : null; if (p && p.term && Date.now() - (p.at || 0) < TTL) return true; } catch (e3) {}
    try { s = global.NovaSameAs && global.NovaSameAs.load ? global.NovaSameAs.load() : null; if (s && s.pending) return true; } catch (e4) {}
    return false;
  }
  function exactLesson(text) {
    var T = global.NovaTrain;
    try { return T && T.lookup ? T.lookup(text) : null; } catch (e) { return null; }
  }

  function handle(text, prev) {
    var low = clean(text).replace(/[?.!]+$/, ""), o = readAsk(), r, q, e;
    if (o) { r = answerAsk(text, o); if (r) return r; }
    if (/^forget (?:that|the last|last) rule$/.test(low)) return forgetRule();
    if (CMD.test(low) || /^when i say\b/.test(low)) return null; /* owner commands and lessons keep their own flows */
    r = aboutList(text);
    if (r) return r;
    if (blockedByPending()) return null;
    q = parseQuestion(text, prev);
    if (q) {
      if (!q.ifq && exactLesson(text)) return null; /* exact saved answers keep priority */
      if (q.kind === "fact") return answerQuestion(q);
      if (!q.ifq && (!q.at.length || (!knowsAsSubject(q.xt) && !knows(q.at)))) return null; /* nothing taught: old flow */
      r = answerQuestion(q);
      if (r) { clearAsk(); return r; }
      r = askMissing(q);
      if (r) return r;
      if (/\?\s*$/.test(text) || !parseRule(text)) return null; /* both sides known, no link: old honest flow */
    }
    e = parseRule(text);
    if (e) return savedReply(addRule(e)) + ".";
    return null;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._rules) return;
    var orig = reply, p;
    function wrapped(text) {
      var prev = arguments.length > 1 ? arguments[1] : null, out = null;
      try { out = handle(text, prev); } catch (e) { out = null; if (global.__rulesDebug) throw e; }
      if (out) {
        /* the new-word index still sees lines answered here (it notes after the inner reply) */
        try { if (global.NovaNewWords && global.NovaNewWords.note && !/^forget /.test(clean(text))) global.NovaNewWords.note(text); } catch (e2) {}
        return out;
      }
      return orig.apply(this, arguments);
    }
    for (p in orig) if (Object.prototype.hasOwnProperty.call(orig, p)) wrapped[p] = orig[p];
    wrapped._rules = true;
    reply = wrapped;
  }
  /* rule replies are not lessons for the tiny brain */
  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._rules) return;
    var orig = T.learnPair, p;
    var g = function (user, nova) {
      if (/^(got it: |(yes|no|probably yes), because |what happens when |what does .+ do\?$|forgot: )/.test(String(nova || "").toLowerCase())) return false;
      return orig.apply(this, arguments);
    };
    for (p in orig) if (Object.prototype.hasOwnProperty.call(orig, p)) g[p] = orig[p];
    g._rules = true;
    T.learnPair = g;
  }

  global.NovaRules = { KEY: KEY, read: read, parseRule: parseRule, parseQuestion: parseQuestion, lemma: lemma, toks: toks,
    reason: reason, addRule: addRule, forgetRule: forgetRule, handle: handle, OPP: OPP, MAX_HOPS: MAX_HOPS };
  wrapReply();
  guardLearn();
  if (global.document && document.addEventListener) document.addEventListener("DOMContentLoaded", function () { guardLearn(); wrapReply(); });
})(window);
