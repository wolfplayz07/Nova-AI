/* Best-effort webpage text. CORS will block many sites. */
(function () {
  function htmlToText(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ");
  }

  function readUrl(url) {
    if (!window.NovaTrain) return Promise.resolve("trainer missing.");
    if (!/^https?:\/\//i.test(url)) return Promise.resolve("need an http link.");
    return fetch(url, { mode: "cors" }).then(function (res) {
      var type = (res.headers.get("content-type") || "").toLowerCase();
      if (type.indexOf("image") !== -1 || type.indexOf("video") !== -1 || type.indexOf("audio") !== -1) {
        return "that link is a picture or video. i only read letters.";
      }
      return res.text().then(function (html) {
        var text = htmlToText(html).slice(0, 4000);
        var taught = NovaTrain.handleUser("read " + text, "");
        return taught || "page had no usable text.";
      });
    }).catch(function () {
      return "could not open that page from the phone (blocked). paste the words: read ...";
    });
  }

  if (window.NovaTrain) window.NovaTrain.readUrl = readUrl;
})();
