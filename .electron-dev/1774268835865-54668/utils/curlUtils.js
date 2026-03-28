"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCurl = void 0;
exports.deepVariableReplacer = deepVariableReplacer;
exports.getByPath = getByPath;
const curl_to_json_1 = __importDefault(require("@bany/curl-to-json"));
/**
 * Validates if the cURL command is parseable and contains required variables
 */
const validateCurl = (curl) => {
    if (!curl || !curl.trim()) {
        return { isValid: false, message: "Command cannot be empty." };
    }
    if (!curl.trim().toLowerCase().startsWith("curl")) {
        return { isValid: false, message: "Command must start with 'curl'." };
    }
    try {
        const json = (0, curl_to_json_1.default)(curl);
        // Ensure {{TEXT}} is present so we can inject the prompt
        // We check the raw string for the placeholder because it might be in url, header, or body
        if (!curl.includes("{{TEXT}}")) {
            return {
                isValid: false,
                message: "Your cURL must contain {{TEXT}} placeholder for the prompt."
            };
        }
        return { isValid: true, json };
    }
    catch (error) {
        return { isValid: false, message: "Invalid cURL syntax." };
    }
};
exports.validateCurl = validateCurl;
/**
 * Replaces {{KEY}} placeholders with actual values
 */
function deepVariableReplacer(node, variables) {
    if (typeof node === "string") {
        let result = node;
        for (const [key, value] of Object.entries(variables)) {
            // Global replace of {{KEY}}
            result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
        }
        return result;
    }
    if (Array.isArray(node)) {
        return node.map((item) => deepVariableReplacer(item, variables));
    }
    if (node && typeof node === "object") {
        const newNode = {};
        for (const key in node) {
            newNode[key] = deepVariableReplacer(node[key], variables);
        }
        return newNode;
    }
    return node;
}
/**
 * Helper to traverse a JSON object via dot notation (e.g. "choices[0].message.content")
 */
function getByPath(obj, path) {
    if (!path)
        return obj;
    return path
        .replace(/\[/g, ".")
        .replace(/\]/g, "")
        .split(".")
        .reduce((o, k) => (o || {})[k], obj);
}
//# sourceMappingURL=curlUtils.js.map
