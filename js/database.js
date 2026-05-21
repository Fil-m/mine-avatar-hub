/**
 * database.js
 * Автономний, легковажний IndexedDB-клієнт для роботи в Local Mode.
 * Працює без жодних зовнішніх бібліотек, сумісний з будь-яким мобільним або десктопним браузером.
 */

class LocalDatabase {
  constructor(dbName = "MineCraftAvatarHub", storeName = "player_saves") {
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 3);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "key" });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  get(key) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      const transaction = this.db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(transaction.objectStoreNames[0]);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  set(key, value) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      const transaction = this.db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(transaction.objectStoreNames[0]);
      const request = store.put({ key, value });

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  clear() {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      const transaction = this.db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }
}

export const db = new LocalDatabase();
