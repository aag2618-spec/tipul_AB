"use client";

import Link from "next/link";

interface SubBoxLinkProps {
  href: string;
  value: number;
  label: string;
  bgColor?: string;
  textColor?: string;
}

export function SubBoxLink({ href, value, label, bgColor, textColor }: SubBoxLinkProps) {
  return (
    <Link href={href}>
      <div className={`${bgColor || 'bg-primary/10'} rounded-lg px-3 py-2 text-center hover:opacity-80 transition-opacity relative z-10`}>
        <div className={`text-lg font-bold ${textColor || 'text-primary'}`}>{value}</div>
        <p className={`text-xs ${textColor ? textColor + '/70' : 'text-primary/70'}`}>{label}</p>
      </div>
    </Link>
  );
}
