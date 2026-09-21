export default function Footer({ name }: { name: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-night-700/60 py-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-5 text-center font-mono text-xs text-moon-300/50">
        <p>
          ☾ built by {name} · {year}
        </p>
        <p className="text-moon-300/30">markdown in, portfolio out</p>
      </div>
    </footer>
  );
}
