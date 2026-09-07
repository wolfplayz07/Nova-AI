/* Nova v7 main-thread trainer. GRU-64 + Adam + LR decay + EMA loss. */
(function (global) {
  var H = 64, SEQ = 48, BASE_LR = 0.01, B1 = 0.9, B2 = 0.999;
  var STEPS_PER_SEC = 16, TICK_MS = 50, PERSIST_MS = 3000;
  var STORE = "nova-tiny-brain-v7";
  var OLD_STORE = "nova-tiny-brain-v6";
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
  var BASE =
    "you: hello\nnova: hey.\n" +
    "you: hi\nnova: hey.\n" +
    "you: hey\nnova: hey.\n" +
    "you: who are you\nnova: i am nova.\n" +
    "you: how are you\nnova: i am here.\n" +
    "you: thanks\nnova: you are welcome.\n" +
    "you: thank you\nnova: you are welcome.\n" +
    "the cat sat on the mat. hello. hey. thanks. you are welcome. " +
    "one plus one is two. two plus two is four. i am nova. i am here. " +
    "i live on this phone. i am still learning english. ";

  var CANNED = [
    { user: "hello", nova: "hey." },
    { user: "hi", nova: "hey." },
    { user: "hey", nova: "hey." },
    { user: "who are you", nova: "i am nova." },
    { user: "how are you", nova: "i am here." },
    { user: "thanks", nova: "you are welcome." },
    { user: "thank you", nova: "you are welcome." }
  ];

  var stoi = {}, itos = ALPHA.split(""), V = ALPHA.length, i;
  for (i = 0; i < V; i++) stoi[ALPHA.charAt(i)] = i;

  function f32(n) { return new Float32Array(n); }
  function randn(n, s) {
    var a = f32(n), i;
    s = s == null ? 0.08 : s;
    for (i = 0; i < n; i++) a[i] = (Math.random() - 0.5) * s;
    return a;
  }
  function zeros(n) { return f32(n); }

  function emptyModel() {
    return {
      Wxz: randn(H * V), Wxr: randn(H * V), Wxn: randn(H * V),
      Uz: randn(H * H), Ur: randn(H * H), Un: randn(H * H),
      bz: zeros(H), br: zeros(H), bn: zeros(H),
      Why: randn(V * H), by: zeros(V),
      steps: 0, loss: null, ema: null, kind: "gru-v7", t: 0
    };
  }
  function emptyMoments() {
    return {
      Wxz: zeros(H * V), Wxr: zeros(H * V), Wxn: zeros(H * V),
      Uz: zeros(H * H), Ur: zeros(H * H), Un: zeros(H * H),
      bz: zeros(H), br: zeros(H), bn: zeros(H),
      Why: zeros(V * H), by: zeros(V)
    };
  }

  var KEYS = ["Wxz", "Wxr", "Wxn", "Uz", "Ur", "Un", "bz", "br", "bn", "Why", "by"];
  var model = emptyModel();
  var mW = emptyMoments();
  var vW = emptyMoments();

  var trainer = {
    running: false, timer: null, startedAt: 0, sessionSteps: 0,
    lastPersist: 0, text: BASE, lessons: [], reading: "", onUpdate: null
  };

  function sanitize(s) {
    var o = "", i, ch;
    s = String(s || "").toLowerCase();
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (stoi[ch] != null) o += ch;
    }
    return o.replace(/\s+/g, " ").trim();
  }

  function currentLr() {
    var s = model.steps;
    if (s < 6000) return BASE_LR;
    if (s < 18000) return 0.003;
    return 0.001;
  }

  function corpus() {
    var extra = trainer.reading || "", i, L;
    for (i = 0; i < trainer.lessons.length; i++) {
      L = "you: " + trainer.lessons[i].user + "\nnova: " + trainer.lessons[i].nova + "\n";
      extra += L + L + L + L;
    }
    return sanitize(BASE + " " + extra);
  }

  function pack(bag) {
    var o = {}, k;
    for (k = 0; k < KEYS.length; k++) o[KEYS[k]] = Array.from(bag[KEYS[k]]);
    return o;
  }
  function unpack(target, src) {
    if (!src) return false;
    var k;
    for (k = 0; k < KEYS.length; k++) {
      if (!src[KEYS[k]] || src[KEYS[k]].length !== target[KEYS[k]].length) return false;
    }
    for (k = 0; k < KEYS.length; k++) target[KEYS[k]] = Float32Array.from(src[KEYS[k]]);
    return true;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      var p = raw ? JSON.parse(raw) : null;
      if (p && p.model && unpack(model, p.model)) {
        model.steps = p.model.steps || 0;
        model.loss = p.model.loss;
        model.ema = p.model.ema != null ? p.model.ema : p.model.loss;
        model.t = p.model.t || 0;
        model.kind = "gru-v7";
        unpack(mW, p.mW);
        unpack(vW, p.vW);
        if (Array.isArray(p.lessons)) trainer.lessons = p.lessons;
        if (p.reading) trainer.reading = p.reading;
        return;
      }
      var old = localStorage.getItem(OLD_STORE);
      if (old) {
        var o = JSON.parse(old);
        if (Array.isArray(o.lessons)) trainer.lessons = o.lessons;
        if (o.reading) trainer.reading = o.reading;
      }
    } catch (e) {}
  }

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        model: {
          kind: "gru-v7", steps: model.steps, loss: model.loss, ema: model.ema, t: model.t,
          Wxz: Array.from(model.Wxz), Wxr: Array.from(model.Wxr), Wxn: Array.from(model.Wxn),
          Uz: Array.from(model.Uz), Ur: Array.from(model.Ur), Un: Array.from(model.Un),
          bz: Array.from(model.bz), br: Array.from(model.br), bn: Array.from(model.bn),
          Why: Array.from(model.Why), by: Array.from(model.by)
        },
        mW: pack(mW),
        vW: pack(vW),
        lessons: trainer.lessons,
        reading: trainer.reading
      }));
      trainer.lastPersist = Date.now();
      if (global.NovaIDB && NovaIDB.backup) NovaIDB.backup();
    } catch (e) {}
  }

  function sigm(x) { return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x)))); }
  function clip(x) { return x > 5 ? 5 : x < -5 ? -5 : x; }

  function softmax(a) {
    var m = -Infinity, i, s = 0, o = f32(a.length);
    for (i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
    for (i = 0; i < a.length; i++) { o[i] = Math.exp(Math.min(a[i] - m, 20)); s += o[i]; }
    for (i = 0; i < a.length; i++) o[i] /= s || 1;
    return o;
  }

  function gruForward(x, prev, cache) {
    var i, j, z, r, n, h = f32(H);
    var zt = f32(H), rt = f32(H), nt = f32(H);
    for (i = 0; i < H; i++) {
      z = model.bz[i] + model.Wxz[i * V + x];
      r = model.br[i] + model.Wxr[i * V + x];
      n = model.bn[i] + model.Wxn[i * V + x];
      for (j = 0; j < H; j++) {
        z += model.Uz[i * H + j] * prev[j];
        r += model.Ur[i * H + j] * prev[j];
      }
      zt[i] = sigm(z);
      rt[i] = sigm(r);
      for (j = 0; j < H; j++) n += model.Un[i * H + j] * (rt[i] * prev[j]);
      nt[i] = Math.tanh(n);
      h[i] = (1 - zt[i]) * nt[i] + zt[i] * prev[i];
    }
    if (cache) { cache.h = h; cache.z = zt; cache.r = rt; cache.n = nt; cache.prev = prev; cache.x = x; }
    return h;
  }

  function adam(arr, g, m, v, lr) {
    var i;
    for (i = 0; i < arr.length; i++) {
      var gi = clip(g[i]);
      m[i] = B1 * m[i] + (1 - B1) * gi;
      v[i] = B2 * v[i] + (1 - B2) * gi * gi;
      arr[i] -= lr * m[i] / (Math.sqrt(v[i]) + 1e-8);
    }
  }

  function stepOnce() {
    var text = trainer.text;
    if (text.length < SEQ + 2) return;
    var pos = Math.floor(Math.random() * (text.length - SEQ - 1));
    var xs = new Array(SEQ), ys = new Array(SEQ), t, i, j, k;
    for (t = 0; t < SEQ; t++) {
      xs[t] = stoi[text.charAt(pos + t)];
      ys[t] = stoi[text.charAt(pos + t + 1)];
      if (xs[t] == null || ys[t] == null) return;
    }
    var caches = new Array(SEQ);
    var hs = new Array(SEQ + 1);
    hs[0] = f32(H);
    var pList = new Array(SEQ);
    for (t = 0; t < SEQ; t++) {
      caches[t] = {};
      hs[t + 1] = gruForward(xs[t], hs[t], caches[t]);
      var logits = f32(V), h = hs[t + 1];
      for (i = 0; i < V; i++) {
        var zz = model.by[i];
        for (j = 0; j < H; j++) zz += model.Why[i * H + j] * h[j];
        logits[i] = zz;
      }
      pList[t] = softmax(logits);
    }
    var loss = 0;
    for (t = 0; t < SEQ; t++) loss += -Math.log(Math.max(pList[t][ys[t]], 1e-8));
    loss /= SEQ;

    var g = emptyMoments();
    var dhNext = f32(H);
    for (t = SEQ - 1; t >= 0; t--) {
      var p = pList[t], h = hs[t + 1], c = caches[t], dlog = f32(V);
      for (i = 0; i < V; i++) dlog[i] = p[i];
      dlog[ys[t]] -= 1;
      for (i = 0; i < V; i++) {
        g.by[i] += dlog[i];
        for (j = 0; j < H; j++) g.Why[i * H + j] += dlog[i] * h[j];
      }
      var dh = f32(H);
      for (j = 0; j < H; j++) {
        var gg = dhNext[j];
        for (i = 0; i < V; i++) gg += model.Why[i * H + j] * dlog[i];
        dh[j] = gg;
      }
      var prev = c.prev, zt = c.z, rt = c.r, nt = c.n, x = c.x;
      var dz = f32(H), dn = f32(H), dprev = f32(H);
      for (i = 0; i < H; i++) {
        dz[i] = dh[i] * (prev[i] - nt[i]);
        dn[i] = dh[i] * (1 - zt[i]);
        dprev[i] += dh[i] * zt[i];
        var dnt = dn[i] * (1 - nt[i] * nt[i]);
        var dzt = dz[i] * zt[i] * (1 - zt[i]);
        g.bn[i] += dnt;
        g.bz[i] += dzt;
        g.Wxn[i * V + x] += dnt;
        g.Wxz[i * V + x] += dzt;
        var dri = 0;
        for (k = 0; k < H; k++) dri += model.Un[i * H + k] * dnt * prev[k];
        var drs = dri * rt[i] * (1 - rt[i]);
        g.br[i] += drs;
        g.Wxr[i * V + x] += drs;
        for (k = 0; k < H; k++) {
          g.Un[i * H + k] += dnt * (rt[i] * prev[k]);
          g.Uz[i * H + k] += dzt * prev[k];
          g.Ur[i * H + k] += drs * prev[k];
          dprev[k] += model.Uz[i * H + k] * dzt;
          dprev[k] += model.Ur[i * H + k] * drs;
          dprev[k] += model.Un[i * H + k] * dnt * rt[i];
        }
      }
      dhNext = dprev;
    }

    var inv = 1 / SEQ, lr, b1t, b2t;
    model.t += 1;
    b1t = 1 - Math.pow(B1, model.t);
    b2t = 1 - Math.pow(B2, model.t);
    lr = currentLr() * Math.sqrt(b2t) / b1t;
    for (i = 0; i < KEYS.length; i++) {
      var arr = g[KEYS[i]];
      for (j = 0; j < arr.length; j++) arr[j] *= inv;
      adam(model[KEYS[i]], arr, mW[KEYS[i]], vW[KEYS[i]], lr);
    }
    model.steps += 1;
    model.loss = loss;
    model.ema = model.ema == null ? loss : 0.98 * model.ema + 0.02 * loss;
  }

  function emit() {
    if (trainer.onUpdate) trainer.onUpdate(status());
  }

  function burst() {
    if (!trainer.running) return;
    if (document.hidden) { pause("paused \u2014 keep Nova on screen"); return; }
    var now = Date.now();
    var due = Math.floor((now - trainer.startedAt) * STEPS_PER_SEC / 1000) - trainer.sessionSteps;
    if (due > 12) due = 12;
    var i;
    for (i = 0; i < due; i++) stepOnce();
    if (due > 0) trainer.sessionSteps += due;
    if (now - trainer.lastPersist >= PERSIST_MS) persist();
    emit();
    trainer.timer = setTimeout(burst, TICK_MS);
  }

  function start() {
    if (trainer.running) return "Already training.";
    trainer.text = corpus();
    trainer.running = true;
    trainer.startedAt = Date.now();
    trainer.sessionSteps = 0;
    persist();
    emit();
    burst();
    return "Training v7 GRU-64 on this screen. Fresh weights. LR decays after 6k / 18k steps. Button should say Stop.";
  }

  function pause(reason) {
    trainer.running = false;
    if (trainer.timer) clearTimeout(trainer.timer);
    trainer.timer = null;
    persist();
    emit();
    return reason || "Paused. v7 saved.";
  }

  function generate(seed, maxLen, temp) {
    seed = sanitize(seed);
    if (!seed) seed = "you: hello\nnova: ";
    var prev = f32(H), t, i, j, out = "";
    for (t = 0; t < seed.length; t++) prev = gruForward(stoi[seed.charAt(t)] || 0, prev, null);
    var repeats = 0, last = "";
    for (t = 0; t < (maxLen || 40); t++) {
      var logits = f32(V);
      for (i = 0; i < V; i++) {
        var z = model.by[i];
        for (j = 0; j < H; j++) z += model.Why[i * H + j] * prev[j];
        logits[i] = z;
      }
      var p = softmax(logits), idx = 0;
      if (!temp) {
        for (i = 1; i < V; i++) if (p[i] > p[idx]) idx = i;
      } else {
        var r = Math.random(), acc = 0;
        for (i = 0; i < V; i++) { acc += p[i]; if (r <= acc) { idx = i; break; } }
      }
      var ch = itos[idx];
      if (ch === "\n") break;
      if (ch === last) repeats += 1; else repeats = 0;
      if (repeats >= 3 && ch !== " ") break;
      out += ch;
      last = ch;
      prev = gruForward(idx, prev, null);
    }
    return out.replace(/\s+/g, " ").trim();
  }

  function looksGibberish(s) {
    if (!s || s.length < 2) return true;
    var words = s.split(" ").filter(Boolean);
    if (!words.length) return true;
    var good = 0, i, w;
    for (i = 0; i < words.length; i++) {
      w = words[i];
      if (w.length >= 3) good += 1;
      else if (w === "i" || w === "a" || w === "am") good += 1;
    }
    return good < Math.max(1, Math.ceil(words.length * 0.45));
  }

  function lookupReply(text) {
    var q = sanitize(text);
    var i, u;
    for (i = trainer.lessons.length - 1; i >= 0; i--) {
      u = trainer.lessons[i].user;
      if (q === u || q.indexOf(u) !== -1 || u.indexOf(q) !== -1) return trainer.lessons[i].nova;
    }
    for (i = 0; i < CANNED.length; i++) {
      if (q === CANNED[i].user || q === CANNED[i].user + "?" || q === CANNED[i].user + ".") {
        return CANNED[i].nova;
      }
    }
    return null;
  }

  function handleUser(text, lastUser) {
    var raw = String(text || "").trim(), lower = raw.toLowerCase(), m;
    if (lower.indexOf("read ") === 0) {
      trainer.reading = (trainer.reading + " " + sanitize(raw.slice(5))).slice(-8000);
      trainer.text = corpus();
      persist();
      return "added reading.";
    }
    m = lower.match(/^fix[:\s]+(.+)$/) || lower.match(/^no[,:]\s*(.+)$/);
    if (m && lastUser) {
      trainer.lessons.push({ user: sanitize(lastUser), nova: sanitize(m[1]) });
      trainer.text = corpus();
      persist();
      return "lesson saved.";
    }
    m = lower.match(/^when i say (.+?) say (.+)$/);
    if (m) {
      trainer.lessons.push({ user: sanitize(m[1]), nova: sanitize(m[2]) });
      trainer.text = corpus();
      persist();
      return "lesson saved.";
    }
    return null;
  }

  function status() {
    return {
      running: trainer.running,
      steps: model.steps,
      loss: model.ema != null ? model.ema : model.loss,
      raw: model.loss,
      lr: currentLr(),
      rate: STEPS_PER_SEC,
      lessons: trainer.lessons.length,
      kind: "v7"
    };
  }

  load();
  trainer.text = corpus();

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && trainer.running) pause("paused because you left Nova");
  });

  global.NovaTrain = {
    start: start,
    pause: pause,
    toggle: function () { return trainer.running ? pause() : start(); },
    sample: function () { return generate("the ", 40, 0.6) || "(empty)"; },
    talk: function (t) {
      var hit = lookupReply(t);
      if (hit) return hit;
      var out = generate("you: " + sanitize(t) + "\nnova: ", 28, 0);
      if (looksGibberish(out)) return "still learning. train more, or teach me: when i say " + sanitize(t) + " say ...";
      return out;
    },
    handleUser: handleUser,
    reset: function () { return "Type reset brain confirm to wipe v7."; },
    resetConfirm: function () {
      pause();
      localStorage.removeItem(STORE);
      model = emptyModel();
      mW = emptyMoments();
      vW = emptyMoments();
      trainer.lessons = [];
      trainer.reading = "";
      persist();
      emit();
      return "v7 wiped.";
    },
    status: status,
    exportBrain: function () {
      persist();
      var raw = localStorage.getItem(STORE) || "{}";
      var name = "nova-v7-" + model.steps + ".json";
      var blob = new Blob([raw], { type: "application/json" });
      var file, url, a;
      try { file = new File([blob], name, { type: "application/json" }); } catch (e) { file = null; }
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: "Nova v7 brain", text: name, files: [file] }).catch(function () {});
        return "Share sheet opened. Tap Save to Files for " + name + ".";
      }
      url = URL.createObjectURL(blob);
      a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
      return "Saving " + name + " (" + model.steps + " steps). If no file appears, open Nova in Safari and Export again.";
    },
    onUpdate: function (fn) { trainer.onUpdate = fn; }
  };
})(window);
