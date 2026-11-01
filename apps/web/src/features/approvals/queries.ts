import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalDecision } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';
import { toast } from '@/shared/ui/toast';

export function useApprovals() {
  const api = useApi();
  return useQuery({
    queryKey: qk.approvals,
    queryFn: () => api.approvals.list(),
    refetchInterval: 30_000,
  });
}

export function usePendingApprovalCount(): number {
  const { data } = useApprovals();
  return data?.filter((a) => a.status === 'pending').length ?? 0;
}

export function useDecideApproval() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: ApprovalDecision) => api.approvals.decide(decision),
    onSuccess: (approval) => {
      toast.success(
        approval.status === 'approved' ? 'Approved and sent' : 'Rejected',
        approval.status === 'approved'
          ? `${approval.title} went to ${approval.recipients.map((r) => r.name).join(', ')}. Logged.`
          : 'Nothing was sent. The decision is in the audit log.',
      );
      void queryClient.invalidateQueries({ queryKey: qk.approvals });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
      void queryClient.invalidateQueries({ queryKey: qk.auditRoot });
    },
    onError: toastError('Could not record the decision'),
  });
}
