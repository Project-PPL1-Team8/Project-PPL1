export function shortId(value?: string | null, length = 8): string {
  if (!value) return "-";
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function statusClass(status?: string | null): string {
  const normalized = (status || "").toLowerCase();

  if (["approved", "completed", "success", "active", "allocated"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }

  if (["pending", "pending_payment"].includes(normalized)) {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }

  if (["rejected", "failed", "cancelled", "refunded"].includes(normalized)) {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function downloadTextFile(filename: string, content: string, mimeType = "text/csv") {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}