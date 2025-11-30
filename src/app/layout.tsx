import "./globals.css";
import type { Metadata } from "next";
import ServiceWorkerProvider from "./ServiceWorkerProvider";

export const metadata: Metadata = {
  title: "POS Offline POC",
  description: "Offline-first POS demo using Next.js + IndexedDB",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
      </head>
      <body>
        <ServiceWorkerProvider>
          <div
            style={{
              margin: "0 auto",
              minHeight: "100vh",
              padding: "24px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {children}
          </div>
        </ServiceWorkerProvider>
      </body>
    </html>
  );
}
