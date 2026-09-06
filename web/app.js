const STORAGE_KEY = "nova-local-v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function migrate(raw) {
  if (!raw) {
    var first = makeChat("New chat");
    return { conversations: [first], currentId: first.id, memories: {}, sideOpen: false };
  }
  if (raw.conversations && raw.currentId) return raw;
  var chat = makeChat(raw.messages && raw.messages.length ? titleFrom(raw.messages) : "New chat");
  chat.messages = raw.messages || [];
  return {
    conversations: [chat],
    currentId: chat.id,
    memories: raw.memories || {},
    sideOpen: false
  };
}

function makeChat(title) {
  return {
    id: "c" + Date.now() + Math.floor(Math.random() * 999),
    title: title || "New chat",
    messages: [],
    updated: Date.now()
  };
}

function titleFrom(messages) {
  var first = (messages || []).filter(function (m) { return m.role === "user"; })[0];
  if (!first) return "New chat";
  return String(first.content).slice(0, 28);
}

const state = migrate(load());

const feed = document.getElementById("feed");
const form = document.getElementById("form");
const draft = document.getElementById("draft");
const mic = document.getElementById("mic");
const newChat = document.getElementById("newChat");
const statusEl = document.getElementById("status");
const side = document.getElementById("side");
const chatList = document.getElementById("chatList");
const toggleSide = document.getElementById("toggleSide");
const chatTitle = document.getElementById("chatTitle");

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentChat() {
  var found = state.conversations.filter(function (c) { return c.id === state.currentId; })[0];
  if (found) return found;
  state.currentId = state.conversations[0].id;
  return state.conversations[0];
}

function setStatus(st) {
  if (!statusEl) return;
  if (!st && window.NovaTrain) st = NovaTrain.status();
  if (st && st.running) {
    var loss = st.loss == null ? "" : " loss " + st.loss.toFixed(2);
    statusEl.textContent = "train " + st.steps + loss;
  } else if (st && st.steps) {
    statusEl.textContent = "paused · " + st.steps + " steps";
  } else {
    statusEl.textContent = "offline brain";
  }
}

if (window.NovaTrain) {
  NovaTrain.onUpdate(setStatus);
  setStatus(NovaTrain.status());
}

function renderSide() {
  if (!chatList) return;
  chatList.innerHTML = "";
  state.conversations.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (c) {
    var btn = document.createElement("button");
    btn.className = "chat-item" + (c.id === state.currentId ? " on" : "");
    btn.textContent = c.title || "New chat";
    btn.onclick = function () {
      state.currentId = c.id;
      save();
      render();
    };
    chatList.appendChild(btn);
  });
  if (side) side.hidden = !state.sideOpen;
}

function render() {
  var chat = currentChat();
  if (chatTitle) chatTitle.textContent = chat.title || "Local · on this device";
  renderSide();
  setStatus();
  feed.innerHTML = "";
  if (!chat.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<h2>Nova</h2><p>New chat. Training and memories stay.</p><div class=\"chips\"><button class=\"chip\" data-fill=\"train\">Train</button><button class=\"chip\" data-fill=\"pause\">Pause</button><button class=\"chip\" data-fill=\"export brain\">Export brain</button></div>";
    feed.appendChild(empty);
    feed.querySelectorAll("[data-fill]").forEach(function (btn) {
      btn.onclick = function () {
        draft.value = btn.dataset.fill;
        draft.focus();
      };
    });
    return;
  }
  chat.messages.forEach(function (msg) {
    var meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = msg.role === "user" ? "You" : "Nova";
    var bubble = document.createElement("div");
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
  if (text.toLowerCase().startsWith("i live in ")) return { key: "city", value: text.slice(10).trim() };
  if (text) return { key: "note", value: text };
  return null;
}

function memoryList() {
  return Object.keys(state.memories || {}).map(function (key) {
    return { key: key, value: state.memories[key] };
  });
}

function reply(text) {
  var lower = text.toLowerCase().trim();
  var T = window.NovaTrain;
  if (T && (lower === "train" || lower === "train a little" || lower === "start training")) return T.start();
  if (T && (lower === "pause" || lower === "stop" || lower === "pause train" || lower === "stop train")) return T.pause();
  if (T && (lower === "sample" || lower === "speak brain")) return "Tiny brain sample:\n" + T.sample(50);
  if (T && (lower === "export brain" || lower === "export")) return T.exportBrain();
  if (T && (lower === "reset brain" || lower === "wipe brain")) return T.reset();
  if (T && (lower === "train status" || lower === "brain status")) {
    var st = T.status();
    return "Running: " + st.running + ". Steps: " + st.steps + ". Loss: " + st.loss;
  }
  var memories = memoryList();
  var name = state.memories && state.memories.name;
  if (["hi", "hey", "hello", "yo", "sup"].indexOf(lower) !== -1) {
    return name ? "Hey " + name + "." : "Hey. I'm Nova.";
  }
  if (lower.indexOf("who are you") !== -1) return "I'm Nova. I run on this device.";
  if (lower.indexOf("what do you remember") !== -1 || lower === "memory") {
    if (!memories.length) return "Local memory is empty.";
    return memories.map(function (m) { return "- " + m.key + ": " + m.value; }).join("\n");
  }
  var remembered = parseRemember(text);
  if (remembered) {
    state.memories = state.memories || {};
    state.memories[remembered.key] = remembered.value;
    return "Got it. Saved \"" + remembered.key + "\" on this phone.";
  }
  if (lower.indexOf("what time") !== -1 || lower === "time") {
    return "It's " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ".";
  }
  return "I heard you. You said: \"" + text + "\"";
}

function send(text) {
  var cleaned = text.trim();
  if (!cleaned) return;
  var chat = currentChat();
  chat.messages.push({ role: "user", content: cleaned, at: Date.now() });
  chat.messages.push({ role: "assistant", content: reply(cleaned), at: Date.now() });
  chat.updated = Date.now();
  if (chat.title === "New chat") chat.title = titleFrom(chat.messages);
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
  var chat = makeChat("New chat");
  state.conversations.push(chat);
  state.currentId = chat.id;
  save();
  render();
});

if (toggleSide) {
  toggleSide.addEventListener("click", function () {
    state.sideOpen = !state.sideOpen;
    save();
    renderSide();
  });
}

var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Speech) {
  mic.style.display = "none";
} else {
  var rec = new Speech();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = false;
  rec.onresult = function (event) { send(event.results[0][0].transcript); };
  rec.onend = function () { mic.classList.remove("hot"); };
  mic.addEventListener("click", function () {
    try { mic.classList.add("hot"); rec.start(); } catch (e) { mic.classList.remove("hot"); }
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(function () {});
}

render();
