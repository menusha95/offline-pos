import { openDB } from "./idb";

const DEFAULT_BACKOFF = 1000;
const MAX_BACKOFF = 30000;

type ListenerFn = (payload?: unknown) => void;

export class OfflineDataStore {
  private dbPromise: Promise<IDBDatabase>;
  private apiBaseUrl: string;
  private deviceId: string;
  private listeners: Record<string, ListenerFn[]>;
  private backoff: number;
  private syncInProgress: boolean;

  constructor({
    dbName = "pos-offline",
    version = 1,
    apiBaseUrl,
    deviceId,
  }: {
    dbName?: string;
    version?: number;
    apiBaseUrl: string;
    deviceId: string;
  }) {
    this.dbPromise = openDB(dbName, version, (db) => {
      if (!db.objectStoreNames.contains("orders")) {
        const orders = db.createObjectStore("orders", { keyPath: "id" });
        orders.createIndex("status", "status", { unique: false });
        orders.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("orderItems")) {
        db.createObjectStore("orderItems", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("menuItems")) {
        const mi = db.createObjectStore("menuItems", { keyPath: "id" });
        mi.createIndex("category", "category", { unique: false });
      }

      if (!db.objectStoreNames.contains("inventory")) {
        db.createObjectStore("inventory", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("printJobs")) {
        const pj = db.createObjectStore("printJobs", { keyPath: "id" });
        pj.createIndex("status", "status", { unique: false });
      }
    });

    this.apiBaseUrl = apiBaseUrl;
    this.deviceId = deviceId;
    this.listeners = {};
    this.backoff = DEFAULT_BACKOFF;
    this.syncInProgress = false;

    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.sync());
    }
  }

  // ---- Events ----

  on(event: string, handler: ListenerFn): () => void {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(handler);
    return () => {
      this.listeners[event] = this.listeners[event].filter(
        (h) => h !== handler
      );
    };
  }

  private _emit(event: string, payload?: unknown) {
    (this.listeners[event] || []).forEach((fn) => fn(payload));
  }

  // ---- Internal helper for batch writes ----

  private async _withStore(
    storeName: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => void
  ): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      fn(store);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async get(storeName: string, key: IDBValidKey): Promise<any> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName: string, value: any): Promise<IDBValidKey> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(
    storeName: string,
    indexName?: string,
    query?: IDBValidKey | IDBKeyRange | null
  ): Promise<any[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const req =
        query !== undefined && query !== null
          ? source.getAll(query)
          : source.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async transaction<T = unknown>(
    storeNames: string[],
    fn: (stores: Record<string, IDBObjectStore>) => T
  ): Promise<T> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, "readwrite");
      const stores: Record<string, IDBObjectStore> = storeNames.reduce(
        (acc, name) => {
          acc[name] = tx.objectStore(name);
          return acc;
        },
        {} as Record<string, IDBObjectStore>
      );
      let result: T;
      try {
        result = fn(stores);
      } catch (err) {
        tx.abort();
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async queueMutation({
    collection,
    op,
    entity,
  }: {
    collection: string;
    op: string;
    entity: any;
  }): Promise<any> {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const mutation = {
      id,
      collection,
      op,
      entity,
      deviceId: this.deviceId,
      ts: Date.now(),
    };

    await this.put("outbox", mutation);
    this._emit("outbox:queued", mutation);

    if (typeof navigator !== "undefined" && navigator.onLine) {
      this.sync();
    }

    return mutation;
  }

  async createOrder(order: any, items: any[]): Promise<any> {
    const now = new Date().toISOString();
    const id =
      order.id ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

    const orderWithMeta = {
      ...order,
      id,
      status: order.status || "pending",
      updatedAt: now,
      deviceId: this.deviceId,
    };

    const itemsWithMeta = items.map((item) => ({
      ...item,
      id:
        item.id ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      orderId: orderWithMeta.id,
      updatedAt: now,
      deviceId: this.deviceId,
    }));

    await this.transaction(["orders", "orderItems"], (stores) => {
      stores.orders.put(orderWithMeta);
      itemsWithMeta.forEach((i) => stores.orderItems.put(i));
      return null;
    });

    await this.queueMutation({
      collection: "orders",
      op: "createWithItems",
      entity: { order: orderWithMeta, items: itemsWithMeta },
    });

    this._emit("orders:changed", orderWithMeta);
    return orderWithMeta;
  }

  async updateOrderStatus(orderId: string, status: string): Promise<any> {
    const order = await this.get("orders", orderId);
    if (!order) return;

    const updated = {
      ...order,
      status,
      updatedAt: new Date().toISOString(),
      deviceId: this.deviceId,
    };

    await this.put("orders", updated);

    await this.queueMutation({
      collection: "orders",
      op: "updateStatus",
      entity: { id: orderId, status, updatedAt: updated.updatedAt },
    });

    this._emit("orders:changed", updated);
    return updated;
  }

  async listOrders(): Promise<any[]> {
    const orders = await this.getAll("orders");
    return orders.sort((a, b) =>
      (b.updatedAt || "").localeCompare(a.updatedAt || "")
    );
  }

  async sync(): Promise<void> {
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    this._emit("sync:start");

    try {
      const outbox = await this.getAll("outbox");

      if (outbox.length > 0) {
        const res = await fetch(`${this.apiBaseUrl}/sync/mutations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mutations: outbox }),
        });

        if (!res.ok) throw new Error("Failed to push mutations");

        const result = await res.json();
        const appliedIds: string[] = result.appliedIds || [];

        await this._withStore("outbox", "readwrite", (store) => {
          appliedIds.forEach((id) => store.delete(id));
        });
      }

      const lastSync = (await this.get("meta", "lastSync")) || {
        key: "lastSync",
        ts: 0,
      };

      const res2 = await fetch(
        `${this.apiBaseUrl}/sync/changes?since=${lastSync.ts}`
      );
      if (!res2.ok) throw new Error("Failed to fetch changes");

      const { ts, changes } = await res2.json();

      await this.transaction(
        ["orders", "orderItems", "menuItems", "inventory", "meta"],
        (stores) => {
          ["orders", "orderItems", "menuItems", "inventory"].forEach((col) => {
            (changes[col] || []).forEach((entity: any) => {
              stores[col].put(entity);
            });
          });
          stores.meta.put({ key: "lastSync", ts });
          return null;
        }
      );

      this.backoff = DEFAULT_BACKOFF;
      this._emit("sync:success");
    } catch (err) {
      console.error("Sync failed", err);
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
      this._emit("sync:error", err);
      setTimeout(() => this.sync(), this.backoff);
    } finally {
      this.syncInProgress = false;
    }
  }
}
