import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { AuditQuery } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { downloadText } from '@/lib/download';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';
import { toast } from '@/shared/ui/toast';

export function useAudit(query: AuditQuery) {
  const api = useApi();
  return useQuery({
    queryKey: qk.audit(query),
    queryFn: () => api.audit.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useExportAudit() {
  const api = useApi();
  return useMutation({
    mutationFn: (query: AuditQuery) => api.audit.exportCsv(query),
    onSuccess: ({ filename, content }) => {
      downloadText(filename, content);
      toast.success('Export ready', `${filename}. The export itself is in the audit log.`);
    },
    onError: toastError('Could not export'),
  });
}
