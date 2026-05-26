import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.2em]", {
  variants: {
    variant: {
      default: "border-white/10 bg-white/8 text-zinc-100",
      secondary: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
      outline: "border-white/15 text-zinc-200",
      destructive: "border-rose-500/20 bg-rose-500/10 text-rose-100",
      success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
