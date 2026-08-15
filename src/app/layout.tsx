import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recipe flow diagrams",
  description:
    "Turn a recipe into a merge-box flow diagram, and cook from an interactive checklist.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Cook mode lives on a phone propped against something in a kitchen; let
  // people pinch-zoom the board.
  maximumScale: 5,
  themeColor: "#f2f0e6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
