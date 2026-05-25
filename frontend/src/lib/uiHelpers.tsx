/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function syntaxHighlight(code: string, language: string): string {
  const escaped = escapeHtml(code);
  const keywordSets: Record<string, string[]> = {
    python: ["def", "class", "return", "from", "import", "as", "if", "elif", "else", "for", "while", "try", "except", "with", "lambda", "yield", "await", "async", "pass", "raise", "in", "is", "not", "and", "or", "None", "True", "False"],
    javascript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "try", "catch", "finally", "class", "extends", "new", "import", "from", "export", "async", "await", "switch", "case", "break", "continue", "of", "in", "null", "true", "false"],
    typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "try", "catch", "finally", "class", "extends", "new", "import", "from", "export", "async", "await", "type", "interface", "enum", "implements", "private", "public", "protected", "readonly", "null", "true", "false"],
  };
  const keywords = keywordSets[language] ?? keywordSets.javascript;

  let highlighted = escaped.replace(/(`[^`]+`)/g, '<span class="text-cyan-300">$1</span>');
  highlighted = highlighted.replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g, '<span class="text-amber-200">$1</span>');
  highlighted = highlighted.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="text-emerald-300">$1</span>');
  highlighted = highlighted.replace(new RegExp(`\\b(${keywords.join("|")})\\b`, "g"), '<span class="text-sky-300 font-semibold">$1</span>');
  highlighted = highlighted.replace(/(#.*$)/gm, '<span class="text-emerald-400">$1</span>');
  highlighted = highlighted.replace(/(\/\/.*$)/gm, '<span class="text-emerald-400">$1</span>');
  return highlighted;
}

export function renderCodeFence(block: string) {
  const lines = block.split("\n");
  const language = (lines[0] || "").trim().toLowerCase();
  const code = lines.slice(1).join("\n");
  return { language, code };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function MessageBody({ content }: { content: string }) {
  const sections = content.split(/```([\s\S]*?)```/g);
  return (
    <div className="space-y-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200">
      {sections.map((section, index) => {
        if (index % 2 === 0) {
          return <p key={index}>{section}</p>;
        }
        const { language, code } = renderCodeFence(section);
        return (
          <div key={index} className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-zinc-400">
              <span>{language || "code"}</span>
              <span>syntax highlighted</span>
            </div>
            <pre
              className="overflow-x-auto p-4 text-[13px] leading-6 text-zinc-100"
              dangerouslySetInnerHTML={{ __html: syntaxHighlight(code, language) }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ReferencedFiles({ files, referencedIds }: { files: Record<string, any>; referencedIds: string[] }) {
  if (!referencedIds.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-2 text-[11px]">
      {referencedIds.map((fileId) => {
        const file = files[fileId];
        return (
          <span key={fileId} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-cyan-200">
            {file ? file.original_name : shortId(fileId)}
          </span>
        );
      })}
    </div>
  );
}
