"use client";

import { useEffect, useMemo, useState } from "react";
import { OfflineDataStore } from "../lib/offline/OfflineDataStore";
import { PrintJobManager } from "../lib/print/PrintJobManager";
import ProductGrid from "../components/ProductGrid";
import Cart from "../components/Cart";
import OrderStatusBoard from "../components/OrderStatusBoard";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category?: string;
  icon: string;
}

interface CartItem extends MenuItem {
  qty: number;
}

interface Order {
  id: string;
  total: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  specialRequest?: string;
}

type SyncStatus = "idle" | "syncing" | "ok" | "error";

function createSampleCatalog(): MenuItem[] {
  return [
    { id: "burger", name: "Burger", price: 10, category: "Mains", icon: "🍔" },
    { id: "pizza", name: "Pizza", price: 11, category: "Mains", icon: "🍕" },
    { id: "fries", name: "Fries", price: 4, category: "Sides", icon: "🍟" },
    { id: "pepsi", name: "Pepsi", price: 3, category: "Drinks", icon: "🥤" },
    { id: "water", name: "Water", price: 2, category: "Drinks", icon: "💧" },
  ];
}

export default function POSPage() {
  const [dataStore, setDataStore] = useState<OfflineDataStore | null>(null);
  const [printManager, setPrintManager] = useState<PrintJobManager | null>(
    null
  );
  const [catalog, setCatalog] = useState<MenuItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [isOnline, setIsOnline] = useState(true);

  // track online / offline status
  useEffect(() => {
    if (typeof window === "undefined") {
      console.log("Online effect: running on server, skipping");
      return;
    }

    const updateOnlineStatus = () => {
      console.log("navigator.onLine =", navigator.onLine);
      setIsOnline(navigator.onLine);
    };

    console.log("Setting up online/offline listeners");
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      console.log("Cleaning up online/offline listeners");
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  // initialize data store + print manager
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (dataStore) {
      return;
    }

    const ds = new OfflineDataStore({
      apiBaseUrl: "/api",
      deviceId: "cashier-1",
    });

    const printerDriver = {
      async print(payload: string) {
        console.log("PRINT JOB PAYLOAD:", payload);
      },
    };

    const pm = new PrintJobManager({
      dataStore: ds,
      printerDriver,
      deviceId: "cashier-1",
    });

    setDataStore(ds);
    setPrintManager(pm);

    ds.on("orders:changed", async () => {
      console.log("orders:changed event fired");
      const all = (await ds.listOrders()) as Order[];
      setOrders(all);
    });

    ds.on("sync:start", () => {
      console.log("sync:start");
      setSyncStatus("syncing");
    });
    ds.on("sync:success", () => {
      console.log("sync:success");
      setSyncStatus("ok");
    });
    ds.on("sync:error", (err) => {
      console.log("sync:error", err);
      setSyncStatus("error");
    });

    (async () => {
      console.log("Loading catalog + existing orders from IndexedDB");
      const products = (await ds.getAll("menuItems")) as MenuItem[];
      if (!products.length) {
        console.log("No menu items found, seeding sample catalog");
        const sample = createSampleCatalog();
        for (const p of sample) {
          await ds.put("menuItems", p);
        }
        setCatalog(sample);
      } else {
        setCatalog(products);
      }

      const existingOrders = (await ds.listOrders()) as Order[];
      setOrders(existingOrders);

      console.log("Triggering initial sync");
      ds.sync();
    })();
  }, [dataStore]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((item) => item.name.toLowerCase().includes(q));
  }, [catalog, search]);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cartItems]
  );

  const addToCart = (product: MenuItem) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx === -1) {
        return [...prev, { ...product, qty: 1 }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    });
  };

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((i) => i.id !== productId));
      return;
    }
    setCartItems((prev) =>
      prev.map((i) => (i.id === productId ? { ...i, qty } : i))
    );
  };

  const placeOrder = async () => {
    if (!dataStore || cartItems.length === 0) return;

    console.log("items:", cartItems);

    const order: Partial<Order> = {
      total: cartTotal,
      createdAt: new Date().toISOString(),
    };

    const items: OrderItem[] = cartItems.map((ci) => ({
      productId: ci.id,
      name: ci.name,
      price: ci.price,
      qty: ci.qty,
    }));

    setCartItems([]);

    const saved = (await dataStore.createOrder(order, items)) as Order;
    console.log("saved locally:", saved);

    dataStore.sync();
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    if (!dataStore) return;
    console.log("updating order", orderId, "===>", status);
    await dataStore.updateOrderStatus(orderId, status);
    dataStore.sync();
  };

  const printLastOrder = async () => {
    if (!printManager || !dataStore) {
      console.log("Cannot print: printManager or dataStore missing");
      return;
    }

    console.log("printLastOrder called");

    const allOrders = (await dataStore.listOrders()) as Order[];
    if (!allOrders.length) {
      console.log("No orders found to print");
      return;
    }

    const latestOrder = allOrders[0];
    const allItems = (await dataStore.getAll("orderItems")) as any[];
    const itemsForOrder = allItems.filter(
      (item) => item.orderId === latestOrder.id
    );

    console.log("Printing latest order:", latestOrder, itemsForOrder);

    await printManager.enqueueJob({
      destination: "receipt",
      priority: 10,
      templateId: "receipt",
      data: {
        order: latestOrder,
        items: itemsForOrder,
      },
    });
  };

  const syncClass =
    syncStatus === "syncing"
      ? "sync-banner sync-online"
      : syncStatus === "ok"
      ? "sync-banner sync-online"
      : syncStatus === "error"
      ? "sync-banner sync-error"
      : isOnline
      ? "sync-banner sync-online"
      : "sync-banner sync-offline";

  const syncLabel =
    syncStatus === "syncing"
      ? "Syncing..."
      : syncStatus === "ok"
      ? "Synced"
      : syncStatus === "error"
      ? "Sync error"
      : isOnline
      ? "Online"
      : "Offline";

  return (
    <div className="pos-layout">
      <div className="left-pane">
        <div className={syncClass}>
          <span className="sync-dot" />
          <span className="sync-label">{syncLabel}</span>
        </div>
        <input
          className="search"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ProductGrid products={filteredCatalog} onSelect={addToCart} />
      </div>
      <div className="right-pane">
        <Cart
          items={cartItems}
          total={cartTotal}
          onQtyChange={updateQty}
          onCheckout={placeOrder}
          onPrintLast={printLastOrder}
        />
        <OrderStatusBoard orders={orders} onUpdateStatus={updateOrderStatus} />
      </div>
    </div>
  );
}
