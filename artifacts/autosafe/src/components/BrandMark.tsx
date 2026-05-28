import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  compact?: boolean;
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border border-primary/30 bg-black shadow-glow",
        compact ? "h-10 w-10" : "h-12 w-12",
        className,
      )}
      aria-label="AutoSafe"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.22),transparent_35%)]" />
      <img
        src="/autosafe-logo-zlote.png"
        alt="AutoSafe"
        className={cn("relative z-10 object-contain", compact ? "h-8 w-8" : "h-10 w-10")}
        draggable={false}
      />
    </div>
  );
}
