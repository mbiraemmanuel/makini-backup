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
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-800 hover:bg-brand-900 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
      >
        ↩ Restore Backup
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
