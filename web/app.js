const STORAGE_KEY = "nova-local-v1";

const state = load() || {
  messages: [],
  memories: {}
};

const feed = document.getElementById("feed");
const form = document.getElementById("form");
const draft = document.getElementById("draft");
const mic = document.getElementById("mic");
const newChat = document.getElementById("newChat");
const statusEl = document.getElementById("status");

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setStatus(st) {
  if (!statusEl) return;
  if (st && st.running) {
    var loss = st.loss == null ? "" : " loss " + st.loss.toFixed(2);
    statusEl.textContent = "train " + st.steps + loss;
  } else if (st && st.steps) {
    statusEl.textContent = "paused \u00b7 " + st.steps + " steps";
  } else {
    statusEl.textContent = "offline brain";
  }
}

if (window.NovaTrain) {
  NovaTrain.onUpdate(setStatus);
}

function render() {
  feed.innerHTML = "";
  if (!state.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<h2>Nova</h2><p>Local only. Tiny on-phone training is optional and careful.</p><div class=\"chips\"><button class=\"chip\" data-fill=\"train\">Train a little</button><button class=\"chip\" data-fill=\"pause\">Pause</button><button class=\"chip\" data-fill=\"sample\">Sample</button></div>";
    feed.appendChild(empty);
    feed.querySelectorAll("[data-fill]").forEach(function (btn) {
      btn.onclick = function () {
        draft.value = btn.dataset.fill;
        draft.focus();
      };
    });
    return;
  }

  state.messages.forEach(function (msg) {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = msg.role === "user" ? "You" : "Nova";
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (msg.role === "user" ? "me" : "nova");
    bubble.textContent = msg.content;
    feed.appendChild(meta);
    feed.appendChild(bubble);
  });
  feed.scrollTop = feed.scrollHeight;
}

function parseRemember(raw) {
  var text = raw.trim();
  var lower = text.toLowerCase();
  if (!lower.startsWith("remember")) return null;
  text = text.slice(8).trim();
  if (text.toLowerCase().startsWith("that ")) text = text.slice(5).trim();
  if (text.toLowerCase().startsWith("my ")) text = text.slice(3).trim();
  var eq = text.indexOf(" = ");
  if (eq > 0) return { key: text.slice(0, eq).trim(), value: text.slice(eq + 3).trim() };
  var isAt = text.toLowerCase().indexOf(" is ");
  if (isAt > 0) {
    var key = text.slice(0, isAt).trim().toLowerCase();
    if (key.endsWith(" name") || key === "name") key = "name";
    return { key: key, value: text.slice(isAt + 4).trim() };
  }
  if (text.toLowerCase().startsWith("i live in ")) {
    return { key: "city", value: text.slice(10).trim() };
  }
  if (text) return { key: "note", value: text };
  return null;
}

function memoryList() {
  return Object.keys(state.memories).map(function (key) {
    return { key: key, value: state.memories[key] };
  });
}

function reply(text) {
  var lower = text.toLowerCase().trim();
  var T = window.NovaTrain;

  if (T && (lower === "train" || lower === "train a little" || lower === "start training")) {
    return T.start();
  }
  if (T && (lower === "pause" || lower === "stop" || lower === "pause train" || lower === "stop train" || lower === "pause training")) {
    return T.pause();
  }
  if (T && (lower === "sample" || lower === "speak brain")) {
    return "Tiny brain sample (expect nonsense at first):\n" + T.sample(50);
  }
  if (T && (lower === "reset brain" || lower === "wipe brain")) {
    return T.reset();
  }
  if (T && (lower === "train status" || lower === "brain status")) {
    var st = T.status();
    return "Running: " + st.running + ". Steps: " + st.steps + ". Loss: " + st.loss;
  }

  var memories = memoryList();
  var name = state.memories.name;

  if (["hi", "hey", "hello", "yo", "sup"].indexOf(lower) !== -1) {
    return name
      ? "Hey " + name + ". Nova is here, local only. What do you want to do?"
      : "Hey. I'm Nova. Local only. Say train to learn a little on this phone, carefully.";
  }

  if (lower.indexOf("who are you") !== -1 || lower.indexOf("what are you") !== -1) {
    return "I'm Nova. I run on this device. I can remember facts and optionally train a tiny CPU brain in short bursts. That brain will not become ChatGPT.";
  }

  if (lower.indexOf("what do you know") !== -1 || lower.indexOf("what do you remember") !== -1 || lower === "memory") {
    if (!memories.length) return "Local memory is empty. Say: remember my name is Alex.";
    return "Here's what I'm keeping on this device:\n" + memories.map(function (m) {
      return "- " + m.key + ": " + m.value;
    }).join("\n");
  }

  var remembered = parseRemember(text);
  if (remembered) {
    state.memories[remembered.key] = remembered.value;
    return "Got it. I'll keep \"" + remembered.key + "\" as " + remembered.value + " on this phone.";
  }

  if (lower.indexOf("what time") !== -1 || lower === "time") {
    return "It's " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ".";
  }

  if (lower.indexOf("what day") !== -1 || (lower.indexOf("date") !== -1 && lower.indexOf("what") !== -1)) {
    return "Today is " + new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + ".";
  }

  if ((lower.indexOf("what's my name") !== -1 || lower.indexOf("what is my name") !== -1 || lower.indexOf("who am i") !== -1) && name) {
    return "Your name is " + name + ".";
  }

  if (lower.indexOf("who am i") !== -1 || lower.indexOf("what do you know about me") !== -1) {
    if (!memories.length) return "I don't know much yet. Say remember my name is ...";
    return "From local memory: " + memories.map(function (m) {
      return m.key + " is " + m.value;
    }).join(", ") + ".";
  }

  var known = memories.length
    ? "I already know: " + memories.slice(0, 4).map(function (m) {
        return m.key + " = " + m.value;
      }).join("; ") + "."
    : "I don't have saved facts yet. Say remember my name is ... and I'll store it here.";

  return "I heard you. Local Nova can't reason like a full model yet, but I kept your message.\n\n" + known + "\n\nYou said: \"" + text + "\"";
}

function send(text) {
  var cleaned = text.trim();
  if (!cleaned) return;
  state.messages.push({ role: "user", content: cleaned, at: Date.now() });
  state.messages.push({ role: "assistant", content: reply(cleaned), at: Date.now() });
  save();
  render();
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  send(draft.value);
  draft.value = "";
  draft.style.height = "auto";
});

draft.addEventListener("input", function () {
  draft.style.height = "auto";
  draft.style.height = Math.min(draft.scrollHeight, 140) + "px";
});

draft.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

newChat.addEventListener("click", function () {
  if (state.messages.length && !confirm("Start a new chat? Memories stay.")) return;
  state.messages = [];
  save();
  render();
});

var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Speech) {
  mic.style.display = "none";
} else {
  var rec = new Speech();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = false;
  rec.onresult = function (event) {
    send(event.results[0][0].transcript);
  };
  rec.onend = function () {
    mic.classList.remove("hot");
  };
  mic.addEventListener("click", function () {
    try {
      mic.classList.add("hot");
      rec.start();
    } catch (e) {
      mic.classList.remove("hot");
    }
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(function () {});
}

render();
