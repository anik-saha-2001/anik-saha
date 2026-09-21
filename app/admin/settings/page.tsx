"use client";

import { useEffect, useState } from "react";
import type { SiteSettings } from "@/lib/settings";

const inputClass =
  "w-full rounded-lg border border-night-600 bg-night-900 px-3 py-2 text-sm text-moon-100 outline-none focus:border-accent-dim";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-moon-300/50">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [skillsText, setSkillsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(({ settings }) => {
        setSettings(settings);
        setSkillsText((settings.skills ?? []).join(", "));
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      ...settings,
      skills: skillsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      setSettings(data.settings);
      setMessage("Saved.");
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p className="text-sm text-moon-300/60">Loading…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-moon-100">Site settings</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Role">
            <input
              value={settings.role}
              onChange={(e) => setSettings({ ...settings, role: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Tagline — hero subtitle">
          <input
            value={settings.tagline}
            onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Bio — shown in the About section">
          <textarea
            value={settings.bio}
            onChange={(e) => setSettings({ ...settings, bio: e.target.value })}
            rows={4}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location">
            <input
              value={settings.location}
              onChange={(e) => setSettings({ ...settings, location: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              value={settings.email}
              onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GitHub URL">
            <input
              value={settings.socials?.github ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  socials: { ...settings.socials, github: e.target.value },
                })
              }
              className={inputClass}
            />
          </Field>
          <Field label="LinkedIn URL">
            <input
              value={settings.socials?.linkedin ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  socials: { ...settings.socials, linkedin: e.target.value },
                })
              }
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Skills — comma separated">
          <textarea
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </Field>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-emerald-400">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 font-mono text-sm text-accent-glow transition hover:bg-accent/20 disabled:opacity-50"
        >
          {saving ? "saving…" : "save settings"}
        </button>
      </form>
    </div>
  );
}
