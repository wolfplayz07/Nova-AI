/* Nova tiny trainer.
   CPU only. Short bursts. Auto-pause. Will not become ChatGPT.
   Safe-ish for a phone you still want to use.
*/
(function (global) {
  var H = 16;
  var LR = 0.03;
  var STEPS_PER_BURST = 2;
  var BURST_MS = 400;
  var MAX_BURST_SECONDS = 12;
  var SAVE_EVERY = 20;

  var BASE_TEXT =
    "hello i am nova. i live on this phone. " +
    "two plus two is four. one plus one is two. " +
    "if the light is red, stop. if the light is green, go. " +
    "remember facts. be careful. think one small step. ";

  function charsOf(s) {
    var set = {};
    var i;
    for (i = 0; i < s.length; i++) set[s.charAt(i)] = 1;
    var list = Object.keys(set).sort();
    var itos = list;
    var stoi = {};
    for (i = 0; i < list.length; i++) stoi[list[i]] = i;
    return { itos: itos, stoi: stoi, n: list.length };
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

  function tanh(x) {
    return Math.tanh(x);
  }

  function softmax(arr) {
    var m = -Infinity;
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    var s = 0;
    var out = new Array(arr.length);
    for (i = 0; i < arr.length; i++) {
      out[i] = Math.exp(arr[i] - m);
      s += out[i];
    }
    for (i = 0; i < arr.length; i++) out[i] /= s;
    return out;
  }

  var trainer = {
    running: false,
    timer: null,
    startedAt: 0,
    model: null,
    vocab: null,
    text: BASE_TEXT,
    onUpdate: null
  };

  function corpus() {
    var extra = "";
    try {
      var st = JSON.parse(localStorage.getItem("nova-local-v1") || "{}");
      var k;
      if (st.memories) {
        for (k in st.memories) extra += k + " is " + st.memories[k] + ". ";
      }
    } catch (e) {}
    return BASE_TEXT + extra.toLowerCase();
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem("nova-tiny-brain-v1");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        "nova-tiny-brain-v1",
        JSON.stringify({ model: trainer.model, vocab: trainer.vocab })
      );
    } catch (e) {}
  }

  function prepare() {
    trainer.text = corpus();
    trainer.vocab = charsOf(trainer.text);
    var saved = loadSaved();
    if (saved && saved.model && saved.vocab && saved.vocab.n === trainer.vocab.n) {
      trainer.model = saved.model;
    } else {
      trainer.model = newModel(trainer.vocab.n);
    }
  }

  function stepOnce() {
    var m = trainer.model;
    var v = trainer.vocab.n;
    var text = trainer.text;
    if (text.length < 8) return;

    var pos = Math.floor(Math.random() * (text.length - 2));
    var ch = text.charAt(pos);
    var target = text.charAt(pos + 1);
    var x = trainer.vocab.stoi[ch];
    var y = trainer.vocab.stoi[target];
    if (x == null || y == null) return;

    var h = zeros(H);
    var i, j;
    for (i = 0; i < H; i++) {
      var s = m.bh[i];
      s += m.Wxh[i * v + x];
      h[i] = tanh(s);
    }

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
      for (j = 0; j < H; j++) {
        m.Why[i * H + j] -= LR * dlog[i] * h[j];
      }
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
    if (m.steps % SAVE_EVERY === 0) persist();
  }

  function emit() {
    if (trainer.onUpdate) trainer.onUpdate(status());
  }

  function status() {
    var m = trainer.model;
    return {
      running: trainer.running,
      steps: m ? m.steps : 0,
      loss: m && m.loss != null ? m.loss : null
    };
  }

  function burst() {
    if (!trainer.running) return;
    if (document.hidden) {
      pause("paused because the app went to the background");
      return;
    }
    if (Date.now() - trainer.startedAt > MAX_BURST_SECONDS * 1000) {
      pause("paused after a short burst so the phone can rest");
      return;
    }
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        if (!b.charging && b.level < 0.2) pause("paused: battery under 20%");
      }).catch(function () {});
    }
    var i;
    for (i = 0; i < STEPS_PER_BURST; i++) stepOnce();
    emit();
    trainer.timer = setTimeout(burst, BURST_MS);
  }

  function start() {
    if (trainer.running) return "Already training in small bursts.";
    prepare();
    trainer.running = true;
    trainer.startedAt = Date.now();
    burst();
    return "Training on this phone in tiny CPU bursts. 2 steps, then a rest. Auto-pauses after 12 seconds. Keep Nova on screen. If the phone gets warm, say pause train.";
  }

  function pause(reason) {
    trainer.running = false;
    if (trainer.timer) clearTimeout(trainer.timer);
    trainer.timer = null;
    persist();
    emit();
    return reason || "Paused. Phone can rest. Progress saved on this device.";
  }

  function sample(n) {
    prepare();
    var m = trainer.model;
    var v = trainer.vocab;
    if (!m || !v) return "(no brain yet)";
    n = n || 40;
    var seed = " ";
    var out = seed;
    var last = v.stoi[seed] != null ? v.stoi[seed] : 0;
    var t, i, j;
    for (t = 0; t < n; t++) {
      var h = zeros(H);
      for (i = 0; i < H; i++) {
        var s = m.bh[i] + m.Wxh[i * v.n + last];
        h[i] = tanh(s);
      }
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
        if (r <= acc) {
          pick = i;
          break;
        }
      }
      out += v.itos[pick];
      last = pick;
    }
    return out.trim();
  }

  function reset() {
    pause();
    localStorage.removeItem("nova-tiny-brain-v1");
    trainer.model = null;
    return "Tiny brain wiped on this phone.";
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && trainer.running) pause("paused because you left Nova");
  });

  global.NovaTrain = {
    start: start,
    pause: pause,
    sample: sample,
    reset: reset,
    status: status,
    onUpdate: function (fn) {
      trainer.onUpdate = fn;
    }
  };
})(window);
