import { Job } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, Building2 } from "lucide-react";

export function JobCard({
  job,
  onClick,
  draggable,
  onDragStart,
  compact,
}: {
  job: Job;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className="w-full text-left bg-card border border-border rounded-lg p-4 hover:border-primary/50 hover:-translate-y-0.5 transition-all group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {job.title}
        </h3>
        {job.remote && <Badge variant="secondary" className="shrink-0 text-[10px]">Remote</Badge>}
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
        <Building2 className="size-3" /> {job.company}
      </div>
      {!compact && job.location && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
          <MapPin className="size-3" /> {job.location}
        </div>
      )}
      {job.salary && (
        <div className="flex items-center gap-1 text-xs text-primary mt-2">
          <DollarSign className="size-3" /> {job.salary}
        </div>
      )}
    </button>
  );
}
