import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  compact?: boolean;
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border border-primary/40 bg-black text-primary shadow-glow",
        compact ? "h-10 w-10" : "h-12 w-12",
        className,
      )}
      aria-label="AutoSafe"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_35%)]" />
      <ShieldCheck className={compact ? "h-7 w-7" : "h-8 w-8"} strokeWidth={1.8} />
      <span className="absolute bottom-1 text-[9px] font-black tracking-tighter text-primary">AS</span>
    </div>
  );
}
