import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Makini SF Backup Dashboard",
  description: "Monitor and restore Salesforce backups",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          {/* Nav */}
          <header className="bg-brand-900 text-white shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-6">
              <Link
                href="/"
                className="font-semibold text-lg tracking-tight hover:text-brand-100 transition-colors"
              >
                Makini SF Backup
              </Link>
              <span className="text-brand-300 text-sm hidden sm:block flex-1">
                Backup Dashboard
              </span>
              <Link
                href="/setup"
                className="ml-auto text-sm font-medium text-brand-200 hover:text-white border border-brand-600 hover:border-brand-300 px-3 py-1 rounded-lg transition-colors"
              >
                + Add Client
              </Link>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1">
            {children}
          </main>

          <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
            Makini Consulting — makiniconsulting.com
          </footer>
        </div>
      </body>
    </html>
  );
}
