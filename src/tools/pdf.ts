// src/tools/pdf.ts — extract text from a PDF file using pdfjs-dist.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

function resolvePath(input: string) {
  if (input.startsWith("~")) {
    return path.join(os.homedir(), input.slice(1).replace(/^\/+/, ""));
  }
  return path.resolve(input);
}

export async function readPdf({ path: target, maxChars = 20000 }: { path?: string; maxChars?: number } = {}) {
  if (!target) return "Tell me which PDF to read.";
  const filePath = resolvePath(target);
  try {
    await fs.access(filePath);
  } catch {
    return `No file at ${filePath}.`;
  }

  try {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const buf = await fs.readFile(filePath);
    const data = new Uint8Array(buf);
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
      text += pageText + "\n";
      if (text.length >= maxChars) break;
    }

    const trimmed = text.trim();
    if (!trimmed) return `No extractable text in ${path.basename(filePath)} (may be a scanned PDF).`;
    return {
      path: filePath,
      pages: doc.numPages,
      text: trimmed.slice(0, maxChars),
      truncated: trimmed.length > maxChars,
    };
  } catch (err: any) {
    return `Couldn't read ${filePath}: ${err.message}`;
  }
}
