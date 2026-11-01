import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

export function SettingSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-col gap-3 sm:flex-row">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Label and value pairs; stacks on phones, two columns from the sm breakpoint. */
export function FactList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-line rounded-xl border border-line">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <dt className="text-[13px] text-fg-subtle">{label}</dt>
          <dd className="min-w-0 text-[13px] font-medium break-words text-fg sm:text-right">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
