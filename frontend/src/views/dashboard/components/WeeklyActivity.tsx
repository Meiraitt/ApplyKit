import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DashboardData = {
  timezone: string;
  totals: { saved: number; applied: number; pending: number; ready: number };
  weekly: { week: string; saved: number; applied: number }[];
};
const label = (week: string) =>
  new Date(week + "T12:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
  });

export function Dashboard({
  data,
  weeks,
  onWeeks,
}: {
  data?: DashboardData;
  weeks: number;
  onWeeks: (n: number) => void;
}) {
  if (!data)
    return (
      <p className="col-span-full rounded-md border border-dashed border-line px-5 py-10 text-center text-muted [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-[#d6ddda] [&_p]:mb-0">
        Loading overview…
      </p>
    );
  const last = data.weekly.at(-1);

  return (
    <>
      <div className="mb-6 grid min-w-0 grid-cols-2 rounded-lg border border-line bg-panel tablet:grid-cols-4">
        {[
          [data.totals.saved, "Saved jobs"],
          [data.totals.applied, "Applications"],
          [data.totals.pending, "Not applied"],
          [data.totals.ready, "Approved CV"],
        ].map(([value, title]) => (
          <div
            className="flex min-w-0 flex-col gap-3.5 border-r border-line p-4.5 last:border-r-0 max-tablet:even:border-r-0 max-tablet:nth-[-n+2]:border-b desktop:px-6 desktop:py-5 [&_span]:text-xs [&_span]:text-muted [&_span]:wrap-anywhere [&_strong]:text-[27px] [&_strong]:leading-none [&_strong]:font-medium [&_strong]:tracking-tight [&_strong]:tabular-nums desktop:[&_strong]:text-3xl"
            key={title}
          >
            <span>{title}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="min-w-0 rounded-lg border border-line bg-panel px-3 pt-4.5 pb-3 desktop:px-6 desktop:pt-6 desktop:pb-3.5">
        <div className="mb-4.5 flex flex-wrap items-center justify-between gap-4 [&_h3]:m-0 [&_p]:mt-2 [&_p]:mb-0 [&_select]:m-0 [&_select]:w-auto [&_select]:min-h-10 [&_select]:p-2 [&_select]:text-[13px]">
          <div>
            <h2>Weekly activity</h2>
            <p className="text-xs leading-relaxed text-muted">
              {last?.saved ?? 0} saved and {last?.applied ?? 0} applied this
              week.
            </p>
          </div>
          <select
            aria-label="Chart period"
            value={weeks}
            onChange={(e) => onWeeks(Number(e.target.value))}
          >
            <option value={4}>4 weeks</option>
            <option value={8}>8 weeks</option>
            <option value={12}>12 weeks</option>
          </select>
        </div>
        <div className="mt-4.5 mb-1 flex gap-5 text-xs text-muted [&_span]:flex [&_span]:items-center [&_span]:gap-2 [&_i]:size-2 [&_i]:rounded-xs">
          <span>
            <i className="bg-[#89989e]" />
            Saved jobs
          </span>
          <span>
            <i className="bg-[#85bd9c]" />
            Applications
          </span>
        </div>
        <div
          className="h-[220px] w-full min-w-0 max-w-full"
          aria-label="Weekly chart of saved jobs and applications"
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={data.weekly}
              barGap={5}
              margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid stroke="#303638" vertical={false} />
              <XAxis
                dataKey="week"
                tickFormatter={label}
                tick={{ fill: "#a8b0b2", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#a8b0b2", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "#ffffff05" }}
                contentStyle={{
                  background: "#202628",
                  border: "1px solid #495254",
                  borderRadius: 6,
                  color: "#f0f3f1",
                }}
                labelFormatter={(v) => "Week of " + label(String(v))}
              />
              <Bar
                dataKey="saved"
                name="Saved jobs"
                fill="#89989e"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
              <Bar
                dataKey="applied"
                name="Applications"
                fill="#85bd9c"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-5 flex flex-col flex-wrap justify-between gap-1 text-[11px] text-[#9ba5a7] desktop:flex-row desktop:gap-3">
          <span>Monday–Sunday weeks · America/Sao_Paulo time</span>
          <span>Current week in progress</span>
        </div>
        <details className="mt-4 text-xs [&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border-b [&_td]:border-line [&_td]:px-1 [&_td]:py-2 [&_td]:text-left [&_th]:border-b [&_th]:border-line [&_th]:px-1 [&_th]:py-2 [&_th]:text-left">
          <summary>View data table</summary>
          <table>
            <thead>
              <tr>
                <th>Week of</th>
                <th>Saved</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {data.weekly.map((w) => (
                <tr key={w.week}>
                  <td>{label(w.week)}</td>
                  <td>{w.saved}</td>
                  <td>{w.applied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </>
  );
}
