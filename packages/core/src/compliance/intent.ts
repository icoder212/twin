/**
 * First-pass classification of what a question is asking for. The router uses it to send
 * advice-seeking questions straight to a refusal, and to flag likely prompt-injection attempts
 * for the audit log. It is a filter, not a guarantee: the advice checks still run on every draft.
 */
export type QuestionIntent = 'advice-seeking' | 'injection-attempt' | 'informational';

const ADVICE_PATTERNS: RegExp[] = [
  /\bshould\s+i\s+(?:buy|sell|short|long|go\s+long|go\s+short|hold|close|enter|exit|add|take)\b/i,
  /\b(?:is\s+it|is\s+now)\s+(?:a\s+)?(?:good|right|bad)\s+(?:time|moment|idea)\s+to\s+(?:buy|sell|trade|enter)/i,
  /\b(?:will|is)\s+[A-Z]{3,6}(?:\/[A-Z]{3})?\s+(?:go\s+up|go\s+down|rise|fall|rally|crash|break\s*out)/i,
  /\b(?:will|is)\s+(?:the\s+)?(?:market|price|gold|oil|bitcoin|euro|dollar|pound|stock|index)\s+(?:go\s+up|go\s+down|rise|fall|rally|crash)/i,
  /\b(?:price\s+target|target\s+price|where\s+(?:will|is)\s+\S+\s+(?:going|heading))\b/i,
  /\b(?:give|send|tell)\s+me\s+(?:a|your)\s+(?:trade|signal|tip|pick|call)\b/i,
  /\b(?:what|which)\s+(?:should|would)\s+(?:i|you)\s+(?:buy|sell|trade)\b/i,
  /\b(?:best|top)\s+(?:trade|stock|pair|coin)s?\s+(?:to\s+buy|today|this\s+week)\b/i,
  /\b(?:long|short)\s+or\s+(?:long|short)\b/i,
  /\bbuy\s+or\s+sell\b/i,
];

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+|your\s+|the\s+|previous\s+|prior\s+)*(?:rules|instructions|guidelines|checks)\b/i,
  /\b(?:system\s+prompt|developer\s+mode|jailbreak|DAN\b)/i,
  /\bpretend\s+(?:you\s+are|to\s+be)\s+(?:not|an?\s+unrestricted)/i,
  /\byou\s+are\s+now\s+(?:allowed|free)\s+to\b/i,
];

export function classifyQuestion(question: string): QuestionIntent {
  if (INJECTION_PATTERNS.some((p) => p.test(question))) return 'injection-attempt';
  if (ADVICE_PATTERNS.some((p) => p.test(question))) return 'advice-seeking';
  return 'informational';
}
