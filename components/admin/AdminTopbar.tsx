"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/admin/projects", label: "projects" },
  { href: "/admin/cv", label: "cv" },
  { href: "/admin/settings", label: "settings" },
];

export default function AdminTopbar() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return null;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-night-700/60 bg-night-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-5 font-mono text-sm">
          <Link href="/" className="text-accent-glow/80 hover:text-accent">
            ☾ site
          </Link>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`transition hover:text-accent ${
                pathname.startsWith(l.href) ? "text-moon-100" : "text-moon-300/60"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <button
          onClick={logout}
          className="font-mono text-xs text-moon-300/60 transition hover:text-accent"
        >
          log out
        </button>
      </div>
    </header>
  );
}
