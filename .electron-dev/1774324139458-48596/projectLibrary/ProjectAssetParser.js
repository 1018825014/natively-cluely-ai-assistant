"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectAssetParser = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
function cleanText(text) {
    return text.replace(/\u0000/g, " ").replace(/\r/g, "").trim();
}
function summarizeRelativePath(relativePath, content) {
    const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8);
    const preview = lines.join(" ").slice(0, 320);
    return `File: ${relativePath}\nPreview: ${preview}`;
}
async function parsePdf(filePath) {
    const pdfParse = require("pdf-parse");
    const buffer = await fs_1.default.promises.readFile(filePath);
    const result = await pdfParse(buffer);
    return cleanText(result?.text || "");
}
async function parseDocx(filePath) {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return cleanText(result?.value || "");
}
async function parseNotebook(filePath) {
    const raw = await fs_1.default.promises.readFile(filePath, "utf8");
    const notebook = JSON.parse(raw);
    const cells = Array.isArray(notebook?.cells) ? notebook.cells : [];
    const parts = cells.map((cell, index) => {
        const cellType = cell?.cell_type || "unknown";
        const source = Array.isArray(cell?.source) ? cell.source.join("") : String(cell?.source || "");
        return `Cell ${index + 1} (${cellType})\n${source}`;
    });
    return cleanText(parts.join("\n\n"));
}
async function parseImage(filePath) {
    try {
        const tesseract = require("tesseract.js");
        const result = await tesseract.recognize(filePath, "eng+chi_sim");
        return cleanText(result?.data?.text || "");
    }
    catch (error) {
        console.warn("[ProjectAssetParser] OCR unavailable for image:", filePath, error);
        return "";
    }
}
async function parseTextFile(filePath) {
    const content = await fs_1.default.promises.readFile(filePath, "utf8");
    return cleanText(content);
}
class ProjectAssetParser {
    static inferAssetKind(filePath, forceCode = false) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        if (forceCode)
            return "code_file";
        if (ext === ".pdf")
            return "pdf";
        if (ext === ".docx")
            return "docx";
        if (ext === ".ipynb")
            return "ipynb";
        if (IMAGE_EXTENSIONS.has(ext))
            return "image";
        if (ext === ".md" || ext === ".markdown")
            return "md";
        if (ext === ".txt")
            return "txt";
        if (TEXT_EXTENSIONS.has(ext))
            return "text";
        return "text";
    }
    static async parseFile(filePath, forceCode = false) {
        const resolvedPath = path_1.default.resolve(filePath);
        const name = path_1.default.basename(resolvedPath);
        const kind = this.inferAssetKind(resolvedPath, forceCode);
        let text = "";
        if (kind === "pdf") {
            text = await parsePdf(resolvedPath);
        }
        else if (kind === "docx") {
            text = await parseDocx(resolvedPath);
        }
        else if (kind === "ipynb") {
            text = await parseNotebook(resolvedPath);
        }
        else if (kind === "image") {
            text = await parseImage(resolvedPath);
        }
        else {
            text = await parseTextFile(resolvedPath);
        }
        return {
            kind,
            name,
            sourcePath: resolvedPath,
            text,
            metadata: {
                ext: path_1.default.extname(resolvedPath).toLowerCase(),
                fileName: name,
            },
        };
    }
    static async parseRepo(repoPath) {
        const resolvedRoot = path_1.default.resolve(repoPath);
        const results = [];
        const discoveredFiles = [];
        const walk = async (currentPath) => {
            if (discoveredFiles.length >= MAX_REPO_FILES)
                return;
            const entries = await fs_1.default.promises.readdir(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                if (discoveredFiles.length >= MAX_REPO_FILES)
                    break;
                const fullPath = path_1.default.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    if (REPO_EXCLUDE_DIRS.has(entry.name))
                        continue;
                    await walk(fullPath);
                    continue;
                }
                const ext = path_1.default.extname(entry.name).toLowerCase();
                if (!TEXT_EXTENSIONS.has(ext) && ext !== ".ipynb")
                    continue;
                const stat = await fs_1.default.promises.stat(fullPath);
                if (stat.size > MAX_FILE_BYTES)
                    continue;
                discoveredFiles.push(fullPath);
            }
        };
        await walk(resolvedRoot);
        for (const filePath of discoveredFiles) {
            const parsed = await this.parseFile(filePath, true);
            const relativePath = path_1.default.relative(resolvedRoot, filePath).replace(/\\/g, "/");
            results.push({
                ...parsed,
                kind: "code_file",
                name: relativePath,
                metadata: {
                    ...(parsed.metadata || {}),
                    relativePath,
                    repoRoot: resolvedRoot,
                    repoName: path_1.default.basename(resolvedRoot),
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
            name: path_1.default.basename(resolvedRoot),
            sourcePath: resolvedRoot,
            text: cleanText(`Repository root: ${resolvedRoot}\nIndexed files:\n${repoSummary}`),
            metadata: {
                repoRoot: resolvedRoot,
                repoName: path_1.default.basename(resolvedRoot),
                indexedFileCount: results.length,
            },
        });
        return results;
    }
}
exports.ProjectAssetParser = ProjectAssetParser;
//# sourceMappingURL=ProjectAssetParser.js.map