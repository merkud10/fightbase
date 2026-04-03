"use client";

import { useState, type ReactNode } from "react";

export function AdminDisclosure({
  title,
  eyebrow,
  defaultOpen = true,
  children
}: {
  title: string;
  eyebrow?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article className="policy-card admin-sidebar-card admin-disclosure">
      <button
        type="button"
        className={`admin-disclosure-toggle ${open ? "admin-disclosure-toggle--open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>
          {eyebrow ? <span className="admin-kicker">{eyebrow}</span> : null}
          <strong>{title}</strong>
        </span>
        <span className="admin-disclosure-icon">{open ? "−" : "+"}</span>
      </button>

      {!open ? null : <div className="admin-disclosure-body">{children}</div>}
    </article>
  );
}
