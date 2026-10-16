import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type Job, type JobInput, type JobStatus } from "@/lib/api";
import { STATUS_META } from "@/lib/jobs";

function invalidateAll(qc: ReturnType<typeof useQueryClient>, id?: number) {
  qc.invalidateQueries({ queryKey: ["jobs"] });
  qc.invalidateQueries({ queryKey: ["stats"] });
  if (id != null) qc.invalidateQueries({ queryKey: ["job", id] });
}

/** Status change with an optimistic update, so the board/table moves instantly. */
export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: JobStatus }) =>
      api.updateJob(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["jobs"] });
      const prev = qc.getQueriesData<Job[]>({ queryKey: ["jobs"] });
      qc.setQueriesData<Job[]>({ queryKey: ["jobs"] }, (old) =>
        old?.map((j) => (j.id === id ? { ...j, status } : j)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(e.message);
    },
    onSuccess: (job) => toast.success(`${job.company} → ${STATUS_META[job.status].label}`),
    onSettled: (_d, _e, v) => invalidateAll(qc, v.id),
  });
}

export function useUpdateJob(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<JobInput>) => api.updateJob(id, data),
    onSuccess: (job) => {
      qc.setQueryData(["job", id], job);
      invalidateAll(qc, id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
