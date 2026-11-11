import {
  CHANNEL_LABELS,
  type DeliveryChannel,
  type EconomicWatch,
  type NewsWatch,
} from '@twindesk/core';

/** Wording shared by the instructions card and its sections. */

const CHANNEL_WORDS: Partial<Record<DeliveryChannel, string>> = {
  'in-app': 'the app',
  email: 'email',
  whatsapp: 'WhatsApp',
};

export function listWords(words: string[], empty = ''): string {
  if (words.length <= 1) return words[0] ?? empty;
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

export function listChannels(channels: DeliveryChannel[]): string {
  return listWords(
    channels.map((c) => CHANNEL_WORDS[c] ?? CHANNEL_LABELS[c]),
    'the app',
  );
}

export function releasesProblem(watch: EconomicWatch): string | undefined {
  if (watch.events.length === 0) return 'Choose at least one release.';
  if (watch.remindMinutes === 0 && !watch.results && !watch.summaryAt) {
    return 'Choose a summary, a reminder or the figures afterwards.';
  }
  return undefined;
}

export function newsProblem(watch: NewsWatch): string | undefined {
  return watch.tickers.length + watch.topics.length + watch.centralBanks.length === 0
    ? 'Choose at least one company, topic or central bank.'
    : undefined;
}
