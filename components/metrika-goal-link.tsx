"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { reachMetrikaGoal } from "@/lib/metrika";

type MetrikaGoalLinkProps = {
  href: string;
  goal: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
  children: ReactNode;
};

export function MetrikaGoalLink({ href, goal, className, ariaLabel, title, children }: MetrikaGoalLinkProps) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
      title={title}
      onClick={() => reachMetrikaGoal(goal)}
    >
      {children}
    </a>
  );
}

export function MetrikaInternalLink({ href, goal, className, children }: MetrikaGoalLinkProps) {
  return <Link href={href} className={className} onClick={() => reachMetrikaGoal(goal)}>{children}</Link>;
}
