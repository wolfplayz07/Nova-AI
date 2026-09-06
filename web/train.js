/* Nova v5. Worker trainer + same chat API. */
(function (global) {
  var STORE = "nova-tiny-brain-v5";
  var worker = null;
  var statusSnap = { running: false, steps: 0, loss: null, lessons: 0, rate: 0 };
  var onUpdate = null;
  var pendingTalk = [];

  function emit() { if (onUpdate) onUpdate(status()); }

  function persist(model) {
    if (!model) return;
    try { localStorage.setItem(STORE, JSON.stringify({ model: model, H: 32 })); } catch (e) {}
    if (global.NovaIDB && NovaIDB.backup) NovaIDB.backup();
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return null;
      var pack = JSON.parse(raw);
      return pack && pack.model && pack.model.kind === "rnn-v5" ? pack.model : null;
    } catch (e) { return null; }
  }

  function boot() {
    if (worker) return;
    try { worker = new Worker("./worker.js"); } catch (e) { worker = null; return; }
    worker.onmessage = function (e) {
      var msg = e.data || {};
      if (msg.type === "status") {
        statusSnap.running = !!msg.running;
        statusSnap.steps = msg.steps || 0;
        statusSnap.loss = msg.loss;
        emit();
      }
      if (msg.type === "persist" && msg.model) persist(msg.model);
      if (msg.type === "reply") {
        var cb = pendingTalk.shift();
        if (cb) cb(msg.text || "");
      }
    };
    var saved = loadSaved();
    if (saved) worker.postMessage({ type: "load", model: saved });
  }

  function ask(text) {
    return new Promise(function (resolve) {
      if (!worker) { resolve("worker missing. reload Nova."); return; }
      pendingTalk.push(resolve);
      worker.postMessage({ type: text.sample ? "sample" : "talk", text: text.text || "hello" });
      setTimeout(function () {
        if (pendingTalk[0] === resolve) {
          pendingTalk.shift();
          resolve("still thinking.");
        }
      }, 4000);
    });
  }

  boot();

  function start() {
    boot();
    if (!worker) return "Could not start a worker on this phone.";
    if (statusSnap.running) return "Already training.";
    worker.postMessage({ type: "start" });
    return "Training v5 in a background worker with Adam. Chat should stay smooth.";
  }
  function pause(reason) {
    if (worker) worker.postMessage({ type: "stop" });
    return reason || "Paused. v5 brain saved.";
  }
  function toggle() { return statusSnap.running ? pause() : start(); }
  function status() {
    return {
      running: statusSnap.running,
      steps: statusSnap.steps,
      loss: statusSnap.loss,
      rate: 0,
      lessons: statusSnap.lessons
    };
  }
  function sample() {
    if (!worker) return "(no worker)";
    worker.postMessage({ type: "sample" });
    return "sampling...";
  }
  function talk(userText) {
    if (!worker) return "reload Nova.";
    worker.postMessage({ type: "talk", text: userText });
    return "...";
  }

  var lastTalk = null;
  function handleUser(text, lastUser) {
    if (!worker) return null;
    var raw = String(text || "").trim();
    var lower = raw.toLowerCase();
    if (lower.indexOf("read ") === 0) {
      worker.postMessage({ type: "read", text: raw.slice(5) });
      return "added reading. keep Train on.";
    }
    var m = lower.match(/^fix[:\s]+(.+)$/) || lower.match(/^no[,:]\s*(.+)$/);
    if (m && lastUser) {
      worker.postMessage({ type: "lesson", user: lastUser, nova: m[1] });
      return "lesson saved.";
    }
    m = lower.match(/^when i say (.+?) say (.+)$/);
    if (m) {
      worker.postMessage({ type: "lesson", user: m[1], nova: m[2] });
      return "lesson saved.";
    }
    return null;
  }

  function talkSyncShim(userText) {
    lastTalk = userText;
    if (worker) worker.postMessage({ type: "talk", text: userText });
    return "thinking...";
  }

  global.NovaTrain = {
    start: start,
    pause: pause,
    toggle: toggle,
    sample: function () {
      if (worker) worker.postMessage({ type: "sample" });
      return "Tiny brain sample requested. Watch the next Nova line.";
    },
    talk: talkSyncShim,
    handleUser: handleUser,
    reset: function () { return "Type reset brain confirm to wipe v5."; },
    resetConfirm: function () {
      pause();
      localStorage.removeItem(STORE);
      statusSnap = { running: false, steps: 0, loss: null, lessons: 0, rate: 0 };
      if (worker) { worker.terminate(); worker = null; boot(); }
      emit();
      return "v5 wiped.";
    },
    status: status,
    exportBrain: function () {
      if (worker) worker.postMessage({ type: "dump" });
      return "Saving v5 to this phone.";
    },
    onUpdate: function (fn) { onUpdate = fn; }
  };

  var pendingReplies = [];
  var origOnMessage = null;
})(window);
