(function () {
  if (!window.NovaTrain) return;
  var orig = NovaTrain.onUpdate;
  NovaTrain.onReply = function (text) {
    var chat = (window.state && null);
    var feedChats = document.querySelectorAll(".bubble.nova");
    var last = feedChats[feedChats.length - 1];
    if (last && /thinking|sampling/i.test(last.textContent || "")) {
      last.textContent = text;
      try {
        var raw = JSON.parse(localStorage.getItem("nova-local-v1") || "{}");
        var cur = (raw.conversations || []).filter(function (c) { return c.id === raw.currentId; })[0];
        if (cur && cur.messages && cur.messages.length) {
          var m = cur.messages[cur.messages.length - 1];
          if (m.role === "assistant") m.content = text;
          localStorage.setItem("nova-local-v1", JSON.stringify(raw));
        }
      } catch (e) {}
      return;
    }
    if (typeof note === "function") note(text);
  };
})();
