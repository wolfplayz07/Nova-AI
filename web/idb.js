/* Bigger-than-localStorage backup for the phone brain. OPFS when available, else IndexedDB. */
(function (global) {
  var DB = "nova-idb-v1";
  var STORE = "kv";
  var OPFS_DIR = "nova-brain";
  var KEYS = [
    "nova-tiny-brain-v7",
    "nova-tiny-brain-v6",
    "nova-tiny-brain-v5",
    "nova-tiny-brain-v4",
    "nova-lessons-v4",
    "nova-read-v4"
  ];

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function put(db, key, val) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function get(db, key) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).get(key);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function opfsRoot() {
    if (!navigator.storage || !navigator.storage.getDirectory) return Promise.reject(new Error("no opfs"));
    return navigator.storage.getDirectory().then(function (root) {
      return root.getDirectoryHandle(OPFS_DIR, { create: true });
    });
  }

  function opfsPut(key, val) {
    return opfsRoot().then(function (dir) {
      return dir.getFileHandle(key + ".json", { create: true }).then(function (fh) {
        return fh.createWritable().then(function (w) {
          return w.write(String(val)).then(function () { return w.close(); });
        });
      });
    });
  }

  function opfsGet(key) {
    return opfsRoot().then(function (dir) {
      return dir.getFileHandle(key + ".json").then(function (fh) {
        return fh.getFile().then(function (f) { return f.text(); });
      });
    });
  }

  function backup() {
    var jobs = KEYS.map(function (k) {
      var raw = localStorage.getItem(k);
      if (raw == null) return Promise.resolve();
      return opfsPut(k, raw).catch(function () {
        return openDb().then(function (db) { return put(db, k, raw); });
      });
    });
    return Promise.all(jobs).catch(function () {});
  }

  function restoreIfEmpty() {
    var jobs = KEYS.map(function (k) {
      if (localStorage.getItem(k)) return Promise.resolve();
      return opfsGet(k).then(function (val) {
        if (typeof val === "string" && val) localStorage.setItem(k, val);
      }).catch(function () {
        return openDb().then(function (db) {
          return get(db, k).then(function (val) {
            if (typeof val === "string") localStorage.setItem(k, val);
          });
        });
      });
    });
    return Promise.all(jobs).catch(function () {});
  }

  global.NovaIDB = { backup: backup, restoreIfEmpty: restoreIfEmpty };
  restoreIfEmpty();
  setInterval(backup, 15000);
})(window);
