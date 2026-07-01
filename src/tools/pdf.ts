// src/tools/pdf.ts — extract text from a PDF file using pdfjs-dist.
import fs from "node:fs/promises";
import path from "node:path";
import { sendDoc } from "../skills/ipc.js";
import { classifyPath, pathDeniedMessage, resolveUserPath } from "../skills/pathPolicy.js";
import { redactSensitiveText } from "../skills/redaction.js";

export async function readPdf({ path: target, maxChars = 20000 }: { path?: string; maxChars?: number } = {}) {
  if (!target) return "Tell me which PDF to read.";
  const filePath = resolveUserPath(target);
  const policy = classifyPath(filePath);
  if (!policy.allowed) return pathDeniedMessage(policy, "reading");

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
    const redacted = redactSensitiveText(trimmed.slice(0, maxChars));
    const out = redacted.text;
    // Put the text on the center stage so Miles can read it while Gwen talks.
    sendDoc({ title: path.basename(filePath), text: out, pages: doc.numPages });
    return {
      path: filePath,
      pages: doc.numPages,
      text: out,
      truncated: trimmed.length > maxChars,
      redacted: redacted.redacted,
      redactions: redacted.count,
    };
  } catch (err: any) {
    return `Couldn't read ${filePath}: ${err.message}`;
  }
}
