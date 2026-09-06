/* Nova v5 worker. Same char RNN, Adam, off the UI thread. */
var H = 32, SEQ = 24, LR = 0.01, BETA1 = 0.9, BETA2 = 0.999;
var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
var BASE =
  "you: hello\nnova: hey.\n" +
  "you: hi\nnova: hey.\n" +
  "you: who are you\nnova: i am nova.\n" +
  "you: how are you\nnova: i am here.\n" +
  "the cat sat on the mat. the dog ran in the park. " +
  "i am nova. i live on this phone. i am still learning english. " +
  "hello. hey. thanks. you are welcome. one plus one is two. two plus two is four. " +
  "i can say yes. i can say no. i can say i do not know. ";

var stoi = {}, itos = ALPHA.split(""), V = ALPHA.length, i;
for (i = 0; i < V; i++) stoi[ALPHA.charAt(i)] = i;

function f32(n) { return new Float32Array(n); }
function randn(n) {
  var a = f32(n), i;
  for (i = 0; i < n; i++) a[i] = (Math.random() - 0.5) * 0.12;
  return a;
}
function zerosLike(a) { return f32(a.length); }

var model = {
  Wxh: randn(H * V), Whh: randn(H * H), Why: randn(V * H),
  bh: f32(H), by: f32(V), steps: 0, loss: null, kind: "rnn-v5", t: 0
};
var mW = { Wxh: zerosLike(model.Wxh), Whh: zerosLike(model.Whh), Why: zerosLike(model.Why), bh: f32(H), by: f32(V) };
var vW = { Wxh: zerosLike(model.Wxh), Whh: zerosLike(model.Whh), Why: zerosLike(model.Why), bh: f32(H), by: f32(V) };

var reading = "", lessons = [], running = false;

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
  var extra = reading || "";
  var i;
  for (i = 0; i < lessons.length; i++) {
    extra += "you: " + lessons[i].user + "\nnova: " + lessons[i].nova + "\n";
  }
  return sanitize(BASE + " " + extra);
}

function tanh(x) { return Math.tanh(x); }
function clip(x) { return x > 5 ? 5 : x < -5 ? -5 : x; }

function softmax(arr) {
  var m = -Infinity, i, s = 0, out = f32(arr.length);
  for (i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  for (i = 0; i < arr.length; i++) { out[i] = Math.exp(Math.min(arr[i] - m, 20)); s += out[i]; }
  for (i = 0; i < arr.length; i++) out[i] /= s || 1;
  return out;
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
  var i, md, vd, lr = LR * Math.sqrt(1 - Math.pow(BETA2, model.t)) / (1 - Math.pow(BETA1, model.t));
  for (i = 0; i < arr.length; i++) {
    var gi = clip(g[i]);
    m[i] = BETA1 * m[i] + (1 - BETA1) * gi;
    v[i] = BETA2 * v[i] + (1 - BETA2) * gi * gi;
    md = m[i]; vd = v[i];
    arr[i] -= lr * md / (Math.sqrt(vd) + 1e-8);
  }
}

function stepOnce() {
  var text = corpus();
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
  var inv = 1 / SEQ;
  function scale(g) { var i; for (i = 0; i < g.length; i++) g[i] *= inv; }
  scale(dWxh); scale(dWhh); scale(dWhy); scale(dbh); scale(dby);
  adam(model.Wxh, dWxh, mW.Wxh, vW.Wxh);
  adam(model.Whh, dWhh, mW.Whh, vW.Whh);
  adam(model.Why, dWhy, mW.Why, vW.Why);
  adam(model.bh, dbh, mW.bh, vW.bh);
  adam(model.by, dby, mW.by, vW.by);
  model.steps += 1;
  model.loss = loss;
}

function dump() {
  return {
    kind: "rnn-v5",
    steps: model.steps,
    loss: model.loss,
    Wxh: Array.from(model.Wxh),
    Whh: Array.from(model.Whh),
    Why: Array.from(model.Why),
    bh: Array.from(model.bh),
    by: Array.from(model.by),
    t: model.t
  };
}

function load(pack) {
  if (!pack || pack.kind !== "rnn-v5" || !pack.Wxh) return;
  model.Wxh = Float32Array.from(pack.Wxh);
  model.Whh = Float32Array.from(pack.Whh);
  model.Why = Float32Array.from(pack.Why);
  model.bh = Float32Array.from(pack.bh);
  model.by = Float32Array.from(pack.by);
  model.steps = pack.steps || 0;
  model.loss = pack.loss;
  model.t = pack.t || 0;
}

function generate(seed, maxLen, temp) {
  seed = sanitize(seed);
  if (!seed) seed = "you: hello\nnova: ";
  var prev = f32(H), h = f32(H), last = 0, t, i, j, out = "";
  for (t = 0; t < seed.length; t++) {
    last = stoi[seed.charAt(t)] || 0;
    forwardChar(last, prev, h);
    prev.set(h);
  }
  for (t = 0; t < (maxLen || 40); t++) {
    var logits = f32(V);
    for (i = 0; i < V; i++) {
      var z = model.by[i];
      for (j = 0; j < H; j++) z += model.Why[i * H + j] * prev[j];
      logits[i] = z;
    }
    var p = softmax(logits);
    var idx = 0;
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

function loop() {
  if (!running) return;
  var n = 8, i;
  for (i = 0; i < n; i++) stepOnce();
  postMessage({ type: "status", steps: model.steps, loss: model.loss, running: true });
  if (model.steps % 40 === 0) postMessage({ type: "persist", model: dump() });
  setTimeout(loop, 20);
}

onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type === "load") load(msg.model);
  if (msg.type === "read") reading = (reading + " " + sanitize(msg.text)).slice(-20000);
  if (msg.type === "lesson") lessons.push({ user: sanitize(msg.user), nova: sanitize(msg.nova) });
  if (msg.type === "start") {
    running = true;
    postMessage({ type: "status", steps: model.steps, loss: model.loss, running: true });
    loop();
  }
  if (msg.type === "stop") {
    running = false;
    postMessage({ type: "status", steps: model.steps, loss: model.loss, running: false });
    postMessage({ type: "persist", model: dump() });
  }
  if (msg.type === "talk") postMessage({ type: "reply", text: generate("you: " + sanitize(msg.text) + "\nnova: ", 40, 0) || "still learning." });
  if (msg.type === "sample") postMessage({ type: "reply", text: generate("the ", 50, 0.7) });
  if (msg.type === "dump") postMessage({ type: "persist", model: dump() });
};
