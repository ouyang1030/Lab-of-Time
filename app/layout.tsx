import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Lab of Time",
  description:
    "Shared research calendar for Lab of Time — tasks, meetings, and milestones.",
  icons: { icon: "/logo.png?v=2", apple: "/logo.png?v=2" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
