import { ShieldCheck, ShieldX } from 'lucide-react';
import type { ComplianceCheckResult } from '@twindesk/core';
import { Badge } from '@/shared/ui/badge';

export function ComplianceBadge({
  checks,
  className,
}: {
  checks: ComplianceCheckResult[];
  className?: string;
}) {
  const passed = checks.filter((c) => c.passed).length;
  const ok = passed === checks.length;
  return (
    <Badge tone={ok ? 'success' : 'danger'} className={className}>
      {ok ? <ShieldCheck aria-hidden /> : <ShieldX aria-hidden />}
      {passed} of {checks.length} checks
    </Badge>
  );
}
