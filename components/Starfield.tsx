// Deterministic "random" star field — same output on server and client,
// so there's no hydration mismatch (no Math.random at render time).
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeStars(count: number, seed: number) {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    top: `${(rand() * 100).toFixed(2)}%`,
    left: `${(rand() * 100).toFixed(2)}%`,
    size: rand() > 0.85 ? 2 : 1,
    delay: `${(rand() * 6).toFixed(2)}s`,
    duration: `${(3 + rand() * 4).toFixed(2)}s`,
  }));
}

const stars = makeStars(90, 42);

export default function Starfield() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-night-950"
    >
      <div className="absolute inset-0 bg-radial-fade" />
      <div className="absolute -top-40 right-[-10%] h-[420px] w-[420px] rounded-full bg-accent/10 blur-[120px]" />
      <div className="absolute bottom-[-15%] left-[-10%] h-[380px] w-[380px] rounded-full bg-accent-soft/10 blur-[120px]" />
      {stars.map((s) => (
        <span
          key={s.key}
          className="absolute rounded-full bg-star"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            animation: `twinkle ${s.duration} ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}
      <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:22px_22px]" />
    </div>
  );
}
