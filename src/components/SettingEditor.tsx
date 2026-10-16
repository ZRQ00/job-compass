import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, type Settings } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Small pencil button that opens a popover to change one number setting
 * (weekly goal, follow-up days). Saves to the backend so it sticks.
 */
export function SettingEditor({
  setting,
  value,
  title,
  unit,
  min,
  max,
  presets,
  ariaLabel,
}: {
  setting: keyof Settings;
  value: number | undefined;
  title: string;
  unit: string;
  min: number;
  max: number;
  presets: number[];
  ariaLabel: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => {
    if (open) setDraft(String(value ?? ""));
  }, [open, value]);

  const save = useMutation({
    mutationFn: (n: number) => api.updateSettings({ [setting]: n }),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`${title}: ${s[setting]} ${unit}`);
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const n = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(n) && n >= min && n <= max;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={ariaLabel}
          title={ariaLabel}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 border-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate(n);
          }}
          className="space-y-3"
        >
          <div className="text-sm font-medium">{title}</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="w-24 rounded-lg border border-border bg-background/50 px-3 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDraft(String(p))}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs tabular-nums transition-colors",
                  draft === String(p)
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {!valid && draft.trim() !== "" && (
            <p className="text-xs text-destructive">
              Enter a whole number from {min} to {max}.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || save.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              {save.isPending && <Loader2 className="size-3 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
