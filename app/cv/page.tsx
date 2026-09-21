import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getSettings } from "@/lib/settings";
import { getCvInfo } from "@/lib/cv";

export const dynamic = "force-dynamic";

export default async function CvPage() {
  const [settings, cv] = await Promise.all([getSettings(), getCvInfo()]);

  return (
    <>
      <Nav name={settings.name} />
      <main className="mx-auto flex max-w-3xl flex-col items-center px-5 py-24 text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent-glow/70">
          ☾ curriculum vitae
        </p>
        <h1 className="mb-4 text-2xl font-semibold text-moon-100 sm:text-3xl">
          {settings.name}'s CV
        </h1>
        <p className="mb-10 max-w-md text-sm leading-relaxed text-moon-300/75">
          Always the latest version — updated from the admin panel whenever
          something changes.
          {cv.updatedAt && (
            <span className="mt-1 block font-mono text-xs text-moon-300/50">
              last updated {new Date(cv.updatedAt).toLocaleDateString()}
            </span>
          )}
        </p>

        {cv.hasPdf ? (
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-night-700/70 bg-night-900/40">
            <iframe
              src={cv.pdfUrl ?? undefined}
              className="h-[70vh] w-full"
              title="CV preview"
            />
          </div>
        ) : (
          <p className="mb-6 rounded-xl border border-night-700 bg-night-900/50 px-5 py-4 text-sm text-moon-300/60">
            No CV has been uploaded yet.
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3 font-mono text-sm">
          {cv.hasPdf && cv.pdfDownloadUrl && (
            <a
              href={cv.pdfDownloadUrl}
              className="rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 text-accent-glow transition hover:bg-accent/20"
            >
              download PDF
            </a>
          )}
          {cv.hasTex && cv.texUrl && (
            <a
              href={cv.texUrl}
              className="rounded-lg border border-night-600 px-4 py-2 text-moon-200 transition hover:border-accent-dim hover:text-accent-glow"
            >
              download .tex source
            </a>
          )}
        </div>
      </main>
      <Footer name={settings.name} />
    </>
  );
}
