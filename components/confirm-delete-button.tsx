"use client";

export function ConfirmDeleteButton({
  label,
  confirmMessage
}: {
  label: string;
  confirmMessage: string;
}) {
  return (
    <button
      type="submit"
      className="button-danger"
      onClick={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
