import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHANNEL_LABELS,
  URGENCY_LABELS,
  type BriefingKind,
  type ConfirmVerificationInput,
  type ContactChannel,
  type NotificationPolicyInput,
  type NotificationPreferences,
  type StartVerificationInput,
  type UpdateBriefingInput,
  type Urgency,
} from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';
import { toast } from '@/shared/ui/toast';

export function useNotificationPreferences() {
  const api = useApi();
  return useQuery({
    queryKey: qk.notificationPrefs,
    queryFn: () => api.notifications.preferences(),
  });
}

export function useUpdatePreferences() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationPreferences) => api.notifications.updatePreferences(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.notificationPrefs, saved);
      toast.success('Notification settings saved');
    },
    onError: toastError('Could not save your notification settings'),
  });
}

export function useContacts() {
  const api = useApi();
  return useQuery({ queryKey: qk.contacts, queryFn: () => api.notifications.contacts() });
}

/** Errors are shown in the verification dialog, next to the field they concern. */
export function useStartVerification() {
  const api = useApi();
  return useMutation({
    mutationFn: (input: StartVerificationInput) => api.notifications.startVerification(input),
  });
}

export function useConfirmVerification() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmVerificationInput) => api.notifications.confirmVerification(input),
    onSuccess: (contact) => {
      toast.success(`${CHANNEL_LABELS[contact.channel]} verified`, contact.address);
      void queryClient.invalidateQueries({ queryKey: qk.contacts });
    },
  });
}

export function useRemoveContact() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channel: ContactChannel) => api.notifications.removeContact(channel),
    onSuccess: (_, channel) => {
      toast.success(`${CHANNEL_LABELS[channel]} removed`);
      void queryClient.invalidateQueries({ queryKey: qk.contacts });
    },
    onError: toastError('Could not remove it'),
  });
}

export function useNotificationPolicy() {
  const api = useApi();
  return useQuery({ queryKey: qk.notificationPolicy, queryFn: () => api.notifications.policy() });
}

export function useUpdatePolicy() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationPolicyInput) => api.notifications.updatePolicy(input),
    onSuccess: (policy) => {
      queryClient.setQueryData(qk.notificationPolicy, policy);
      toast.success('Firm policy saved', 'It applies to everyone at the firm straight away.');
      void queryClient.invalidateQueries({ queryKey: qk.notifyRoot });
    },
    onError: toastError('Could not save the firm policy'),
  });
}

export function useNotificationEvents() {
  const api = useApi();
  return useQuery({
    queryKey: qk.notificationEvents,
    queryFn: () => api.notifications.events(),
    // Picks up escalations that fire while the log is open.
    refetchInterval: 30_000,
  });
}

export function useAcknowledge() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.acknowledge(id),
    onSuccess: () => {
      toast.success('Acknowledged', 'Any escalation waiting on it has been stopped.');
      void queryClient.invalidateQueries({ queryKey: qk.notificationEvents });
    },
    onError: toastError('Could not acknowledge it'),
  });
}

export function useSendTest() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (urgency: Urgency) => api.notifications.sendTest(urgency),
    onSuccess: (event) => {
      toast.success(
        `Test ${URGENCY_LABELS[event.urgency].label.toLowerCase()} notification sent`,
        `Reference ${event.ref}. See it in the delivery log.`,
      );
      void queryClient.invalidateQueries({ queryKey: qk.notificationEvents });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      void queryClient.invalidateQueries({ queryKey: qk.auditRoot });
    },
    onError: toastError('Could not send the test'),
  });
}

export function useBriefings() {
  const api = useApi();
  return useQuery({ queryKey: qk.briefings, queryFn: () => api.briefings.list() });
}

export function useUpdateBriefing() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBriefingInput) => api.briefings.update(input),
    onSuccess: (schedule) => {
      toast.success(schedule.enabled ? 'Briefing scheduled' : 'Briefing paused');
      void queryClient.invalidateQueries({ queryKey: qk.briefings });
      void queryClient.invalidateQueries({ queryKey: qk.briefingPreview(schedule.kind) });
    },
    onError: toastError('Could not save the briefing'),
  });
}

export function useBriefingPreview(kind: BriefingKind, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: qk.briefingPreview(kind),
    queryFn: () => api.briefings.preview(kind),
    enabled,
  });
}

export function useSendBriefing() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: BriefingKind) => api.briefings.sendNow(kind),
    onSuccess: (event) => {
      toast.success(event.title, `Reference ${event.ref}. See it in the delivery log.`);
      void queryClient.invalidateQueries({ queryKey: qk.briefings });
      void queryClient.invalidateQueries({ queryKey: qk.notificationEvents });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
    },
    onError: toastError('Could not send the briefing'),
  });
}
