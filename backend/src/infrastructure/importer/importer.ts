import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class NeedsDescription extends Error {}

export function canonicalUrl(value: string) {
  const u = new URL(value);

  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error("Use a public HTTP or HTTPS link.");
  u.hash = "";

  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|trk$|trackingId$|refId$|rcm$)/i.test(key))
      u.searchParams.delete(key);

  return u.toString();
}

function blockedIp(ip: string) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");

  if (value.includes(":"))
    return (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe80") ||
      value.startsWith("::ffff:")
    );
  const [a, b] = value.split(".").map(Number);

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export async function validatePublicUrl(value: string) {
  const url = new URL(canonicalUrl(value));

  if (url.port && !["80", "443"].includes(url.port))
    throw new NeedsDescription(
      "This link uses an unsupported port. Paste the description.",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });

  if (!addresses.length || addresses.some((a) => blockedIp(a.address)))
    throw new NeedsDescription("Use a public job URL.");

  return url;
}

export function parsePage(html: string, url: string) {
  const $ = cheerio.load(html);
  const clean = (v: string) =>
    v
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim();
  const text = (selector: string) => {
    const node = $(selector).first().clone();

    node.find("br").replaceWith("\n");
    node.find("p,li").append("\n");

    return clean(node.text());
  };
  const structured: Record<string, any>[] = [];

  function walk(v: any) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if (v["@type"]) structured.push(v);

      if (v["@graph"]) walk(v["@graph"]);
    }
  }

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {}
  });

  const posting = structured.find((v) =>
    [v["@type"]].flat().includes("JobPosting"),
  );
  const article = structured.find((v) => v.articleBody);

  $("script,style,noscript,nav,footer,header,form").remove();
  const fromHtml = (v: string) => {
    const x = cheerio.load(v);

    x("br").replaceWith("\n");
    x("p,li").append("\n");

    return clean(x.text());
  };
  const candidates = [
    posting?.description ? fromHtml(posting.description) : "",
    article?.articleBody ?? "",
    text(".show-more-less-html__markup"),
    text(".description__text"),
    text(".attributed-text-segment-list__content"),
    text(".feed-shared-update-v2__description"),
    text(".break-words"),
    text("#jobDescriptionText"),
    text('[data-testid="job-description"]'),
    text("article"),
  ];
  // Metadata may be a preview only. Never turn a truncated preview into a full job description.
  const description = candidates.find((v) => v && v.length >= 100) || "";

  if (
    !description ||
    /^(sign in|entrar|join linkedin|cadastre-se)/i.test(description) ||
    description.endsWith("…")
  )
    throw new NeedsDescription(
      "Could not extract the full description. Open the job and paste its text to continue.",
    );
  const metaTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const isPost =
    new URL(url).hostname.endsWith("linkedin.com") &&
    /\/(posts|feed)\//.test(new URL(url).pathname);
  const title =
    posting?.title ||
    (isPost
      ? description
          .split("\n")[0]
          .replace(/^[^\p{L}\p{N}]+/u, "")
          .slice(0, 160)
      : text("h1") || metaTitle.split("|")[0].trim()) ||
    description.split("\n")[0].slice(0, 120);
  const company =
    posting?.hiringOrganization?.name || text(".topcard__org-name-link") || "";

  return {
    title: clean(title).slice(0, 200),
    company: clean(company).slice(0, 200),
    description: description.slice(0, 40000),
    url: canonicalUrl(url),
  };
}

export async function extractUrl(input: string) {
  let url = canonicalUrl(input);

  for (let redirect = 0; redirect < 6; redirect++) {
    await validatePublicUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ApplyKit/2.0)",
        Accept: "text/html",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location) break;
      url = canonicalUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok)
      throw new NeedsDescription(
        `The page returned HTTP ${response.status}. Paste the job description to continue.`,
      );

    if (!response.headers.get("content-type")?.includes("text/html"))
      throw new NeedsDescription(
        "The link did not return HTML. Paste the description.",
      );
    const reader = response.body?.getReader();

    if (!reader)
      throw new NeedsDescription("Empty page. Paste the description.");
    const chunks: Uint8Array[] = [];
    let size = 0;

    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;
      size += value.length;

      if (size > 4_000_000) {
        await reader.cancel();

        throw new NeedsDescription("Page too large. Paste the description.");
      }

      chunks.push(value);
    }

    return parsePage(Buffer.concat(chunks).toString("utf8"), url);
  }

  throw new NeedsDescription(
    "Could not resolve the link redirect. Paste the description.",
  );
}
