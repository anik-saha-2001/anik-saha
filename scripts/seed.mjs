// One-time migration: pushes the markdown case studies in content/projects/,
// content/site.json, and the CV files in seed/cv/ into your Supabase
// project. Run this once after you've created the Supabase project and run
// supabase/schema.sql there.
//
// Usage:
//   1. cp .env.example .env, fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   2. npm install
//   3. npm run seed
//
// Safe to re-run — every write is an upsert.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`\n✗ ${name} is not set. Copy .env.example to .env and fill it in first.\n`);
    process.exit(1);
  }
  return v;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const ROOT = process.cwd();

function slugify(input) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80) || "project"
  );
}

async function seedProjects() {
  const dir = path.join(ROOT, "content", "projects");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));

  console.log(`Seeding ${files.length} project(s)...`);
  for (const file of files) {
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const { data, content } = matter(raw);
    const slug = slugify(data.slug || file.replace(/\.md$/, ""));

    const row = {
      slug,
      title: data.title ?? "Untitled",
      summary: data.summary ?? "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      type: data.type ?? "Project",
      order_num: typeof data.order === "number" ? data.order : 999,
      featured: !!data.featured,
      date: data.date ?? new Date().toISOString().slice(0, 10),
      content: content.trim(),
    };

    const { error } = await sb.from("projects").upsert(row, { onConflict: "slug" });
    if (error) {
      console.error(`  ✗ ${slug}: ${error.message}`);
      if (error.message.includes("does not exist") || error.message.includes("schema cache")) {
        console.error(
          "    → Have you run supabase/schema.sql in your Supabase project's SQL Editor yet?"
        );
      }
      process.exitCode = 1;
    } else {
      console.log(`  ✓ ${slug}`);
    }
  }
}

async function seedSettings() {
  const filePath = path.join(ROOT, "content", "site.json");
  console.log("Seeding site settings...");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(raw);
    const { error } = await sb
      .from("site_settings")
      .upsert({ id: 1, ...json }, { onConflict: "id" });
    if (error) {
      console.error(`  ✗ ${error.message}`);
      process.exitCode = 1;
    } else {
      console.log("  ✓ site_settings");
    }
  } catch (err) {
    console.error(`  ✗ Couldn't read content/site.json: ${err.message}`);
    process.exitCode = 1;
  }
}

async function seedCv() {
  console.log("Seeding CV files into Supabase Storage...");
  const cvDir = path.join(ROOT, "seed", "cv");

  const uploads = [
    { file: "latest.pdf", contentType: "application/pdf" },
    { file: "latest.tex", contentType: "application/x-tex" },
  ];

  for (const { file, contentType } of uploads) {
    const filePath = path.join(cvDir, file);
    try {
      const buf = await fs.readFile(filePath);
      const { error } = await sb.storage.from("cv").upload(file, buf, {
        contentType,
        upsert: true,
      });
      if (error) {
        console.error(`  ✗ ${file}: ${error.message}`);
        if (error.message.includes("Bucket not found")) {
          console.error(
            "    → Have you run supabase/schema.sql in your Supabase project's SQL Editor yet?"
          );
        }
        process.exitCode = 1;
      } else {
        console.log(`  ✓ ${file}`);
      }
    } catch {
      console.log(`  – skipped ${file} (not found in seed/cv/)`);
    }
  }
}

async function main() {
  await seedProjects();
  await seedSettings();
  await seedCv();
  console.log("\nDone. Check your Supabase project's Table Editor / Storage to confirm.");
}

main();
