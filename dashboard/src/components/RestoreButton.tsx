"use client";

import { useState } from "react";
import { RestoreModal } from "@/components/RestoreModal";

interface Props {
  slug: string;
  date: string;
  availableObjects: string[];
}

export default function RestoreButton({ slug, date, availableObjects }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-info/10 hover:bg-info/20 text-info text-sm font-medium rounded-lg border border-info/20 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
          />
        </svg>
        Restore Backup
      </button>

      {open && (
        <RestoreModal
          slug={slug}
          date={date}
          availableObjects={availableObjects}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
