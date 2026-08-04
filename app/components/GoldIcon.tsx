"use client";

import type { SVGProps } from "react";

export type IconName =
  | "agent"
  | "dashboard"
  | "knowledge"
  | "briefings"
  | "email"
  | "chat"
  | "history"
  | "report"
  | "analyzer"
  | "competitor"
  | "legal"
  | "think"
  | "react"
  | "search"
  | "translate"
  | "format"
  | "dictionary"
  | "travel"
  | "graphics"
  | "vision"
  | "security"
  | "calculator"
  | "clock"
  | "web"
  | "page"
  | "image"
  | "download"
  | "weather"
  | "currency"
  | "holiday"
  | "mail"
  | "folder"
  | "copy"
  | "spark";

const paths: Record<Exclude<IconName, "agent">, string> = {
  dashboard: "M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-3H4v3Z",
  knowledge: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0A2.5 2.5 0 0 1 6.5 8H20",
  briefings: "M5 4h14v16H5z M8 8h8M8 12h8M8 16h5",
  email: "M4 6h16v12H4z M4 7l8 6 8-6",
  chat: "M5 5h14v10H9l-4 4V5Z",
  history: "M4 12a8 8 0 1 0 2.35-5.65M4 5v4h4 M12 7v5l3 2",
  report: "M5 19V5h14v14H5Zm3-3v-4m4 4V8m4 8v-6",
  analyzer: "m4 19 5-5 3 3 8-9 M16 8h4v4",
  competitor: "M4 20V8l8-4 8 4v12H4Zm5 0v-6h6v6M8 10h1m6 0h1",
  legal: "M12 4v15M7 20h10M5 8h14M5 8l-3 6h6L5 8Zm14 0-3 6h6l-3-6Z",
  think: "M9 18h6M10 21h4M8 14.5A6 6 0 1 1 16 15c-1.3.8-2 1.6-2 3H10c0-1.4-.7-2.2-2-3.5Z",
  react: "M7 7h10l-2-2m2 2-2 2M17 17H7l2 2m-2-2 2-2",
  search: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z",
  translate: "M4 5h8M8 3v2m-3 0c.8 3 2.5 5.3 5 7M6 10l-2 4m8-4-2-4m7-4v14m-3-3h6",
  format: "M5 4h14v16H5z M8 8h8M8 12h6M8 16h4",
  dictionary: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 0V4Zm0 0v16",
  travel: "m12 3 3 7 6 2-6 2-3 7-3-7-6-2 6-2 3-7Z",
  graphics: "M4 5h16v14H4z M7 16l3-4 2 2 2-3 3 5 M8 9h.01",
  vision: "M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  security: "M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z M9 12l2 2 4-4",
  calculator: "M5 3h14v18H5z M8 7h8M8 11h2m2 0h2m2 0h2M8 15h2m2 0h2m2 0h2M8 19h8",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  web: "M4 5h16v14H4z M4 9h16M8 5v4m4-4v4m4-4v4",
  page: "M6 3h9l3 3v15H6z M15 3v4h4M9 12h6M9 16h6",
  image: "M4 5h16v14H4z M7 16l3-4 2 2 2-3 3 5 M8 9h.01",
  download: "M12 3v11m0 0 4-4m-4 4-4-4M5 19h14",
  weather: "M7 18a4 4 0 1 1 1.2-7.8A5 5 0 0 1 18 12h.5a3.5 3.5 0 0 1 0 7H7Zm5-15v2m-6.4.6 1.4 1.4m11.4-1.4-1.4 1.4M3 10h2",
  currency: "M12 3v18M16 7.5c0-1.4-1.7-2.5-4-2.5S8 6.1 8 7.5s1.7 2.5 4 2.5 4 1.1 4 2.5-1.7 2.5-4 2.5-4-1.1-4-2.5",
  holiday: "M5 4h14v16H5z M8 2v4m8-4v4M5 9h14M8 13h2m2 0h2m2 0h2M8 17h2",
  mail: "M4 6h16v12H4z M4 7l8 6 8-6",
  folder: "M3 6h7l2 2h9v10H3z",
  copy: "M8 8h11v12H8z M5 16H4V4h11v1",
  spark: "m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z",
};

export function GoldIcon({ name, size = 20, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  if (name === "agent") {
    return (
      <svg aria-hidden="true" className="gold-icon" fill="none" height={size} viewBox="0 0 32 32" width={size} {...props}>
        <path d="M16 5V2M13 2h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <rect fill="currentColor" fillOpacity=".12" height="20" rx="6" stroke="currentColor" strokeWidth="1.8" width="24" x="4" y="8" />
        <rect fill="currentColor" fillOpacity=".18" height="10" rx="3" width="18" x="7" y="12" />
        <circle cx="12" cy="17" fill="currentColor" r="1.5" />
        <circle cx="20" cy="17" fill="currentColor" r="1.5" />
        <path d="M12 22h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="gold-icon" fill="none" height={size} viewBox="0 0 24 24" width={size} {...props}>
      <path d={paths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
