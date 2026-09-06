/* Nova v5 main-thread trainer. Adam. No worker — iOS PWA workers were silent. */
(function (global) {
  var H = 32, SEQ = 24, LR = 0.01, B1 = 0.9, B2 = 0.999;
  var STEPS_PER_SEC = 40, TICK_MS = 40, PERSIST_MS = 2500;
  var STORE = "nova-tiny-brain-v5";
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
  var BASE =
    "you: hello\nnova: hey.\n" +
    "you: hi\nnova: hey.\n" +
    "you: who are you\nnova: i am nova.\n" +
    "you: how are you\nnova: i am here.\n" +
    "the cat sat on the mat. hello. hey. thanks. you are welcome. " +
    "one plus one is two. two plus two is four. i am nova. i am here. ";

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
    bh: f32(H), by: f32(V), steps: 0, loss: null, kind: "rnn-v5", t: 0
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
    return o;
  }

  function corpus() {
    var extra = trainer.reading || "", i;
    for (i = 0; i < trainer.lessons.length; i++) {
      extra += "you: " + trainer.lessons[i].user + "\nnova: " + trainer.lessons[i].nova + "\n";
    }
    return sanitize(BASE + " " + extra);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return;
      var p = JSON.parse(raw).model;
      if (!p || p.kind !== "rnn-v5" || !p.Wxh) return;
      model.Wxh = Float32Array.from(p.Wxh);
      model.Whh = Float32Array.from(p.Whh);
      model.Why = Float32Array.from(p.Why);
      model.bh = Float32Array.from(p.bh);
      model.by = Float32Array.from(p.by);
      model.steps = p.steps || 0;
      model.loss = p.loss;
      model.t = p.t || 0;
    } catch (e) {}
  }

  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        model: {
          kind: "rnn-v5", steps: model.steps, loss: model.loss, t: model.t,
          Wxh: Array.from(model.Wxh), Whh: Array.from(model.Whh), Why: Array.from(model.Why),
          bh: Array.from(model.bh), by: Array.from(model.by)
        }
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
    var i, lr = LR * Math.sqrt(1 - Math.pow(B2, model.t)) / (1 - Math.pow(B1, model.t));
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
  }

  function emit() {
    if (trainer.onUpdate) trainer.onUpdate(status());
  }

  function burst() {
    if (!trainer.running) return;
    if (document.hidden) { pause("paused — keep Nova on screen"); return; }
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
    return "Training v5 on this screen (Adam). Button should say Stop. Steps should rise.";
  }

  function pause(reason) {
    trainer.running = false;
    if (trainer.timer) clearTimeout(trainer.timer);
    trainer.timer = null;
    persist();
    emit();
    return reason || "Paused. v5 saved.";
  }

  function generate(seed, maxLen, temp) {
    seed = sanitize(seed);
    if (!seed) seed = "you: hello\nnova: ";
    var prev = f32(H), h = f32(H), t, i, j, out = "";
    for (t = 0; t < seed.length; t++) {
      forwardChar(stoi[seed.charAt(t)] || 0, prev, h);
      prev.set(h);
    }
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
      out += ch;
      forwardChar(idx, prev, h);
      prev.set(h);
    }
    return out.trim();
  }

  function handleUser(text, lastUser) {
    var raw = String(text || "").trim(), lower = raw.toLowerCase(), m;
    if (lower.indexOf("read ") === 0) {
      trainer.reading = (trainer.reading + " " + sanitize(raw.slice(5))).slice(-20000);
      trainer.text = corpus();
      return "added reading.";
    }
    m = lower.match(/^fix[:\s]+(.+)$/) || lower.match(/^no[,:]\s*(.+)$/);
    if (m && lastUser) {
      trainer.lessons.push({ user: sanitize(lastUser), nova: sanitize(m[1]) });
      trainer.text = corpus();
      return "lesson saved.";
    }
    m = lower.match(/^when i say (.+?) say (.+)$/);
    if (m) {
      trainer.lessons.push({ user: sanitize(m[1]), nova: sanitize(m[2]) });
      trainer.text = corpus();
      return "lesson saved.";
    }
    return null;
  }

  function status() {
    return { running: trainer.running, steps: model.steps, loss: model.loss, rate: STEPS_PER_SEC, lessons: trainer.lessons.length };
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
    talk: function (t) { return generate("you: " + sanitize(t) + "\nnova: ", 36, 0) || "still learning."; },
    handleUser: handleUser,
    reset: function () { return "Type reset brain confirm to wipe v5."; },
    resetConfirm: function () {
      pause();
      localStorage.removeItem(STORE);
      model.Wxh = randn(H * V); model.Whh = randn(H * H); model.Why = randn(V * H);
      model.bh = f32(H); model.by = f32(V); model.steps = 0; model.loss = null; model.t = 0;
      persist(); emit();
      return "v5 wiped.";
    },
    status: status,
    exportBrain: function () { persist(); return "Saved v5 (" + model.steps + " steps)."; },
    onUpdate: function (fn) { trainer.onUpdate = fn; }
  };
})(window);
