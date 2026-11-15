import { dayKeyIn, localClock } from '@twindesk/core';
import { notify, type NotifyDeps } from './notify';
import { updateTemplate } from './whatsapp';

/** Twilio's shared WhatsApp test number. */
export const TWILIO_SANDBOX_NUMBER = '+14155238886';

export type SandboxOutcome = { status: 'off' } | { status: 'ok'; sent: boolean };

/**
 * While WhatsApp goes through Twilio's test number, it only delivers within 24 hours of a message
 * from the owner's phone. Once a day this asks the owner to reply, on WhatsApp (which arrives if
 * the window is still open, so they can answer in the same chat) and by email (which arrives
 * either way). It stops by itself once the owner's own WhatsApp number is set up.
 */
export async function runSandboxReminder(deps: NotifyDeps): Promise<SandboxOutcome> {
  const { config, store, now } = deps;
  if (
    config.WHATSAPP_PROVIDER !== 'twilio' ||
    config.TWILIO_WHATSAPP_FROM !== TWILIO_SANDBOX_NUMBER ||
    !config.SANDBOX_REMINDER_AT
  ) {
    return { status: 'off' };
  }
  const [hours = 0, minutes = 0] = config.SANDBOX_REMINDER_AT.split(':').map(Number);
  if (localClock(config.TIMEZONE, new Date(now)).minutes < hours * 60 + minutes) {
    return { status: 'ok', sent: false };
  }

  const key = `sandbox-reminder|${dayKeyIn(config.TIMEZONE, new Date(now))}`;
  if (!(await store.claimReminder(key, now))) return { status: 'ok', sent: false };
  try {
    await notify(deps, {
      topic: 'source-health',
      urgency: 'important',
      title: 'Reply on WhatsApp to keep tomorrow’s alerts coming',
      body: `Send "hi" to ${TWILIO_SANDBOX_NUMBER} on WhatsApp now, or reply in that chat. Twilio’s test number only delivers within 24 hours of your last message, so this keeps tomorrow’s brief and reminders arriving. This reminder stops once your own WhatsApp number is set up.`,
      href: '/notifications',
      channels: ['in-app', 'email', 'whatsapp'],
      scheduled: true,
      whatsapp: updateTemplate(
        config,
        'your WhatsApp alerts',
        'reply hi here to keep them coming for the next 24 hours',
      ),
    });
  } catch (error) {
    // Nothing was recorded, so the next run tries again.
    await store.releaseReminder(key);
    throw error;
  }
  return { status: 'ok', sent: true };
}
