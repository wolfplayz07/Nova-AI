(function () {
  function novaMath(text) {
    var q = String(text || "").toLowerCase();
    q = q.replace(/[?!,'\u2019]/g, " ").replace(/\s+/g, " ").trim();
    q = q.replace(/^what is /, "").replace(/^whats /, "");
    var ops = [
      { re: /^(-?\d+(?:\.\d+)?) (?:times|x|\*) (-?\d+(?:\.\d+)?)$/, fn: function (a, b) { return a * b; } },
      { re: /^(-?\d+(?:\.\d+)?) (?:plus|\+) (-?\d+(?:\.\d+)?)$/, fn: function (a, b) { return a + b; } },
      { re: /^(-?\d+(?:\.\d+)?) (?:minus|-) (-?\d+(?:\.\d+)?)$/, fn: function (a, b) { return a - b; } },
      { re: /^(-?\d+(?:\.\d+)?) (?:divided by|over|\/) (-?\d+(?:\.\d+)?)$/, fn: function (a, b) { return b === 0 ? null : a / b; } }
    ];
    function n(s) {
      if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
      var v = parseFloat(s);
      return isFinite(v) ? v : null;
    }
    var i, m, a, b, r;
    for (i = 0; i < ops.length; i++) {
      m = q.match(ops[i].re);
      if (!m) continue;
      a = n(m[1]); b = n(m[2]);
      if (a == null || b == null) return null;
      r = ops[i].fn(a, b);
      if (r == null) return "i cannot divide by zero.";
      if (Math.abs(r - Math.round(r)) < 1e-10) return String(Math.round(r)) + ".";
      return String(Math.round(r * 1e6) / 1e6) + ".";
    }
    return null;
  }

  function wrapReply() {
    if (typeof reply !== "function" || reply._math) return;
    var orig = reply;
    function wrapped(text) {
      var hit = novaMath(text);
      if (hit) return hit;
      return orig(text);
    }
    wrapped._math = true;
    reply = wrapped;
  }

  wrapReply();
  document.addEventListener("DOMContentLoaded", wrapReply);
})();
