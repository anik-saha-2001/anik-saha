import { supabaseAdmin } from "@/lib/supabase";

const BUCKET = "cv";

export type CvInfo = {
  hasPdf: boolean;
  hasTex: boolean;
  updatedAt: string | null;
  pdfUrl: string | null;
  pdfDownloadUrl: string | null;
  texUrl: string | null;
};

const EMPTY: CvInfo = {
  hasPdf: false,
  hasTex: false,
  updatedAt: null,
  pdfUrl: null,
  pdfDownloadUrl: null,
  texUrl: null,
};

export async function getCvInfo(): Promise<CvInfo> {
  // Fully wrapped in try/catch — supabaseAdmin() throws synchronously if
  // env vars are missing (before any network call), and a Supabase error
  // (e.g. the "cv" bucket not existing yet because schema.sql hasn't been
  // run) arrives async via `error`. Either way, fail soft: the CV page
  // just shows "not uploaded yet" instead of crashing.
  try {
    const sb = supabaseAdmin();

    // list() also gives us each file's updated_at, so we don't need a
    // second round trip just to show "last updated".
    const { data: files, error } = await sb.storage.from(BUCKET).list("", {
      limit: 10,
    });

    if (error) {
      console.error("Failed to read CV bucket:", error.message);
      return EMPTY;
    }

    const pdfFile = files?.find((f) => f.name === "latest.pdf");
    const texFile = files?.find((f) => f.name === "latest.tex");

    const dates = [pdfFile?.updated_at, texFile?.updated_at].filter(Boolean) as string[];
    const updatedAt = dates.length
      ? new Date(Math.max(...dates.map((d) => new Date(d).getTime()))).toISOString()
      : null;

    return {
      hasPdf: !!pdfFile,
      hasTex: !!texFile,
      updatedAt,
      pdfUrl: pdfFile ? sb.storage.from(BUCKET).getPublicUrl("latest.pdf").data.publicUrl : null,
      pdfDownloadUrl: pdfFile
        ? sb.storage.from(BUCKET).getPublicUrl("latest.pdf", { download: true }).data.publicUrl
        : null,
      texUrl: texFile
        ? sb.storage.from(BUCKET).getPublicUrl("latest.tex", { download: true }).data.publicUrl
        : null,
    };
  } catch (err) {
    console.error("Failed to read CV bucket:", (err as Error).message);
    return EMPTY;
  }
}
