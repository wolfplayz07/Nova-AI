/* Nova tiny trainer. One brain per origin/icon. Never wiped by new chat. */
(function (global) {
  var H = 16;
  var LR = 0.03;
  var STEPS_PER_SEC = 10;
  var TICK_MS = 50;
  var PERSIST_MS = 2000;
  var STORE = "nova-tiny-brain-v1";
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";

  var BASE_TEXT =
    "hello i am nova. i live on this phone. " +
    "two plus two is four. one plus one is two. " +
    "if the light is red, stop. if the light is green, go. " +
    "remember facts. be careful. think one small step. ";

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
      loss: null
    };
  }

  function tanh(x) { return Math.tanh(x); }

  function softmax(arr) {
    var m = -Infinity;
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    var s = 0;
    var out = new Array(arr.length);
    for (i = 0; i < arr.length; i++) {
      out[i] = Math.exp(Math.min(arr[i] - m, 20));
      s += out[i];
    }
    for (i = 0; i < arr.length; i++) out[i] /= s || 1;
    return out;
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
    var savedOk = saved && saved.model && saved.model.Wxh && saved.model.Wxh.length === H * trainer.vocab.n;
    var savedSteps = savedOk && typeof saved.model.steps === "number" ? saved.model.steps : -1;
    var liveSteps = trainer.model && typeof trainer.model.steps === "number" ? trainer.model.steps : -1;
    if (savedOk && savedSteps >= liveSteps) {
      trainer.model = saved.model;
    } else if (!trainer.model) {
      trainer.model = savedOk ? saved.model : newModel(trainer.vocab.n);
    }
  }

  function corpus() {
    var extra = "";
    try {
      var st = JSON.parse(localStorage.getItem("nova-local-v1") || "{}");
      var k;
      if (st.memories) {
        for (k in st.memories) extra += " " + k + " is " + st.memories[k] + ".";
      }
    } catch (e) {}
    return (BASE_TEXT + extra).toLowerCase();
  }

  function prepare() {
    restore();
    trainer.text = corpus();
  }

  function stepOnce() {
    var m = trainer.model;
    var v = trainer.vocab.n;
    var text = trainer.text;
    if (!m || text.length < 8) return;
    var pos = Math.floor(Math.random() * (text.length - 2));
    var ch = text.charAt(pos);
    var target = text.charAt(pos + 1);
    var x = trainer.vocab.stoi[ch];
    var y = trainer.vocab.stoi[target];
    if (x == null || y == null) return;
    var h = zeros(H);
    var i, j;
    for (i = 0; i < H; i++) h[i] = tanh(m.bh[i] + m.Wxh[i * v + x]);
    var logits = zeros(v);
    for (i = 0; i < v; i++) {
      var z = m.by[i];
      for (j = 0; j < H; j++) z += m.Why[i * H + j] * h[j];
      logits[i] = z;
    }
    var p = softmax(logits);
    var loss = -Math.log(Math.max(p[y], 1e-8));
    var dlog = p.slice();
    dlog[y] -= 1;
    for (i = 0; i < v; i++) {
      m.by[i] -= LR * dlog[i];
      for (j = 0; j < H; j++) m.Why[i * H + j] -= LR * dlog[i] * h[j];
    }
    var dh = zeros(H);
    for (j = 0; j < H; j++) {
      var g = 0;
      for (i = 0; i < v; i++) g += m.Why[i * H + j] * dlog[i];
      dh[j] = g * (1 - h[j] * h[j]);
    }
    for (j = 0; j < H; j++) {
      m.bh[j] -= LR * dh[j];
      m.Wxh[j * v + x] -= LR * dh[j];
    }
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
    if (need > 40) need = 40;
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
    return "Training at 10 steps/sec until you turn it off. Keep Nova on screen.";
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

  function sample(n) {
    if (!trainer.model) prepare();
    var m = trainer.model;
    var v = trainer.vocab;
    if (!m || !v) return "(no brain yet)";
    n = n || 40;
    var last = v.stoi[" "] != null ? v.stoi[" "] : 0;
    var out = "";
    var t, i, j;
    for (t = 0; t < n; t++) {
      var h = zeros(H);
      for (i = 0; i < H; i++) h[i] = tanh(m.bh[i] + m.Wxh[i * v.n + last]);
      var logits = zeros(v.n);
      for (i = 0; i < v.n; i++) {
        var z = m.by[i];
        for (j = 0; j < H; j++) z += m.Why[i * H + j] * h[j];
        logits[i] = z;
      }
      var p = softmax(logits);
      var r = Math.random();
      var acc = 0;
      var pick = 0;
      for (i = 0; i < p.length; i++) {
        acc += p[i];
        if (r <= acc) { pick = i; break; }
      }
      out += v.itos[pick];
      last = pick;
    }
    return out.trim();
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
    return "Shared brain wiped because you typed reset brain confirm.";
  }

  function exportBrain() {
    persist();
    var payload = {
      id: "nova-export",
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
    reset: reset,
    resetConfirm: resetConfirm,
    status: status,
    exportBrain: exportBrain,
    onUpdate: function (fn) { trainer.onUpdate = fn; }
  };
})(window);
