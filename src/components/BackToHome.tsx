"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n/context";

/**
 * Reusable "← Back to home" link.
 *
 * Rendered as the FIRST element inside each module's main content container so
 * every page follows the same structure: Navbar → Back to home → title → content.
 * Keeping it in one component guarantees identical placement, styling and i18n
 * text across all NetGuard modules and prevents the old bottom-of-page link from
 * drifting or being duplicated.
 */
export default function BackToHome({ className = "" }: { className?: string }) {
  const { t } = useLang();
  return (
    <Link
      href="/"
      className={`inline-flex text-sm font-medium text-teal-700 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300 ${className}`}
    >
      {t.common.backToHome}
    </Link>
  );
}
