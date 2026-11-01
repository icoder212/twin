import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Automation, AutomationKind, PlanRequest } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';
import { toast } from '@/shared/ui/toast';

export function useAutomations(kind?: AutomationKind) {
  const api = useApi();
  return useQuery({ queryKey: qk.automations(kind), queryFn: () => api.automations.list(kind) });
}

export function useAutomation(id: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.automation(id), queryFn: () => api.automations.get(id) });
}

export function useAutomationRuns(id: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.runs(id), queryFn: () => api.automations.runs(id) });
}

export function usePlanAutomation() {
  const api = useApi();
  return useMutation({ mutationFn: (request: PlanRequest) => api.automations.plan(request) });
}

export function useSaveAutomation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: Automation) => api.automations.save(draft),
    onSuccess: (saved) => {
      toast.success(
        `${saved.kind === 'task' ? 'Task' : 'Workflow'} saved`,
        saved.shortcut ? `Run it any time with ${saved.shortcut}.` : saved.schedule.label,
      );
      void queryClient.invalidateQueries({ queryKey: qk.automationsRoot });
      void queryClient.invalidateQueries({ queryKey: qk.shortcuts });
    },
  });
}

export function useSetAutomationStatus() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      api.automations.setStatus(id, status),
    onSuccess: (a) => {
      toast.success(a.status === 'paused' ? 'Paused' : 'Resumed', a.name);
      void queryClient.invalidateQueries({ queryKey: qk.automationsRoot });
    },
    onError: toastError('Could not change the status'),
  });
}

export function useRunAutomation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.automations.run(id),
    onSuccess: (run) => {
      toast.success(
        run.status === 'awaiting-approval'
          ? 'Ran. A draft is waiting for your approval'
          : 'Ran successfully',
        `${run.steps.length} steps, every one logged.`,
      );
      void queryClient.invalidateQueries({ queryKey: qk.automationsRoot });
      void queryClient.invalidateQueries({ queryKey: qk.approvals });
    },
    onError: toastError('The run did not start'),
  });
}
