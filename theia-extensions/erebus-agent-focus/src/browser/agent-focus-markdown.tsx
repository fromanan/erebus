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

const { useEffect, useMemo, useRef } = React;

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

export interface RichMarkdownEditorProps {
    value: string;
    disabled: boolean;
    placeholder: string;
    ariaLabel: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
}

interface SavedSelection {
    path: number[];
    offset: number;
}

interface EditorSnapshot {
    html: string;
    markdown: string;
    selection?: SavedSelection;
}

interface MacroUndoEntry extends EditorSnapshot {
    afterHtml: string;
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

function editableMarkdownHtml(markdown: string): string {
    if (!markdown.trim()) {
        return '<p><br></p>';
    }

    const template = document.createElement('template');
    // renderMarkdown disables raw HTML and sanitizes the generated markup.
    // eslint-disable-next-line no-unsanitized/property
    template.innerHTML = renderMarkdown(markdown);
    template.content.querySelectorAll<HTMLElement>('.erebus-code-block').forEach(block => {
        block.dataset.richCodeBlock = 'true';
        block.querySelector<HTMLElement>('.erebus-code-toolbar')?.setAttribute('contenteditable', 'false');
        const code = block.querySelector<HTMLElement>('pre code');
        if (code) {
            code.setAttribute('spellcheck', 'false');
        }
    });
    template.content.querySelectorAll<HTMLInputElement>('.erebus-task-checkbox').forEach(checkbox => {
        checkbox.disabled = false;
        checkbox.tabIndex = -1;
        checkbox.setAttribute('contenteditable', 'false');
    });
    return template.innerHTML;
}

function selectionElement(selection: Selection): Element | undefined {
    const node = selection.anchorNode;
    return node instanceof Element ? node : node?.parentElement ?? undefined;
}

function captureSelection(editor: HTMLElement): SavedSelection | undefined {
    const selection = window.getSelection();
    if (!selection?.rangeCount) {
        return undefined;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.endContainer)) {
        return undefined;
    }

    const path: number[] = [];
    let node: Node = range.endContainer;
    while (node !== editor) {
        const parent = node.parentNode;
        if (!parent) {
            return undefined;
        }
        path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
        node = parent;
    }
    return { path, offset: range.endOffset };
}

function restoreSelection(editor: HTMLElement, saved?: SavedSelection): void {
    if (!saved) {
        placeCaretAtOffset(editor, editor.textContent?.length ?? 0);
        return;
    }

    let node: Node = editor;
    for (const index of saved.path) {
        const next = node.childNodes[Math.min(index, Math.max(0, node.childNodes.length - 1))];
        if (!next) {
            break;
        }
        node = next;
    }
    const maximumOffset = node.nodeType === Node.TEXT_NODE
        ? node.textContent?.length ?? 0
        : node.childNodes.length;
    const range = document.createRange();
    range.setStart(node, Math.min(saved.offset, maximumOffset));
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function caretOffsetWithin(container: Node): number {
    const selection = window.getSelection();
    if (!selection?.rangeCount) {
        return 0;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.endContainer)) {
        return 0;
    }
    const prefix = range.cloneRange();
    prefix.selectNodeContents(container);
    prefix.setEnd(range.endContainer, range.endOffset);
    return prefix.toString().length;
}

function placeCaretAtOffset(container: Node, offset: number): void {
    const selection = window.getSelection();
    if (!selection) {
        return;
    }
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let textNode = walker.nextNode();
    while (textNode) {
        const length = textNode.textContent?.length ?? 0;
        if (remaining <= length) {
            const textRange = document.createRange();
            textRange.setStart(textNode, remaining);
            textRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(textRange);
            return;
        }
        remaining -= length;
        textNode = walker.nextNode();
    }

    const fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(container);
    fallbackRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(fallbackRange);
}

function placeCaretInside(element: HTMLElement): void {
    if (!element.firstChild) {
        element.appendChild(document.createElement('br'));
    }
    if (!(element.textContent ?? '').length) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(element, 0);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
    }
    placeCaretAtOffset(element, 0);
}

function currentEditableBlock(editor: HTMLElement, selection: Selection): HTMLElement | undefined {
    let anchor = selection.anchorNode;
    let directTextOffset: number | undefined;
    if (!anchor || (anchor !== editor && !editor.contains(anchor))) {
        return undefined;
    }

    if (anchor === editor) {
        const index = Math.min(selection.anchorOffset, editor.childNodes.length);
        anchor = editor.childNodes[Math.max(0, index - 1)] ?? editor.childNodes[index];
        if (anchor?.nodeType === Node.TEXT_NODE) {
            directTextOffset = anchor.textContent?.length ?? 0;
        }
    } else if (anchor.nodeType === Node.TEXT_NODE && anchor.parentNode === editor) {
        directTextOffset = selection.anchorOffset;
    }
    if (anchor?.nodeType === Node.TEXT_NODE && anchor.parentNode === editor) {
        const paragraph = document.createElement('p');
        editor.replaceChild(paragraph, anchor);
        paragraph.appendChild(anchor);
        const range = document.createRange();
        range.setStart(anchor, Math.min(directTextOffset ?? 0, anchor.textContent?.length ?? 0));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return paragraph;
    }

    let element = anchor instanceof Element ? anchor : anchor?.parentElement ?? undefined;
    while (element && element !== editor) {
        if (element.parentElement === editor
            || ['LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) {
            return element as HTMLElement;
        }
        element = element.parentElement ?? undefined;
    }
    return undefined;
}

function replaceTextRange(
    container: HTMLElement,
    start: number,
    end: number,
    replacement: HTMLElement
): boolean {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let position = 0;
    let startNode: Node | undefined;
    let startOffset = 0;
    let endNode: Node | undefined;
    let endOffset = 0;
    let node = walker.nextNode();

    while (node) {
        const length = node.textContent?.length ?? 0;
        if (!startNode && start <= position + length) {
            startNode = node;
            startOffset = start - position;
        }
        if (end <= position + length) {
            endNode = node;
            endOffset = end - position;
            break;
        }
        position += length;
        node = walker.nextNode();
    }

    if (!startNode || !endNode) {
        return false;
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    range.deleteContents();
    range.insertNode(replacement);
    range.setStartAfter(replacement);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
}

function createListBlock(ordered: boolean, taskChecked?: boolean): { block: HTMLElement; caret: HTMLElement } {
    const list = document.createElement(ordered ? 'ol' : 'ul');
    if (taskChecked !== undefined) {
        list.className = 'erebus-markdown-task-list';
    }
    const item = document.createElement('li');
    if (taskChecked !== undefined) {
        item.className = 'erebus-markdown-task-list-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = taskChecked;
        checkbox.tabIndex = -1;
        checkbox.className = 'erebus-task-checkbox';
        checkbox.setAttribute('contenteditable', 'false');
        item.append(checkbox, document.createTextNode(' '));
    }
    item.appendChild(document.createElement('br'));
    list.appendChild(item);
    return { block: list, caret: item };
}

function appendLanguageOptions(select: HTMLSelectElement, selectedLanguage: string, detectedLanguage?: string): void {
    const automatic = document.createElement('option');
    automatic.value = '';
    automatic.textContent = detectedLanguage ? `Auto · ${languageLabel(detectedLanguage)}` : 'Auto';
    automatic.selected = !selectedLanguage;
    select.appendChild(automatic);

    if (selectedLanguage && !languageOptions.includes(selectedLanguage)) {
        const requested = document.createElement('option');
        requested.value = selectedLanguage;
        requested.textContent = languageLabel(selectedLanguage);
        requested.selected = true;
        select.appendChild(requested);
    }
    languageOptions.forEach(language => {
        const option = document.createElement('option');
        option.value = language;
        option.textContent = languageLabel(language);
        option.selected = language === selectedLanguage;
        select.appendChild(option);
    });
}

function createRichCodeBlock(source: string, selectedLanguage: string = ''): { block: HTMLElement; code: HTMLElement } {
    const block = document.createElement('div');
    block.className = 'erebus-code-block';
    block.dataset.richCodeBlock = 'true';

    const toolbar = document.createElement('div');
    toolbar.className = 'erebus-code-toolbar';
    toolbar.setAttribute('contenteditable', 'false');
    const label = document.createElement('label');
    const codeIcon = document.createElement('span');
    codeIcon.className = 'codicon codicon-code';
    codeIcon.setAttribute('aria-hidden', 'true');
    const select = document.createElement('select');
    select.dataset.markdownLanguage = 'true';
    select.setAttribute('aria-label', 'Code block language');
    const initialHighlight = highlightCode(source, selectedLanguage);
    appendLanguageOptions(select, selectedLanguage, initialHighlight.language);
    label.append(codeIcon, select);

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.dataset.markdownCopy = 'true';
    copyButton.setAttribute('aria-label', 'Copy code');
    copyButton.title = 'Copy code';
    const copyIcon = document.createElement('span');
    copyIcon.className = 'codicon codicon-copy';
    copyIcon.setAttribute('aria-hidden', 'true');
    const copyLabel = document.createElement('span');
    copyLabel.textContent = 'Copy';
    copyButton.append(copyIcon, copyLabel);
    toolbar.append(label, copyButton);

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = initialHighlight.language ? `hljs language-${initialHighlight.language}` : 'hljs';
    code.dataset.detectedLanguage = initialHighlight.language ?? '';
    code.setAttribute('spellcheck', 'false');
    code.innerHTML = DOMPurify.sanitize(initialHighlight.html);
    if (!source) {
        code.appendChild(document.createElement('br'));
    }
    pre.appendChild(code);
    block.append(toolbar, pre);
    return { block, code };
}

function highlightEditableCode(code: HTMLElement, selectedLanguage: string, caretOffset?: number): void {
    const source = code.textContent ?? '';
    const highlighted = highlightCode(source, selectedLanguage);
    code.innerHTML = DOMPurify.sanitize(highlighted.html);
    code.className = highlighted.language ? `hljs language-${highlighted.language}` : 'hljs';
    code.dataset.detectedLanguage = highlighted.language ?? '';
    if (!source) {
        code.appendChild(document.createElement('br'));
    }
    const select = code.closest('.erebus-code-block')?.querySelector<HTMLSelectElement>('[data-markdown-language]');
    const autoOption = select?.querySelector<HTMLOptionElement>('option[value=""]');
    if (autoOption) {
        autoOption.textContent = highlighted.language ? `Auto · ${languageLabel(highlighted.language)}` : 'Auto';
    }
    if (caretOffset !== undefined) {
        placeCaretAtOffset(code, caretOffset);
    }
}

function applyBlockMacro(editor: HTMLElement, selection: Selection): boolean {
    if (!selection.isCollapsed) {
        return false;
    }
    const block = currentEditableBlock(editor, selection);
    if (!block || block.closest('.erebus-code-block')) {
        return false;
    }
    const text = (block.textContent ?? '').replace(/\u00a0/gu, ' ');
    if (caretOffsetWithin(block) !== text.length) {
        return false;
    }

    let replacement: HTMLElement | undefined;
    let caretTarget: HTMLElement | undefined;
    if (/^[-+*]\s$/u.test(text)) {
        ({ block: replacement, caret: caretTarget } = createListBlock(false));
    } else if (/^1[.)]\s$/u.test(text)) {
        ({ block: replacement, caret: caretTarget } = createListBlock(true));
    } else if (/^\[[ xX]\]\s$/u.test(text)) {
        ({ block: replacement, caret: caretTarget } = createListBlock(false, /[xX]/u.test(text)));
    } else if (text === '> ') {
        replacement = document.createElement('blockquote');
        caretTarget = document.createElement('p');
        caretTarget.appendChild(document.createElement('br'));
        replacement.appendChild(caretTarget);
    } else if (/^#{1,6}\s$/u.test(text)) {
        replacement = document.createElement(`h${text.trim().length}`);
        replacement.appendChild(document.createElement('br'));
        caretTarget = replacement;
    } else if (text === '```') {
        const codeBlock = createRichCodeBlock('');
        replacement = codeBlock.block;
        caretTarget = codeBlock.code;
    } else if (text === '---') {
        replacement = document.createElement('hr');
    }

    if (!replacement) {
        return false;
    }
    block.replaceWith(replacement);
    if (replacement.tagName === 'HR') {
        const paragraph = document.createElement('p');
        paragraph.appendChild(document.createElement('br'));
        replacement.after(paragraph);
        placeCaretInside(paragraph);
    } else if (caretTarget) {
        placeCaretInside(caretTarget);
    }
    return true;
}

interface InlineMacro {
    start: number;
    end: number;
    element: HTMLElement;
}

function inlineMacro(text: string): InlineMacro | undefined {
    const definitions: Array<{ pattern: RegExp; tag: string; group: number; hrefGroup?: number; prefixGroup?: number }> = [
        { pattern: /`([^`\n]+)`$/u, tag: 'code', group: 1 },
        { pattern: /\*\*([^*\n]+)\*\*$/u, tag: 'strong', group: 1 },
        { pattern: /__([^_\n]+)__$/u, tag: 'strong', group: 1 },
        { pattern: /~~([^~\n]+)~~$/u, tag: 'del', group: 1 },
        { pattern: /(^|[^*])\*([^*\n]+)\*$/u, tag: 'em', group: 2, prefixGroup: 1 },
        { pattern: /(^|[^_])_([^_\n]+)_$/u, tag: 'em', group: 2, prefixGroup: 1 },
        { pattern: /\[([^\]\n]+)\]\(([^)\s]+)\)$/u, tag: 'a', group: 1, hrefGroup: 2 }
    ];

    for (const definition of definitions) {
        const match = definition.pattern.exec(text);
        if (!match || match.index === undefined) {
            continue;
        }
        const prefixLength = definition.prefixGroup ? match[definition.prefixGroup].length : 0;
        const element = document.createElement(definition.tag);
        element.textContent = match[definition.group];
        if (definition.hrefGroup) {
            const href = match[definition.hrefGroup];
            if (!markdownRenderer.validateLink(href)) {
                continue;
            }
            element.setAttribute('href', href);
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
        }
        return {
            start: match.index + prefixLength,
            end: text.length,
            element
        };
    }
    return undefined;
}

function applyInlineMacro(editor: HTMLElement, selection: Selection): boolean {
    if (!selection.isCollapsed) {
        return false;
    }
    const block = currentEditableBlock(editor, selection);
    if (!block || block.closest('.erebus-code-block')) {
        return false;
    }
    const caretOffset = caretOffsetWithin(block);
    const textBeforeCaret = (block.textContent ?? '').substring(0, caretOffset);
    const macro = inlineMacro(textBeforeCaret);
    return macro ? replaceTextRange(block, macro.start, macro.end, macro.element) : false;
}

function serializeInlineNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.replace(/\u200b/gu, '') ?? '';
    }
    if (!(node instanceof HTMLElement)) {
        return '';
    }
    const content = () => Array.from(node.childNodes).map(serializeInlineNode).join('');
    switch (node.tagName) {
        case 'BR': return '\n';
        case 'STRONG':
        case 'B': return `**${content()}**`;
        case 'EM':
        case 'I': return `*${content()}*`;
        case 'DEL':
        case 'S': return `~~${content()}~~`;
        case 'CODE': return node.closest('pre') ? node.textContent ?? '' : `\`${node.textContent ?? ''}\``;
        case 'A': return `[${content()}](${node.getAttribute('href') ?? ''})`;
        case 'IMG': return `![${node.getAttribute('alt') ?? ''}](${node.getAttribute('src') ?? ''})`;
        case 'INPUT': return node instanceof HTMLInputElement && node.type === 'checkbox' ? `[${node.checked ? 'x' : ' '}] ` : '';
        default: return content();
    }
}

function serializeList(list: HTMLElement, depth: number = 0): string {
    const ordered = list.tagName === 'OL';
    return Array.from(list.children).filter(child => child.tagName === 'LI').map((child, index) => {
        const item = child as HTMLElement;
        const nestedLists = Array.from(item.children).filter(element => element.tagName === 'UL' || element.tagName === 'OL') as HTMLElement[];
        const contentNodes = Array.from(item.childNodes).filter(node => !(node instanceof HTMLElement && nestedLists.includes(node)));
        const itemContent = contentNodes.map(node => {
            if (node instanceof HTMLElement && (node.tagName === 'P' || node.tagName === 'DIV')) {
                return Array.from(node.childNodes).map(serializeInlineNode).join('');
            }
            return serializeInlineNode(node);
        }).join('').trim();
        const indent = '  '.repeat(depth);
        const marker = ordered ? `${index + 1}.` : '-';
        const nested = nestedLists.map(nestedList => `\n${serializeList(nestedList, depth + 1)}`).join('');
        return `${indent}${marker} ${itemContent}${nested}`;
    }).join('\n');
}

function serializeTable(table: HTMLTableElement): string {
    const rows = Array.from(table.rows).map(row => Array.from(row.cells).map(cell =>
        Array.from(cell.childNodes).map(serializeInlineNode).join('').replace(/\|/gu, '\\|').trim()));
    if (!rows.length) {
        return '';
    }
    const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
    return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)].join('\n');
}

function serializeBlockNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.replace(/\u200b/gu, '') ?? '';
    }
    if (!(node instanceof HTMLElement)) {
        return '';
    }
    if (node.matches('.erebus-code-block')) {
        const code = node.querySelector('pre code')?.textContent ?? '';
        const selectedLanguage = node.querySelector<HTMLSelectElement>('[data-markdown-language]')?.value ?? '';
        return `\`\`\`${selectedLanguage}\n${code.replace(/\n$/u, '')}\n\`\`\``;
    }
    const inlineContent = () => Array.from(node.childNodes).map(serializeInlineNode).join('');
    const blockContent = () => Array.from(node.childNodes).map(serializeBlockNode).filter(Boolean).join('\n\n');
    switch (node.tagName) {
        case 'P':
        case 'DIV': return inlineContent();
        case 'H1':
        case 'H2':
        case 'H3':
        case 'H4':
        case 'H5':
        case 'H6': return `${'#'.repeat(Number(node.tagName.substring(1)))} ${inlineContent()}`;
        case 'BLOCKQUOTE': return blockContent().split('\n').map(line => `> ${line}`.trimEnd()).join('\n');
        case 'UL':
        case 'OL': return serializeList(node);
        case 'HR': return '---';
        case 'PRE': return `\`\`\`\n${node.textContent ?? ''}\n\`\`\``;
        case 'TABLE': return serializeTable(node as HTMLTableElement);
        default: return inlineContent();
    }
}

export function serializeRichMarkdownEditor(editor: HTMLElement): string {
    return Array.from(editor.childNodes)
        .map(serializeBlockNode)
        .filter((block, index, blocks) => block.length > 0 || (index > 0 && index < blocks.length - 1))
        .join('\n\n')
        .trim();
}

function insertTextAtSelection(value: string): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) {
        return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const text = document.createTextNode(value);
    range.insertNode(text);
    range.setStartAfter(text);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}

function wrapSelection(tagName: 'strong' | 'em'): boolean {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) {
        return false;
    }
    const range = selection.getRangeAt(0);
    const element = document.createElement(tagName);
    element.appendChild(range.extractContents());
    range.insertNode(element);
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function placeCaretOutsideInline(element: HTMLElement, after: boolean): void {
    const marker = document.createTextNode('\u200b');
    element.parentNode?.insertBefore(marker, after ? element.nextSibling : element);
    const range = document.createRange();
    range.setStart(marker, after ? 1 : 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function topLevelEditableBlock(editor: HTMLElement, selection: Selection): HTMLElement | undefined {
    currentEditableBlock(editor, selection);
    let element = selectionElement(selection);
    while (element && element.parentElement !== editor) {
        element = element.parentElement ?? undefined;
    }
    return element instanceof HTMLElement && element !== editor ? element : undefined;
}

function adjacentPlainParagraph(editor: HTMLElement, block: HTMLElement, after: boolean): HTMLElement {
    const sibling = after ? block.nextElementSibling : block.previousElementSibling;
    if (sibling instanceof HTMLElement && sibling.tagName === 'P') {
        return sibling;
    }
    const paragraph = document.createElement('p');
    paragraph.appendChild(document.createElement('br'));
    editor.insertBefore(paragraph, after ? block.nextSibling : block);
    return paragraph;
}

function moveToAdjacentPlainParagraph(editor: HTMLElement, selection: Selection, after: boolean): boolean {
    const block = topLevelEditableBlock(editor, selection);
    if (!block) {
        return false;
    }
    const paragraph = adjacentPlainParagraph(editor, block, after);
    placeCaretAtOffset(paragraph, after ? 0 : paragraph.textContent?.length ?? 0);
    return true;
}

function exitFormattedBoundary(editor: HTMLElement, selection: Selection, after: boolean): boolean {
    if (!selection.isCollapsed) {
        return false;
    }
    const element = selectionElement(selection);
    if (!element) {
        return false;
    }

    const inline = element.closest<HTMLElement>('code:not(pre code), strong, b, em, i, del, s, a');
    if (inline && editor.contains(inline)) {
        const inlineOffset = caretOffsetWithin(inline);
        const inlineBoundary = after ? inline.textContent?.length ?? 0 : 0;
        if (inlineOffset === inlineBoundary) {
            placeCaretOutsideInline(inline, after);
            return true;
        }
        return false;
    }

    const codeBlock = element.closest<HTMLElement>('.erebus-code-block');
    const formattedBlock = codeBlock ?? element.closest<HTMLElement>('li, blockquote, h1, h2, h3, h4, h5, h6');
    if (!formattedBlock || !editor.contains(formattedBlock)) {
        return false;
    }
    const content = codeBlock?.querySelector<HTMLElement>('pre code') ?? formattedBlock;
    const offset = caretOffsetWithin(content);
    const boundary = after ? content.textContent?.length ?? 0 : 0;
    return offset === boundary ? moveToAdjacentPlainParagraph(editor, selection, after) : false;
}

function exitToNextLine(editor: HTMLElement, selection: Selection): boolean {
    return selection.isCollapsed ? moveToAdjacentPlainParagraph(editor, selection, true) : false;
}

function paragraphFromListItem(item: HTMLElement): { paragraph: HTMLParagraphElement; nestedLists: HTMLElement[] } {
    const paragraph = document.createElement('p');
    const nestedLists: HTMLElement[] = [];
    let removedTaskCheckbox = false;
    Array.from(item.childNodes).forEach(node => {
        if (node instanceof HTMLInputElement && node.type === 'checkbox') {
            removedTaskCheckbox = true;
            node.remove();
        } else if (node instanceof HTMLElement && (node.tagName === 'UL' || node.tagName === 'OL')) {
            nestedLists.push(node);
        } else if (node instanceof HTMLElement && (node.tagName === 'P' || node.tagName === 'DIV')) {
            while (node.firstChild) {
                paragraph.appendChild(node.firstChild);
            }
            node.remove();
        } else {
            paragraph.appendChild(node);
        }
    });
    if (removedTaskCheckbox && paragraph.firstChild?.nodeType === Node.TEXT_NODE) {
        paragraph.firstChild.textContent = paragraph.firstChild.textContent?.replace(/^\s+/u, '') ?? '';
    }
    if (!paragraph.childNodes.length) {
        paragraph.appendChild(document.createElement('br'));
    }
    return { paragraph, nestedLists };
}

function removeListItemFormatting(item: HTMLElement): boolean {
    const list = item.parentElement;
    if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL') || caretOffsetWithin(item) !== 0) {
        return false;
    }

    const items = Array.from(list.children).filter(child => child.tagName === 'LI');
    const itemIndex = items.indexOf(item);
    if (itemIndex < 0) {
        return false;
    }
    const afterList = itemIndex < items.length - 1 ? list.cloneNode(false) as HTMLElement : undefined;
    if (afterList) {
        items.slice(itemIndex + 1).forEach(followingItem => afterList.appendChild(followingItem));
    }

    const { paragraph, nestedLists } = paragraphFromListItem(item);
    const replacement = document.createDocumentFragment();
    replacement.append(paragraph, ...nestedLists);
    if (afterList) {
        replacement.appendChild(afterList);
    }
    list.parentNode?.insertBefore(replacement, list.nextSibling);
    item.remove();
    if (!list.querySelector(':scope > li')) {
        list.remove();
    }
    placeCaretAtOffset(paragraph, 0);
    return true;
}

function removeQuoteFormatting(quote: HTMLElement): boolean {
    if (caretOffsetWithin(quote) !== 0) {
        return false;
    }
    const children = Array.from(quote.childNodes);
    let caretTarget = children.find((child): child is HTMLElement => child instanceof HTMLElement);
    if (!caretTarget) {
        caretTarget = document.createElement('p');
        children.forEach(child => caretTarget?.appendChild(child));
        if (!caretTarget.childNodes.length) {
            caretTarget.appendChild(document.createElement('br'));
        }
        quote.replaceWith(caretTarget);
    } else {
        quote.replaceWith(...children);
    }
    placeCaretAtOffset(caretTarget, 0);
    return true;
}

function removeBlockFormattingAtStart(editor: HTMLElement, selection: Selection): boolean {
    if (!selection.isCollapsed) {
        return false;
    }
    const element = selectionElement(selection);
    if (!element) {
        return false;
    }
    const item = element.closest<HTMLElement>('li');
    if (item && editor.contains(item) && removeListItemFormatting(item)) {
        return true;
    }
    const quote = element.closest<HTMLElement>('blockquote');
    return Boolean(quote && editor.contains(quote) && removeQuoteFormatting(quote));
}

function splitListItemAtSelection(editor: HTMLElement, selection: Selection): boolean {
    if (!selection.rangeCount) {
        return false;
    }
    const range = selection.getRangeAt(0);
    const startElement = range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const item = startElement?.closest<HTMLElement>('li');
    const list = item?.parentElement;
    if (!item || !list || !editor.contains(item) || (list.tagName !== 'UL' && list.tagName !== 'OL')
        || !item.contains(range.endContainer)) {
        return false;
    }

    range.deleteContents();
    const trailingRange = document.createRange();
    trailingRange.setStart(range.startContainer, range.startOffset);
    trailingRange.setEnd(item, item.childNodes.length);
    const trailingContent = trailingRange.extractContents();

    const nextItem = item.cloneNode(false) as HTMLElement;
    const isTaskItem = item.classList.contains('erebus-markdown-task-list-item');
    if (isTaskItem) {
        Array.from(trailingContent.childNodes).forEach(node => {
            if (node instanceof HTMLInputElement && node.type === 'checkbox') {
                node.remove();
            }
        });
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.tabIndex = -1;
        checkbox.className = 'erebus-task-checkbox';
        checkbox.setAttribute('contenteditable', 'false');
        nextItem.append(checkbox, document.createTextNode(' '));
    }
    nextItem.appendChild(trailingContent);
    if (!(item.textContent ?? '').trim() && !item.querySelector('br')) {
        item.appendChild(document.createElement('br'));
    }
    if (!(nextItem.textContent ?? '').trim() && !nextItem.querySelector('br')) {
        nextItem.appendChild(document.createElement('br'));
    }
    list.insertBefore(nextItem, item.nextSibling);
    if (isTaskItem) {
        placeCaretAtOffset(nextItem, 1);
    } else {
        placeCaretInside(nextItem);
    }
    return true;
}

export function RichMarkdownEditor({
    value,
    disabled,
    placeholder,
    ariaLabel,
    onChange,
    onSubmit
}: RichMarkdownEditorProps): React.ReactElement {
    const editorRef = useRef<HTMLDivElement>();
    const lastEmittedValue = useRef<string | undefined>();
    const composing = useRef(false);
    const macroUndoEntries = useRef<MacroUndoEntry[]>([]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || value === lastEmittedValue.current) {
            return;
        }
        // editableMarkdownHtml is produced by the sanitized Markdown renderer.
        // eslint-disable-next-line no-unsanitized/property
        editor.innerHTML = editableMarkdownHtml(value);
        editor.dataset.empty = String(!value.trim());
        lastEmittedValue.current = value;
        macroUndoEntries.current = [];
    }, [value]);

    const emitValue = (): string => {
        const editor = editorRef.current;
        if (!editor) {
            return '';
        }
        const markdown = serializeRichMarkdownEditor(editor);
        editor.dataset.empty = String(!markdown);
        lastEmittedValue.current = markdown;
        onChange(markdown);
        return markdown;
    };

    const captureEditorSnapshot = (editor: HTMLElement): EditorSnapshot => ({
        html: editor.innerHTML,
        markdown: serializeRichMarkdownEditor(editor),
        selection: captureSelection(editor)
    });

    const undoAutomaticMacro = (): boolean => {
        const editor = editorRef.current;
        const entry = macroUndoEntries.current[macroUndoEntries.current.length - 1];
        if (!editor || !entry || editor.innerHTML !== entry.afterHtml) {
            return false;
        }
        macroUndoEntries.current.pop();
        // This is an exact snapshot captured from this sanitized editor immediately before its automatic conversion.
        // eslint-disable-next-line no-unsanitized/property
        editor.innerHTML = entry.html;
        const textWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        let textNode = textWalker.nextNode();
        while (textNode) {
            textNode.textContent = textNode.textContent?.replace(/\u00a0/gu, ' ') ?? '';
            textNode = textWalker.nextNode();
        }
        editor.dataset.empty = String(!entry.markdown);
        lastEmittedValue.current = entry.markdown;
        restoreSelection(editor, entry.selection);
        onChange(entry.markdown);
        return true;
    };

    const handleInput = (): void => {
        if (composing.current) {
            return;
        }
        const editor = editorRef.current;
        const selection = window.getSelection();
        if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) {
            return;
        }
        const beforeMacro = captureEditorSnapshot(editor);
        const element = selectionElement(selection);
        const code = element?.closest<HTMLElement>('.erebus-code-block pre code');
        let transformed = false;
        if (code) {
            const offset = caretOffsetWithin(code);
            const language = code.closest('.erebus-code-block')?.querySelector<HTMLSelectElement>('[data-markdown-language]')?.value ?? '';
            highlightEditableCode(code, language, offset);
        } else {
            transformed = applyBlockMacro(editor, selection);
            if (!transformed) {
                transformed = applyInlineMacro(editor, selection);
            }
        }
        emitValue();
        if (transformed) {
            macroUndoEntries.current.push({
                ...beforeMacro,
                afterHtml: editor.innerHTML
            });
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (disabled) {
            event.preventDefault();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key.toLowerCase() === 'b' || event.key.toLowerCase() === 'i')) {
            if (wrapSelection(event.key.toLowerCase() === 'b' ? 'strong' : 'em')) {
                event.preventDefault();
                emitValue();
            }
            return;
        }
        if (event.key === 'Tab') {
            const tabCode = selectionElement(window.getSelection() as Selection)?.closest('.erebus-code-block pre code');
            if (tabCode) {
                event.preventDefault();
                insertTextAtSelection('    ');
                handleInput();
            }
            return;
        }
        if (event.key === 'Backspace' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
            const editor = editorRef.current;
            const selection = window.getSelection();
            if (editor && selection && removeBlockFormattingAtStart(editor, selection)) {
                event.preventDefault();
                emitValue();
            }
            return;
        }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight')
            && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
            const editor = editorRef.current;
            const selection = window.getSelection();
            if (editor && selection && exitFormattedBoundary(editor, selection, event.key === 'ArrowRight')) {
                event.preventDefault();
            }
            return;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey) {
            const editor = editorRef.current;
            const selection = window.getSelection();
            if (editor && selection && exitToNextLine(editor, selection)) {
                event.preventDefault();
                emitValue();
            }
            return;
        }
        if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const editor = editorRef.current;
            const selection = window.getSelection();
            if (editor && selection && splitListItemAtSelection(editor, selection)) {
                event.preventDefault();
                emitValue();
            }
            return;
        }
        if (event.key !== 'Enter' || event.shiftKey) {
            return;
        }
        event.preventDefault();
        onSubmit();
    };

    const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (!disabled && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z'
            && undoAutomaticMacro()) {
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
        }
    };

    const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>): void => {
        const inputEvent = event.nativeEvent as InputEvent;
        if (!disabled && inputEvent.inputType === 'historyUndo' && undoAutomaticMacro()) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    const handleEditorChange = (event: React.ChangeEvent<HTMLDivElement>): void => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.matches('[data-markdown-language]')) {
            const code = target.closest('.erebus-code-block')?.querySelector<HTMLElement>('pre code');
            if (code) {
                const offset = caretOffsetWithin(code);
                highlightEditableCode(code, target.value, offset);
                emitValue();
            }
        } else if (target instanceof HTMLInputElement && target.type === 'checkbox') {
            emitValue();
        }
    };

    const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const link = target.closest('a');
        if (link && !(event.ctrlKey || event.metaKey)) {
            event.preventDefault();
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
        ref={element => editorRef.current = element ?? undefined}
        className='erebus-rich-markdown-editor erebus-markdown'
        contentEditable={!disabled}
        suppressContentEditableWarning
        role='textbox'
        aria-label={ariaLabel}
        aria-multiline='true'
        aria-disabled={disabled}
        data-placeholder={placeholder}
        data-empty={String(!value.trim())}
        spellCheck
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onKeyDownCapture={handleKeyDownCapture}
        onKeyDown={handleKeyDown}
        onChange={handleEditorChange}
        onClick={handleClick}
        onCompositionStart={() => composing.current = true}
        onCompositionEnd={() => {
            composing.current = false;
            handleInput();
        }}
        onFocus={() => {
            const editor = editorRef.current;
            if (editor?.dataset.empty === 'true' && editor.firstElementChild instanceof HTMLElement) {
                placeCaretInside(editor.firstElementChild);
            }
        }}
        onBlur={emitValue}
    />;
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
