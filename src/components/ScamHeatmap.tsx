"use client";

type HeatmapProps = {
  categories: string[];
  platforms: string[];
  matrix: Record<string, Record<string, number>>;
  maxValue: number;
};

/** Maps an intensity level (0–5) to a Tailwind class string.
 *  All class strings are written literally so Tailwind can detect them. */
function cellClasses(level: number): string {
  switch (level) {
    case 0:
      return "bg-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-600";
    case 1:
      return "bg-teal-950/40 text-teal-200";
    case 2:
      return "bg-teal-900/60 text-teal-100";
    case 3:
      return "bg-teal-800/80 text-white";
    case 4:
      return "bg-teal-700 text-white";
    default:
      return "bg-teal-500 text-black";
  }
}

const LEGEND_ITEMS: { label: string; cls: string }[] = [
  { label: "0", cls: "bg-zinc-200 dark:bg-zinc-900" },
  { label: "Low", cls: "bg-teal-950/40 ring-1 ring-teal-800" },
  { label: "", cls: "bg-teal-900/60" },
  { label: "Medium", cls: "bg-teal-800/80" },
  { label: "", cls: "bg-teal-700" },
  { label: "High", cls: "bg-teal-500" },
];

export default function ScamHeatmap({
  categories,
  platforms,
  matrix,
  maxValue,
}: HeatmapProps) {
  if (categories.length === 0 || platforms.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        No data available to display heatmap. Submit scam reports to see the
        heatmap visualization.
      </div>
    );
  }

  function getLevel(count: number): number {
    if (maxValue === 0) return 0;
    return Math.min(5, Math.ceil((count / maxValue) * 5));
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-44" />
            {platforms.map((p) => (
              <th
                key={p}
                className="px-2 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400"
              >
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat}>
              <td className="pr-3 text-right text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {cat}
              </td>
              {platforms.map((plat) => {
                const count = matrix[cat]?.[plat] ?? 0;
                const level = getLevel(count);
                return (
                  <td
                    key={plat}
                    className={`rounded-lg p-3 text-center text-sm font-semibold transition ${cellClasses(level)}`}
                    title={`${cat} × ${plat}: ${count} report(s)`}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-1.5 text-xs text-zinc-500">
        <span className="mr-1">Less</span>
        {LEGEND_ITEMS.map((item, i) => (
          <span
            key={i}
            className={`inline-block h-4 w-6 rounded ${item.cls}`}
            title={item.label}
          />
        ))}
        <span className="ml-1">More</span>
      </div>
    </div>
  );
}
