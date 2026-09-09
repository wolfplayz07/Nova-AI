(function () {
  function novaMath(text) {
    var q = String(text || "").toLowerCase();
    q = q.replace(/[?!,'\u2019=]/g, " ");
    q = q.replace(/\u00d7/g, "*").replace(/\u00f7/g, "/");
    q = q.replace(/\s+/g, " ").trim();
    q = q.replace(/^what is /, "").replace(/^whats /, "").replace(/^calculate /, "").replace(/^compute /, "");
    q = q.replace(/\s+/g, " ").trim();

    var m = q.match(/^(-?\d+(?:\.\d+)?)\s*(times|x|\*|plus|\+|minus|-|divided by|over|\/)\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) {
      m = q.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/x])\s*(-?\d+(?:\.\d+)?)$/);
    }
    if (!m) return null;

    var a = parseFloat(m[1]);
    var b = parseFloat(m[3]);
    var op = m[2];
    if (!isFinite(a) || !isFinite(b)) return null;

    var r = null;
    if (op === "plus" || op === "+") r = a + b;
    else if (op === "minus" || op === "-") r = a - b;
    else if (op === "times" || op === "x" || op === "*") r = a * b;
    else if (op === "divided by" || op === "over" || op === "/") {
      if (b === 0) return "i cannot divide by zero.";
      r = a / b;
    } else return null;

    if (Math.abs(r - Math.round(r)) < 1e-10) return String(Math.round(r)) + ".";
    return String(Math.round(r * 1e6) / 1e6) + ".";
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
