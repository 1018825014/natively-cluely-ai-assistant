import fs from "fs";
import path from "path";
import { ParsedAssetContent, ProjectAssetKind } from "./types";

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".yml",
  ".yaml",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".kts",
  ".sql",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".sh",
  ".ps1",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".xml",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);

const REPO_EXCLUDE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  "coverage",
  "target",
  "out",
  ".idea",
  ".vscode",
  "__pycache__",
  ".venv",
  "venv",
  ".gradle",
  ".yarn",
  "vendor",
]);

const MAX_FILE_BYTES = 300 * 1024;
const MAX_REPO_FILES = 240;

function cleanText(text: string): string {
  return text.replace(/\u0000/g, " ").replace(/\r/g, "").trim();
}

function summarizeRelativePath(relativePath: string, content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  const preview = lines.join(" ").slice(0, 320);
  return `File: ${relativePath}\nPreview: ${preview}`;
}

async function parsePdf(filePath: string): Promise<string> {
  const pdfParse = require("pdf-parse");
  const buffer = await fs.promises.readFile(filePath);
  const result = await pdfParse(buffer);
  return cleanText(result?.text || "");
}

async function parseDocx(filePath: string): Promise<string> {
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  return cleanText(result?.value || "");
}

async function parseNotebook(filePath: string): Promise<string> {
  const raw = await fs.promises.readFile(filePath, "utf8");
  const notebook = JSON.parse(raw);
  const cells = Array.isArray(notebook?.cells) ? notebook.cells : [];
  const parts = cells.map((cell: any, index: number) => {
    const cellType = cell?.cell_type || "unknown";
    const source = Array.isArray(cell?.source) ? cell.source.join("") : String(cell?.source || "");
    return `Cell ${index + 1} (${cellType})\n${source}`;
  });
  return cleanText(parts.join("\n\n"));
}

async function parseImage(filePath: string): Promise<string> {
  try {
    const tesseract = require("tesseract.js");
    const result = await tesseract.recognize(filePath, "eng+chi_sim");
    return cleanText(result?.data?.text || "");
  } catch (error) {
    console.warn("[ProjectAssetParser] OCR unavailable for image:", filePath, error);
    return "";
  }
}

async function parseTextFile(filePath: string): Promise<string> {
  const content = await fs.promises.readFile(filePath, "utf8");
  return cleanText(content);
}

export class ProjectAssetParser {
  public static inferAssetKind(filePath: string, forceCode: boolean = false): ProjectAssetKind {
    const ext = path.extname(filePath).toLowerCase();

    if (forceCode) return "code_file";
    if (ext === ".pdf") return "pdf";
    if (ext === ".docx") return "docx";
    if (ext === ".ipynb") return "ipynb";
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (ext === ".md" || ext === ".markdown") return "md";
    if (ext === ".txt") return "txt";
    if (TEXT_EXTENSIONS.has(ext)) return "text";

    return "text";
  }

  public static async parseFile(filePath: string, forceCode: boolean = false): Promise<ParsedAssetContent> {
    const resolvedPath = path.resolve(filePath);
    const name = path.basename(resolvedPath);
    const kind = this.inferAssetKind(resolvedPath, forceCode);
    let text = "";

    if (kind === "pdf") {
      text = await parsePdf(resolvedPath);
    } else if (kind === "docx") {
      text = await parseDocx(resolvedPath);
    } else if (kind === "ipynb") {
      text = await parseNotebook(resolvedPath);
    } else if (kind === "image") {
      text = await parseImage(resolvedPath);
    } else {
      text = await parseTextFile(resolvedPath);
    }

    return {
      kind,
      name,
      sourcePath: resolvedPath,
      text,
      metadata: {
        ext: path.extname(resolvedPath).toLowerCase(),
        fileName: name,
      },
    };
  }

  public static async parseRepo(repoPath: string): Promise<ParsedAssetContent[]> {
    const resolvedRoot = path.resolve(repoPath);
    const results: ParsedAssetContent[] = [];
    const discoveredFiles: string[] = [];

    const walk = async (currentPath: string) => {
      if (discoveredFiles.length >= MAX_REPO_FILES) return;

      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (discoveredFiles.length >= MAX_REPO_FILES) break;

        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          if (REPO_EXCLUDE_DIRS.has(entry.name)) continue;
          await walk(fullPath);
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext) && ext !== ".ipynb") continue;

        const stat = await fs.promises.stat(fullPath);
        if (stat.size > MAX_FILE_BYTES) continue;
        discoveredFiles.push(fullPath);
      }
    };

    await walk(resolvedRoot);

    for (const filePath of discoveredFiles) {
      const parsed = await this.parseFile(filePath, true);
      const relativePath = path.relative(resolvedRoot, filePath).replace(/\\/g, "/");
      results.push({
        ...parsed,
        kind: "code_file",
        name: relativePath,
        metadata: {
          ...(parsed.metadata || {}),
          relativePath,
          repoRoot: resolvedRoot,
          repoName: path.basename(resolvedRoot),
          repoSummary: summarizeRelativePath(relativePath, parsed.text),
        },
      });
    }

    const repoSummary = results
      .slice(0, 24)
      .map((asset) => `- ${asset.name}`)
      .join("\n");

    results.unshift({
      kind: "repo",
      name: path.basename(resolvedRoot),
      sourcePath: resolvedRoot,
      text: cleanText(`Repository root: ${resolvedRoot}\nIndexed files:\n${repoSummary}`),
      metadata: {
        repoRoot: resolvedRoot,
        repoName: path.basename(resolvedRoot),
        indexedFileCount: results.length,
      },
    });

    return results;
  }
}
