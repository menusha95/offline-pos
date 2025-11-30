export function openDB(
  name: string,
  version: number,
  upgradeCallback: (
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number | null
  ) => void
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(name, version);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      upgradeCallback(db, event.oldVersion, event.newVersion);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
