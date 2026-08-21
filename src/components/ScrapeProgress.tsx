export function ScrapeProgress({
  statusLog,
  current,
  total,
  site,
}: {
  statusLog: string[];
  current: number;
  total: number;
  site: string | null;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-2">
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{site}</span>
            <span className="tabular-nums">{current}/{total}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <div className="max-h-32 overflow-y-auto space-y-1 text-xs text-muted-foreground font-mono">
        {statusLog.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}