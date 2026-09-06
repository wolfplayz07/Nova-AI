/* Bigger-than-localStorage backup for the phone brain. */
(function (global) {
  var DB = "nova-idb-v1";
  var STORE = "kv";
  var KEYS = ["nova-tiny-brain-v4", "nova-lessons-v4", "nova-read-v4"];

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

  function backup() {
    return openDb().then(function (db) {
      var jobs = KEYS.map(function (k) {
        var raw = localStorage.getItem(k);
        if (raw == null) return Promise.resolve();
        return put(db, k, raw);
      });
      return Promise.all(jobs);
    }).catch(function () {});
  }

  function restoreIfEmpty() {
    return openDb().then(function (db) {
      var jobs = KEYS.map(function (k) {
        if (localStorage.getItem(k)) return Promise.resolve();
        return get(db, k).then(function (val) {
          if (typeof val === "string") localStorage.setItem(k, val);
        });
      });
      return Promise.all(jobs);
    }).catch(function () {});
  }

  global.NovaIDB = { backup: backup, restoreIfEmpty: restoreIfEmpty };
  restoreIfEmpty();
  setInterval(backup, 15000);
})(window);
