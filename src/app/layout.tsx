import type { Metadata } from "next";
import { Geist, Geist_Mono, Nunito } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Rounded, heavy headings echo the SHAYVERA wordmark.
const display = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["700", "800", "900"] });

export const metadata: Metadata = {
  title: { default: "Shayvera Inventory", template: "%s · Shayvera" },
  description: "Inventory management for Shayvera: raw materials, ready products and e-commerce.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${display.variable} font-sans`}>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
