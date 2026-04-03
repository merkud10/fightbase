"use client";

import { useId, useState } from "react";

type Option = {
  id: string;
  label: string;
};

export function SearchableMultiSelect({
  name,
  label,
  options,
  defaultValue,
  searchPlaceholder,
  helperText,
  emptyText
}: {
  name: string;
  label: string;
  options: Option[];
  defaultValue: string[];
  searchPlaceholder: string;
  helperText: string;
  emptyText: string;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultValue);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  const selectedLabels = options
    .filter((option) => selectedIds.includes(option.id))
    .map((option) => option.label);

  function toggleOption(optionId: string) {
    setSelectedIds((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
    );
  }

  return (
    <div className="admin-field searchable-select">
      <span>{label}</span>
      <label className="searchable-select-search" htmlFor={searchId}>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </label>

      <div className="searchable-select-summary">
        {selectedLabels.length > 0 ? selectedLabels.join(", ") : helperText}
      </div>

      <div className="searchable-select-panel">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const checked = selectedIds.includes(option.id);

            return (
              <label key={option.id} className={`searchable-select-option ${checked ? "searchable-select-option--checked" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(option.id)}
                />
                <span>{option.label}</span>
              </label>
            );
          })
        ) : (
          <p className="muted searchable-select-empty">{emptyText}</p>
        )}
      </div>

      {selectedIds.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
    </div>
  );
}
