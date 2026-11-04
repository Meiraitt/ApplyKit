export type RoleFocus = "frontend" | "backend" | "fullstack" | "general";

// Explicit role names take precedence over incidental technologies in the description.
export function roleFocus(title: string, description = ""): RoleFocus {
  if (/full[\s-]?stack|node.*react|react.*node/i.test(title))
    return "fullstack";

  if (/front[\s-]?end/i.test(title)) return "frontend";

  if (/back[\s-]?end/i.test(title)) return "backend";

  if (/\bReact\b/i.test(title) && !/\bNode\b|NestJS/i.test(title))
    return "frontend";

  if (/\bNode(?:\.?js)?\b|NestJS/i.test(title)) return "backend";
  const opening = description
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  if (/full[\s-]?stack/i.test(opening)) return "fullstack";

  if (/front[\s-]?end/i.test(opening) && !/back[\s-]?end/i.test(opening))
    return "frontend";

  if (/back[\s-]?end/i.test(opening) && !/front[\s-]?end/i.test(opening))
    return "backend";

  return "general";
}
