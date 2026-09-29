/* Beach Scout — almacenamiento de capturas (IndexedDB; las imágenes no caben en localStorage). */
(function () {
  'use strict';
  const DB_NAME = 'beachscout', STORE = 'captures';
  let dbp = null;

  function open() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('matchId', 'matchId');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }

  function tx(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  window.DB = {
    put: (rec) => tx('readwrite', (s) => s.put(rec)),
    get: (id) => tx('readonly', (s) => s.get(id)),
    all: () => tx('readonly', (s) => s.getAll()),
    del: (id) => tx('readwrite', (s) => s.delete(id)),
    delMatch: (matchId) => tx('readwrite', (s) => {
      const req = s.index('matchId').openCursor(IDBKeyRange.only(matchId));
      req.onsuccess = () => { const c = req.result; if (c) { c.delete(); c.continue(); } };
    }),
  };
})();
