"use client";

import { ReactNode, useEffect } from "react";

type Props = {
  children: ReactNode;
};

export default function ServiceWorkerProvider({ children }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      console.log("Service workers not supported in this browser");
      return;
    }

    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log("SW registered:", registration);
      })
      .catch((err) => {
        console.error("SW registration failed:", err);
      });
  }, []);

  return <>{children}</>;
}
