import { ArrowRight, BookOpen, CheckCircle2, Route, ShieldCheck } from 'lucide-react';
import { useTenant } from '@/features/tenant/tenant-context';
import { BrandLogo } from '@/shared/components/BrandLogo';

const PIPELINE = [
  { icon: Route, label: 'Router', detail: 'picks a specialist' },
  { icon: BookOpen, label: 'Research', detail: 'finds your passages' },
  { icon: ShieldCheck, label: 'Compliance', detail: 'eight advice checks' },
];

/** Brand side of the sign-in screen. Hidden on phones, where the form comes first. */
export function HeroPanel() {
  const { tenant } = useTenant();
  const [lead, tail] = splitTagline(tenant.tagline);

  return (
    <aside className="relative hidden overflow-hidden border-r border-line bg-bg lg:flex lg:flex-col">
      <div aria-hidden className="absolute inset-0 hero-glow" />
      {tenant.brand.heroArt ? (
        <img
          src="/brand/hero-wave.svg"
          alt=""
          aria-hidden
          className="absolute inset-x-0 bottom-0 w-full [mask-image:linear-gradient(to_bottom,transparent_0%,black_55%)] object-cover object-bottom opacity-50 dark:opacity-90"
          decoding="async"
        />
      ) : null}

      <div className="relative flex h-16 items-center px-10">
        <BrandLogo showProduct />
      </div>

      <div className="relative flex flex-1 flex-col justify-center px-10 pb-16 xl:px-16">
        <p className="font-mono text-[11px] tracking-[0.18em] text-brand-fg uppercase">
          {tenant.productName} by {tenant.name}
        </p>
        <h2 className="mt-4 max-w-xl text-[40px] leading-[1.08] font-semibold tracking-tight text-fg xl:text-[46px]">
          {lead}
          {tail ? (
            <>
              <br />
              <span className="text-gradient">{tail}</span>
            </>
          ) : null}
        </h2>
        <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-fg-muted">
          It knows your rules, your history and your notes, answers with sources, and runs every
          answer through a wording check before you see it.
        </p>

        <figure className="mt-10 max-w-lg rounded-2xl p-5 glass-strong">
          <div className="flex items-center justify-between gap-3">
            <figcaption className="text-[12px] font-semibold text-fg-muted">
              Prop firm rules specialist
            </figcaption>
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-fg-subtle">
              ANSWER
            </span>
          </div>
          <blockquote className="mt-3 text-[15px] leading-relaxed text-fg">
            By recording it as it happens: the rule, its version, the time and the equity at the
            breach, checked on every tick.
            <Cite n={1} />
            <Cite n={2} />
          </blockquote>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[11px] text-fg-subtle">
            <span>2 cited passages</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="size-3" aria-hidden /> 8 of 8 checks
            </span>
            <span aria-hidden>·</span>
            <span>DT-K7P2QA</span>
            <span aria-hidden>·</span>
            <span>4.6s</span>
          </div>
        </figure>

        <ol className="mt-6 flex max-w-lg flex-wrap items-center gap-2 text-[12px]">
          {PIPELINE.map((step, i) => (
            <li key={step.label} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5">
                <step.icon className="size-3.5 text-brand-fg" aria-hidden />
                <span className="font-medium text-fg">{step.label}</span>
                <span className="hidden text-fg-subtle 2xl:inline">{step.detail}</span>
              </span>
              {i < PIPELINE.length - 1 ? (
                <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function Cite({ n }: { n: number }) {
  return (
    <sup className="ml-1 inline-grid size-4.5 place-items-center rounded border border-brand-fg/40 bg-brand/15 align-[2px] font-mono text-[10px] font-semibold text-brand-fg">
      {n}
    </sup>
  );
}

function splitTagline(tagline: string): [string, string | null] {
  const at = tagline.indexOf(' that ');
  if (at > 0) return [tagline.slice(0, at), tagline.slice(at + 1)];
  return [tagline, null];
}
