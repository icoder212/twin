import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AuditQuery } from '@twindesk/core';
import { Button } from '@/shared/ui/button';
import { Input, Select } from '@/shared/ui/field';
import { ACTION_GROUP_LABELS, OUTCOME_FILTER_LABELS } from './audit-labels';

interface Props {
  query: AuditQuery;
  onChange: (patch: Partial<Record<'q' | 'action' | 'outcome', string>>) => void;
}

/** Search is debounced in the change handler, so typing never triggers an effect loop. */
export function AuditFilters({ query, onChange }: Props) {
  const [search, setSearch] = useState(query.search ?? '');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onSearch = (value: string) => {
    const next = value.slice(0, 100);
    setSearch(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange({ q: next.trim() }), 300);
  };

  const hasFilters = Boolean(query.search) || query.action !== 'all' || query.outcome !== 'all';

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="relative flex-1">
        <label htmlFor="audit-search" className="sr-only">
          Search the audit log
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
        <Input
          id="audit-search"
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          maxLength={100}
          placeholder="Search summaries, people or ids such as DT-K7P2QA"
          className="pl-9"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 md:flex md:w-auto">
        <div className="md:w-56">
          <label htmlFor="audit-action" className="sr-only">
            Activity type
          </label>
          <Select
            id="audit-action"
            value={query.action}
            onChange={(e) => onChange({ action: e.target.value })}
          >
            {Object.entries(ACTION_GROUP_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="md:w-44">
          <label htmlFor="audit-outcome" className="sr-only">
            Outcome
          </label>
          <Select
            id="audit-outcome"
            value={query.outcome}
            onChange={(e) => onChange({ outcome: e.target.value })}
          >
            {Object.entries(OUTCOME_FILTER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {hasFilters ? (
        <Button
          variant="ghost"
          size="md"
          className="self-start md:self-auto"
          onClick={() => {
            window.clearTimeout(timer.current);
            setSearch('');
            onChange({ q: '', action: 'all', outcome: 'all' });
          }}
        >
          <X /> Clear
        </Button>
      ) : null}
    </div>
  );
}
