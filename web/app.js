const STORAGE_KEY = "nova-local-v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function makeChat(title, folderId) {
  return {
    id: "c" + Date.now() + Math.floor(Math.random() * 999),
    title: title || "New chat",
    folderId: folderId || null,
    messages: [],
    updated: Date.now()
  };
}

function makeFolder(name) {
  return {
    id: "f" + Date.now() + Math.floor(Math.random() * 999),
    name: name || "Folder",
    open: true
  };
}

function titleFrom(messages) {
  var first = (messages || []).filter(function (m) { return m.role === "user"; })[0];
  if (!first) return "New chat";
  return String(first.content).slice(0, 28);
}

function migrate(raw) {
  if (!raw) {
    var first = makeChat("New chat");
    return { conversations: [first], folders: [], currentId: first.id, memories: {}, sideOpen: true };
  }
  var next = raw;
  if (!raw.conversations || !raw.currentId) {
    var chat = makeChat(raw.messages && raw.messages.length ? titleFrom(raw.messages) : "New chat");
    chat.messages = raw.messages || [];
    next = {
      conversations: [chat],
      currentId: chat.id,
      memories: raw.memories || {},
      sideOpen: true
    };
  }
  next.folders = next.folders || [];
  next.conversations.forEach(function (c) {
    if (!c.folderId) c.folderId = null;
  });
  return next;
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
const trainBtn = document.getElementById("trainBtn");
const brainMenuBtn = document.getElementById("brainMenuBtn");
const brainMenu = document.getElementById("brainMenu");

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentChat() {
  var found = state.conversations.filter(function (c) { return c.id === state.currentId; })[0];
  if (found) return found;
  if (!state.conversations.length) {
    var fresh = makeChat("New chat");
    state.conversations.push(fresh);
    state.currentId = fresh.id;
    return fresh;
  }
  state.currentId = state.conversations[0].id;
  return state.conversations[0];
}

function syncTrainUi(st) {
  if (!st && window.NovaTrain) st = NovaTrain.status();
  var running = !!(st && st.running);
  if (trainBtn) {
    trainBtn.textContent = running ? "Stop" : "Train";
    trainBtn.classList.toggle("on", running);
  }
  if (brainMenu) {
    var tog = brainMenu.querySelector("[data-act=toggle]");
    if (tog) tog.textContent = running ? "Stop training" : "Start training";
  }
}

function setStatus(st) {
  if (!statusEl) return;
  if (!st && window.NovaTrain) st = NovaTrain.status();
  syncTrainUi(st);
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
  setStatus(NovaTrain.status());
}

function note(text) {
  var chat = currentChat();
  chat.messages.push({ role: "assistant", content: text, at: Date.now() });
  chat.updated = Date.now();
  save();
  render();
}

function runBrain(act) {
  var T = window.NovaTrain;
  if (!T) return;
  if (act === "toggle") note(T.toggle());
  else if (act === "sample") note("Tiny brain sample:\n" + T.sample(50));
  else if (act === "status") {
    var st = T.status();
    note("Running: " + st.running + ". Steps: " + st.steps + ". Loss: " + st.loss);
  } else if (act === "export") note(T.exportBrain());
}

function closeMenu() {
  if (brainMenu) brainMenu.hidden = true;
}

if (trainBtn) {
  trainBtn.addEventListener("click", function () {
    closeMenu();
    runBrain("toggle");
  });
}

if (brainMenuBtn && brainMenu) {
  brainMenuBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    brainMenu.hidden = !brainMenu.hidden;
  });
  brainMenu.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    closeMenu();
    runBrain(btn.getAttribute("data-act"));
  });
  document.addEventListener("click", function () { closeMenu(); });
}

function deleteChat(id) {
  if (state.conversations.length < 2) {
    alert("Keep at least one chat.");
    return;
  }
  if (!confirm("Delete this chat? The shared brain stays.")) return;
  state.conversations = state.conversations.filter(function (c) { return c.id !== id; });
  if (state.currentId === id) state.currentId = state.conversations[0].id;
  save();
  render();
}

function addFolder() {
  var name = prompt("Folder name?");
  if (!name) return;
  state.folders.push(makeFolder(name.trim()));
  save();
  renderSide();
}

function moveChat(chat) {
  var names = state.folders.map(function (f, i) { return i + 1 + ". " + f.name; });
  names.push("0. No folder");
  var pick = prompt("Move chat to folder:\n" + names.join("\n"));
  if (pick === null) return;
  var n = parseInt(pick, 10);
  if (n === 0) chat.folderId = null;
  else if (n > 0 && state.folders[n - 1]) chat.folderId = state.folders[n - 1].id;
  save();
  renderSide();
}

function deleteFolder(id) {
  if (!confirm("Remove folder? Chats inside are kept, ungrouped.")) return;
  state.folders = state.folders.filter(function (f) { return f.id !== id; });
  state.conversations.forEach(function (c) {
    if (c.folderId === id) c.folderId = null;
  });
  save();
  renderSide();
}

function chatRow(c) {
  var wrap = document.createElement("div");
  wrap.className = "chat-row";
  var btn = document.createElement("button");
  btn.className = "chat-item" + (c.id === state.currentId ? " on" : "");
  btn.textContent = c.title || "New chat";
  btn.onclick = function () {
    state.currentId = c.id;
    save();
    render();
  };
  var move = document.createElement("button");
  move.className = "mini";
  move.textContent = "\ud83d\udcc1";
  move.title = "Move to folder";
  move.onclick = function (e) { e.stopPropagation(); moveChat(c); };
  var del = document.createElement("button");
  del.className = "mini danger";
  del.textContent = "\u00d7";
  del.title = "Delete chat";
  del.onclick = function (e) { e.stopPropagation(); deleteChat(c.id); };
  wrap.appendChild(btn);
  wrap.appendChild(move);
  wrap.appendChild(del);
  return wrap;
}

function renderSide() {
  if (!chatList) return;
  chatList.innerHTML = "";

  var tools = document.createElement("div");
  tools.className = "side-tools";
  var nf = document.createElement("button");
  nf.className = "side-link";
  nf.textContent = "+ folder";
  nf.onclick = addFolder;
  tools.appendChild(nf);
  chatList.appendChild(tools);

  state.folders.forEach(function (folder) {
    var head = document.createElement("div");
    head.className = "folder-head";
    var tog = document.createElement("button");
    tog.className = "folder-btn";
    tog.textContent = (folder.open ? "\u25be " : "\u25b8 ") + folder.name;
    tog.onclick = function () {
      folder.open = !folder.open;
      save();
      renderSide();
    };
    var rm = document.createElement("button");
    rm.className = "mini";
    rm.textContent = "\u00d7";
    rm.onclick = function () { deleteFolder(folder.id); };
    head.appendChild(tog);
    head.appendChild(rm);
    chatList.appendChild(head);
    if (folder.open) {
      state.conversations.filter(function (c) { return c.folderId === folder.id; })
        .sort(function (a, b) { return b.updated - a.updated; })
        .forEach(function (c) { chatList.appendChild(chatRow(c)); });
    }
  });

  var loose = document.createElement("p");
  loose.className = "side-label";
  loose.textContent = "Chats";
  chatList.appendChild(loose);
  state.conversations.filter(function (c) { return !c.folderId; })
    .sort(function (a, b) { return b.updated - a.updated; })
    .forEach(function (c) { chatList.appendChild(chatRow(c)); });

  if (side) side.hidden = !state.sideOpen;
}

function render() {
  var chat = currentChat();
  if (chatTitle) chatTitle.textContent = chat.title || "Local \u00b7 on this device";
  renderSide();
  setStatus();
  feed.innerHTML = "";
  if (!chat.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<h2>Nova</h2><p>Talk to me. Training teaches the shared brain.</p><div class=\"chips\"><button class=\"chip\" data-act=\"toggle\">Train</button><button class=\"chip\" data-act=\"sample\">Sample</button><button class=\"chip\" data-act=\"export\">Export brain</button></div>";
    feed.appendChild(empty);
    feed.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.onclick = function () { runBrain(btn.getAttribute("data-act")); };
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
  if (T && lower === "reset brain confirm") return T.resetConfirm();
  if (T && (lower === "reset brain" || lower === "wipe brain")) return T.reset();
  if (T && (lower === "train status" || lower === "brain status")) {
    var st = T.status();
    return "Running: " + st.running + ". Steps: " + st.steps + ". Loss: " + st.loss;
  }
  var memories = memoryList();
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
  if (T && T.talk) return T.talk(text);
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
