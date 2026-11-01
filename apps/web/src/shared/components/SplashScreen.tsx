import { Loader2 } from 'lucide-react';

export function SplashScreen({ label = 'Loading your desk' }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-fg-subtle">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="text-[13px]">{label}</span>
      </div>
    </div>
  );
}
