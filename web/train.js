/* Nova v4. Discovers words from English text + your messages + read paste. */
(function (global) {
  var H = 32;
  var SEQ = 20;
  var LR = 0.04;
  var STEPS_PER_SEC = 50;
  var TICK_MS = 40;
  var PERSIST_MS = 3000;
  var STORE = "nova-tiny-brain-v4";
  var LESSONS = "nova-lessons-v4";
  var READ = "nova-read-v4";
  var MAX_READ = 20000;
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";

  var BASE_TEXT =
    "you: hello\nnova: hey.\n" +
    "you: hi\nnova: hey.\n" +
    "you: who are you\nnova: i am nova.\n" +
    "you: how are you\nnova: i am here.\n" +
    "the cat sat on the mat. the dog ran in the park. " +
    "i am nova. i live on this phone. i am still learning english. " +
    "hello. hey. hi. goodbye. bye. thanks. you are welcome. " +
    "the sun is hot. the night is dark. water is wet. fire is hot. " +
    "one plus one is two. two plus two is four. three plus three is six. " +
    "i see a red light. stop. i see a green light. go. " +
    "people talk with words. words make sentences. sentences make meaning. " +
    "i can say yes. i can say no. i can say i do not know. " +
    "this is a small brain. it reads letters. it tries the next letter. " +
    "if you talk to me, i hear the words you type. ";

  function fixedVocab() {
    var stoi = {};
    var i;
    for (i = 0; i < ALPHA.length; i++) stoi[ALPHA.charAt(i)] = i;
    return { itos: ALPHA.split(""), stoi: stoi, n: ALPHA.length };
  }

  function f32(n) { return new Float32Array(n); }

  function randn(n) {
    var a = f32(n);
    var i;
    for (i = 0; i < n; i++) a[i] = (Math.random() - 0.5) * 0.15;
    return a;
  }

  function newModel(v) {
    return {
      Wxh: randn(H * v),
      Whh: randn(H * H),
      Why: randn(v * H),
      bh: f32(H),
      by: f32(v),
      steps: 0,
      loss: null,
      kind: "rnn-v4"
    };
  }

  function asF32(a, n) {
    if (a && a.length === n) return a instanceof Float32Array ? a : Float32Array.from(a);
    return f32(n);
  }

  function tanh(x) { return Math.tanh(x); }

  function softmaxInto(arr, out, temp) {
    if (!temp || temp <= 0) temp = 1;
    var m = -Infinity;
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    var s = 0;
    for (i = 0; i < arr.length; i++) {
      out[i] = Math.exp(Math.min((arr[i] - m) / temp, 20));
      s += out[i];
    }
    var inv = 1 / (s || 1);
    for (i = 0; i < arr.length; i++) out[i] *= inv;
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
    lessons: [],
    reading: "",
    onUpdate: null
  };

  var work = { h: f32(H), logits: null, p: null, dlog: null };

  function ensureWork() {
    var v = trainer.vocab.n;
    if (!work.logits || work.logits.length !== v) {
      work.logits = f32(v);
      work.p = f32(v);
      work.dlog = f32(v);
    }
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function loadLessons() {
    try {
      var raw = JSON.parse(localStorage.getItem(LESSONS) || "[]");
      return raw && raw.length ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function loadReading() {
    try { return localStorage.getItem(READ) || ""; } catch (e) { return ""; }
  }

  function saveLessons() {
    try { localStorage.setItem(LESSONS, JSON.stringify(trainer.lessons.slice(-80))); } catch (e) {}
  }

  function saveReading() {
    try { localStorage.setItem(READ, trainer.reading.slice(-MAX_READ)); } catch (e) {}
  }

  function persist() {
    if (!trainer.model) return;
    try {
      var m = trainer.model;
      localStorage.setItem(STORE, JSON.stringify({
        model: {
          Wxh: Array.prototype.slice.call(m.Wxh),
          Whh: Array.prototype.slice.call(m.Whh),
          Why: Array.prototype.slice.call(m.Why),
          bh: Array.prototype.slice.call(m.bh),
          by: Array.prototype.slice.call(m.by),
          steps: m.steps,
          loss: m.loss,
          kind: "rnn-v4"
        },
        vocab: trainer.vocab,
        H: H
      }));
      trainer.lastPersist = Date.now();
    } catch (e) {}
  }

  function restore() {
    trainer.vocab = fixedVocab();
    var v = trainer.vocab.n;
    var saved = loadSaved();
    var savedOk = saved && saved.model && saved.model.kind === "rnn-v4" && saved.model.Wxh && saved.model.Wxh.length === H * v;
    if (savedOk) {
      trainer.model = {
        Wxh: asF32(saved.model.Wxh, H * v),
        Whh: asF32(saved.model.Whh, H * H),
        Why: asF32(saved.model.Why, v * H),
        bh: asF32(saved.model.bh, H),
        by: asF32(saved.model.by, v),
        steps: saved.model.steps || 0,
        loss: saved.model.loss,
        kind: "rnn-v4"
      };
    } else if (!trainer.model) {
      trainer.model = newModel(v);
    }
    trainer.lessons = loadLessons();
    trainer.reading = loadReading();
    ensureWork();
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

  function pairText(user, nova) {
    return "you: " + sanitize(user) + "\nnova: " + sanitize(nova) + "\n";
  }

  function corpus() {
    var extra = trainer.reading || "";
    var i;
    for (i = 0; i < trainer.lessons.length; i++) {
      extra += pairText(trainer.lessons[i].user, trainer.lessons[i].nova);
    }
    try {
      var st = JSON.parse(localStorage.getItem("nova-local-v1") || "{}");
      var k;
      if (st.memories) {
        for (k in st.memories) extra += " " + sanitize(k) + " is " + sanitize(st.memories[k]) + ".";
      }
      if (st.conversations) {
        st.conversations.forEach(function (c) {
          (c.messages || []).forEach(function (msg) {
            if (msg.role === "user") extra += " " + sanitize(msg.content) + ".";
          });
        });
      }
    } catch (e) {}
    return sanitize(BASE_TEXT + " " + extra);
  }

  function prepare() {
    restore();
    trainer.text = corpus();
  }

  function forwardChar(m, v, x, prev, h) {
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
    ensureWork();
    var pos = Math.floor(Math.random() * (text.length - SEQ - 1));
    var xs = new Array(SEQ);
    var ys = new Array(SEQ);
    var t, i, j, k;
    for (t = 0; t < SEQ; t++) {
      var cx = trainer.vocab.stoi[text.charAt(pos + t)];
      var cy = trainer.vocab.stoi[text.charAt(pos + t + 1)];
      if (cx == null || cy == null) return;
      xs[t] = cx;
      ys[t] = cy;
    }
    var hs = new Array(SEQ + 1);
    hs[0] = f32(H);
    var pList = new Array(SEQ);
    for (t = 0; t < SEQ; t++) {
      hs[t + 1] = f32(H);
      forwardChar(m, v, xs[t], hs[t], hs[t + 1]);
      var logits = f32(v);
      var h = hs[t + 1];
      for (i = 0; i < v; i++) {
        var z = m.by[i];
        for (j = 0; j < H; j++) z += m.Why[i * H + j] * h[j];
        logits[i] = z;
      }
      pList[t] = f32(v);
      softmaxInto(logits, pList[t], 1);
    }
    var loss = 0;
    for (t = 0; t < SEQ; t++) loss += -Math.log(Math.max(pList[t][ys[t]], 1e-8));
    loss /= SEQ;

    var dWxh = f32(H * v);
    var dWhh = f32(H * H);
    var dWhy = f32(v * H);
    var dbh = f32(H);
    var dby = f32(v);
    var dhNext = f32(H);

    for (t = SEQ - 1; t >= 0; t--) {
      var p = pList[t];
      var h = hs[t + 1];
      var prev = hs[t];
      for (i = 0; i < v; i++) work.dlog[i] = p[i];
      work.dlog[ys[t]] -= 1;
      for (i = 0; i < v; i++) {
        dby[i] += work.dlog[i];
        for (j = 0; j < H; j++) dWhy[i * H + j] += work.dlog[i] * h[j];
      }
      var dh = f32(H);
      for (j = 0; j < H; j++) {
        var g = dhNext[j];
        for (i = 0; i < v; i++) g += m.Why[i * H + j] * work.dlog[i];
        dh[j] = g * (1 - h[j] * h[j]);
      }
      for (j = 0; j < H; j++) {
        dbh[j] += dh[j];
        dWxh[j * v + xs[t]] += dh[j];
        for (k = 0; k < H; k++) dWhh[j * H + k] += dh[j] * prev[k];
      }
      for (k = 0; k < H; k++) {
        var s = 0;
        for (j = 0; j < H; j++) s += m.Whh[j * H + k] * dh[j];
        dhNext[k] = s;
      }
    }

    function apply(arr, grad) {
      var i;
      var scale = LR / SEQ;
      for (i = 0; i < arr.length; i++) arr[i] -= scale * clip(grad[i]);
    }
    apply(m.Wxh, dWxh);
    apply(m.Whh, dWhh);
    apply(m.Why, dWhy);
    apply(m.bh, dbh);
    apply(m.by, dby);
    m.steps += 1;
    m.loss = loss;
  }

  function drill(n) {
    trainer.text = corpus();
    var i;
    for (i = 0; i < n; i++) stepOnce();
    persist();
    emit();
  }

  function addLesson(user, nova) {
    user = sanitize(user);
    nova = sanitize(nova);
    if (!user || !nova) return false;
    trainer.lessons.push({ user: user, nova: nova });
    saveLessons();
    prepare();
    drill(30);
    return true;
  }

  function addReading(chunk) {
    chunk = sanitize(chunk);
    if (chunk.length < 8) return 0;
    trainer.reading = (trainer.reading + " " + chunk).slice(-MAX_READ);
    saveReading();
    prepare();
    drill(20);
    return chunk.length;
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
      rate: measuredRate(),
      lessons: trainer.lessons.length,
      reading: (trainer.reading || "").length
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
    if (trainer.running) return "Already training.";
    prepare();
    trainer.running = true;
    trainer.startedAt = Date.now();
    trainer.sessionSteps = 0;
    trainer.lastPersist = 0;
    persist();
    burst();
    return "Training v4 on English + anything you paste after read.";
  }

  function pause(reason) {
    trainer.running = false;
    if (trainer.timer) clearTimeout(trainer.timer);
    trainer.timer = null;
    persist();
    emit();
    return reason || "Paused. v4 brain saved.";
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
    ensureWork();
    seed = sanitize(seed);
    if (!seed) seed = "you: hello\nnova: ";
    var prev = f32(H);
    var h = f32(H);
    var last = 0;
    var i, t, j;
    for (t = 0; t < seed.length; t++) {
      last = v.stoi[seed.charAt(t)];
      if (last == null) last = 0;
      forwardChar(m, v.n, last, prev, h);
      for (i = 0; i < H; i++) prev[i] = h[i];
    }
    var out = "";
    for (t = 0; t < (maxLen || 40); t++) {
      for (i = 0; i < v.n; i++) {
        var z = m.by[i];
        for (j = 0; j < H; j++) z += m.Why[i * H + j] * prev[j];
        work.logits[i] = z;
      }
      softmaxInto(work.logits, work.p, temp == null ? 0.6 : (temp || 1));
      var idx = temp === 0 ? argmax(work.p) : pick(work.p);
      var ch = v.itos[idx];
      if (ch === "\n") break;
      out += ch;
      forwardChar(m, v.n, idx, prev, h);
      for (i = 0; i < H; i++) prev[i] = h[i];
    }
    return out.trim();
  }

  function sample(n) {
    return generate("the ", n || 40, 0.7) || "(no brain yet)";
  }

  function talk(userText) {
    var seed = "you: " + sanitize(userText) + "\nnova: ";
    var out = generate(seed, 40, 0.4);
    if (!out) return "still learning.";
    return out;
  }

  function handleUser(text, lastUser) {
    if (!trainer.model) prepare();
    var raw = String(text || "").trim();
    var lower = raw.toLowerCase();
    var m;
    if (lower === "forget reading") {
      trainer.reading = "";
      saveReading();
      prepare();
      return "cleared the reading pile.";
    }
    if (lower.indexOf("read ") === 0) {
      var n = addReading(raw.slice(5));
      if (!n) return "need a longer chunk after read.";
      return "added " + n + " letters. reading pile is " + trainer.reading.length + " letters. tap Train.";
    }
    m = lower.match(/^fix[:\s]+(.+)$/);
    if (m && lastUser) {
      addLesson(lastUser, m[1]);
      return "learned \"" + sanitize(m[1]) + "\".";
    }
    m = lower.match(/^no[,:]\s*(.+)$/);
    if (m && lastUser) {
      addLesson(lastUser, m[1]);
      return "corrected to \"" + sanitize(m[1]) + "\".";
    }
    m = lower.match(/^when i say (.+?) say (.+)$/);
    if (m) {
      addLesson(m[1], m[2]);
      return "lesson saved.";
    }
    return null;
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
    return "v4 brain wiped. Reading pile and lessons were kept.";
  }

  function exportBrain() {
    persist();
    return "Exported v4 (" + (trainer.model ? trainer.model.steps : 0) + " steps, " + (trainer.reading || "").length + " read letters).";
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
    handleUser: handleUser,
    reset: reset,
    resetConfirm: resetConfirm,
    status: status,
    exportBrain: exportBrain,
    onUpdate: function (fn) { trainer.onUpdate = fn; }
  };
})(window);
