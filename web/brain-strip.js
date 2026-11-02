/* v61: brain sanitizer shared by the app (import + seed) and scripts/strip-brain.mjs.
   Keeps ONLY model weights + architecture fields. Drops lessons, memories, notes, diary,
   journal, taught senses, optimizer state and any free text. */
(function (global) {
  var KEYS = ["Wxz", "Wxr", "Wxn", "Uz", "Ur", "Un", "bz", "br", "bn", "Why", "by"];
  var ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789 .,!?'-\n";
  var H = 64, V = ALPHA.length;
  var SIZES = { Wxz: H * V, Wxr: H * V, Wxn: H * V, Uz: H * H, Ur: H * H, Un: H * H,
    bz: H, br: H, bn: H, Why: V * H, by: V };
  function num(x) { return typeof x === "number" && isFinite(x) ? x : null; }
  /* steps: keeps the file's value; if it is 0 (old export bug) uses the Adam counter t.
     Returns { ok, brain, error }. Accepts an "export brain" file ({model:{...}, lessons, ...})
     or an already-stripped file ({kind, hidden, vocab, weights:{...}}). */
  function strip(input) {
    var src = input, m, w, out, k, a, i;
    if (typeof src === "string") {
      try { src = JSON.parse(src); } catch (e) { return { ok: false, error: "That file is not valid JSON." }; }
    }
    if (!src || typeof src !== "object") return { ok: false, error: "That file is empty." };
    m = src.model && typeof src.model === "object" ? src.model : src;
    w = m.weights && typeof m.weights === "object" ? m.weights : m;
    if (m.kind !== "gru-v7" && src.kind !== "gru-v7") return { ok: false, error: "That is not a Nova v7 brain (kind must be gru-v7)." };
    var hidden = m.hidden != null ? m.hidden : src.hidden;
    if (hidden != null && hidden !== H) return { ok: false, error: "Wrong brain size: hidden " + hidden + ", Nova uses " + H + "." };
    var vocab = m.vocab != null ? m.vocab : src.vocab;
    if (vocab != null && vocab !== V) return { ok: false, error: "Wrong letter set: vocab " + vocab + ", Nova uses " + V + "." };
    var alpha = m.alphabet != null ? m.alphabet : src.alphabet;
    if (alpha != null && alpha !== ALPHA) return { ok: false, error: "Wrong letter set in that brain." };
    out = { kind: "gru-v7", hidden: H, vocab: V, alphabet: ALPHA,
      steps: Math.max(0, Math.floor(Math.max(num(m.steps) || 0, num(m.t) || 0, num(src.steps) || 0))), loss: num(m.loss), ema: num(m.ema), weights: {} };
    if (out.ema == null) out.ema = out.loss;
    for (k = 0; k < KEYS.length; k++) {
      a = w[KEYS[k]];
      if (!Array.isArray(a) && !(a && typeof a.length === "number")) return { ok: false, error: "That brain has no weights (" + KEYS[k] + " missing)." };
      if (a.length !== SIZES[KEYS[k]]) return { ok: false, error: "Weights do not match Nova's size (" + KEYS[k] + ")." };
      var arr = new Array(a.length);
      for (i = 0; i < a.length; i++) {
        if (typeof a[i] !== "number" || !isFinite(a[i])) return { ok: false, error: "That brain has broken weights (" + KEYS[k] + ")." };
        arr[i] = a[i];
      }
      out.weights[KEYS[k]] = arr;
    }
    return { ok: true, brain: out };
  }
  var api = { strip: strip, KEYS: KEYS, H: H, V: V, ALPHA: ALPHA };
  global.NovaBrainStrip = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
