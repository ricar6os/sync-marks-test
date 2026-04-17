export type SyncStatus = "idle" | "syncing" | "success" | "error"

interface SyncStatusBadgeProps {
  status: SyncStatus
  detail?: string
}

const STATUS_STYLES: Record<SyncStatus, string> = {
  idle: "border-[var(--color-border)] bg-white text-[var(--color-muted)]",
  syncing: "border-amber-300 bg-amber-50 text-[var(--color-warning)]",
  success: "border-emerald-300 bg-emerald-50 text-[var(--color-success)]",
  error: "border-rose-300 bg-rose-50 text-[var(--color-danger)]",
}

export function SyncStatusBadge({ status, detail }: SyncStatusBadgeProps) {
  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em]",
        STATUS_STYLES[status],
      ].join(" ")}
    >
      <span>{status}</span>
      {detail ? <span className="normal-case tracking-normal">{detail}</span> : null}
    </div>
  )
}
