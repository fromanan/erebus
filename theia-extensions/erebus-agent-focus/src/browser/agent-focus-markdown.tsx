/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';
import * as DOMPurify from '@theia/core/shared/dompurify';
import markdownit from '@theia/core/shared/markdown-it';
import hljs from 'highlight.js/lib/common';

const { useMemo } = React;

interface MarkdownRenderEnvironment {
    codeBlockIndex: number;
}

interface HighlightedCode {
    html: string;
    language?: string;
}

export interface MarkdownContentProps {
    markdown: string;
    className?: string;
    onCodeLanguageChange?: (codeBlockIndex: number, language: string) => void;
}

export interface MarkdownContinuation {
    value: string;
    selectionStart: number;
}

const LANGUAGE_LABELS: Record<string, string> = {
    bash: 'Bash',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    css: 'CSS',
    diff: 'Diff',
    go: 'Go',
    graphql: 'GraphQL',
    ini: 'INI',
    java: 'Java',
    javascript: 'JavaScript',
    json: 'JSON',
    kotlin: 'Kotlin',
    lua: 'Lua',
    markdown: 'Markdown',
    objectivec: 'Objective-C',
    php: 'PHP',
    plaintext: 'Plain text',
    python: 'Python',
    ruby: 'Ruby',
    rust: 'Rust',
    scss: 'SCSS',
    shell: 'Shell',
    sql: 'SQL',
    swift: 'Swift',
    typescript: 'TypeScript',
    vbnet: 'Visual Basic',
    xml: 'HTML / XML',
    yaml: 'YAML'
};

const languageOptions = hljs.listLanguages().sort((left, right) =>
    languageLabel(left).localeCompare(languageLabel(right)));

const markdownRenderer = markdownit({
    breaks: false,
    html: false,
    linkify: true,
    typographer: false
});

markdownRenderer.renderer.rules.link_open = (tokens, index, options, _environment, renderer) => {
    tokens[index].attrSet('target', '_blank');
    tokens[index].attrSet('rel', 'noopener noreferrer');
    return renderer.renderToken(tokens, index, options);
};

markdownRenderer.renderer.rules.fence = (tokens, index, _options, environment) => {
    const token = tokens[index];
    const renderEnvironment = environment as MarkdownRenderEnvironment;
    const codeBlockIndex = renderEnvironment.codeBlockIndex++;
    const requestedLanguage = token.info.trim().split(/\s+/u)[0]?.toLowerCase() || '';
    const highlighted = highlightCode(token.content, requestedLanguage);
    const detectedLanguage = highlighted.language || 'plaintext';
    const codeClass = detectedLanguage === 'plaintext' ? 'hljs' : `hljs language-${escapeAttribute(detectedLanguage)}`;
    const autoLabel = detectedLanguage === 'plaintext' ? 'Auto' : `Auto · ${languageLabel(detectedLanguage)}`;
    const requestedOption = requestedLanguage && !languageOptions.includes(requestedLanguage)
        ? `<option value="${escapeAttribute(requestedLanguage)}" selected>${escapeHtml(languageLabel(requestedLanguage))}</option>`
        : '';
    const options = languageOptions.map(language =>
        `<option value="${escapeAttribute(language)}"${language === requestedLanguage ? ' selected' : ''}>${escapeHtml(languageLabel(language))}</option>`
    ).join('');

    return `<div class="erebus-code-block" data-code-index="${codeBlockIndex}">
        <div class="erebus-code-toolbar">
            <label>
                <span class="codicon codicon-code" aria-hidden="true"></span>
                <select data-markdown-language aria-label="Code block language">
                    <option value=""${requestedLanguage ? '' : ' selected'}>${escapeHtml(autoLabel)}</option>
                    ${requestedOption}${options}
                </select>
            </label>
            <button type="button" data-markdown-copy aria-label="Copy code" title="Copy code">
                <span class="codicon codicon-copy" aria-hidden="true"></span><span>Copy</span>
            </button>
        </div>
        <pre><code class="${codeClass}">${highlighted.html}</code></pre>
    </div>`;
};

markdownRenderer.core.ruler.after('inline', 'erebus-task-lists', state => {
    for (let index = 0; index < state.tokens.length; index++) {
        const inlineToken = state.tokens[index];
        if (inlineToken.type !== 'inline' || !inlineToken.children?.length) {
            continue;
        }
        const firstChild = inlineToken.children[0];
        const task = firstChild.type === 'text' ? /^\[([ xX])\]\s+/u.exec(firstChild.content) : undefined;
        if (!task) {
            continue;
        }

        firstChild.content = firstChild.content.substring(task[0].length);
        const checkbox = new state.Token('html_inline', '', 0);
        checkbox.content = `<input class="erebus-task-checkbox" type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}>`;
        inlineToken.children.unshift(checkbox);

        for (let parentIndex = index - 1; parentIndex >= 0; parentIndex--) {
            const parent = state.tokens[parentIndex];
            if (parent.type === 'list_item_open') {
                parent.attrJoin('class', 'erebus-markdown-task-list-item');
            }
            if (parent.type === 'bullet_list_open' || parent.type === 'ordered_list_open') {
                parent.attrJoin('class', 'erebus-markdown-task-list');
                break;
            }
        }
    }
});

function languageLabel(language: string): string {
    return LANGUAGE_LABELS[language] ?? language
        .split(/[-_]/u)
        .map(part => part.length <= 3 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.substring(1)}`)
        .join(' ');
}

function highlightCode(code: string, requestedLanguage?: string): HighlightedCode {
    const language = requestedLanguage?.toLowerCase();
    if (language && hljs.getLanguage(language)) {
        const explicitResult = hljs.highlight(code, { language, ignoreIllegals: true });
        return { html: explicitResult.value, language: explicitResult.language || language };
    }
    const automaticResult = hljs.highlightAuto(code);
    return {
        html: automaticResult.value,
        language: automaticResult.language
    };
}

function escapeHtml(value: string): string {
    return markdownRenderer.utils.escapeHtml(value);
}

function escapeAttribute(value: string): string {
    return escapeHtml(value.replace(/["']/gu, ''));
}

function renderMarkdown(markdown: string): string {
    const environment: MarkdownRenderEnvironment = { codeBlockIndex: 0 };
    return DOMPurify.sanitize(markdownRenderer.render(markdown, environment), {
        ADD_ATTR: ['target', 'rel']
    });
}

async function copyText(value: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this window.');
    }
    await navigator.clipboard.writeText(value);
}

export function MarkdownContent({ markdown, className, onCodeLanguageChange }: MarkdownContentProps): React.ReactElement {
    const html = useMemo(() => renderMarkdown(markdown), [markdown]);

    const changeLanguage = (event: React.ChangeEvent<HTMLDivElement>): void => {
        const select = event.target;
        if (!(select instanceof HTMLSelectElement) || !select.matches('[data-markdown-language]')) {
            return;
        }
        const block = select.closest<HTMLElement>('.erebus-code-block');
        const code = block?.querySelector<HTMLElement>('pre code');
        if (!block || !code) {
            return;
        }

        const highlighted = highlightCode(code.textContent ?? '', select.value);
        code.innerHTML = DOMPurify.sanitize(highlighted.html);
        code.className = highlighted.language ? `hljs language-${highlighted.language}` : 'hljs';
        const autoOption = select.querySelector<HTMLOptionElement>('option[value=""]');
        if (autoOption && !select.value) {
            autoOption.textContent = highlighted.language ? `Auto · ${languageLabel(highlighted.language)}` : 'Auto';
        }

        const codeBlockIndex = Number(block.dataset.codeIndex);
        if (onCodeLanguageChange && Number.isInteger(codeBlockIndex)) {
            onCodeLanguageChange(codeBlockIndex, select.value);
        }
    };

    const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const copyButton = target.closest<HTMLButtonElement>('[data-markdown-copy]');
        const code = copyButton?.closest('.erebus-code-block')?.querySelector('pre code');
        if (!copyButton || !code) {
            return;
        }

        copyText(code.textContent ?? '').then(() => {
            const label = copyButton.querySelector('span:last-child');
            if (label) {
                label.textContent = 'Copied';
                window.setTimeout(() => label.textContent = 'Copy', 1400);
            }
        }).catch(error => console.error('Could not copy Markdown code block', error));
    };

    return <div
        className={`erebus-markdown${className ? ` ${className}` : ''}`}
        onChange={changeLanguage}
        onClick={handleClick}
        // Markdown is rendered with HTML disabled, then sanitized before insertion.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
    />;
}

export function updateFencedCodeLanguage(markdown: string, targetIndex: number, language: string): string {
    const lineEnding = markdown.includes('\r\n') ? '\r\n' : '\n';
    const lines = markdown.split(/\r?\n/u);
    let openFence: { character: string; length: number } | undefined;
    let codeBlockIndex = -1;

    for (let index = 0; index < lines.length; index++) {
        const fence = /^(\s*)(`{3,}|~{3,})(.*)$/u.exec(lines[index]);
        if (!fence) {
            continue;
        }

        if (!openFence) {
            codeBlockIndex++;
            openFence = { character: fence[2][0], length: fence[2].length };
            if (codeBlockIndex === targetIndex) {
                lines[index] = `${fence[1]}${fence[2]}${language}`;
            }
            continue;
        }

        const isClosingFence = fence[2][0] === openFence.character
            && fence[2].length >= openFence.length
            && fence[3].trim().length === 0;
        if (isClosingFence) {
            openFence = undefined;
        }
    }

    return lines.join(lineEnding);
}

function findOpenFence(markdown: string): { character: string; length: number } | undefined {
    let openFence: { character: string; length: number } | undefined;
    for (const line of markdown.split(/\r?\n/u)) {
        const fence = /^\s*(`{3,}|~{3,})(.*)$/u.exec(line);
        if (!fence) {
            continue;
        }
        if (!openFence) {
            openFence = { character: fence[1][0], length: fence[1].length };
        } else if (fence[1][0] === openFence.character
            && fence[1].length >= openFence.length
            && fence[2].trim().length === 0) {
            openFence = undefined;
        }
    }
    return openFence;
}

export function continueMarkdownOnEnter(value: string, selectionStart: number, selectionEnd: number): MarkdownContinuation | undefined {
    if (selectionStart !== selectionEnd) {
        return undefined;
    }

    const lineStart = Math.max(value.lastIndexOf('\n', selectionStart - 1) + 1, 0);
    const linePrefix = value.substring(lineStart, selectionStart);
    const beforeLine = value.substring(0, lineStart);
    const openFence = findOpenFence(beforeLine);

    if (openFence) {
        const potentialClose = /^\s*(`{3,}|~{3,})\s*$/u.exec(linePrefix);
        const closesFence = potentialClose
            && potentialClose[1][0] === openFence.character
            && potentialClose[1].length >= openFence.length;
        if (!closesFence) {
            return insertAtSelection(value, selectionStart, selectionEnd, '\n');
        }
        return undefined;
    }

    const openingFence = /^(\s*)(`{3,}|~{3,})[^\n]*$/u.exec(linePrefix);
    if (openingFence) {
        const insertion = `\n\n${openingFence[1]}${openingFence[2]}`;
        const continuation = insertAtSelection(value, selectionStart, selectionEnd, insertion);
        return { ...continuation, selectionStart: selectionStart + 1 };
    }

    const listItem = /^(\s*)([-+*]|(\d+)([.)]))([ \t]+)(.*)$/u.exec(linePrefix);
    if (listItem) {
        if (!listItem[6].trim()) {
            const replacement = listItem[1];
            return {
                value: `${value.substring(0, lineStart)}${replacement}${value.substring(selectionEnd)}`,
                selectionStart: lineStart + replacement.length
            };
        }
        const marker = listItem[3] ? `${Number(listItem[3]) + 1}${listItem[4]}` : listItem[2];
        return insertAtSelection(value, selectionStart, selectionEnd, `\n${listItem[1]}${marker}${listItem[5]}`);
    }

    const quote = /^(\s*(?:>\s*)+)(.*)$/u.exec(linePrefix);
    if (quote) {
        if (!quote[2].trim()) {
            return {
                value: `${value.substring(0, lineStart)}${value.substring(selectionEnd)}`,
                selectionStart: lineStart
            };
        }
        return insertAtSelection(value, selectionStart, selectionEnd, `\n${quote[1]}`);
    }

    return undefined;
}

function insertAtSelection(value: string, selectionStart: number, selectionEnd: number, insertion: string): MarkdownContinuation {
    return {
        value: `${value.substring(0, selectionStart)}${insertion}${value.substring(selectionEnd)}`,
        selectionStart: selectionStart + insertion.length
    };
}
