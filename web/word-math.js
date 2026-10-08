/* On-device word-problem solver (v42). Plain rules: no model, no network.
   novaWordMath(text) returns a plain sentence, or null when the line is not a word problem
   it can read. null means the normal reply path carries on exactly as before.
   State (who has how many of what) lives in memory for this session only. */
(function (global) {
  var TTL = 15 * 60 * 1000;
  var S = blank();
  var lastSolved = null;

  function blank() {
    return { owners: {}, order: [], lastOwner: null, lastNamed: null, lastObject: null, lastDivide: null, nouns: {}, at: 0 };
  }

  /* ---------- words ---------- */
  var UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

  var SUB = "gave away|gives away|give away|threw away|throws away|throw away|took away|takes away|take away|used up|uses up|use up|" +
    "took|takes|take|ate|eats|eat|eaten|lost|loses|lose|spent|spends|spend|broke|breaks|break|sold|sells|sell|" +
    "used|uses|dropped|drops|popped|pops|stole|steals|donated|donates";
  var ADD = "picked up|picks up|pick up|was given|were given|is given|are given|got|gets|found|finds|find|bought|buys|buy|" +
    "received|receives|receive|picked|picks|pick|collected|collects|collect|won|wins|earned|earns|made|makes|baked|bakes|" +
    "caught|catches|grew|grows|borrowed|borrows";
  var GIVE = "gave|gives|give|handed|hands|hand|passed|passes|sent|sends|lent|lends";
  var DIV = "shared|shares|share|sharing|split|splits|splitting|divided|divides|divide|dividing|handed out|hands out|hand out|dealt|deals|deal";
  var PASSIVE = "eaten|taken|lost|sold|broken|used|spent|stolen|dropped|popped|given away";

  var AUX = "(?:has |have |had |just |then |also |later |now )*";
  var SUBJ = "^(?:(?:the|a|an|his|her|their|my|our) )?([a-z]+) " + AUX;
  var RE_SUB = new RegExp(SUBJ + "(?:" + SUB + ")\\b ?(.*)$");
  var RE_SUB0 = new RegExp("^" + AUX + "(?:" + SUB + ")\\b ?(.*)$");
  var RE_ADD = new RegExp(SUBJ + "(?:" + ADD + ")\\b ?(.*)$");
  var RE_ADD0 = new RegExp("^" + AUX + "(?:" + ADD + ")\\b ?(.*)$");
  var RE_GIVE = new RegExp(SUBJ + "(?:" + GIVE + ")\\b(?! away| out) ?(.*)$");
  var RE_GIVE0 = new RegExp("^" + AUX + "(?:" + GIVE + ")\\b(?! away| out) ?(.*)$");
  var RE_DIV = new RegExp("\\b(?:" + DIV + ")\\b");
  var RE_PASSIVE = new RegExp("^(\\d+(?:\\.\\d+)?)(?: ([a-z]+(?: [a-z]+)?))? (?:were|was|are|is|got|get|have been|had been) (?:" + PASSIVE + ")\\b");
  var RE_VERB_ANY = new RegExp("\\b(?:" + SUB + "|" + ADD + "|" + GIVE + "|" + DIV + ")\\b");
  var RE_CUE = new RegExp("\\b(?:" + SUB + "|" + ADD + "|" + GIVE + "|" + DIV + "|each|apiece|groups? of|how many|how much|left|in all|altogether|in total)\\b");

  var STOP = toSet("if then and but so there it its this that these those the a an how what many much each every all now left " +
    "more of to from with in on at by for some any no not into among amongst between equally total altogether together combined " +
    "is are was were be been am has have had do does did will would can could should may might " +
    "him her them his their hers it me you us we our your my its one ones today yesterday tomorrow too also back out up over per " +
    "apiece than as just still only away then later first next after before when while yes ok okay please");
  var PRON = toSet("he she they him her them");
  var SELF = toSet("i me");

  var IRREG = { children: "child", people: "person", men: "man", women: "woman", mice: "mouse", feet: "foot", teeth: "tooth",
    geese: "goose", leaves: "leaf", knives: "knife", wolves: "wolf", loaves: "loaf", halves: "half", shelves: "shelf",
    lives: "life", calves: "calf", thieves: "thief", shoes: "shoe", toes: "toe", canoes: "canoe", buses: "bus" };
  var SAME = toSet("sheep fish deer money candy corn rice water juice milk bread");
  var IE = toSet("cookie movie pie brownie tie smoothie zombie selfie rookie hippie calorie goalie cutie pixie veggie");
  var IRREG_PL = {};
  (function () { var k; for (k in IRREG) if (IRREG.hasOwnProperty(k)) IRREG_PL[IRREG[k]] = k; })();

  function toSet(s) {
    var o = {}, a = s.split(/\s+/), n;
    for (n = 0; n < a.length; n++) if (a[n]) o[a[n]] = 1;
    return o;
  }

  function singular(w) {
    if (!w) return w;
    if (IRREG[w]) return IRREG[w];
    if (SAME[w]) return w;
    if (/ies$/.test(w) && w.length > 4) return IE[w.slice(0, -1)] ? w.slice(0, -1) : w.slice(0, -3) + "y";
    if (/(ch|sh|x|ss|z)es$/.test(w)) return w.slice(0, -2);
    if (/oes$/.test(w)) return w.slice(0, -2);
    if (/(ss|us|is)$/.test(w)) return w;
    if (/s$/.test(w) && w.length > 2) return w.slice(0, -1);
    return w;
  }

  function plural(w) {
    if (!w) return w;
    if (IRREG_PL[w]) return IRREG_PL[w];
    if (SAME[w]) return w;
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
    if (/(s|x|z|ch|sh)$/.test(w)) return w + "es";
    if (/^(potato|tomato|hero|echo|mango)$/.test(w)) return w + "es";
    return w + "s";
  }

  function lastWord(p) { var a = p.split(" "); return a[a.length - 1]; }
  function headOf(p) { var a = p.split(" "); a[a.length - 1] = singular(a[a.length - 1]); return a.join(" "); }

  /* Remember how to say a noun both ways. typedPlural: the user wrote it with a count other than 1. */
  function learnNoun(W, phrase, typedPlural) {
    var key = headOf(phrase);
    if (W.nouns[key]) return key;
    var a = phrase.split(" "), one, many;
    if (typedPlural) { many = phrase; a[a.length - 1] = singular(a[a.length - 1]); one = a.join(" "); }
    else { one = phrase; a[a.length - 1] = plural(a[a.length - 1]); many = a.join(" "); }
    W.nouns[key] = { one: one, many: many };
    return key;
  }

  function say(W, key, n) {
    if (!key) return "";
    var f = W.nouns[key] || { one: key, many: plural(key) };
    return n === 1 ? f.one : f.many;
  }

  function fmtNum(n) {
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }

  /* ---------- text prep ---------- */
  function numberWords(q) {
    q = q.replace(/\bhalf a dozen\b/g, "6").replace(/\b(?:a|one) dozen\b/g, "12");
    q = q.replace(/\b(\d+) dozen\b/g, function (m, n) { return String(parseInt(n, 10) * 12); });
    q = q.replace(/\bdozen\b/g, "12");
    q = q.replace(/\b(each|no|this|that|which|the|every|any|some) one\b/g, "$1 \u0001");
    q = q.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](one|two|three|four|five|six|seven|eight|nine)\b/g,
      function (m, t, u) { return String(TENS[t] + UNITS[u]); });
    q = q.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g,
      function (w) { return String(UNITS[w] != null ? UNITS[w] : TENS[w]); });
    q = q.replace(/\u0001/g, "one");
    /* "ate a cookie" -> "ate 1 cookie" (only right after a math verb) */
    q = q.replace(new RegExp("\\b(" + SUB + "|" + ADD + "|" + GIVE + ")\\b (?:a|an) (?!lot\\b|few\\b|bit\\b|little\\b|couple\\b|bunch\\b|lot of\\b)([a-z]+)", "g"), "$1 1 $2");
    return q;
  }

  function normalize(text) {
    var q = String(text || "").toLowerCase().replace(/[\u2018\u2019]/g, "'");
    q = q.replace(/'s\b/g, "").replace(/[^a-z0-9.?!,;\s-]/g, " ").replace(/-/g, " ");
    q = q.replace(/\s+/g, " ").trim();
    return numberWords(q);
  }

  var OWNER_CMD = /^(when i say|lock |edit |read |remember|my |define |teach |fix\b|say\b|reply\b|answer\b|tell them|you should say|the answer is|no[,:]|skip|nevermind|never mind|cancel|forget it|start |stop|pause|train|learn|sample|export|reset )/;
  var YESNO = /^(can|could|do|does|did|is|are|am|will|would|should|have|has|may)\b/;

  function fresh() { return S.at && Date.now() - S.at < TTL && S.order.length > 0; }

  /* Only take lines that look like word problems. Everything else goes to the normal path untouched. */
  function wants(text) {
    var low = String(text || "").toLowerCase().trim();
    if (!low) return false;
    if (OWNER_CMD.test(low) || /\bmeans\b/.test(low) || /what do you remember|what time/.test(low)) return false;
    if (/https?:\/\//.test(low)) return false;
    if (YESNO.test(low)) return false;
    var q = normalize(low);
    var hasNum = /\d/.test(q);
    if (hasNum && RE_CUE.test(q)) return true;
    if (fresh() && /\bhow (many|much)\b/.test(q)) return true;
    return false;
  }

  /* ---------- state helpers ---------- */
  function owner(W, k) {
    if (!W.owners[k]) W.owners[k] = { counts: {} };
    return W.owners[k];
  }

  function touch(W, k) {
    var i = W.order.indexOf(k);
    if (i !== -1) W.order.splice(i, 1);
    W.order.push(k);
    if (k !== "") W.lastOwner = k;
    if (k !== "" && k !== "i") W.lastNamed = k;
  }

  function has(W, k, obj) {
    return !!(W.owners[k] && W.owners[k].counts[obj] != null);
  }

  /* Who a word points to. exclude: prefer someone else (for "Mary gives him 3"). */
  function resolve(W, word, exclude) {
    var n;
    if (word == null || word === "") return null;
    if (SELF[word]) return "i";
    if (word === "there") return "";
    if (PRON[word]) {
      if (W.lastNamed && W.lastNamed !== exclude) return W.lastNamed;
      for (n = W.order.length - 1; n >= 0; n--) {
        if (W.order[n] !== exclude && W.order[n] !== "" && W.order[n] !== "i") return W.order[n];
      }
      if ((word === "they" || word === "them") && W.owners[""]) return "";
      return null;
    }
    if (STOP[word] || word === "you" || word === "we" || !/^[a-z]+$/.test(word)) return null;
    if (RE_VERB_ANY.test(word)) return null;
    return word;
  }

  /* Match "apples" to a tracked "red apple" etc. */
  function matchObj(W, k, key) {
    if (!key) return null;
    var c = W.owners[k] ? W.owners[k].counts : {}, o;
    if (c[key] != null) return key;
    for (o in c) if (c.hasOwnProperty(o) && lastWord(o) === lastWord(key)) return o;
    return key;
  }

  function defaultObj(W, k) {
    var c = W.owners[k] ? W.owners[k].counts : null, keys = [], o;
    if (c && W.lastObject && c[W.lastObject] != null) return W.lastObject;
    if (c) for (o in c) if (c.hasOwnProperty(o)) keys.push(o);
    if (keys.length === 1) return keys[0];
    return W.lastObject;
  }

  /* Noun phrase after a number: "cookies", "red apples", "of his cookies", "more". Returns {phrase} or null. */
  function nounAfter(rest) {
    var w = String(rest || "").split(" ").filter(Boolean), i = 0, got = [];
    while (i < w.length && (w[i] === "more" || w[i] === "extra" || w[i] === "new")) i++;
    if (w[i] === "of") {
      i++;
      if (/^(them|it|those|these)$/.test(w[i] || "")) return null;
      if (/^(his|her|their|the|my|our|your|its)$/.test(w[i] || "")) i++;
    }
    while (i < w.length && got.length < 2) {
      if (!/^[a-z]+$/.test(w[i]) || STOP[w[i]] || RE_VERB_ANY.test(w[i])) break;
      got.push(w[i]);
      i++;
    }
    return got.length ? { phrase: got.join(" ") } : null;
  }

  function objFrom(W, rest, n) {
    var np = nounAfter(rest);
    if (!np) return null;
    return learnNoun(W, np.phrase, n !== 1);
  }

  function change(W, k, obj, delta, info) {
    var o = owner(W, k);
    if (info.before.owners[k] && info.before.owners[k].counts[obj] != null) info.touched = true;
    o.counts[obj] = (o.counts[obj] || 0) + delta;
    if (o.counts[obj] < -1e-9) {
      info.impossible = cap(who(k)) + " only " + (k === "i" ? "had " : "had ") + fmtNum(o.counts[obj] - delta) + (obj ? " " + say(W, obj, o.counts[obj] - delta) : "") + ". that does not add up.";
    }
    if (obj) W.lastObject = obj;
  }

  /* ---------- clause readers ---------- */
  var NOTW = "(?!(?:and|in|on|inside|with|of|each|that|has|have|had|holds|hold|contains|contain|got|get|holding|containing)\\b)";
  var NP = "(" + NOTW + "[a-z]+(?: " + NOTW + "[a-z]+)?)";
  var HOLD = "(?:has|had|have|owns|bought|got|buys|gets|carries|carried|has got|have got)";
  var RE_MUL1 = new RegExp("^(?:(?:([a-z]+) " + HOLD + "|there (?:are|were|is|was)) )?(\\d+(?:\\.\\d+)?) " + NP +
    " (?:with|of|holding|containing|that (?:has|have|hold|holds|contain|contains)|(?:and )?each (?:[a-z]+ )?(?:has|have|holds|hold|contains|contain|with|holding|containing|of)|has|have|hold|holds|contain|contains|each have|each has|got|get) " +
    "(\\d+(?:\\.\\d+)?)(?: (.*))?$");
  var RE_MUL2 = new RegExp("^(?:(?:([a-z]+) " + HOLD + "|there (?:are|were|is|was)) )?(\\d+(?:\\.\\d+)?) " + NP + " (?:in|on|inside) each(?: of)?(?: the)?(?: (\\d+(?:\\.\\d+)?))? ([a-z]+)");
  var RE_MUL3 = new RegExp("^each ([a-z]+) (?:has|have|holds|hold|contains|contain|had|gets|got|is holding|has got) (\\d+(?:\\.\\d+)?)(?: (.*))?$");

  function mulOwner(W, subj, clause) {
    if (subj) return resolve(W, subj);
    if (/^there /.test(clause)) return "";
    return "";
  }

  function readMultiply(W, c, info) {
    var m, k, a, b, obj, cont, total, src, n;
    if (!/\b(each|apiece|per|of)\b/.test(c)) return 0;
    m = c.match(RE_MUL1);
    if (m && (/\b(each|apiece|per)\b/.test(c) || / of \d/.test(c))) {
      k = mulOwner(W, m[1], c);
      if (k == null) return -1;
      a = parseFloat(m[2]); b = parseFloat(m[4]);
      if (STOP[lastWord(m[3])]) return -1;
      cont = learnNoun(W, m[3], a !== 1);
      obj = objFrom(W, m[5], b) || "";
      total = a * b;
      owner(W, k).counts[cont] = a;
      owner(W, k).counts[obj] = total;
      touch(W, k);
      W.lastObject = obj;
      info.mul = { k: k, obj: obj };
      return 1;
    }
    m = c.match(RE_MUL2);
    if (m) {
      k = mulOwner(W, m[1], c);
      if (k == null) return -1;
      b = parseFloat(m[2]);
      obj = learnNoun(W, m[3], b !== 1);
      cont = headOf(m[5]);
      if (m[4]) a = parseFloat(m[4]);
      else {
        src = holderOf(W, cont);
        if (src == null) return -1;
        k = src;
        a = W.owners[src].counts[cont];
      }
      owner(W, k).counts[obj] = a * b;
      touch(W, k);
      W.lastObject = obj;
      info.mul = { k: k, obj: obj };
      return 1;
    }
    m = c.match(RE_MUL3);
    if (m) {
      cont = headOf(m[1]);
      src = holderOf(W, cont);
      if (src == null) return -1;
      b = parseFloat(m[2]);
      obj = objFrom(W, m[3], b) || "";
      n = W.owners[src].counts[cont];
      owner(W, src).counts[obj] = n * b;
      touch(W, src);
      W.lastObject = obj;
      info.mul = { k: src, obj: obj };
      return 1;
    }
    return 0;
  }

  /* Most recent owner who holds this noun. */
  function holderOf(W, key) {
    var n, k, o;
    for (n = W.order.length - 1; n >= 0; n--) {
      k = W.order[n];
      if (W.owners[k].counts[key] != null) return k;
      for (o in W.owners[k].counts) if (W.owners[k].counts.hasOwnProperty(o) && lastWord(o) === lastWord(key)) return k;
    }
    return null;
  }

  function readDivide(W, c, info) {
    var dm, vm, subj, k, total, obj, nums, n, divisor, recip, per, rem, re, m;
    vm = c.match(RE_DIV);
    if (!vm) return 0;
    dm = c.match(/\b(?:among|amongst|between|into|by) (?:his |her |their |the |my )?(\d+(?:\.\d+)?)(?: ([a-z]+))?/);
    if (!dm) return 0;
    divisor = parseFloat(dm[1]);
    recip = dm[2] && !STOP[dm[2]] ? singular(dm[2]) : "";
    /* dividend: first number in the clause that is not the divisor */
    re = /(\d+(?:\.\d+)?)(?: ([a-z]+(?: [a-z]+)?))?/g;
    nums = null;
    while ((m = re.exec(c))) {
      if (m.index === dm.index + dm[0].indexOf(dm[1])) continue;
      if (m.index > dm.index) continue;
      nums = m;
      break;
    }
    m = c.match(new RegExp("^(?:(?:the|a|an) )?([a-z]+) (?:equally )?(?:" + DIV + ")\\b"));
    subj = m ? m[1] : null;
    if (subj && !resolveOk(W, subj)) subj = null;
    if (nums) {
      total = parseFloat(nums[1]);
      obj = nums[2] ? objFrom(W, nums[2], total) : null;
      if (!obj) obj = W.lastObject || "";
      k = subj ? resolve(W, subj) : "";
      if (k == null) k = "";
      owner(W, k).counts[obj] = total;
    } else {
      k = subj ? resolve(W, subj) : W.lastOwner;
      if (k == null) return -1;
      m = c.slice(vm.index + vm[0].length).match(/^ (?:the |his |her |their )?([a-z]+)/);
      obj = m && !STOP[m[1]] && !/^(equally|evenly|them|it)$/.test(m[1]) ? matchObj(W, k, headOf(m[1])) : defaultObj(W, k);
      if (!has(W, k, obj)) return -1;
      if (info.before.owners[k] && info.before.owners[k].counts[obj] != null) info.touched = true;
      total = W.owners[k].counts[obj];
    }
    if (divisor === 0) { info.say = "i cannot divide by zero."; return 1; }
    if (Math.abs(total - Math.round(total)) < 1e-9 && Math.abs(divisor - Math.round(divisor)) < 1e-9) {
      per = Math.floor(total / divisor);
      rem = total - per * divisor;
    } else {
      per = total / divisor;
      rem = 0;
    }
    owner(W, k).counts[obj] = rem;
    touch(W, k);
    W.lastObject = obj;
    W.lastDivide = { per: per, rem: rem, obj: obj, recip: recip };
    info.divided = true;
    return 1;
  }

  function resolveOk(W, word) { return resolve(W, word) != null; }

  function divideSentence(W, d) {
    var who = d.recip ? "each " + d.recip : "each one";
    var s = cap(who) + " gets " + fmtNum(d.per) + (d.obj ? " " + say(W, d.obj, d.per) : "") + ".";
    if (d.rem) s += " " + fmtNum(d.rem) + (d.obj ? " " + say(W, d.obj, d.rem) : "") + (d.rem === 1 ? " is" : " are") + " left over.";
    return s;
  }

  var RE_POSS = /^(?:([a-z]+) (?:has got|have got|has|had|have|owns|owned|starts with|started with|start with|keeps|kept|holds|held)|there (?:are|were|is|was)) (\d+(?:\.\d+)?)(?: (.*))?$/;

  function readPossess(W, c, info) {
    var m = c.match(RE_POSS), k, n, obj;
    if (!m) return 0;
    k = m[1] ? resolve(W, m[1]) : "";
    if (k == null) return -1;
    n = parseFloat(m[2]);
    obj = objFrom(W, m[3], n);
    if (!obj) obj = defaultObj(W, k) || "";
    if (m[3] && /\b(left|now)\b/.test(m[3]) && !has(W, k, obj)) return -1;
    owner(W, k).counts[obj] = n;
    touch(W, k);
    W.lastObject = obj;
    info.events++;
    return 1;
  }

  function splitAmount(rest) {
    var m = String(rest || "").match(/^(\d+(?:\.\d+)?)(?: (.*))?$/);
    if (!m) return null;
    return { n: parseFloat(m[1]), rest: m[2] || "" };
  }

  function readSubtract(W, c, info) {
    var m = c.match(RE_SUB), subj = null, rest, amt, k, from, target, obj, fm;
    if (m) { subj = m[1]; rest = m[2]; }
    else if ((m = c.match(RE_SUB0))) { rest = m[1]; }
    else if ((m = c.match(RE_PASSIVE))) {
      amt = { n: parseFloat(m[1]), rest: m[2] || "" };
      target = W.lastOwner != null ? W.lastOwner : (W.owners[""] ? "" : null);
      obj = amt.rest ? objFrom(W, amt.rest, amt.n) : null;
      if (target == null) return -1;
      obj = obj ? matchObj(W, target, obj) : defaultObj(W, target);
      if (!has(W, target, obj)) { target = holderOf(W, obj); if (target == null) return -1; }
      change(W, target, obj, -amt.n, info);
      info.events++; info.ops++;
      return 1;
    } else return 0;
    amt = splitAmount(rest);
    if (!amt) return -1;
    k = subj != null ? resolve(W, subj) : W.lastOwner;
    obj = objFrom(W, amt.rest, amt.n);
    fm = amt.rest.match(/\bfrom (?:the )?([a-z]+)/);
    if (fm) {
      target = resolve(W, fm[1], k);
      if (target == null) return -1;
    } else if (k != null && W.owners[k] && (obj ? has(W, k, matchObj(W, k, obj)) : defaultObj(W, k) != null && has(W, k, defaultObj(W, k)))) {
      target = k;
    } else {
      target = null;
      if (W.lastOwner != null && W.lastOwner !== k) target = W.lastOwner;
      if (target == null && obj) target = holderOf(W, obj);
      if (target == null && W.owners[""] && k !== "") target = "";
    }
    if (target == null) return -1;
    obj = obj ? matchObj(W, target, obj) : defaultObj(W, target);
    if (!has(W, target, obj)) return -1;
    change(W, target, obj, -amt.n, info);
    touch(W, target);
    info.events++; info.ops++;
    return 1;
  }

  function readAdd(W, c, info) {
    var m = c.match(RE_ADD), subj = null, rest, amt, k, obj, fm, src;
    if (m) { subj = m[1]; rest = m[2]; }
    else if ((m = c.match(RE_ADD0))) { rest = m[1]; }
    else return 0;
    amt = splitAmount(rest);
    if (!amt) return -1;
    k = subj != null ? resolve(W, subj) : W.lastOwner;
    if (k == null) return -1;
    obj = objFrom(W, amt.rest, amt.n);
    obj = obj ? matchObj(W, k, obj) : defaultObj(W, k);
    if (obj == null) obj = "";
    fm = amt.rest.match(/\bfrom (?:the )?([a-z]+)/);
    if (fm) {
      src = resolve(W, fm[1], k);
      if (src != null && has(W, src, matchObj(W, src, obj))) change(W, src, matchObj(W, src, obj), -amt.n, info);
    }
    change(W, k, obj, amt.n, info);
    touch(W, k);
    info.events++; info.ops++;
    return 1;
  }

  function readGive(W, c, info) {
    var m = c.match(RE_GIVE), subj = null, rest, giver, recipWord = null, amt, obj, recip, r;
    if (m) { subj = m[1]; rest = m[2]; }
    else if ((m = c.match(RE_GIVE0))) { rest = m[1]; }
    else return 0;
    if ((r = rest.match(/^(?:the )?([a-z]+) (\d+(?:\.\d+)?)(?: (.*))?$/))) {
      recipWord = r[1]; amt = { n: parseFloat(r[2]), rest: r[3] || "" };
    } else if ((r = rest.match(/^(\d+(?:\.\d+)?)(?: (.*?))?(?: to (?:the )?([a-z]+).*)?$/))) {
      amt = { n: parseFloat(r[1]), rest: r[2] || "" }; recipWord = r[3] || null;
    } else return -1;
    giver = subj != null ? resolve(W, subj) : W.lastOwner;
    recip = recipWord ? resolve(W, recipWord, giver) : null;
    obj = objFrom(W, amt.rest, amt.n);
    if (giver != null && W.owners[giver] && has(W, giver, obj ? matchObj(W, giver, obj) : defaultObj(W, giver))) {
      obj = obj ? matchObj(W, giver, obj) : defaultObj(W, giver);
      change(W, giver, obj, -amt.n, info);
      if (recip != null && recip !== giver && W.owners[recip]) change(W, recip, obj, amt.n, info);
      touch(W, giver);
    } else if (recip != null && W.owners[recip]) {
      obj = obj ? matchObj(W, recip, obj) : defaultObj(W, recip);
      if (!has(W, recip, obj)) return -1;
      change(W, recip, obj, amt.n, info);
      touch(W, recip);
    } else return -1;
    info.events++; info.ops++;
    return 1;
  }

  /* ---------- answers ---------- */
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function who(k) { return k === "i" ? "you" : k; }

  function statement(W, k, obj, n, tail) {
    var thing = obj ? " " + say(W, obj, n) : "";
    var num = fmtNum(n);
    if (k === "") return (n === 1 ? "There is " : "There are ") + num + thing + tail + ".";
    if (k === "i") return "You have " + num + thing + tail + ".";
    return cap(k) + " has " + num + thing + tail + ".";
  }

  var QSTOP = toSet("are is do does did will would can could left now in each total altogether were was has have should remain remaining " +
    "there of does in all together combined he she they i jon");

  function answer(W, q, info) {
    var m = q.match(/\bhow (?:many|much)\b ?(.*)$/), rest, obj = null, k, tail, words, i, got, total, n, holders, o;
    if (!m) return null;
    rest = m[1];
    if (/\beach\b/.test(rest) && /\b(get|gets|got|receive|receives|have|has|will|each)\b/.test(rest)) {
      return W.lastDivide ? divideSentence(W, W.lastDivide) : null;
    }
    /* "how many did Mary take" asks about an event, not a count. Not handled yet. */
    if (new RegExp("\\b(?:" + SUB + "|" + GIVE + "|" + DIV + ")\\b").test(rest)) return null;
    if (/\b(more|fewer|less|than|older|younger|longer|cost|costs|time|minutes|hours|days)\b/.test(rest)) return null;
    words = rest.split(" ").filter(Boolean);
    got = [];
    for (i = 0; i < words.length && got.length < 2; i++) {
      if (QSTOP[words[i]] || STOP[words[i]] || !/^[a-z]+$/.test(words[i])) break;
      got.push(words[i]);
    }
    if (got.length) obj = headOf(got.join(" "));
    m = rest.match(/\b(?:does|do|did|will|would|can|could|should|has|have) (?:(?:the|a|an) )?([a-z]+)(?: [a-z]+)? (?:have|has|own|hold|get|got|keep|end up with|left|now)\b/) ||
        rest.match(/\b(?:does|do|did|will|would|can|could|should) (?:(?:the|a|an) )?([a-z]+)$/) ||
        rest.match(/\b(?:has|have) ([a-z]+) (?:got|left)\b/) ||
        rest.match(/\b(?:are|is) (?:there|left) (?:with|for) ([a-z]+)\b/);
    tail = /\b(left|remain|remaining)\b/.test(rest) ? " left" :
      /\b(in all|altogether|in total|total|together|combined|all together)\b/.test(rest) ? " in all" :
      /\bnow\b/.test(rest) ? " now" : (info.ops || info.touched ? " now" : "");
    if (m) {
      k = resolve(W, m[1]);
      if (k == null) return null;
      if (!W.owners[k]) return null;
      obj = obj ? matchObj(W, k, obj) : defaultObj(W, k);
      if (!has(W, k, obj)) return null;
      return statement(W, k, obj, W.owners[k].counts[obj], tail);
    }
    if (!obj) obj = W.lastObject;
    if (obj == null) return null;
    if (tail === " in all") {
      holders = []; total = 0;
      for (o in W.owners) {
        if (!W.owners.hasOwnProperty(o)) continue;
        n = W.owners[o].counts[matchObj(W, o, obj)];
        if (n != null) { holders.push(o); total += n; obj = matchObj(W, o, obj); }
      }
      if (!holders.length) return null;
      if (holders.length === 1) return statement(W, holders[0], obj, total, tail);
      return statement(W, "", obj, total, tail);
    }
    k = W.lastOwner != null && has(W, W.lastOwner, matchObj(W, W.lastOwner, obj)) ? W.lastOwner : holderOf(W, obj);
    if (k == null && W.owners[""] && has(W, "", matchObj(W, "", obj))) k = "";
    if (k == null) return null;
    obj = matchObj(W, k, obj);
    return statement(W, k, obj, W.owners[k].counts[obj], tail);
  }

  /* ---------- main ---------- */
  var LEAD = /^(?:if|so|then|now|first|at first|later|next|also|and|but|after that|afterwards|well|ok|okay|suppose|today|yesterday|in the end|finally)\s+/;

  function clauses(q) {
    q = q.replace(/\b(?:among|amongst|between) ((?:[a-z]+, )*[a-z]+,? and [a-z]+)\b/g, function (m, names) {
      return "among " + names.split(/,? and |, /).length + " people";
    });
    var parts = q.split(/(?:[?!;,]|\.(?!\d))+|\b(?:and then|then|but|so|after that|afterwards|later|if|when|after|while)\b|\band\b(?! each\b)/);
    var out = [], n, c, prev;
    for (n = 0; n < parts.length; n++) {
      c = (parts[n] || "").trim();
      do { prev = c; c = c.replace(LEAD, "").trim(); } while (c !== prev);
      if (c) out.push(c);
    }
    return out;
  }

  function solve(text) {
    if (!wants(text)) return null;
    if (!fresh()) S = blank();
    var W = JSON.parse(JSON.stringify(S));
    var info = { before: S, events: 0, ops: 0, touched: false, impossible: null, say: null, mul: null, divided: false };
    var parts = clauses(normalize(text));
    var question = null, n, c, r;
    for (n = 0; n < parts.length; n++) {
      c = parts[n];
      if (/\bhow (?:many|much)\b/.test(c)) { question = c; continue; }
      r = readMultiply(W, c, info);
      if (!r) r = readDivide(W, c, info);
      if (!r) r = readPossess(W, c, info);
      if (!r) r = readSubtract(W, c, info);
      if (!r) r = readGive(W, c, info);
      if (!r) r = readAdd(W, c, info);
      if (r < 0) return null;
      if (!r && /\d/.test(c)) return null;
      if (info.impossible) return info.impossible;
      if (info.say) return info.say;
    }
    var out = null;
    if (question) out = answer(W, question, info);
    else if (info.divided) out = divideSentence(W, W.lastDivide);
    else if (info.mul) out = statement(W, info.mul.k, info.mul.obj, W.owners[info.mul.k].counts[info.mul.obj], "");
    else if (info.ops && (info.touched || info.events >= 2) && W.lastOwner != null) {
      var k = W.lastOwner, obj = defaultObj(W, k);
      if (has(W, k, obj)) out = statement(W, k, obj, W.owners[k].counts[obj], " now");
    }
    if (!out) return null;
    W.at = Date.now();
    S = W;
    lastSolved = String(text || "").trim();
    return out;
  }

  /* A solved line is recomputed from state each time; do not store it as a lesson. */
  function guardLearn() {
    var T = global.NovaTrain;
    if (!T || typeof T.learnPair !== "function" || T.learnPair._wordMath) return;
    var orig = T.learnPair;
    var g = function (user) {
      if (lastSolved != null && String(user || "").trim() === lastSolved) { lastSolved = null; return false; }
      return orig.apply(this, arguments);
    };
    g._wordMath = true;
    T.learnPair = g;
  }

  global.novaWordMath = solve;
  global.NovaWordMath = {
    solve: solve,
    wants: wants,
    reset: function () { S = blank(); lastSolved = null; },
    state: function () { return JSON.parse(JSON.stringify(S)); },
    singular: singular,
    plural: plural
  };
  guardLearn();
  if (global.document && document.addEventListener) document.addEventListener("DOMContentLoaded", guardLearn);
})(window);
