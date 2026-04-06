"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function EditConfigPage(props: Props) {
  const { slug } = use(props.params);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [jsonContent, setJsonContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${slug}/config`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load config");
        return res.json();
      })
      .then((data) => {
        setJsonContent(JSON.stringify(data, null, 2));
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to fetch client configuration.");
        setIsLoading(false);
      });
  }, [slug]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      
      const payload = JSON.parse(jsonContent);

      const res = await fetch(`/api/clients/${slug}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update configuration");
      }

      router.push(`/clients/${slug}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Invalid JSON syntax. Please correct it and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-sm text-zinc-500 mb-4 cursor-pointer hover:underline">
            <Link href={`/clients/${slug}`}>&larr; Back to {slug}</Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
            <span className="text-blue-400">{'< />'}</span>
            Edit Configuration
          </h1>
          <p className="text-zinc-400 text-sm hover:text-zinc-300">
            Modify the underlying JSON. Ensure properties matches the <code>ClientConfig</code> schema.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center p-4 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 gap-3">
          <span className="text-xl font-bold">!</span>
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-2xl relative">
        <textarea
          value={jsonContent}
          onChange={(e) => setJsonContent(e.target.value)}
          className="w-full h-[600px] p-6 bg-zinc-950 text-emerald-400 font-mono text-sm leading-relaxed outline-none resize-y tabular-nums border-0"
          spellCheck="false"
        />
        <div className="border-t border-zinc-800 bg-zinc-900/50 p-4 flex justify-end gap-3 rounded-b-xl backdrop-blur-sm">
          <button
            onClick={() => router.push(`/clients/${slug}`)}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded border border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isSaving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}