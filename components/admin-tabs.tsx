"use client";

import { useState, type ReactNode } from "react";

type AdminTabItem = {
  id: string;
  label: string;
  note?: string;
  content: ReactNode;
};

export function AdminTabs({
  items,
  initialTabId
}: {
  items: AdminTabItem[];
  initialTabId?: string;
}) {
  const fallbackTabId = items[0]?.id ?? "";
  const [activeTabId, setActiveTabId] = useState(initialTabId ?? fallbackTabId);

  return (
    <div className="admin-tabs">
      <div className="admin-tab-list" role="tablist" aria-label="Admin sections">
        {items.map((item) => {
          const isActive = item.id === activeTabId;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`admin-tab ${isActive ? "admin-tab--active" : ""}`}
              onClick={() => setActiveTabId(item.id)}
            >
              <span>{item.label}</span>
              {item.note ? <small>{item.note}</small> : null}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          hidden={item.id !== activeTabId}
          className="admin-tab-panel"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
