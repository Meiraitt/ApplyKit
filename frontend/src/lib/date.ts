export const date = (s?: string) =>
  s ? new Date(s).toLocaleDateString("en-GB") : "-";
