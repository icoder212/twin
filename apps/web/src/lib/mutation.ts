import { userMessage } from '@twindesk/core';
import { toast } from '@/shared/ui/toast';

/** Standard error handler for mutations: a calm, user-safe toast. */
export function toastError(title: string) {
  return (error: unknown) => toast.error(title, userMessage(error));
}
