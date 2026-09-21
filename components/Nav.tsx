import Link from "next/link";

export default function Nav({ name }: { name: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-night-700/60 bg-night-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 text-sm">
        <Link
          href="/"
          className="font-mono text-moon-200 transition hover:text-accent"
        >
          <span className="text-accent">☾</span> {name}
        </Link>
        <div className="flex items-center gap-5 font-mono text-[13px] text-moon-300/80">
          <Link href="/#projects" className="transition hover:text-accent">
            projects
          </Link>
          <Link href="/#about" className="transition hover:text-accent">
            about
          </Link>
          <Link href="/cv" className="transition hover:text-accent">
            cv
          </Link>
        </div>
      </nav>
    </header>
  );
}
