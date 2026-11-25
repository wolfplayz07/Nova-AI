/* v64: self-knowledge. A capability registry computed at runtime from what is actually
   loaded (modules, the Learn button, navigator.onLine), not hardcoded true.
   Questions aimed at Nova ("can you / could you / are you able to / do you know how to /
   can nova", optional "yet") and "what can you do?" are answered here, before yes/no,
   saved answers, and the rules flow. A future research module (window.NovaResearch)
   plus an online phone would flip research to yes; this file does not implement
   research, and web/ ships no research module and makes no network calls.
   "finish my sentence" / "complete my sentence" is listed and is not available. */
(function (global) {
  function hasDict() {
    var D = global.NovaDict;
    return !!(D && (D.entry || D.offer || D.ready));
  }
  function hasTeach() {
    return typeof parseRemember === "function" || typeof teachMeaning === "function" || !!(global.NovaLookup);
  }
  function hasRules() { return !!global.NovaRules; }
  function hasLearn() {
    var T = global.NovaTrain, el;
    if (T && (T.start || T.isLearning)) return true;
    try {
      el = global.document && document.getElementById && document.getElementById("trainBtn");
      if (el && el.nodeType === 1) return true;
    } catch (e) {}
    return false;
  }
  /* true only when a research module is present AND the phone is online. Nothing in web/ provides one. */
  function hasResearch() {
    return !!(global.NovaResearch && global.navigator && navigator.onLine);
  }
  function hasSee() { return !!(global.NovaVision || global.NovaSee); }
  function hasHear() { return !!(global.SpeechRecognition || global.webkitSpeechRecognition); }
  /* the browser's speechSynthesis API is not enough: the app has no speak-out-loud code today. */
  function hasSpeak() { return !!global.NovaSpeak; }
  function hasSync() { return !!(global.NovaSync || global.NovaCloud); }
  function researchHowTo() {
    var m = global.NovaResearch;
    return (m && m.howTo) ? String(m.howTo) : "";
  }

  function capabilities() {
    return [
      { id: "dictionary", names: ["look up words", "look up a word", "look words up", "use the dictionary", "use a dictionary", "dictionary", "look up"], phrase: "look up words", available: hasDict(), howTo: "try 'what is rain'" },
      { id: "teach", names: ["remember", "teach", "learn meanings", "save a memory"], phrase: "remember what you teach me", available: hasTeach(), howTo: "say 'remember rain means water from the sky'" },
      { id: "rules", names: ["rules and reasoning", "use rules", "reasoning", "reason", "follow rules", "rules"], phrase: "use rules and reasoning", available: hasRules(), howTo: "tell me something like 'an umbrella keeps you dry'" },
      { id: "learn", names: ["learn from me", "learn from chat", "learn", "train"], phrase: "learn", available: hasLearn(), howTo: "tap Learn" },
      { id: "research", names: ["look up online", "look things up online", "search the internet", "search online", "use the internet", "research", "search", "internet"], phrase: "research", available: hasResearch(), howTo: researchHowTo() },
      { id: "see", names: ["see pictures", "see images", "see photos", "look at pictures", "see"], phrase: "see", available: hasSee() },
      { id: "hear", names: ["hear", "listen"], phrase: "hear", available: hasHear(), howTo: "tap the mic" },
      { id: "speak", names: ["talk out loud", "speak out loud", "speak", "talk"], phrase: "speak", available: hasSpeak(), howTo: "I would speak the reply out loud" },
      { id: "sync", names: ["remember across phones", "sync across phones", "sync"], phrase: "remember across phones", available: hasSync() },
      { id: "finish", names: ["finish my sentence", "complete my sentence", "finish this sentence", "complete this sentence", "finish a sentence", "complete a sentence", "finish sentences", "complete sentences"], phrase: "finish sentences", available: false, noReply: "I can't finish sentences yet." }
    ];
  }

  function clean(s) {
    return String(s || "").toLowerCase().replace(/\u2019/g, "'").replace(/[?.!,]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function stripFillers(q) {
    return q.replace(/^(?:(?:ok|okay|hey|hi|so|um|well|please|nova)\b\s*)+/, "").replace(/\s+(?:please|for me)$/, "").trim();
  }
  function stripYet(q) {
    return q.replace(/\b(?:yet|already|now|nowadays)\b/g, " ").replace(/\s+/g, " ").trim();
  }

  function isWhatCanYouDo(q) {
    q = stripYet(stripFillers(q)).replace(/\s+(?:for me|today)$/, "").trim();
    return /^(?:what can you do|what are you able to do|what can nova do|what do you know how to do|what are your abilities|what can you even do)$/.test(q);
  }
  function isFinish(q) {
    q = stripYet(stripFillers(clean(q)));
    return /^(?:finish|complete)\s+(?:my|this|the|a)\s+sentences?$/.test(q) || /^(?:finish|complete)\s+sentences$/.test(q);
  }
  /* remainder after a self-question prefix, or null if the line is not aimed at Nova. */
  function selfRest(q) {
    var m;
    q = stripYet(stripFillers(clean(q)));
    m = q.match(/^(?:can you|could you|are you able to|do you know how to|can nova)\s+(.+)$/);
    if (!m) return null;
    return m[1].replace(/^to\s+/, "").trim() || null;
  }
  function tidyVerb(rest) {
    var r = String(rest || "").replace(/\s+(?:please|for me)$/, "").trim();
    r = r.replace(/\s+\b(?:me|this|that|it)$/, "").trim();
    return r || rest;
  }

  function matchCap(rest) {
    var r = tidyVerb(rest), list = capabilities(), i, j, names, name;
    if (!r) return null;
    for (i = 0; i < list.length; i++) {
      names = list[i].names.slice().sort(function (a, b) { return b.length - a.length; });
      for (j = 0; j < names.length; j++) {
        name = names[j];
        /* exact, or the synonym plus extra words ("hear me", "research this").
           do not treat a short verb as a hit on a longer name ("learn" is not "learn meanings"). */
        if (r === name || r.indexOf(name + " ") === 0) return list[i];
      }
    }
    return null;
  }

  function yesReply(cap) {
    var how = cap.howTo ? String(cap.howTo).replace(/\s+$/, "") : "";
    if (how && !/[.!?]$/.test(how)) how += ".";
    return "yes, I can " + cap.phrase + "." + (how ? " " + how : "");
  }
  function noReply(cap) {
    if (cap.noReply) return cap.noReply;
    return "no, I can't " + cap.phrase + " yet. I only know my dictionary and what you teach me.";
  }
  function listAvailable() {
    var ok = capabilities().filter(function (c) { return c.available; }), parts;
    if (!ok.length) return "I don't have any listed abilities right now.";
    parts = ok.map(function (c) {
      var how = c.howTo ? String(c.howTo).replace(/[.]+$/, "") : "";
      return how ? c.phrase + " (" + how + ")" : c.phrase;
    });
    if (parts.length === 1) return "I can " + parts[0] + ".";
    return "I can " + parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1] + ".";
  }

  function clearSlots() {
    var L = global.NovaLookup;
    try { if (L && L.clearPending) L.clearPending(); } catch (e) {}
    try { if (L && L.clearClarify) L.clearClarify(); } catch (e2) {}
    try { localStorage.removeItem("nova-clarify-v1"); } catch (e3) {}
    try { localStorage.removeItem("nova-rules-ask-v1"); } catch (e4) {}
  }

  function handle(text) {
    var q = clean(text), rest, cap, verb;
    if (!q) return null;
    if (isWhatCanYouDo(q)) { clearSlots(); return listAvailable(); }
    rest = selfRest(q);
    if (isFinish(q) || (rest && isFinish(rest))) { clearSlots(); return "I can't finish sentences yet."; }
    if (!rest) return null;
    cap = matchCap(rest);
    if (cap) { clearSlots(); return cap.available ? yesReply(cap) : noReply(cap); }
    verb = tidyVerb(rest);
    if (!verb) return null;
    clearSlots();
    return "I'm not sure I can " + verb + ". I don't have that ability listed.";
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._selfKnow) return;
    var orig = reply, p;
    function wrapped(text) {
      var out = null;
      try { out = handle(text); } catch (e) { out = null; if (global.__selfDebug) throw e; }
      if (out) return out;
      return orig.apply(this, arguments);
    }
    for (p in orig) if (Object.prototype.hasOwnProperty.call(orig, p)) wrapped[p] = orig[p];
    wrapped._selfKnow = true;
    reply = wrapped;
  }
  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._selfKnow) return;
    var orig = T.learnPair, p;
    var g = function (user, nova) {
      if (/^(yes, I can |no, I can't |I'm not sure I can |I can't finish sentences yet\.|I can |I don't have any listed abilities)/.test(String(nova || ""))) return false;
      return orig.apply(this, arguments);
    };
    for (p in orig) if (Object.prototype.hasOwnProperty.call(orig, p)) g[p] = orig[p];
    g._selfKnow = true;
    T.learnPair = g;
  }

  global.NovaSelfKnow = { capabilities: capabilities, handle: handle, matchCap: matchCap, selfRest: selfRest };
  wrapReply();
  guardLearn();
  if (global.document && document.addEventListener) document.addEventListener("DOMContentLoaded", function () { guardLearn(); wrapReply(); });
})(window);
