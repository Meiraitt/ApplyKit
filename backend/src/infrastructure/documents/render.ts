import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import puppeteer from "puppeteer";
import { env } from "../../config/config.js";
import type { Cv } from "../../domain/types.js";

const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function labels(cv: Cv) {
  return cv.language === "en"
    ? ["Professional summary", "Skills", "Experience", "Education", "Languages"]
    : [
        "Resumo profissional",
        "Competências",
        "Experiência",
        "Formação",
        "Idiomas",
      ];
}

const techLabel = (cv: Cv) =>
  cv.language === "en" ? "Technologies used" : "Tecnologias utilizadas";

export function cvHtml(cv: Cv) {
  const t = labels(cv);

  return `<!doctype html><html lang="${cv.language}"><head><meta charset="utf-8"><title>CV - ${escape(cv.name)}</title><style>
@page{size:A4;margin:13mm 15mm}*{box-sizing:border-box}body{font-family:"Times New Roman","Liberation Serif",serif;color:#000;font-size:11pt;line-height:1.18;margin:0;font-variant-ligatures:none}header{text-align:center;margin-bottom:12px}h1{font-size:25pt;margin:0 0 3px;font-weight:normal}h2{font-size:12pt;margin:11px 0 5px;border-bottom:.6pt solid #000;padding-bottom:2px;break-after:avoid}h3{font-size:11pt;margin:8px 0 2px;break-after:avoid;display:flex;justify-content:space-between;gap:12px}h3 span{font-size:10pt;font-weight:normal;white-space:nowrap}p{margin:3px 0}.role{font-style:italic;break-after:avoid}.stack,.contact{font-size:9.5pt;line-height:1.2;overflow-wrap:anywhere}.contact{margin-top:5px}ul{padding-left:16px;margin:4px 0}li{padding-left:1px;margin:2px 0;break-inside:avoid}.stack{margin:4px 0 6px}
</style></head><body><header><h1>${escape(cv.name)}</h1><p>${escape(cv.headline)}</p><p class="contact">${Object.values(cv.contact).map(escape).join(" | ")}</p></header><h2>${t[0]}</h2><p>${escape(cv.summary)}</p><h2>${t[2]}</h2>${cv.experiences.map((e) => `<section><h3>${escape(e.company)}<span>${escape(e.period)}</span></h3><p class="role">${escape(e.role)}</p><ul>${e.bullets.map((b) => `<li>${escape(b)}</li>`).join("")}</ul>${e.technologies?.length ? `<p class="stack">${techLabel(cv)}: ${e.technologies.map(escape).join(" · ")}</p>` : ""}</section>`).join("")}${cv.studies?.length ? `<h2>${t[1]}</h2><p>${cv.studies.map(escape).join(" · ")}</p>` : ""}<h2>${t[3]}</h2>${cv.education.map((e) => `<p>${escape(e)}</p>`).join("")}${cv.languages.length ? `<h2>${t[4]}</h2><p>${cv.languages.map(escape).join(" · ")}</p>` : ""}</body></html>`;
}

export async function docxBuffer(cv: Cv) {
  const t = labels(cv),
    font = "Times New Roman";
  const heading = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: 140, after: 65 },
      border: {
        bottom: {
          color: "000000",
          style: BorderStyle.SINGLE,
          size: 4,
          space: 2,
        },
      },
    });
  const doc = new Document({
    creator: "ApplyKit",
    title: `Currículo - ${cv.name}`,
    styles: {
      default: {
        document: {
          run: { font, size: 22, color: "000000" },
          paragraph: { spacing: { after: 55, line: 260 } },
        },
        heading2: { run: { font, size: 24, bold: true, color: "000000" } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 737, right: 850, bottom: 737, left: 850 },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: cv.name, font, size: 50, color: "000000" }),
            ],
            spacing: { after: 40 },
          }),
          new Paragraph({ text: cv.headline, alignment: AlignmentType.CENTER }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: Object.values(cv.contact).join(" | "),
                size: 19,
              }),
            ],
          }),
          heading(t[0]),
          new Paragraph(cv.summary),
          heading(t[2]),
          ...cv.experiences.flatMap((e) => [
            new Paragraph({
              children: [
                new TextRun({ text: e.company, bold: true }),
                new TextRun({ text: "\t" + e.period, size: 20 }),
              ],
              tabStops: [{ type: TabStopType.RIGHT, position: 10206 }],
              keepNext: true,
              spacing: { before: 100, after: 30 },
            }),
            new Paragraph({
              children: [new TextRun({ text: e.role, italics: true })],
              keepNext: true,
            }),
            ...e.bullets.map(
              (text) =>
                new Paragraph({
                  text,
                  bullet: { level: 0 },
                  keepLines: true,
                  spacing: { after: 35, line: 250 },
                }),
            ),
            ...(e.technologies?.length
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${techLabel(cv)}: ${e.technologies.join(" · ")}`,
                        size: 19,
                      }),
                    ],
                    keepLines: true,
                  }),
                ]
              : []),
          ]),
          ...(cv.studies?.length
            ? [heading(t[1]), new Paragraph(cv.studies.join(" · "))]
            : []),
          heading(t[3]),
          ...cv.education.map((text) => new Paragraph(text)),
          ...(cv.languages.length
            ? [heading(t[4]), new Paragraph(cv.languages.join(" · "))]
            : []),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

const normalized = (s: string) =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim();

export function expectedPdfBlocks(cv: Cv) {
  const t = labels(cv);

  return [
    cv.name,
    cv.headline,
    ...Object.values(cv.contact),
    t[0],
    cv.summary,
    t[2],
    ...cv.experiences.flatMap((e) => [
      e.company,
      e.period,
      e.role,
      ...e.bullets,
      ...(e.technologies?.length
        ? [`${techLabel(cv)}: ${e.technologies.join(" · ")}`]
        : []),
    ]),
    ...(cv.studies?.length ? [t[1], cv.studies.join(" · ")] : []),
    t[3],
    ...cv.education,
    ...(cv.languages.length ? [t[4], cv.languages.join(" · ")] : []),
  ];
}

export function verifyExtractedText(text: string, cv: Cv) {
  const actual = normalized(text);
  let cursor = 0;
  const blocks = expectedPdfBlocks(cv);

  if (actual.includes("�")) throw new Error("PDF contains invalid characters.");

  for (const block of blocks) {
    const at = actual.indexOf(normalized(block), cursor);

    if (at < 0)
      throw new Error(
        `PDF does not reproduce the approved content or order: ${block.slice(0, 100)}`,
      );
    cursor = at + normalized(block).length;
  }

  return blocks.length;
}

export class PdfPageOverflow extends Error {
  constructor(readonly pages: number) {
    super(`PDF contains ${pages} A4 pages. Shorten content to fit one page.`);
  }
}

export async function verifyPdf(pdf: Uint8Array, cv: Cv) {
  const document = await getDocument({
    data: Uint8Array.from(pdf),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  try {
    if (document.numPages !== 1) throw new PdfPageOverflow(document.numPages);
    const texts: string[] = [];

    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i),
        content = await page.getTextContent();

      texts.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
    }

    return {
      pages: document.numPages,
      textVerified: true,
      checkedBlocks: verifyExtractedText(texts.join(" "), cv),
    };
  } finally {
    await document.destroy();
  }
}

// Keep standard spacing when it fits. Both alternatives keep the original body font size.
const compactPdfStyles = [
  `@page { margin: 11mm 13mm } body { line-height: 1.13 }
   header { margin-bottom: 7px } h2 { margin: 7px 0 3px }
   h3 { margin: 5px 0 1px } p, li { margin: 1px 0 }
   ul, .stack { margin: 2px 0 }`,
  `@page { margin: 10mm 11mm } body { line-height: 1.09 }
   header { margin-bottom: 4px } h1 { font-size: 22pt }
   h2 { margin: 5px 0 2px } h3 { margin: 3px 0 1px }`,
];

export async function renderPdf(cv: Cv) {
  const browser = await puppeteer.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.setContent(cvHtml(cv), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    for (const style of ["", ...compactPdfStyles]) {
      if (style) await page.addStyleTag({ content: style });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });

      try {
        return { pdf, validation: await verifyPdf(pdf, cv) };
      } catch (error) {
        if (
          !(error instanceof PdfPageOverflow) ||
          style === compactPdfStyles.at(-1)
        )
          throw error;
      }
    }

    throw new Error("No PDF layout available.");
  } finally {
    await browser.close();
  }
}

export async function renderArtifacts(id: string, cv: Cv) {
  await mkdir(env.artifactDir, { recursive: true });
  const { pdf, validation } = await renderPdf(cv);
  const docx = await docxBuffer(cv);

  await Promise.all([
    writeFile(resolve(env.artifactDir, `${id}.pdf`), pdf),
    writeFile(resolve(env.artifactDir, `${id}.docx`), docx),
    writeFile(
      resolve(env.artifactDir, `${id}.json`),
      JSON.stringify(cv, null, 2),
    ),
  ]);

  return { pdf: `${id}.pdf`, docx: `${id}.docx`, validation };
}
