(function () {
  function fmt(n) {
    if (!isFinite(n)) return null;
    if (Math.abs(n - Math.round(n)) < 1e-10) return String(Math.round(n)) + ".";
    return String(Math.round(n * 1e6) / 1e6) + ".";
  }

  function percentOf(text) {
    var q = String(text || "").toLowerCase();
    q = q.replace(/[?!,'\u2019]/g, " ");
    q = q.replace(/\s+/g, " ").trim();
    var m = q.match(/(?:what\s+is|whats|what's|how much is)?\s*(-?\d+(?:\.\d+)?)\s*(?:%|percent|pct)\s+of\s+(-?\d+(?:\.\d+)?)/i);
    if (!m) return null;
    var n = parseFloat(m[1]) / 100 * parseFloat(m[2]);
    var out = fmt(n);
    return out || null;
  }

  function strip(text) {
    var q = String(text || "").toLowerCase();
    q = q.replace(/[?!,'\u2019=]/g, " ");
    q = q.replace(/\u00d7/g, " * ").replace(/\u00f7/g, " / ");
    q = q.replace(/\s+/g, " ").trim();
    q = q.replace(/^(what is|whats|what's|calculate|compute|how much is)\s+/, "");
    q = q.replace(/\s+/g, " ").trim();
    return q;
  }

  function wordsToOps(q) {
    q = q.replace(/\bplus\b/g, "+");
    q = q.replace(/\bminus\b/g, "-");
    q = q.replace(/\btimes\b/g, "*");
    q = q.replace(/\bmultiplied by\b/g, "*");
    q = q.replace(/\bx\b/g, "*");
    q = q.replace(/\bdivided by\b/g, "/");
    q = q.replace(/\bover\b/g, "/");
    q = q.replace(/\bto the power of\b/g, "^");
    q = q.replace(/\bto the\b/g, "^");
    q = q.replace(/\bpower\b/g, "^");
    return q.replace(/\s+/g, " ").trim();
  }

  function specials(q) {
    var m, a;
    m = q.match(/^(?:square root|sqrt)\s+(?:of\s+)?(-?\d+(?:\.\d+)?)$/);
    if (m) {
      a = parseFloat(m[1]);
      if (a < 0) return "neg";
      return Math.sqrt(a);
    }
    m = q.match(/^(-?\d+(?:\.\d+)?)\s+squared$/);
    if (m) return parseFloat(m[1]) * parseFloat(m[1]);
    m = q.match(/^(-?\d+(?:\.\d+)?)\s+cubed$/);
    if (m) {
      a = parseFloat(m[1]);
      return a * a * a;
    }
    m = q.match(/^half of\s+(-?\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]) / 2;
    m = q.match(/^double\s+(-?\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]) * 2;
    m = q.match(/^triple\s+(-?\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]) * 3;
    return null;
  }

  function tokenize(q) {
    var s = q.replace(/\s+/g, "");
    var out = [];
    var i = 0;
    var ch, num;
    while (i < s.length) {
      ch = s.charAt(i);
      if ((ch === "+" || ch === "-") && (out.length === 0 || (out[out.length - 1] !== ")" && isNaN(out[out.length - 1])))) {
        num = ch;
        i++;
        while (i < s.length && /[0-9.]/.test(s.charAt(i))) {
          num += s.charAt(i);
          i++;
        }
        if (!/^-?\d+(\.\d+)?$/.test(num)) return null;
        out.push(parseFloat(num));
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        num = "";
        while (i < s.length && /[0-9.]/.test(s.charAt(i))) {
          num += s.charAt(i);
          i++;
        }
        if (!/^\d+(\.\d+)?$/.test(num)) return null;
        out.push(parseFloat(num));
        continue;
      }
      if ("+-*/^()".indexOf(ch) !== -1) {
        out.push(ch);
        i++;
        continue;
      }
      return null;
    }
    return out;
  }

  function prec(op) {
    if (op === "+" || op === "-") return 1;
    if (op === "*" || op === "/") return 2;
    if (op === "^") return 3;
    return 0;
  }

  function applyOp(nums, ops) {
    var op = ops.pop();
    var b = nums.pop();
    var a = nums.pop();
    if (a == null || b == null || op == null) return false;
    if (op === "+") nums.push(a + b);
    else if (op === "-") nums.push(a - b);
    else if (op === "*") nums.push(a * b);
    else if (op === "/") {
      if (b === 0) return "zero";
      nums.push(a / b);
    } else if (op === "^") nums.push(Math.pow(a, b));
    else return false;
    return true;
  }

  function evalTokens(tokens) {
    var nums = [];
    var ops = [];
    var t, r, i;
    for (i = 0; i < tokens.length; i++) {
      t = tokens[i];
      if (typeof t === "number") {
        nums.push(t);
        continue;
      }
      if (t === "(") {
        ops.push(t);
        continue;
      }
      if (t === ")") {
        while (ops.length && ops[ops.length - 1] !== "(") {
          r = applyOp(nums, ops);
          if (r === "zero") return "zero";
          if (!r) return null;
        }
        if (!ops.length) return null;
        ops.pop();
        continue;
      }
      while (ops.length && ops[ops.length - 1] !== "(" && prec(ops[ops.length - 1]) >= prec(t)) {
        r = applyOp(nums, ops);
        if (r === "zero") return "zero";
        if (!r) return null;
      }
      ops.push(t);
    }
    while (ops.length) {
      if (ops[ops.length - 1] === "(") return null;
      r = applyOp(nums, ops);
      if (r === "zero") return "zero";
      if (!r) return null;
    }
    if (nums.length !== 1) return null;
    return nums[0];
  }

  function novaMath(text) {
    var pct = percentOf(text);
    if (pct) return pct;
    var q = strip(text);
    if (!q) return null;
    var spec = specials(q);
    if (spec === "neg") return "i cannot take that root.";
    if (typeof spec === "number") {
      var out = fmt(spec);
      return out || null;
    }
    q = wordsToOps(q);
    if (!/[0-9]/.test(q)) return null;
    if (q.indexOf("+") < 0 && q.indexOf("-") < 0 && q.indexOf("*") < 0 && q.indexOf("/") < 0 && q.indexOf("^") < 0) return null;
    var tokens = tokenize(q);
    if (!tokens || tokens.length < 3) return null;
    var val = evalTokens(tokens);
    if (val === "zero") return "i cannot divide by zero.";
    if (typeof val !== "number") return null;
    var printed = fmt(val);
    return printed || null;
  }

  window.novaMath = novaMath;

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
