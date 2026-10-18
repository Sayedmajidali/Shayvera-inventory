import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
// Fonts are bundled from npm, so builds never depend on downloading from Google Fonts.
// Nunito (rounded, heavy) echoes the SHAYVERA wordmark in headings.
import "@fontsource-variable/nunito";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Shayvera Inventory", template: "%s · Shayvera" },
  description: "Inventory management for Shayvera: raw materials, ready products and e-commerce.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
