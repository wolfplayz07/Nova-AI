/* Nova v6 main-thread trainer. Adam + LR decay + EMA loss + saved moments. */
(function (global) {
  var H = 32, SEQ = 24, BASE_LR = 0.01, B1 = 0.9, B2 = 0.999;
  var STEPS_PER_SEC = 40, TICK_MS = 40, PERSIST_MS = 2500;
  var STORE = "nova-tiny-brain-v6";
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
  var BASE =
    "you: hello\nnova: hey.\n" +
    "you: hi\nnova: hey.\n" +
    "you: hey\nnova: hey.\n" +
    "you: who are you\nnova: i am nova.\n" +
    "you: how are you\nnova: i am here.\n" +
    "you: thanks\nnova: you are welcome.\n" +
    "the cat sat on the mat. hello. hey. thanks. you are welcome. " +
    "one plus one is two. two plus two is four. i am nova. i am here. ";

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
  function randn(n) {
    var a = f32(n), i;
    for (i = 0; i < n; i++) a[i] = (Math.random() - 0.5) * 0.12;
    return a;
  }

  var model = {
    Wxh: randn(H * V), Whh: randn(H * H), Why: randn(V * H),
    bh: f32(H), by: f32(V), steps: 0, loss: null, ema: null, kind: "rnn-v6", t: 0
  };
  var mW = { Wxh: f32(H * V), Whh: f32(H * H), Why: f32(V * H), bh: f32(H), by: f32(V) };
  var vW = { Wxh: f32(H * V), Whh: f32(H * H), Why: f32(V * H), bh: f32(H), by: f32(V) };

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
    if (s < 4000) return BASE_LR;
    if (s < 12000) return 0.003;
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

  function packMoments(bag) {
    return {
      Wxh: Array.from(bag.Wxh), Whh: Array.from(bag.Whh), Why: Array.from(bag.Why),
      bh: Array.from(bag.bh), by: Array.from(bag.by)
    };
  }

  function loadMoments(target, src) {
    if (!src) return;
    if (src.Wxh) target.Wxh = Float32Array.from(src.Wxh);
    if (src.Whh) target.Whh = Float32Array.from(src.Whh);
    if (src.Why) target.Why = Float32Array.from(src.Why);
    if (src.bh) target.bh = Float32Array.from(src.bh);
    if (src.by) target.by = Float32Array.from(src.by);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) raw = localStorage.getItem("nova-tiny-brain-v5");
      if (!raw) return;
      var p = JSON.parse(raw);
      var mdl = p.model || p;
      if (!mdl || !mdl.Wxh) return;
      if (mdl.kind !== "rnn-v6" && mdl.kind !== "rnn-v5") return;
      model.Wxh = Float32Array.from(mdl.Wxh);
      model.Whh = Float32Array.from(mdl.Whh);
      model.Why = Float32Array.from(mdl.Why);
      model.bh = Float32Array.from(mdl.bh);
      model.by = Float32Array.from(mdl.by);
      model.steps = mdl.steps || 0;
      model.loss = mdl.loss;
      model.ema = mdl.ema != null ? mdl.ema : mdl.loss;
      model.t = mdl.t || 0;
      model.kind = "rnn-v6";
      loadMoments(mW, p.mW || mdl.mW);
      loadMoments(vW, p.vW || mdl.vW);
      if (Array.isArray(p.lessons)) trainer.lessons = p.lessons;
      if (p.reading) trainer.reading = p.reading;
    } catch (e) {}
  }

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        model: {
          kind: "rnn-v6", steps: model.steps, loss: model.loss, ema: model.ema, t: model.t,
          Wxh: Array.from(model.Wxh), Whh: Array.from(model.Whh), Why: Array.from(model.Why),
          bh: Array.from(model.bh), by: Array.from(model.by)
        },
        mW: packMoments(mW),
        vW: packMoments(vW),
        lessons: trainer.lessons,
        reading: trainer.reading
      }));
      trainer.lastPersist = Date.now();
      if (global.NovaIDB && NovaIDB.backup) NovaIDB.backup();
    } catch (e) {}
  }

  function tanh(x) { return Math.tanh(x); }
  function clip(x) { return x > 5 ? 5 : x < -5 ? -5 : x; }

  function softmax(a) {
    var m = -Infinity, i, s = 0, o = f32(a.length);
    for (i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
    for (i = 0; i < a.length; i++) { o[i] = Math.exp(Math.min(a[i] - m, 20)); s += o[i]; }
    for (i = 0; i < a.length; i++) o[i] /= s || 1;
    return o;
  }

  function forwardChar(x, prev, h) {
    var i, j;
    for (i = 0; i < H; i++) {
      var z = model.bh[i] + model.Wxh[i * V + x];
      for (j = 0; j < H; j++) z += model.Whh[i * H + j] * prev[j];
      h[i] = tanh(z);
    }
  }

  function adam(arr, g, m, v) {
    model.t += 1;
    var lr = currentLr() * Math.sqrt(1 - Math.pow(B2, model.t)) / (1 - Math.pow(B1, model.t));
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
    var hs = new Array(SEQ + 1);
    hs[0] = f32(H);
    var pList = new Array(SEQ);
    for (t = 0; t < SEQ; t++) {
      hs[t + 1] = f32(H);
      forwardChar(xs[t], hs[t], hs[t + 1]);
      var logits = f32(V), h = hs[t + 1];
      for (i = 0; i < V; i++) {
        var z = model.by[i];
        for (j = 0; j < H; j++) z += model.Why[i * H + j] * h[j];
        logits[i] = z;
      }
      pList[t] = softmax(logits);
    }
    var loss = 0;
    for (t = 0; t < SEQ; t++) loss += -Math.log(Math.max(pList[t][ys[t]], 1e-8));
    loss /= SEQ;
    var dWxh = f32(H * V), dWhh = f32(H * H), dWhy = f32(V * H), dbh = f32(H), dby = f32(V), dhNext = f32(H);
    for (t = SEQ - 1; t >= 0; t--) {
      var p = pList[t], h = hs[t + 1], prev = hs[t], dlog = f32(V);
      for (i = 0; i < V; i++) dlog[i] = p[i];
      dlog[ys[t]] -= 1;
      for (i = 0; i < V; i++) {
        dby[i] += dlog[i];
        for (j = 0; j < H; j++) dWhy[i * H + j] += dlog[i] * h[j];
      }
      var dh = f32(H);
      for (j = 0; j < H; j++) {
        var g = dhNext[j];
        for (i = 0; i < V; i++) g += model.Why[i * H + j] * dlog[i];
        dh[j] = g * (1 - h[j] * h[j]);
      }
      for (j = 0; j < H; j++) {
        dbh[j] += dh[j];
        dWxh[j * V + xs[t]] += dh[j];
        for (k = 0; k < H; k++) dWhh[j * H + k] += dh[j] * prev[k];
      }
      for (k = 0; k < H; k++) {
        var s = 0;
        for (j = 0; j < H; j++) s += model.Whh[j * H + k] * dh[j];
        dhNext[k] = s;
      }
    }
    var inv = 1 / SEQ, arrs = [dWxh, dWhh, dWhy, dbh, dby];
    for (i = 0; i < arrs.length; i++) for (j = 0; j < arrs[i].length; j++) arrs[i][j] *= inv;
    adam(model.Wxh, dWxh, mW.Wxh, vW.Wxh);
    adam(model.Whh, dWhh, mW.Whh, vW.Whh);
    adam(model.Why, dWhy, mW.Why, vW.Why);
    adam(model.bh, dbh, mW.bh, vW.bh);
    adam(model.by, dby, mW.by, vW.by);
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
    if (due > 30) due = 30;
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
    return "Training v6 on this screen. LR decays after 4k / 12k steps. Button should say Stop.";
  }

  function pause(reason) {
    trainer.running = false;
    if (trainer.timer) clearTimeout(trainer.timer);
    trainer.timer = null;
    persist();
    emit();
    return reason || "Paused. v6 saved.";
  }

  function generate(seed, maxLen, temp) {
    seed = sanitize(seed);
    if (!seed) seed = "you: hello\nnova: ";
    var prev = f32(H), h = f32(H), t, i, j, out = "";
    for (t = 0; t < seed.length; t++) {
      forwardChar(stoi[seed.charAt(t)] || 0, prev, h);
      prev.set(h);
    }
    var repeats = 0, last = "";
    for (t = 0; t < (maxLen || 36); t++) {
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
      forwardChar(idx, prev, h);
      prev.set(h);
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
      kind: "v6"
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
    reset: function () { return "Type reset brain confirm to wipe v6."; },
    resetConfirm: function () {
      pause();
      localStorage.removeItem(STORE);
      model.Wxh = randn(H * V); model.Whh = randn(H * H); model.Why = randn(V * H);
      model.bh = f32(H); model.by = f32(V); model.steps = 0; model.loss = null; model.ema = null; model.t = 0;
      mW = { Wxh: f32(H * V), Whh: f32(H * H), Why: f32(V * H), bh: f32(H), by: f32(V) };
      vW = { Wxh: f32(H * V), Whh: f32(H * H), Why: f32(V * H), bh: f32(H), by: f32(V) };
      trainer.lessons = []; trainer.reading = "";
      persist(); emit();
      return "v6 wiped.";
    },
    status: status,
    exportBrain: function () { persist(); return "Saved v6 (" + model.steps + " steps, ema " + (model.ema == null ? "?" : model.ema.toFixed(2)) + ")."; },
    onUpdate: function (fn) { trainer.onUpdate = fn; }
  };
})(window);
