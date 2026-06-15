import React from 'react';

export const KnifeIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <g transform="rotate(-45 12 12)">
      <rect x="16" y="10" width="6" height="4" rx="1" />
      <path d="M16 10 L4 10 C3 10 2 14 6 14 L16 14 Z" />
      <circle cx="18" cy="12" r="0.5" fill="currentColor"/>
      <circle cx="20" cy="12" r="0.5" fill="currentColor"/>
    </g>
  </svg>
);

export const PlierIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* Simple plier path */}
    <path d="M6 18c0-3 2-6 6-9" />
    <path d="M18 18c0-3-2-6-6-9" />
    <path d="M11 5l1 4 1-4-1-2-1 2z" />
    <path d="M10 9h4" />
    <circle cx="12" cy="9" r="1" />
  </svg>
);
