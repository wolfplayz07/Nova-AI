/* Nova v2 recurrent trainer. Replies to the last user line. */
(function (global) {
  var H = 16;
  var SEQ = 12;
  var LR = 0.05;
  var STEPS_PER_SEC = 40;
  var TICK_MS = 50;
  var PERSIST_MS = 2000;
  var STORE = "nova-tiny-brain-v2";
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";

  var BASE_TEXT =
    "you: hello\nnova: hey.\n" +
    "you: hello\nnova: hey. i am nova.\n" +
    "you: hi\nnova: hey.\n" +
    "you: hey\nnova: hey.\n" +
    "you: hello there\nnova: hey.\n" +
    "you: who are you\nnova: i am nova.\n" +
    "you: how are you\nnova: i am here.\n" +
    "you: what is two plus two\nnova: four.\n" +
    "you: what is one plus one\nnova: two.\n" +
    "you: thanks\nnova: you are welcome.\n";

  function fixedVocab() {
    var stoi = {};
    var i;
    for (i = 0; i < ALPHA.length; i++) stoi[ALPHA.charAt(i)] = i;
    return { itos: ALPHA.split(""), stoi: stoi, n: ALPHA.length };
  }

  function zeros(n) {
    var a = new Array(n);
    var i;
    for (i = 0; i < n; i++) a[i] = 0;
    return a;
  }

  function randn(n) {
    var a = new Array(n);
    var i;
    for (i = 0; i < n; i++) a[i] = (Math.random() - 0.5) * 0.2;
    return a;
  }

  function newModel(v) {
    return {
      Wxh: randn(H * v),
      Whh: randn(H * H),
      Why: randn(v * H),
      bh: zeros(H),
      by: zeros(v),
      steps: 0,
      loss: null,
      kind: "rnn-v2"
    };
  }

  function tanh(x) { return Math.tanh(x); }

  function softmax(arr, temp) {
    if (!temp || temp <= 0) temp = 1;
    var m = -Infinity;
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    var s = 0;
    var out = new Array(arr.length);
    for (i = 0; i < arr.length; i++) {
      out[i] = Math.exp(Math.min((arr[i] - m) / temp, 20));
      s += out[i];
    }
    for (i = 0; i < arr.length; i++) out[i] /= s || 1;
    return out;
  }

  function clip(x) {
    if (x > 5) return 5;
    if (x < -5) return -5;
    return x;
  }

  var trainer = {
    running: false,
    timer: null,
    startedAt: 0,
    sessionSteps: 0,
    lastPersist: 0,
    model: null,
    vocab: fixedVocab(),
    text: BASE_TEXT,
    onUpdate: null
  };

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function persist() {
    if (!trainer.model) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({
        model: trainer.model,
        vocab: trainer.vocab,
        H: H
      }));
      trainer.lastPersist = Date.now();
    } catch (e) {}
  }

  function restore() {
    trainer.vocab = fixedVocab();
    var saved = loadSaved();
    var savedOk = saved && saved.model && saved.model.kind === "rnn-v2" && saved.model.Wxh && saved.model.Wxh.length === H * trainer.vocab.n;
    var savedSteps = savedOk && typeof saved.model.steps === "number" ? saved.model.steps : -1;
    var liveSteps = trainer.model && typeof trainer.model.steps === "number" ? trainer.model.steps : -1;
    if (savedOk && savedSteps >= liveSteps) {
      trainer.model = saved.model;
    } else if (!trainer.model) {
      trainer.model = savedOk ? saved.model : newModel(trainer.vocab.n);
    }
  }

  function sanitize(s) {
    var out = "";
    var i, ch;
    s = String(s || "").toLowerCase();
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (trainer.vocab.stoi[ch] != null) out += ch;
    }
    return out;
  }

  function corpus() {
    var extra = "";
    try {
      var st = JSON.parse(localStorage.getItem("nova-local-v1") || "{}");
      var k;
      if (st.memories) {
        for (k in st.memories) extra += "you: what is " + sanitize(k) + "\nnova: " + sanitize(st.memories[k]) + ".\n";
      }
    } catch (e) {}
    var core = BASE_TEXT + BASE_TEXT + extra;
    return sanitize(core);
  }

  function prepare() {
    restore();
    trainer.text = corpus();
  }

  function forwardChar(m, v, x, prev) {
    var h = zeros(H);
    var i, j;
    for (i = 0; i < H; i++) {
      var z = m.bh[i] + m.Wxh[i * v + x];
      for (j = 0; j < H; j++) z += m.Whh[i * H + j] * prev[j];
      h[i] = tanh(z);
    }
    return h;
  }

  function stepOnce() {
    var m = trainer.model;
    var v = trainer.vocab.n;
    var text = trainer.text;
    if (!m || text.length < SEQ + 2) return;
    var pos = Math.floor(Math.random() * (text.length - SEQ - 1));
    var xs = [];
    var ys = [];
    var t, i, j, k;
    for (t = 0; t < SEQ; t++) {
      var cx = trainer.vocab.stoi[text.charAt(pos + t)];
      var cy = trainer.vocab.stoi[text.charAt(pos + t + 1)];
      if (cx == null || cy == null) return;
      xs.push(cx);
      ys.push(cy);
    }
    var hs = [zeros(H)];
    var pList = [];
    for (t = 0; t < SEQ; t++) {
      var h = forwardChar(m, v, xs[t], hs[t]);
      hs.push(h);
      var logits = zeros(v);
      for (i = 0; i < v; i++) {
        var z = m.by[i];
        for (j = 0; j < H; j++) z += m.Why[i * H + j] * h[j];
        logits[i] = z;
      }
      pList.push(softmax(logits, 1));
    }
    var loss = 0;
    for (t = 0; t < SEQ; t++) loss += -Math.log(Math.max(pList[t][ys[t]], 1e-8));
    loss /= SEQ;

    var dWxh = zeros(H * v);
    var dWhh = zeros(H * H);
    var dWhy = zeros(v * H);
    var dbh = zeros(H);
    var dby = zeros(v);
    var dhNext = zeros(H);

    for (t = SEQ - 1; t >= 0; t--) {
      var p = pList[t];
      var h = hs[t + 1];
      var prev = hs[t];
      var dlog = p.slice();
      dlog[ys[t]] -= 1;
      for (i = 0; i < v; i++) {
        dby[i] += dlog[i];
        for (j = 0; j < H; j++) dWhy[i * H + j] += dlog[i] * h[j];
      }
      var dh = zeros(H);
      for (j = 0; j < H; j++) {
        var g = dhNext[j];
        for (i = 0; i < v; i++) g += m.Why[i * H + j] * dlog[i];
        dh[j] = g * (1 - h[j] * h[j]);
      }
      for (j = 0; j < H; j++) {
        dbh[j] += dh[j];
        dWxh[j * v + xs[t]] += dh[j];
        for (k = 0; k < H; k++) dWhh[j * H + k] += dh[j] * prev[k];
      }
      dhNext = zeros(H);
      for (k = 0; k < H; k++) {
        var s = 0;
        for (j = 0; j < H; j++) s += m.Whh[j * H + k] * dh[j];
        dhNext[k] = s;
      }
    }

    function apply(arr, grad) {
      var i;
      for (i = 0; i < arr.length; i++) arr[i] -= LR * clip(grad[i] / SEQ);
    }
    apply(m.Wxh, dWxh);
    apply(m.Whh, dWhh);
    apply(m.Why, dWhy);
    apply(m.bh, dbh);
    apply(m.by, dby);
    m.steps += 1;
    m.loss = loss;
  }

  function emit() {
    if (trainer.onUpdate) trainer.onUpdate(status());
  }

  function measuredRate() {
    var sec = (Date.now() - trainer.startedAt) / 1000;
    if (!trainer.running || sec < 0.5) return STEPS_PER_SEC;
    return trainer.sessionSteps / sec;
  }

  function status() {
    if (!trainer.model) restore();
    var m = trainer.model;
    return {
      running: trainer.running,
      steps: m ? m.steps : 0,
      loss: m && m.loss != null ? m.loss : null,
      rate: measuredRate()
    };
  }

  function burst() {
    if (!trainer.running) return;
    if (document.hidden) {
      pause("paused because the app went to the background");
      return;
    }
    var now = Date.now();
    var due = Math.floor((now - trainer.startedAt) * STEPS_PER_SEC / 1000);
    var need = due - trainer.sessionSteps;
    if (need > 80) need = 80;
    var i;
    for (i = 0; i < need; i++) stepOnce();
    if (need > 0) trainer.sessionSteps += need;
    if (now - trainer.lastPersist >= PERSIST_MS) persist();
    emit();
    trainer.timer = setTimeout(burst, TICK_MS);
  }

  function start() {
    if (trainer.running) return "Already training. Same brain as every chat on this icon.";
    prepare();
    trainer.running = true;
    trainer.startedAt = Date.now();
    trainer.sessionSteps = 0;
    trainer.lastPersist = 0;
    persist();
    burst();
    return "Training the v2 reply brain at 40 steps/sec. Keep Nova on screen.";
  }

  function pause(reason) {
    trainer.running = false;
    if (trainer.timer) clearTimeout(trainer.timer);
    trainer.timer = null;
    persist();
    emit();
    return reason || "Paused. Shared brain saved on this icon.";
  }

  function toggle() {
    return trainer.running ? pause() : start();
  }

  function argmax(p) {
    var best = 0;
    var i;
    for (i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    return best;
  }

  function pick(p) {
    var r = Math.random();
    var acc = 0;
    var i;
    for (i = 0; i < p.length; i++) {
      acc += p[i];
      if (r <= acc) return i;
    }
    return p.length - 1;
  }

  function generate(seed, maxLen, temp) {
    if (!trainer.model) prepare();
    var m = trainer.model;
    var v = trainer.vocab;
    if (!m || !v) return "";
    seed = sanitize(seed);
    if (!seed) seed = "you: hello\nnova: ";
    var prev = zeros(H);
    var last = 0;
    var i, t;
    for (t = 0; t < seed.length; t++) {
      last = v.stoi[seed.charAt(t)];
      if (last == null) last = 0;
      prev = forwardChar(m, v.n, last, prev);
    }
    var out = "";
    for (t = 0; t < (maxLen || 40); t++) {
      var logits = zeros(v.n);
      for (i = 0; i < v.n; i++) {
        var z = m.by[i];
        var j;
        for (j = 0; j < H; j++) z += m.Why[i * H + j] * prev[j];
        logits[i] = z;
      }
      var p = softmax(logits, temp == null ? 0.6 : temp);
      var idx = temp === 0 ? argmax(p) : pick(p);
      var ch = v.itos[idx];
      if (ch === "\n") break;
      out += ch;
      prev = forwardChar(m, v.n, idx, prev);
    }
    return out.trim();
  }

  function sample(n) {
    return generate("you: hello\nnova: ", n || 20, 0.4) || "(no brain yet)";
  }

  function talk(userText) {
    var seed = "you: " + sanitize(userText) + "\nnova: ";
    var out = generate(seed, 24, 0);
    if (!out) return "still learning. train me a while, then try again.";
    return out;
  }

  function reset() {
    return "Reset is locked. Type reset brain confirm if you really want to wipe the shared brain.";
  }

  function resetConfirm() {
    pause();
    localStorage.removeItem(STORE);
    trainer.model = newModel(trainer.vocab.n);
    persist();
    emit();
    return "Shared v2 brain wiped because you typed reset brain confirm.";
  }

  function exportBrain() {
    persist();
    var payload = {
      id: "nova-export-v2",
      note: "Shared icon brain. No personal memory.",
      steps: trainer.model ? trainer.model.steps : 0,
      model: trainer.model,
      vocab: trainer.vocab
    };
    try {
      var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nova-brain.json";
      a.click();
    } catch (e) {}
    return "Exported the shared brain (" + (trainer.model ? trainer.model.steps : 0) + " steps).";
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && trainer.running) pause("paused because you left Nova");
  });

  restore();

  global.NovaTrain = {
    start: start,
    pause: pause,
    toggle: toggle,
    sample: sample,
    talk: talk,
    reset: reset,
    resetConfirm: resetConfirm,
    status: status,
    exportBrain: exportBrain,
    onUpdate: function (fn) { trainer.onUpdate = fn; }
  };
})(window);
