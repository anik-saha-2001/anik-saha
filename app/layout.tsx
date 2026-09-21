import type { Metadata } from "next";
import "./globals.css";
import Starfield from "@/components/Starfield";
import { getSettings } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: `${settings.name} — ${settings.role}`,
    description: settings.tagline,
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Starfield />
        {children}
      </body>
    </html>
  );
}
