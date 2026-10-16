import type { JobStatus } from "@/lib/api";
import { STATUS_META, STATUSES } from "@/lib/jobs";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        meta.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

/** Compact inline status picker, styled like the badge. */
export function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: JobStatus;
  onChange: (s: JobStatus) => void;
  disabled?: boolean;
}) {
  const meta = STATUS_META[value];
  return (
    <select
      value={value}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as JobStatus)}
      aria-label="Status"
      className={cn(
        "cursor-pointer appearance-none rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60",
        meta.chip,
      )}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} className="bg-popover text-popover-foreground">
          {STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}
