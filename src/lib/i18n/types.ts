export type Lang = "en" | "hi" | "mr";

export const LANGUAGES = [
  { code: "en" as Lang, label: "English" },
  { code: "hi" as Lang, label: "हिन्दी" },
  { code: "mr" as Lang, label: "मराठी" },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Dict {
  nav: Record<string, string>;
  footer: Record<string, string>;
  common: Record<string, string>;
  home: Record<string, string>;
  login: Record<string, string>;
  quiz: Record<string, any>;
  articles: Record<string, string>;
  report: Record<string, any>;
  linkChecker: Record<string, string>;
  scamChatbot: Record<string, any>;
  qrScanner: Record<string, any>;
  heatmap: Record<string, any>;
  safetyScanner: Record<string, any>;
  chatbot: Record<string, string>;
  ident: Record<string, string>;
  lib: Record<string, any>;
}
