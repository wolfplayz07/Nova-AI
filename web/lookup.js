/* Rule table first. User meanings are editable. Locked meanings are not. */
(function (global) {
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
  var STORE = "nova-tiny-brain-v7";
  var FACTS = "nova-facts-v1";
  var PENDING = "nova-pending-teach-v1";
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
    { user: "where is your home", nova: "on this phone." },
    { user: "where is your house", nova: "on this phone." },
    { user: "wheres your home", nova: "on this phone." },
    { user: "do you live here", nova: "yes. on this phone." },
    { user: "do you live", nova: "yes. on this phone." },
    { user: "are you alive", nova: "yes. on this phone." },
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

  /* Write lessons and keep train.js's in-memory copy in sync so its next persist() does not resurrect removed pairs. */
  function saveLessons(lessons) {
    writeLessons(lessons);
    try {
      if (global.NovaTrain && typeof global.NovaTrain.setLessons === "function") {
        global.NovaTrain.setLessons(lessons);
      }
    } catch (e) {}
  }

  function lessonsFromStore() {
    var p = readPack();
    return Array.isArray(p.lessons) ? p.lessons : [];
  }

  /* Lesson key: sanitize like lookup does, minus trailing punctuation, so "how old are you?" and "how old are you" are one key. */
  function lessonKey(s) {
    return sanitize(s).replace(/[?.!,\s]+$/, "");
  }

  /* Overwrite: drop every pair with the same key, then save the new one. Exactly one pair per key afterwards. */
  function replaceLesson(user, nova) {
    var key = lessonKey(user), reply = sanitize(nova);
    if (!key || !reply) return false;
    var kept = lessonsFromStore().filter(function (l) {
      return !(l && lessonKey(l.user) === key);
    });
    kept.push({ user: key, nova: reply });
    saveLessons(kept);
    return true;
  }

  function readFacts() {
    try { return JSON.parse(localStorage.getItem(FACTS) || "{}") || {}; }
    catch (e) { return {}; }
  }

  function writeFacts(map) {
    try { localStorage.setItem(FACTS, JSON.stringify(map)); } catch (e) {}
  }

  function entryFor(word) {
    var raw = readFacts()[sanitize(word)];
    if (!raw) return { user: "", locked: "" };
    if (typeof raw === "string") return { user: raw, locked: "" };
    return { user: raw.user || "", locked: raw.locked || "" };
  }

  function putEntry(word, entry) {
    word = sanitize(word);
    if (!word) return false;
    var map = readFacts();
    map[word] = { user: entry.user || "", locked: entry.locked || "" };
    writeFacts(map);
    return true;
  }

  /* v57: line = the creator's teaching line; the meaning is also APPENDED as a sense (senses.js),
     so "bark" can keep its dictionary meanings next to the taught one. edit = replace newest. */
  function saveUser(word, meaning, line, edit) {
    word = sanitize(word);
    meaning = sanitize(meaning).slice(0, 180);
    if (!word || !meaning || word.split(" ").length > 4) return false;
    var e = entryFor(word);
    e.user = meaning;
    var ok = putEntry(word, e), S = global.NovaSenses;
    try { if (ok && S) (edit ? S.editTaught : S.addTaught)(word, meaning, line || meaning); } catch (x) {}
    return ok;
  }

  function saveLocked(word, meaning) {
    word = sanitize(word);
    meaning = sanitize(meaning).slice(0, 180);
    if (!word || !meaning || word.split(" ").length > 4) return false;
    var e = entryFor(word);
    e.locked = meaning;
    return putEntry(word, e);
  }

  function spokenMeaning(word) {
    var e = entryFor(word);
    return e.locked || e.user || "";
  }

  /* v55: drop leading fillers ("ok nova,", "hey nova", "um so") so yes/no detection sees the question.
     A line that is only fillers is left alone (greetings keep working). */
  function stripFillers(text) {
    var q = sanitize(text);
    var out = q.replace(/^(?:(?:ok|okay|hey|hi|so|um|well|nova)\b[\s,.!]*)+/, "");
    return out ? out : q;
  }

  function isYesNoQuestion(text) {
    var q = stripFillers(text);
    /* v48: "should I / should we ..." asks for advice, not a yes or no. */
    if (/^should (?:i|we)\b/.test(q)) return false;
    return /^(can|could|do|does|did|is|are|am|will|would|should|have|has|may)\b/.test(q);
  }

  function normYesNo(s) {
    var q = sanitize(s);
    if (/^(yes|y|yeah|yep|yup|yea)$/.test(q)) return "yes";
    if (/^(no|n|nope|nah)$/.test(q)) return "no";
    return taughtYesNo(q);
  }

  /* v60: phrases the creator taught for yes / no ("remember yes means correct"). Built-in words always win. */
  var YESNO = "nova-yesno-v1";
  function readYesNo() {
    var m;
    try { m = JSON.parse(localStorage.getItem(YESNO) || "{}") || {}; } catch (e) { m = {}; }
    if (!Array.isArray(m.yes)) m.yes = [];
    if (!Array.isArray(m.no)) m.no = [];
    return m;
  }
  function taughtYesNo(s) {
    var q = sanitize(s).replace(/[.!?,]+$/g, "").trim(), m;
    if (!q) return null;
    m = readYesNo();
    var y = m.yes.indexOf(q) !== -1, n = m.no.indexOf(q) !== -1;
    if (y && !n) return "yes";
    if (n && !y) return "no";
    return null;
  }
  function teachYesNo(side, phrase) {
    var q = sanitize(phrase).replace(/[.!?,]+$/g, "").trim(), m, other;
    if (side !== "yes" && side !== "no") return false;
    if (!q || q === side || q.split(" ").length > 6) return false;
    if (/^(yes|y|yeah|yep|yup|yea|no|n|nope|nah)$/.test(q)) return false; /* built-ins cannot be re-taught */
    m = readYesNo();
    other = side === "yes" ? "no" : "yes";
    m[other] = m[other].filter(function (x) { return x !== q; }); /* newest teaching wins */
    if (m[side].indexOf(q) === -1) m[side].push(q);
    try { localStorage.setItem(YESNO, JSON.stringify(m)); } catch (e) {}
    return true;
  }

  /* v60: after "no" to a dictionary remember-it, only a line that reads like a definition is saved. */
  function readsLikeDefinition(line, term) {
    var t = sanitize(line).replace(/[.!]+$/g, "").trim(), T = global.NovaTrain, w;
    if (!t || /\?\s*$/.test(String(line || ""))) return false;
    if (/^(yes|no|y|n|yeah|yep|nope|nah|ok|okay|k|lol|haha|hmm|hm|um|uh|thanks|thank you|thx|cool|nice|whatever|idk|hi|hello|hey|bye|good night|goodnight)\b/.test(t)) return false;
    if (/^(i|i'm|im|i've|ive|i'll|ill|i'd|you|you're|youre|we|they|he|she|my|your|let's|lets|please|can|could|will|would|do|does|did|are|is)\b/.test(t)) return false;
    if (/^(it|that)\s+(is|means)\s+\S/.test(t)) return true;
    w = stripArticle(String(term || ""));
    if (w && new RegExp("^(?:(?:a|an|the)\\s+)?" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?\\s+(?:is|are|means)\\s+\\S").test(t)) return true;
    if (T && T.wordSalad && T.wordSalad(t)) return false;
    return t.split(" ").length >= 2 && t.length <= 180;
  }

  function getPending() {
    var p;
    try { p = JSON.parse(localStorage.getItem(PENDING) || "null"); }
    catch (e) { return null; }
    if (!p) return null;
    if (!p.question && p.word) {
      return { question: p.word, term: p.word, at: p.at || Date.now(), kind: p.kind || null };
    }
    if (!p.question) return null;
    return p;
  }

  function setPending(opts) {
    var question, term, kind, payload;
    if (opts == null) return;
    if (typeof opts === "string") {
      question = sanitize(opts);
      term = question;
      kind = isYesNoQuestion(opts) ? "yn" : null;
    } else {
      question = sanitize(opts.question || "");
      term = opts.term ? sanitize(opts.term) : null;
      kind = opts.kind || (isYesNoQuestion(opts.question || "") ? "yn" : null);
    }
    if (!question) return;
    payload = { question: question, term: term, kind: kind, at: Date.now(), word: term || question };
    if (opts && opts.dictNo) payload.dictNo = true; /* v56: opened by "no" to a dictionary remember-it */
    try { localStorage.setItem(PENDING, JSON.stringify(payload)); } catch (e) {}
    try {
      if (global.NovaTrain && typeof global.NovaTrain.markUnknown === "function") {
        global.NovaTrain.markUnknown(question);
      }
    } catch (e2) {}
  }

  function clearPending() {
    try { localStorage.removeItem(PENDING); } catch (e) {}
    try {
      if (global.NovaTrain && typeof global.NovaTrain.clearUnknown === "function") {
        global.NovaTrain.clearUnknown();
      }
    } catch (e2) {}
  }

  function allPairs() {
    return lessonsFromStore().concat(CANNED);
  }

  /* "How do you live?" contains the yes/no key "do you live" but asks something else.
     For how/what/why queries, a key found inside the query only counts if it starts the
     query, or if the key is not itself a question (e.g. a noun phrase like "your dog"). */
  function whFalseFriend(q, u) {
    if (!/^(how|what|whats|why)\b/.test(q)) return false;
    if (q.indexOf(u) === 0) return false;
    return startsLikeQuestion(u);
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
      if (q.indexOf(u) !== -1 && whFalseFriend(q, u)) continue;
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

  /* Question form for fact lookups: drop trailing punctuation, treat "what's" like "whats". */
  function factQ(text) {
    return sanitize(text).replace(/[?.!,\s]+$/, "").replace(/^what's /, "whats ");
  }

  function unknownTerm(text) {
    var q = factQ(text);
    if (/\bmy\b/.test(q) && /definition|meaning/.test(q)) return null;
    var m = q.match(/^(?:what does|whats the meaning of|what is the meaning of|whats|what is|define|meaning of|look up|lookup)\s+(.+?)(?:\s+mean)?$/);
    if (!m) return null;
    var word = m[1].replace(/^a |^an |^the /, "").replace(/\s+mean$/, "").trim();
    if (!word || word.split(" ").length > 4) return null;
    if (/^(your name|you|this|that|it)$/.test(word)) return null;
    return word;
  }

  function userAskWord(text) {
    var q = factQ(text);
    var m = q.match(/^(?:my|my definition of|my meaning of|what do i mean by|what is my definition of|what is my meaning of)\s+(.+)$/);
    if (!m) return null;
    return m[1].replace(/^a |^an |^the /, "").replace(/\s+mean$/, "").trim();
  }

  /* Drop lesson pairs that ask what WORD is (what is a photo, what's a photo, define photo...). */
  function dropWhatIsLessons(word) {
    var target = sanitize(word);
    var lessons = lessonsFromStore();
    var kept = [], n;
    if (!target) return 0;
    for (n = 0; n < lessons.length; n++) {
      if (lessons[n] && unknownTerm(lessons[n].user) === target) continue;
      kept.push(lessons[n]);
    }
    if (kept.length !== lessons.length) saveLessons(kept);
    return lessons.length - kept.length;
  }

  /* v47: "what is my favorite color" / "what's my name" reads what the creator saved, before the
     dictionary or the what-is prompt: "remember my X is Y" memories (app.js state.memories), then
     "my WORD" / "WORD means" facts (user slot, as "my WORD" already does), then a meaning saved
     earlier for "my X" through the what-is prompt. null when nothing is saved. */
  function savedMemories() {
    try { if (typeof state !== "undefined" && state && state.memories) return state.memories; } catch (e) {}
    try {
      var raw = JSON.parse(localStorage.getItem("nova-local-v1") || "null");
      if (raw && raw.memories) return raw.memories;
    } catch (e2) {}
    return {};
  }

  function recallMine(text) {
    var q = factQ(text).replace(/^what's /, "whats ");
    var m = q.match(/^(?:what is|whats|what are|tell me|say) my (.+)$/), key, mem, k, e;
    if (!m) return null;
    key = m[1].replace(/^(?:own) /, "").trim();
    if (!key || /^(definition|meaning) of /.test(key)) return null;
    mem = savedMemories();
    if (/(^| )name$/.test(key) && mem.name) return "your name is " + mem.name + ".";
    for (k in mem) {
      if (Object.prototype.hasOwnProperty.call(mem, k) && sanitize(k) === sanitize(key)) return "your " + key + " is " + mem[k] + ".";
    }
    e = entryFor(key);
    if (e.user) return e.user;
    return spokenMeaning("my " + key) || null;
  }

  function lookupFact(text) {
    var mine = userAskWord(text);
    if (mine) {
      var e = entryFor(mine);
      return e.user || null;
    }
    var word = unknownTerm(text);
    if (!word) return null;
    return spokenMeaning(word) || null;
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
    if (global.novaMath) {
      var fast = global.novaMath(text);
      if (fast) return fast;
    }
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

  function startsLikeQuestion(text) {
    var q = sanitize(text);
    if (!q) return false;
    return /^(what|whats|who|where|when|why|how|can|could|do|does|did|is|are|am|should|would|will|which|define)\b/.test(q);
  }

  function looksLikeQuestion(text) {
    var q = String(text || "").toLowerCase().trim();
    if (!q) return false;
    if (q.indexOf("?") !== -1) return true;
    return startsLikeQuestion(text);
  }

  /* v46: is this line a new question (not an answer to the pending teach)? wh-word or aux start, a "?",
     "so/and/ok should I / can you ...", or a question clause after a comma (", is tom an animal").
     Lines that start with yes/no are answers even with a "?" (approved v36 behavior). */
  var AUXQ = "(?:is|are|am|was|were|can|could|do|does|did|should|would|will|shall|may|might|have|has)";
  function isNewQuestion(text) {
    var raw = String(text || "").toLowerCase().replace(/\u2019/g, "'").trim(), q = sanitize(text);
    if (!q) return false;
    if (normYesNo(text) || /^(yes|no|yeah|yep|yup|yea|nope|nah)\b/.test(q)) return false;
    if (raw.indexOf("?") !== -1) return true;
    if (startsLikeQuestion(text)) return true;
    if (new RegExp("^(?:so|and|but|then|ok|okay|well|hey|now|also|nova|jarvis),? " + AUXQ + " (?:i|you|we)\\b").test(q)) return true;
    if (new RegExp(", (?:" + AUXQ + " [a-z]+|what|who|where|when|why|how|which)\\b").test(raw.replace(/\s+/g, " "))) return true;
    return false;
  }

  function ingestRead(raw) {
    var body = String(raw || "").replace(/^read\s+/i, "");
    var lines = body.split(/[\n.;]+/);
    var added = 0;
    var n, line, m;
    for (n = 0; n < lines.length; n++) {
      line = sanitize(lines[n]);
      if (!line) continue;
      m = line.match(/^([a-z][a-z\- ]{0,24})\s+(?:means|is|:|-)\s+(.{8,180})$/);
      if (!m) continue;
      if (saveUser(m[1], m[2])) added++;
      if (added >= 40) break;
    }
    if (!added) return null;
    return "saved " + added + " word" + (added === 1 ? "" : "s") + ".";
  }

  function cancelPending(text) {
    var q = sanitize(text);
    return /^(skip|nevermind|never mind|cancel|forget it)$/.test(q);
  }

  function isExplicitTeachPhrase(text) {
    var lower = sanitize(text);
    return /^when i say /.test(lower)
      || /^read /.test(lower)
      || /^lock /.test(lower)
      || /^edit /.test(lower)
      || /^(?:define|teach) /.test(lower)
      || /^fix[:\s]/.test(lower)
      || /\bmeans\b/.test(lower);
  }

  /* v56: "a bark is a loud sound", "an owl is a bird", "glorp is a game". Not questions, math,
     owner commands, or sentences about people/things in the room ("it is", "my dog is", "you are"). */
  var DECL_SUBJ_BAD = /^(read|lock|edit|define|teach|fix|say|when|remember|i|you|he|she|it|we|they|this|that|these|those|there|here|what|who|why|how|when|where|which|my|your|his|her|our|their|its|everything|nothing|today|tonight|now|life)\b/;
  function stripArticle(t) { return sanitize(t).replace(/^(a|an|the)\s+/, ""); }
  function declarative(text) {
    var raw = String(text || "").trim(), lower = sanitize(raw).replace(/[.!]+$/, ""), m, subj, meaning;
    if (!lower || /\?\s*$/.test(raw) || /\d/.test(lower)) return null;
    m = lower.match(/^(?:(?:a|an)\s+)?([a-z][a-z'-]*(?:\s[a-z][a-z'-]*){0,2})\s+is\s+(.+)$/);
    if (!m) return null;
    subj = m[1]; meaning = m[2].trim();
    if (DECL_SUBJ_BAD.test(subj) || /^(the|not|so|very|too|really|just|ok|okay|good|bad|fine|here|there|gone|done|over)\b/.test(meaning)) return null;
    if (meaning.split(" ").length < 2 && !/^(a|an)\b/.test(meaning)) return null;
    if (subj.split(" ").length > 3 || meaning.length < 3) return null;
    return { term: subj, meaning: meaning };
  }

  function extractCorrectionAnswer(raw) {
    var lower = String(raw || "").trim().toLowerCase(), m;
    m = lower.match(/^(?:say:|say|reply|answer|tell them|you should say|the answer is)[:\s]+["']?(.+?)["']?$/);
    if (m) return m[1].trim();
    m = lower.match(/^fix[:\s]+(.+)$/);
    if (m) return m[1].trim();
    m = lower.match(/^no[,:]\s*(.+)$/);
    if (m) return m[1].trim();
    return String(raw || "").trim();
  }

  function finishPending(text) {
    var pend = getPending();
    var answer, msg, term, yn;
    if (!pend || !pend.question) return null;
    if (Date.now() - (pend.at || 0) > 10 * 60 * 1000) {
      clearPending();
      return null;
    }
    if (cancelPending(text)) {
      clearPending();
      return "ok. skipped.";
    }
    /* v60: "it means ..." / "that is ..." answers the open word, never teaches the word "it". */
    var itm = pend.term && sanitize(text).replace(/[.!]+$/g, "").match(/^(?:it|that)\s+(?:is|means)\s+(.+)$/);
    if (itm && (!pend.dictNo || readsLikeDefinition(text, pend.term)) && saveUser(pend.term, itm[1], text)) {
      clearPending();
      return "saved your meaning of " + pend.term + ".";
    }
    if (isExplicitTeachPhrase(text) && !/^fix[:\s]/.test(sanitize(text)) && !/^no[,:]\s*/.test(sanitize(text))) {
      return null;
    }
    /* v56: a lookup ("look up river", "define bank") is never saved as a meaning. */
    if (pend.term && !isExplicitTeachPhrase(text) && unknownTerm(text)) {
      clearPending();
      return null;
    }
    /* v46: a line that is itself a new question replaces the pending slot instead of being saved as the answer. */
    if (isNewQuestion(text) && !isExplicitTeachPhrase(text)) {
      term = unknownTerm(text);
      setPending({ question: text, term: term });
      return null;
    }
    answer = extractCorrectionAnswer(text);
    if (!answer) return null;
    if (pend.kind === "yn" || isYesNoQuestion(pend.question)) {
      yn = normYesNo(answer);
      if (yn) answer = yn;
    }
    if (pend.dictNo && !readsLikeDefinition(answer, pend.term)) {
      clearPending();
      return null;
    }
    if (pend.term) {
      var dm = declarative(answer);
      if (dm && stripArticle(dm.term) === stripArticle(pend.term)) answer = dm.meaning;
      saveUser(pend.term, answer, text);
    }
    if (global.NovaTrain && typeof global.NovaTrain.teachCorrection === "function") {
      msg = global.NovaTrain.teachCorrection(pend.question, answer);
      clearPending();
      if (pend.dictNo) return "saved your meaning of " + pend.term + ".";
      return msg || ("got it. next time i'll say: " + sanitize(answer));
    }
    replaceLesson(pend.question, answer);
    clearPending();
    if (pend.term) return "saved your meaning of " + pend.term + ".";
    return "got it. next time i'll say: " + sanitize(answer);
  }

  /* v54: the last accepted guess, so the very next line can correct it ("the answer is X",
     "you should say X", "wrong, X"). "no, X" already teaches through train.js. Memory only. */
  var lastGuess = null;
  var GUESS_FIX = /^(?:the answer is|you should say|wrong[,:]|that'?s wrong[,:]?|actually[,:])\s*["']?(.+?)["']?$/;

  function finishGuess(text, lastUser) {
    var g = lastGuess, m, answer;
    lastGuess = null;
    if (!g || Date.now() - g.at > 10 * 60 * 1000) return null;
    /* Only the line right after the guess: other replies (math, memory) skip handleUser. */
    if (lastUser != null && sanitize(lastUser) !== sanitize(g.question)) return null;
    m = String(text || "").trim().toLowerCase().replace(/\u2019/g, "'").match(GUESS_FIX);
    if (!m) return null;
    answer = sanitize(m[1]);
    if (!answer || isNewQuestion(m[1])) return null;
    if (isYesNoQuestion(g.question)) answer = normYesNo(answer) || answer;
    replaceLesson(g.question, answer);
    clearPending();
    return "got it. next time i'll say: " + answer;
  }

  function handleTeach(text, lastUser) {
    var clar = clarifyAnswer(text);
    if (clar) return clar;
    var guessFix = finishGuess(text, lastUser);
    if (guessFix) return guessFix;
    var pendingDone = finishPending(text);
    if (pendingDone) return pendingDone;
    var raw = String(text || "").trim();
    var lower = raw.toLowerCase();
    var m = lower.match(/^when i say (.+?) say (.+)$/);
    if (m) {
      var reply = sanitize(m[2]);
      var yn = isYesNoQuestion(m[1]) ? normYesNo(m[2]) : null;
      if (yn) reply = yn;
      if (replaceLesson(m[1], reply)) {
        clearPending();
        return "lesson saved.";
      }
    }
    m = lower.match(/^lock\s+(.+?)\s+(?:as|means|:)\s+(.+)$/);
    if (m && saveLocked(m[1], m[2])) {
      dropWhatIsLessons(m[1]);
      return "locked " + sanitize(m[1]) + ".";
    }
    m = lower.match(/^edit\s+(.+?)\s+(?:as|means|:)\s+(.+)$/);
    if (m) {
      if (saveUser(m[1], m[2], raw, true)) return "updated your meaning of " + sanitize(m[1]) + ".";
    }
    m = lower.match(/^(?:define|teach)\s+(.+?)\s+(?:as|means|:)\s+(.+)$/);
    if (m && saveUser(m[1], m[2], raw)) return "saved your meaning.";
    m = lower.match(/^(.+?)\s+means\s+(.+)$/);
    if (m && m[1].split(/\s+/).length <= 4 && saveUser(m[1], m[2], raw)) return "saved your meaning.";
    if (/^read\s+/i.test(raw)) {
      var got = ingestRead(raw);
      return got || "no word lines found. use: cat means a small animal.";
    }
    var dm = declarative(raw);
    if (dm && !(global.NovaTrain && global.NovaTrain.isLearnCommand && global.NovaTrain.isLearnCommand(raw)) && saveUser(dm.term, dm.meaning, raw)) {
      clearPending();
      return "got it. " + dm.term + " is " + dm.meaning + ".";
    }
    return null;
  }

  function ruleThenBrain(origTalk, text) {
    var clar = clarifyAnswer(text);
    if (clar) return clar;
    var pendingDone = finishPending(text);
    if (pendingDone) return pendingDone;
    /* v55: "ok nova can a dog talk?" -> "can a dog talk?" so fillers never hide a yes/no question.
       Only yes/no lines are rewritten; greetings and every other line are untouched. */
    var bare = stripFillers(text);
    if (bare !== sanitize(text) && isYesNoQuestion(bare)) text = bare;
    /* Math first; a locked/user fact beats lessons for what is X / define X / my X. */
    var hit = mathAnswer(text) || recallMine(text) || senseAnswer(text) || lookupFact(text) || lookup(text);
    if (hit) return hit;
    var term = unknownTerm(text);
    if (term && !spokenMeaning(term) && !mathAnswer(text)) {
      /* v44: offline dictionary, only when there is no locked/user fact or lesson. */
      var dict = dictionaryOffer(term);
      if (dict) return dict;
      setPending({ question: text, term: term });
      return "i do not know " + term + ". what do you mean by it?";
    }
    if (isYesNoQuestion(text)) {
      /* v62: before "yes or no?", ask about a word Nova does not know or cannot tell apart. */
      var ask = clarifyStart(text);
      if (ask) return ask;
      setPending({ question: text, term: null, kind: "yn" });
      return "yes or no?";
    }
    /* Lookup already missed. Same generate-or-IDK path for questions and other lines.
       Do not call origTalk: its lesson match is looser than wh-substring rules. */
    return generateOrUnknown(text);
  }

  /* v62: words in a yes/no question. "Do phones call?" -> phone (noun), call (verb). Each content
     word is looked up in taught lessons first, then the dictionary. Unknown -> "what is a phone?" /
     "what does call mean?"; several meanings with no clear winner from how the question uses the
     word (v59 usage picker, POS from the question's shape) -> "which call? 1) ... 2) ...".
     The creator's next line is saved as that word's meaning (v60 add-to-list) or picks a number.
     At most 2 words per question, then "yes or no?" as before. Skip / nevermind cancels. */
  var CLARIFY = "nova-clarify-v1", CLARIFY_MAX = 2, CLARIFY_OPTS = 6;
  var DO_AUX = /^(do|does|did|can|could|will|would|should|may|might)$/;
  function readClarify() {
    var c;
    try { c = JSON.parse(localStorage.getItem(CLARIFY) || "null"); } catch (e) { c = null; }
    if (!c || !c.question || Date.now() - (c.at || 0) > 10 * 60 * 1000) return null;
    return c;
  }
  function writeClarify(c) { try { localStorage.setItem(CLARIFY, JSON.stringify(c)); } catch (e) {} }
  function clearClarify() { try { localStorage.removeItem(CLARIFY); } catch (e) {} }

  /* [{ w: token, pos: "n"|"v"|"a" }] plus the question rewritten as a statement for the usage picker. */
  function questionWords(text) {
    var D = global.NovaDict, q = stripFillers(text).replace(/[?.!,]+/g, " ").replace(/\s+/g, " ").trim();
    var t = q.split(" "), aux = t.shift(), out = [], subj = -1, i, w, pos, line;
    if (!D || !D.contentWords || !aux) return null;
    for (i = 0; i < t.length; i++) {
      w = t[i].replace(/'s$/, "").replace(/'/g, "");
      if (!/^[a-z][a-z-]*$/.test(w) || !D.contentWords(w).length) continue;
      if (subj < 0) { subj = i; pos = "n"; }
      else if (DO_AUX.test(aux) && out.length === 1) pos = "v";
      else pos = /^(is|are|am|was|were)$/.test(aux) ? "a" : "n";
      out.push({ w: w, pos: pos });
    }
    if (subj < 0) return null;
    line = t.slice(0, subj + 1).concat(/^(do|does|did)$/.test(aux) ? [] : [aux], t.slice(subj + 1)).join(" ");
    return { words: out, line: line };
  }

  function taughtWord(w, base) {
    var S = global.NovaSenses, f = readFacts(), t = S && S.read ? S.read() : {};
    return [w, base].some(function (k) {
      return k && ((Array.isArray(t[k]) && t[k].length) || spokenMeaning(k) || (f[k] && typeof f[k] === "string"));
    });
  }

  /* null = known; else { word, kind: "unknown"|"which", pos, options } */
  function wordIssue(item, line, skip) {
    var D = global.NovaDict, S = global.NovaSenses, w = item.w, e, base, list, keep, r, top;
    e = D.entry(w);
    base = e ? e.word : (w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
    if (skip.indexOf(base) !== -1 || skip.indexOf(w) !== -1) return null;
    if (taughtWord(w, base)) return null;
    if (!e) return D.ready && D.ready(w) ? { word: base, kind: "unknown", pos: item.pos } : null;
    if (!S || !S.allSenses || !S.usageScores) return null;
    list = S.allSenses(e.word, true);
    keep = list.filter(function (s) {
      var p = s.pos === "s" ? "a" : s.pos;
      return item.pos === "a" ? (p === "a" || p === "n") : p === item.pos;
    });
    if (keep.length) list = keep;
    if (list.length < 2) return null;
    r = S.usageScores(list, line, w);
    /* the most common meaning for this part of speech (WordNet lists it first) is the default:
       "can a dog talk" is not asked "which dog?". Nova asks only when the question pulls toward
       other meanings by a clear margin (or the default does not fit the way the word is used). */
    var exact = list.filter(function (s) { return (s.pos === "s" ? "a" : s.pos) === item.pos; });
    var first = Math.min.apply(null, (exact.length ? exact : list).map(function (s) { return s.source === "dict" ? s.idx : 1e9; }));
    var def = r.ranked.filter(function (x) { return x.s.source === "dict" && x.s.idx === first; })[0];
    top = r.ranked[0].sc;
    if (r.clue && top - r.ranked[1].sc >= 1) return null; /* a clear winner from how it is used */
    if (!def || def.sc >= top - 1) return null;
    var opts = r.ranked.filter(function (x) { return top - x.sc < 1; });
    if (opts.indexOf(def) === -1) opts.push(def);
    if (opts.length < 2) return null;
    return { word: e.word, kind: "which", pos: item.pos,
      options: opts.slice(0, CLARIFY_OPTS).map(function (x) { return shortGloss(x.s.gloss); }) };
  }

  function shortGloss(g) {
    var t = String(g || "").replace(/\s+/g, " ").trim();
    if (t.length <= 70) return t;
    t = t.slice(0, 70).replace(/\s+\S*$/, "").replace(/[\s,;:(]+$/, "");
    return t.replace(/\s+(?:that|which|to|of|and|or|the|a|an|for|with|by|in|as)$/, "") + "...";
  }

  function nextIssue(question, skip) {
    var qw = questionWords(question), i, iss;
    if (!qw) return null;
    for (i = 0; i < qw.words.length; i++) {
      try { iss = wordIssue(qw.words[i], qw.line, skip); } catch (e) { iss = null; }
      if (iss) return iss;
    }
    return null;
  }

  function askIssue(iss) {
    if (iss.kind === "which") {
      return "which " + iss.word + "? " + iss.options.map(function (o, k) { return (k + 1) + ") " + o; }).join(" ");
    }
    if (iss.pos === "n") return "what is " + (/^[aeiou]/.test(iss.word) ? "an " : "a ") + iss.word + "?";
    return "what does " + iss.word + " mean?";
  }

  function clarifyStart(question) {
    if (!global.NovaDict || !global.NovaDict.entry) return null;
    var iss = nextIssue(question, []);
    if (!iss) return null;
    try { if (global.NovaDict.clearOffer) global.NovaDict.clearOffer(); } catch (e) {}
    clearPending();
    writeClarify({ question: sanitize(question), asked: [], current: iss, at: Date.now() });
    return askIssue(iss);
  }

  /* The line after "what is a phone?" / "which call?". null = not an answer (normal flow runs). */
  function clarifyAnswer(text) {
    var c = readClarify(), cur, q = sanitize(text).replace(/[.!?]+$/, "").trim(), k = -1, meaning, dm, saved, iss, hit;
    if (!c) { clearClarify(); return null; }
    cur = c.current;
    if (cancelPending(text)) { clearClarify(); return "ok. skipped."; }
    if (cur.kind === "which") {
      var nq = q.replace(/^(?:the |number )/, "").replace(/ one$/, "");
      var NUMW = ["one", "two", "three", "four", "five", "six"], ORDW = ["first", "second", "third", "fourth", "fifth", "sixth"];
      if (/^\d{1,2}$/.test(nq)) k = parseInt(nq, 10) - 1;
      else if (NUMW.indexOf(nq) >= 0) k = NUMW.indexOf(nq);
      else if (ORDW.indexOf(nq) >= 0) k = ORDW.indexOf(nq);
      if (k >= cur.options.length) k = -1;
    }
    if (k < 0) {
      /* "it means X", "that is X", "call means X", "a phone is X" answer the open word */
      var own = sanitize(text).replace(/[.!]+$/, "").match(/^(?:it|that|(?:a |an |the )?([a-z][a-z-]*))\s+(?:is|means|is like|stands for|=)\s+(.+)$/);
      if (own && (!own[1] || own[1].replace(/s$/, "") === cur.word.replace(/s$/, ""))) { text = own[2]; q = sanitize(text); }
      else if (isNewQuestion(text) || isExplicitTeachPhrase(text) || /^(yes|no|y|n|yeah|nope|nah|ok|okay|idk|i don't know|i dont know)$/.test(q)) {
        clearClarify();
        return null;
      }
      if (/^(?:yes|no|y|n|ok|okay)$/.test(q)) { clearClarify(); return null; }
      meaning = extractCorrectionAnswer(text).replace(/[.!]+$/, "");
      var itm = sanitize(meaning).match(/^(?:it|that)\s+(?:is|means)\s+(.+)$/);
      if (itm) meaning = itm[1];
      dm = declarative(meaning);
      if (dm && stripArticle(dm.term).replace(/s$/, "") === cur.word.replace(/s$/, "")) meaning = dm.meaning;
      if (!sanitize(meaning)) { clearClarify(); return null; }
      saved = saveUser(cur.word, meaning, text); /* v60 style: stacks with any other meaning */
      if (!saved) { clearClarify(); return null; }
    } else {
      saved = true; /* picked a dictionary meaning: used for this question, nothing is taught */
    }
    c.asked.push(cur.word);
    var note = k >= 0 ? "ok, " + cur.word + " = " + cur.options[k] + "." : "saved your meaning of " + cur.word + ".";
    iss = c.asked.length < CLARIFY_MAX ? nextIssue(c.question, c.asked) : null;
    if (iss) {
      c.current = iss; c.at = Date.now(); writeClarify(c);
      return note + " " + askIssue(iss);
    }
    clearClarify();
    hit = lookup(c.question);
    if (hit) return note + " " + hit;
    setPending({ question: c.question, term: null, kind: "yn" });
    return note + " " + c.question.replace(/[?.!\s]+$/, "") + "? yes or no?";
  }

  /* v57: a word with more than one meaning picks one by wording + recent chat (senses.js). */
  function senseAnswer(text) {
    var S = global.NovaSenses;
    if (!S || typeof S.answer !== "function") return null;
    try { return S.answer(text); } catch (e) { return null; }
  }

  function dictionaryOffer(term) {
    var D = global.NovaDict, out = null;
    if (!D || typeof D.offer !== "function") return null;
    try { out = D.offer(term); } catch (e) { out = null; }
    if (out) clearPending();
    return out;
  }

  function generateOrUnknown(text) {
    var T = global.NovaTrain;
    var guessed = null;
    if (T && typeof T.tryGenerate === "function") {
      try { guessed = T.tryGenerate(text); }
      catch (e) { guessed = null; }
    }
    if (guessed && String(guessed).trim()) {
      clearPending();
      lastGuess = { question: text, at: Date.now() };
      return String(guessed).replace(/\s+/g, " ").trim();
    }
    setPending({ question: text, term: null });
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
      var taught = handleTeach(text, lastUser);
      if (taught) return taught;
      return origHandle ? origHandle(text, lastUser) : null;
    };
    T.lookup = lookup;
    T._exactLookup = true;
  }

  /* v43: read-only helpers for new-words.js (the what-is pending slot and facts). */
  global.NovaLookup = {
    taughtYesNo: taughtYesNo,
    teachYesNo: teachYesNo,
    readYesNo: readYesNo,
    saveUser: saveUser,
    setPending: setPending,
    getPending: getPending,
    readFacts: readFacts,
    sanitize: sanitize,
    cancelPending: cancelPending,
    isNewQuestion: isNewQuestion,
    canned: function () { return CANNED; },
    saveUser: saveUser,
    spokenMeaning: spokenMeaning,
    clearPending: clearPending,
    lessons: lessonsFromStore,
    clarifyAnswer: clarifyAnswer,
    readClarify: readClarify,
    lastGuess: function () { return lastGuess ? lastGuess.question : null; }
  };

  wrap();
  document.addEventListener("DOMContentLoaded", wrap);
})(window);
