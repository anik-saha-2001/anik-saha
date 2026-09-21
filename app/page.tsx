import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ProjectCard from "@/components/ProjectCard";
import { listProjects } from "@/lib/projects";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, projects] = await Promise.all([getSettings(), listProjects()]);
  const featured = projects.filter((p) => p.featured);
  const rest = projects.filter((p) => !p.featured);

  return (
    <>
      <Nav name={settings.name} />

      <main className="mx-auto max-w-4xl px-5">
        {/* Hero */}
        <section className="py-20 sm:py-28">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent-glow/70">
            ☾ {settings.location || "somewhere, on a server"}
          </p>
          <h1 className="mb-5 text-3xl font-semibold leading-tight text-moon-100 sm:text-4xl">
            {settings.name}
            <span className="block text-lg font-normal text-moon-300/70 sm:text-xl">
              {settings.role}
            </span>
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-moon-300/80 sm:text-lg">
            {settings.tagline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 font-mono text-sm">
            <Link
              href="#projects"
              className="rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 text-accent-glow transition hover:bg-accent/20"
            >
              view projects
            </Link>
            <Link
              href="/cv"
              className="rounded-lg border border-night-600 px-4 py-2 text-moon-200 transition hover:border-accent-dim hover:text-accent-glow"
            >
              download CV
            </Link>
            {settings.socials?.github && (
              <a
                href={settings.socials.github}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-night-600 px-4 py-2 text-moon-200 transition hover:border-accent-dim hover:text-accent-glow"
              >
                github
              </a>
            )}
          </div>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-24 border-t border-night-700/60 py-14">
          <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-accent-glow/70">
            ☾ about
          </h2>
          <p className="max-w-2xl text-[15px] leading-relaxed text-moon-300/85">
            {settings.bio}
          </p>
          {settings.skills?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {settings.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-md border border-night-700 bg-night-900/60 px-2.5 py-1 font-mono text-xs text-moon-300/80"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Projects */}
        <section id="projects" className="scroll-mt-24 border-t border-night-700/60 py-14">
          <h2 className="mb-6 font-mono text-sm uppercase tracking-widest text-accent-glow/70">
            ☾ projects
          </h2>

          {projects.length === 0 ? (
            <p className="text-sm text-moon-300/60">
              No projects yet — add one from{" "}
              <Link href="/admin" className="text-accent-glow underline">
                /admin
              </Link>
              .
            </p>
          ) : (
            <>
              {featured.length > 0 && (
                <div className="mb-8 grid gap-4 sm:grid-cols-2">
                  {featured.map((p) => (
                    <ProjectCard key={p.slug} project={p} />
                  ))}
                </div>
              )}
              {rest.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {rest.map((p) => (
                    <ProjectCard key={p.slug} project={p} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <Footer name={settings.name} />
    </>
  );
}
