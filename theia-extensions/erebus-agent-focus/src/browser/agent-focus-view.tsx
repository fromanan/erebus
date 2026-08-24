/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';
import type { TheiaCoreAPI } from '@theia/core/lib/electron-common/electron-api';
import {
    ConversationProvider,
    ConversationSourceStatus,
    ConversationSyncService,
    SyncedConversationDetail,
    SyncedConversationSummary
} from '../common/conversation-sync-protocol';
import { SEED_SESSIONS, WORKFLOWS } from './agent-focus-fixtures';
import { MarkdownContent, RichMarkdownEditor } from './agent-focus-markdown';
import {
    FocusContextItem,
    FocusExecutionParameters,
    FocusMessage,
    FocusSession,
    SessionKind,
    SessionStatus,
    WorkflowKind
} from './agent-focus-types';

const { useEffect, useMemo, useRef, useState } = React;

const DEFAULT_RAIL_WIDTH = 290;
const MIN_RAIL_WIDTH = 220;
const MAX_RAIL_WIDTH = 520;
const RAIL_WIDTH_STORAGE_KEY = 'erebus.agentFocus.railWidth';
const PROJECT_CATEGORIES_STORAGE_KEY = 'erebus.agentFocus.projectCategories';
const PROJECTS_STORAGE_KEY = 'erebus.agentFocus.projects';
const PROJECT_TAGS_STORAGE_KEY = 'erebus.agentFocus.projectTags';
const PROJECT_SELECTED_TAGS_STORAGE_KEY = 'erebus.agentFocus.selectedProjectTags';
const CATEGORY_VIEW_STORAGE_KEY = 'erebus.agentFocus.categoryView';
const SHOW_HIDDEN_STORAGE_KEY = 'erebus.agentFocus.showHidden';
const UNCATEGORIZED_CATEGORY_ID = 'erebus-uncategorized';
const UNCATEGORIZED_CATEGORY_NAME = 'Uncategorized';
const CONVERSATION_SYNC_INTERVAL_MS = 15_000;
// Keep the full-screen action available for easy re-enabling, but hide it from the default toolbar.
const SHOW_FULL_SCREEN_WINDOW_CONTROL = false;
const PROJECT_HOLD_THRESHOLD_MS = 500;
const EXTERNAL_PROVIDER_ORDER: ConversationProvider[] = ['claude', 'codex', 'kiro'];
const COMPOSER_AGENT_STORAGE_KEY = 'erebus.agentFocus.composerAgent';
const COMPOSER_EFFORT_STORAGE_KEY = 'erebus.agentFocus.composerEffort';
const COMPOSER_ACCESS_STORAGE_KEY = 'erebus.agentFocus.composerAccess';
const COMPOSER_AUTOPILOT_STORAGE_KEY = 'erebus.agentFocus.composerAutopilot';

type ComposerAgent = 'erebus' | 'explore' | 'review';
type ComposerEffort = 'quick' | 'balanced' | 'deep' | 'extra-high';
type ComposerAccess = 'ask' | 'approve' | 'full' | 'custom';
type ComposerMenu = 'context' | 'agent' | 'effort' | 'access';

interface ComposerSubmission {
    agent: ComposerAgent;
    effort: ComposerEffort;
    access: ComposerAccess;
    autopilot: boolean;
    context: FocusContextItem[];
}

interface ComposerOption<T extends string> {
    value: T;
    label: string;
    detail: string;
    icon: string;
}

const COMPOSER_AGENTS: ComposerOption<ComposerAgent>[] = [
    { value: 'erebus', label: 'Erebus Agent', detail: 'General coding and project work', icon: 'codicon-sparkle' },
    { value: 'explore', label: 'Explore Agent', detail: 'Read-heavy investigation and codebase mapping', icon: 'codicon-search' },
    { value: 'review', label: 'Review Agent', detail: 'Focused change review and risk analysis', icon: 'codicon-comment-discussion' }
];

const COMPOSER_EFFORTS: ComposerOption<ComposerEffort>[] = [
    { value: 'quick', label: 'Quick', detail: 'Fast responses for small, well-defined tasks', icon: 'codicon-zap' },
    { value: 'balanced', label: 'Balanced', detail: 'A practical balance of speed and depth', icon: 'codicon-dashboard' },
    { value: 'deep', label: 'Deep', detail: 'More deliberate investigation and validation', icon: 'codicon-lightbulb' },
    { value: 'extra-high', label: 'Extra High', detail: 'Maximum reasoning for difficult work', icon: 'codicon-rocket' }
];

const COMPOSER_ACCESS_MODES: ComposerOption<ComposerAccess>[] = [
    { value: 'ask', label: 'Ask for approval', detail: 'Always ask before editing files or using the internet', icon: 'codicon-question' },
    { value: 'approve', label: 'Approve for me', detail: 'Only ask for actions detected as potentially unsafe', icon: 'codicon-shield' },
    { value: 'full', label: 'Full access', detail: 'Unrestricted access to the internet and any file on your computer', icon: 'codicon-unlock' },
    { value: 'custom', label: 'Custom (config.toml)', detail: 'Uses permissions defined in config.toml', icon: 'codicon-settings-gear' }
];

interface ProjectCategory {
    id: string;
    name: string;
    projects: string[];
}

type ProjectKind = 'local' | 'remote';

interface ProjectDefinition {
    id: string;
    name: string;
    kind: ProjectKind;
    sourceFolders: string[];
    tags: string[];
    hidden: boolean;
}

interface ProjectGroup {
    project: ProjectDefinition;
    sessions: FocusSession[];
}

interface NewProjectInput {
    name: string;
    kind: ProjectKind;
    sourceFolders: string[];
}

export interface AgentFocusViewProps {
    conversationSyncService: ConversationSyncService;
    onExitFocusMode: () => void;
}

const providerLabels: Record<ConversationProvider, string> = {
    claude: 'Claude',
    codex: 'Codex',
    kiro: 'Kiro'
};

const providerMonograms: Record<ConversationProvider, string> = {
    claude: 'CL',
    codex: 'CX',
    kiro: 'KI'
};

const externalProviderAccentPalette = {
    claude: '#d6ad68',
    codex: '#71b7ff',
    kiro: '#9b6cff',
    reservedNext: '#45c59a'
};

const providerAccents: Record<ConversationProvider, string> = externalProviderAccentPalette;

function relativeUpdatedAt(updatedAt: string): string {
    const elapsed = Math.max(0, Date.now() - Date.parse(updatedAt));
    if (elapsed < 60_000) {
        return 'now';
    }
    if (elapsed < 3_600_000) {
        return `${Math.floor(elapsed / 60_000)} min`;
    }
    if (elapsed < 86_400_000) {
        return `${Math.floor(elapsed / 3_600_000)} hr`;
    }
    return `${Math.floor(elapsed / 86_400_000)} d`;
}

function focusSessionFromSummary(summary: SyncedConversationSummary, existing?: FocusSession): FocusSession {
    const providerLabel = providerLabels[summary.provider];
    const sameVersion = existing?.sourceUpdatedAt === summary.updatedAt;
    const session: FocusSession = {
        ...existing,
        id: `${summary.provider}:${summary.id}`,
        provider: summary.provider,
        externalId: summary.id,
        workspace: summary.workspace,
        title: summary.title,
        summary: existing?.summary
            ?? `${providerLabel} · ${summary.messageCount === undefined ? 'synced conversation' : `${summary.messageCount} messages`}`,
        updated: sameVersion && existing ? existing.updated : relativeUpdatedAt(summary.updatedAt),
        status: summary.active ? 'working' : 'paused',
        kind: 'cli',
        monogram: providerMonograms[summary.provider],
        accent: providerAccents[summary.provider],
        messages: existing?.messages ?? [],
        requirement: `Read-only conversation synchronized from ${providerLabel}'s local session store.`,
        designNotes: existing?.designNotes ?? [
            `Source remains owned by ${providerLabel}`,
            'Erebus does not modify external conversation files',
            'New turns must currently be sent from the source application'
        ],
        tasks: existing?.tasks ?? [],
        changedFiles: existing?.changedFiles ?? [],
        sourceUpdatedAt: summary.updatedAt,
        readOnly: true,
        loading: existing?.loading ?? false,
        truncatedMessages: existing?.truncatedMessages ?? 0
    };
    if (existing
        && existing.workspace === session.workspace
        && existing.title === session.title
        && existing.updated === session.updated
        && existing.status === session.status
        && existing.monogram === session.monogram
        && existing.accent === session.accent
        && existing.sourceUpdatedAt === session.sourceUpdatedAt) {
        return existing;
    }
    return session;
}

function reconcileConversationSources(
    current: ConversationSourceStatus[],
    incoming: ConversationSourceStatus[]
): ConversationSourceStatus[] {
    if (current.length === incoming.length && current.every((source, index) => {
        const next = incoming[index];
        return source.provider === next.provider
            && source.available === next.available
            && source.conversationCount === next.conversationCount
            && source.message === next.message;
    })) {
        return current;
    }
    return incoming;
}

function reconcileSyncedSessions(current: FocusSession[], summaries: SyncedConversationSummary[]): FocusSession[] {
    const local = current.filter(session => session.provider === 'erebus');
    const external = current.filter(session => session.provider !== 'erebus');
    const remaining = new Map(summaries.map(summary => [`${summary.provider}:${summary.id}`, summary]));
    const nextExternal: FocusSession[] = [];

    external.forEach(session => {
        const summary = remaining.get(session.id);
        if (summary) {
            nextExternal.push(focusSessionFromSummary(summary, session));
            remaining.delete(session.id);
        }
    });
    summaries.forEach(summary => {
        const id = `${summary.provider}:${summary.id}`;
        if (remaining.has(id)) {
            nextExternal.push(focusSessionFromSummary(summary));
            remaining.delete(id);
        }
    });

    const next = [...local, ...nextExternal];
    return next.length === current.length && next.every((session, index) => session === current[index])
        ? current
        : next;
}

function sameSyncedMessage(left: FocusMessage, right: FocusMessage): boolean {
    return left.id === right.id
        && left.role === right.role
        && left.toolCalls === right.toolCalls
        && left.body.length === right.body.length
        && left.body.every((part, index) => part === right.body[index]);
}

function reconcileSyncedMessages(current: FocusMessage[], incoming: FocusMessage[]): FocusMessage[] {
    if (incoming.length >= current.length && current.every((message, index) => sameSyncedMessage(message, incoming[index]))) {
        return incoming.length === current.length ? current : [...current, ...incoming.slice(current.length)];
    }
    return incoming;
}

function applyConversationDetail(session: FocusSession, detail: SyncedConversationDetail): FocusSession {
    const messages = reconcileSyncedMessages(session.messages, detail.messages);
    const summary = `${providerLabels[detail.provider]} · ${detail.messages.length + detail.truncatedMessages} messages`;
    const status = detail.active ? 'working' : 'paused';
    if (messages === session.messages
        && summary === session.summary
        && detail.updatedAt === session.sourceUpdatedAt
        && status === session.status
        && !session.loading
        && detail.truncatedMessages === session.truncatedMessages) {
        return session;
    }
    return {
        ...session,
        messages,
        summary,
        sourceUpdatedAt: detail.updatedAt,
        status,
        loading: false,
        truncatedMessages: detail.truncatedMessages
    };
}

const statusLabels: Record<SessionStatus, string> = {
    working: 'Working',
    attention: 'Needs attention',
    paused: 'Paused',
    complete: 'Complete'
};

const kindIcons: Record<SessionKind, string> = {
    local: 'codicon-device-desktop',
    cloud: 'codicon-cloud',
    cli: 'codicon-terminal'
};

function Icon({ name, className = '' }: { name: string; className?: string }): React.ReactElement {
    return <i aria-hidden='true' className={`codicon ${name} ${className}`} />;
}

function StatusDot({ status }: { status: SessionStatus }): React.ReactElement {
    return <span className={`erebus-status-dot is-${status}`} title={statusLabels[status]} aria-label={statusLabels[status]} />;
}

function AgentMark({ small = false }: { small?: boolean }): React.ReactElement {
    return <span className={`erebus-agent-mark${small ? ' is-small' : ''}`} aria-hidden='true'>
        <span />
        <span />
    </span>;
}

function clampRailWidth(width: number): number {
    return Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, width));
}

function loadRailWidth(): number {
    try {
        const storedWidth = Number(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY));
        return Number.isFinite(storedWidth) && storedWidth > 0 ? clampRailWidth(storedWidth) : DEFAULT_RAIL_WIDTH;
    } catch {
        return DEFAULT_RAIL_WIDTH;
    }
}

function loadProjectCategories(): ProjectCategory[] {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(PROJECT_CATEGORIES_STORAGE_KEY) ?? '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.flatMap(candidate => {
            if (!candidate || typeof candidate !== 'object') {
                return [];
            }
            const record = candidate as Record<string, unknown>;
            if (typeof record.id !== 'string' || typeof record.name !== 'string' || !Array.isArray(record.projects)) {
                return [];
            }
            return [{
                id: record.id,
                name: record.name,
                projects: record.projects.filter((project): project is string => typeof project === 'string')
            }];
        }).filter(category => category.id !== UNCATEGORIZED_CATEGORY_ID
            && category.name.toLocaleLowerCase() !== UNCATEGORIZED_CATEGORY_NAME.toLocaleLowerCase());
    } catch {
        return [];
    }
}

function loadProjects(): ProjectDefinition[] {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(PROJECTS_STORAGE_KEY) ?? '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.flatMap(candidate => {
            if (!candidate || typeof candidate !== 'object') {
                return [];
            }
            const record = candidate as Record<string, unknown>;
            if (typeof record.id !== 'string' || typeof record.name !== 'string'
                || (record.kind !== 'local' && record.kind !== 'remote') || !Array.isArray(record.sourceFolders)) {
                return [];
            }
            return [{
                id: record.id,
                name: record.name,
                kind: record.kind,
                sourceFolders: record.sourceFolders.filter((folder): folder is string => typeof folder === 'string'),
                tags: Array.isArray(record.tags)
                    ? record.tags.filter((tag): tag is string => typeof tag === 'string')
                    : [],
                hidden: record.hidden === true
            }];
        });
    } catch {
        return [];
    }
}

function loadStoredStringList(storageKey: string): string[] {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
        return [];
    }
}

function loadStoredBoolean(storageKey: string, fallback: boolean): boolean {
    try {
        const stored = window.localStorage.getItem(storageKey);
        return typeof stored === 'string' ? stored === 'true' : fallback;
    } catch {
        return fallback;
    }
}

function loadComposerPreference<T extends string>(
    storageKey: string,
    options: ReadonlyArray<ComposerOption<T>>,
    fallback: T
): T {
    try {
        const stored = window.localStorage.getItem(storageKey);
        return options.some(option => option.value === stored) ? stored as T : fallback;
    } catch {
        return fallback;
    }
}

function loadComposerAutopilot(): boolean {
    try {
        return window.localStorage.getItem(COMPOSER_AUTOPILOT_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
}

function storeComposerPreference(storageKey: string, value: string | boolean): void {
    try {
        window.localStorage.setItem(storageKey, String(value));
    } catch {
        // Persistence is optional in restricted browser contexts.
    }
}

function getElectronWindowApi(): TheiaCoreAPI | undefined {
    return 'electronTheiaCore' in window ? window.electronTheiaCore : undefined;
}

function pathForAttachedFile(file: File): string {
    try {
        return getElectronWindowApi()?.getPathForFile(file) || file.webkitRelativePath || file.name;
    } catch {
        return file.webkitRelativePath || file.name;
    }
}

function folderSelectionFromFiles(files: File[]): { name: string; path: string } | undefined {
    const firstFile = files[0];
    if (!firstFile) {
        return undefined;
    }
    const absolutePath = pathForAttachedFile(firstFile);
    const relativePath = firstFile.webkitRelativePath;
    const relativeRoot = relativePath.split('/')[0];
    if (relativeRoot && relativePath) {
        const separator = absolutePath.includes('\\') ? '\\' : '/';
        const normalizedRelativePath = relativePath.replace(/[\\/]/g, separator);
        if (absolutePath.toLocaleLowerCase().endsWith(normalizedRelativePath.toLocaleLowerCase())) {
            return {
                name: relativeRoot,
                path: `${absolutePath.slice(0, -normalizedRelativePath.length)}${relativeRoot}`
            };
        }
        return { name: relativeRoot, path: relativeRoot };
    }
    const pathParts = absolutePath.split(/[\\/]/).filter(Boolean);
    const fallbackName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : pathParts[0] || 'Project';
    const lastSeparator = Math.max(absolutePath.lastIndexOf('/'), absolutePath.lastIndexOf('\\'));
    return {
        name: fallbackName,
        path: lastSeparator > 0 ? absolutePath.slice(0, lastSeparator) : absolutePath
    };
}

function hasSelectedTag(tags: readonly string[], selectedTags: ReadonlySet<string>): boolean {
    return selectedTags.size === 0 || tags.some(tag => selectedTags.has(tag));
}

function matchesSearchQuery(query: string, values: ReadonlyArray<string | undefined>): boolean {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
        return true;
    }
    const searchableText = values.filter((value): value is string => Boolean(value)).join('\n').toLocaleLowerCase();
    return terms.every(term => searchableText.includes(term));
}

function sessionMatchesSearch(session: FocusSession, query: string): boolean {
    return matchesSearchQuery(query, [
        session.title,
        session.summary,
        session.workspace,
        session.provider,
        ...session.tags ?? []
    ]);
}

function toggleElectronWindowMaximized(): void {
    const electronApi = getElectronWindowApi();
    if (!electronApi) {
        return;
    }
    if (electronApi.isMaximized()) {
        electronApi.unMaximize();
    } else {
        electronApi.maximize();
    }
}

function WindowControls(): React.ReactElement {
    const electronApi = getElectronWindowApi();
    const [maximized, setMaximized] = useState(() => electronApi?.isMaximized() ?? false);
    const [fullScreen, setFullScreen] = useState(() => electronApi?.isFullScreen() ?? false);

    useEffect(() => {
        if (!electronApi) {
            return undefined;
        }

        const syncWindowState = (): void => {
            setMaximized(electronApi.isMaximized());
            setFullScreen(electronApi.isFullScreen());
        };
        const disposables = [
            electronApi.onWindowEvent('maximize', syncWindowState),
            electronApi.onWindowEvent('unmaximize', syncWindowState),
            electronApi.onWindowEvent('focus', syncWindowState)
        ];
        syncWindowState();
        return () => disposables.forEach(disposable => disposable.dispose());
    }, [electronApi]);

    if (!electronApi) {
        return <></>;
    }

    const toggleMaximized = (): void => {
        const nextMaximized = !electronApi.isMaximized();
        toggleElectronWindowMaximized();
        setMaximized(nextMaximized);
    };
    const toggleFullScreen = (): void => {
        electronApi.toggleFullScreen();
        setFullScreen(value => !value);
    };

    return <div className='erebus-window-controls' aria-label='Window controls'>
        <button type='button' className='erebus-window-control' onClick={() => electronApi.minimize()}
            aria-label='Minimize Erebus' title='Minimize'>
            <Icon name='codicon-chrome-minimize' />
        </button>
        <button type='button' className='erebus-window-control' onClick={toggleMaximized}
            aria-label={maximized ? 'Restore Erebus window' : 'Maximize Erebus'} title={maximized ? 'Restore' : 'Maximize'}>
            <Icon name={maximized ? 'codicon-chrome-restore' : 'codicon-chrome-maximize'} />
        </button>
        {SHOW_FULL_SCREEN_WINDOW_CONTROL && <button type='button' className='erebus-window-control' onClick={toggleFullScreen}
            aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'} title={fullScreen ? 'Exit full screen' : 'Full screen'}>
            <Icon name={fullScreen ? 'codicon-screen-normal' : 'codicon-screen-full'} />
        </button>}
        <button type='button' className='erebus-window-control is-close' onClick={() => electronApi.close()}
            aria-label='Close Erebus' title='Close Erebus'>
            <Icon name='codicon-chrome-close' />
        </button>
    </div>;
}

function SessionRow({ session, active, collapsed, onSelect }: {
    session: FocusSession;
    active: boolean;
    collapsed: boolean;
    onSelect: () => void;
}): React.ReactElement {
    if (collapsed) {
        return <button
            type='button'
            className={`erebus-session-tile${active ? ' is-active' : ''}`}
            onClick={onSelect}
            title={`${session.title} — ${statusLabels[session.status]}`}
            aria-label={`${session.title}, ${statusLabels[session.status]}`}
        >
            <span className='erebus-session-monogram' style={{ '--session-accent': session.accent } as React.CSSProperties}>
                {session.monogram}
            </span>
            <StatusDot status={session.status} />
            <Icon name={kindIcons[session.kind]} className='erebus-session-kind' />
        </button>;
    }

    return <button
        type='button'
        className={`erebus-session-row${active ? ' is-active' : ''}`}
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
    >
        <span className='erebus-session-row-topline'>
            <span className='erebus-session-title'>
                <StatusDot status={session.status} />
                {session.title}
            </span>
            <span className='erebus-session-time'>{session.updated}</span>
        </span>
        <span className='erebus-session-summary'>{session.summary}</span>
        <span className='erebus-session-meta'>
            <Icon name={kindIcons[session.kind]} />
            {session.kind}
        </span>
    </button>;
}

function RailToolbar({
    searchQuery,
    categoryView,
    showHidden,
    tags,
    selectedTags,
    onSearchQueryChange,
    onToggleCategoryView,
    onToggleShowHidden,
    onSelectAllTags,
    onToggleTag,
    onCreateTag
}: {
    searchQuery: string;
    categoryView: boolean;
    showHidden: boolean;
    tags: string[];
    selectedTags: ReadonlySet<string>;
    onSearchQueryChange: (query: string) => void;
    onToggleCategoryView: () => void;
    onToggleShowHidden: () => void;
    onSelectAllTags: () => void;
    onToggleTag: (tag: string) => void;
    onCreateTag: (tag: string) => void;
}): React.ReactElement {
    const [searchOpen, setSearchOpen] = useState(false);
    const [tagMenuOpen, setTagMenuOpen] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const toolbarRef = useRef<HTMLDivElement | undefined>(undefined);
    const searchInputRef = useRef<HTMLInputElement | undefined>(undefined);
    const trimmedTagName = newTagName.trim();
    const duplicateTag = tags.some(tag => tag.toLocaleLowerCase() === trimmedTagName.toLocaleLowerCase());

    useEffect(() => {
        if (!tagMenuOpen) {
            return undefined;
        }
        const closeOnPointerDown = (event: PointerEvent): void => {
            if (!toolbarRef.current?.contains(event.target as Node)) {
                setTagMenuOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                setTagMenuOpen(false);
            }
        };
        window.addEventListener('pointerdown', closeOnPointerDown);
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            window.removeEventListener('pointerdown', closeOnPointerDown);
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [tagMenuOpen]);

    useEffect(() => {
        if (searchOpen) {
            searchInputRef.current?.focus();
        }
    }, [searchOpen]);

    const createTag = (): void => {
        if (!trimmedTagName || duplicateTag) {
            return;
        }
        onCreateTag(trimmedTagName);
        setNewTagName('');
    };

    const closeSearch = (): void => {
        onSearchQueryChange('');
        setSearchOpen(false);
    };

    return <div ref={element => toolbarRef.current = element ?? undefined} className='erebus-rail-toolbar-shell'>
        <div className='erebus-rail-toolbar' aria-label='Project view controls'>
            <button type='button' className={`erebus-rail-search-toggle${searchOpen ? ' is-active' : ''}`}
                aria-expanded={searchOpen} aria-controls='erebus-rail-search' aria-label='Search projects and conversations'
                title='Search projects and conversations' onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}>
                <Icon name='codicon-search' />
            </button>
            <button type='button' className={categoryView ? 'is-active' : ''} aria-pressed={categoryView}
                onClick={onToggleCategoryView} aria-label='Category view mode' title={`Category view ${categoryView ? 'on' : 'off'}`}>
                <Icon name={categoryView ? 'codicon-folder-active' : 'codicon-folder'} />
            </button>
            <button type='button' className={showHidden ? 'is-active' : ''} aria-pressed={showHidden}
                onClick={onToggleShowHidden} aria-label='Show hidden conversations and projects'
                title={`Show hidden conversations and projects ${showHidden ? 'on' : 'off'}`}>
                <Icon name={showHidden ? 'codicon-eye' : 'codicon-eye-closed'} />
            </button>
            <span className='erebus-rail-tag-shell'>
                <button type='button' className={selectedTags.size > 0 || tagMenuOpen ? 'is-active' : ''}
                    aria-haspopup='dialog' aria-expanded={tagMenuOpen} onClick={() => setTagMenuOpen(open => !open)}
                    aria-label='Filter projects and conversations by tag' title='Filter by tag'>
                    <Icon name='codicon-tag' />
                    {selectedTags.size > 0 && <span className='erebus-rail-filter-count'>{selectedTags.size}</span>}
                </button>
                {tagMenuOpen && <div className='erebus-tag-filter-menu' role='dialog' aria-label='Tag filters'>
                    <header>Tags</header>
                    <label className='erebus-tag-filter-option'>
                        <input type='checkbox' checked={selectedTags.size === 0} onChange={onSelectAllTags} />
                        <span>All</span>
                    </label>
                    {tags.map(tag => <label className='erebus-tag-filter-option' key={tag}>
                        <input type='checkbox' checked={selectedTags.has(tag)} onChange={() => onToggleTag(tag)} />
                        <span>{tag}</span>
                    </label>)}
                    {tags.length === 0 && <span className='erebus-tag-filter-empty'>No tags yet</span>}
                    <form className='erebus-tag-create-row' onSubmit={event => {
                        event.preventDefault();
                        createTag();
                    }}>
                        <input value={newTagName} onChange={event => setNewTagName(event.currentTarget.value)}
                            placeholder='Create a tag' aria-label='New tag name' aria-invalid={duplicateTag || undefined} />
                        <button type='submit' disabled={!trimmedTagName || duplicateTag} aria-label='Create tag' title='Create tag'>
                            <Icon name='codicon-add' />
                        </button>
                    </form>
                    {duplicateTag && <span className='erebus-tag-filter-error'>That tag already exists.</span>}
                </div>}
            </span>
        </div>
        {searchOpen && <div id='erebus-rail-search' className='erebus-rail-search' role='search'>
            <Icon name='codicon-search' />
            <input ref={element => searchInputRef.current = element ?? undefined} type='search' value={searchQuery}
                onChange={event => onSearchQueryChange(event.currentTarget.value)} placeholder='Search projects and conversations'
                aria-label='Search projects and conversations' onKeyDown={event => {
                    if (event.key === 'Escape') {
                        closeSearch();
                    }
                }} />
            {searchQuery && <button type='button' onClick={() => onSearchQueryChange('')} aria-label='Clear search' title='Clear search'>
                <Icon name='codicon-close' />
            </button>}
        </div>}
    </div>;
}

function SessionRail({ sessions, projects, categories, sources, selectedId, collapsed, onSelect, onNewSession, onNewProject, onCreateCategory, onAssignProject }: {
    sessions: FocusSession[];
    projects: ProjectDefinition[];
    categories: ProjectCategory[];
    sources: ConversationSourceStatus[];
    selectedId: string;
    collapsed: boolean;
    onSelect: (id: string) => void;
    onNewSession: () => void;
    onNewProject: () => void;
    onCreateCategory: (project?: string) => void;
    onAssignProject: (categoryId: string, project: string) => void;
}): React.ReactElement {
    const [collapsedProjects, setCollapsedProjects] = useState<ReadonlySet<string>>(() => new Set());
    const [collapsedCategories, setCollapsedCategories] = useState<ReadonlySet<string>>(() => new Set());
    const [collapsedProviders, setCollapsedProviders] = useState<ReadonlySet<ConversationProvider>>(
        () => new Set(EXTERNAL_PROVIDER_ORDER)
    );
    const [categoryView, setCategoryView] = useState(() => loadStoredBoolean(CATEGORY_VIEW_STORAGE_KEY, true));
    const [showHidden, setShowHidden] = useState(() => loadStoredBoolean(SHOW_HIDDEN_STORAGE_KEY, true));
    const [searchQuery, setSearchQuery] = useState('');
    const [definedTags, setDefinedTags] = useState(() => loadStoredStringList(PROJECT_TAGS_STORAGE_KEY));
    const [selectedTags, setSelectedTags] = useState<ReadonlySet<string>>(
        () => new Set(loadStoredStringList(PROJECT_SELECTED_TAGS_STORAGE_KEY))
    );
    const [draggedProject, setDraggedProject] = useState<string | undefined>();
    const [dropCategoryId, setDropCategoryId] = useState<string | undefined>();
    const initializedExternalProjects = useRef(new Set<string>());
    const projectDragCleanupRef = useRef<(() => void) | undefined>();
    const suppressedProjectClickRef = useRef<string | undefined>();
    const searching = searchQuery.trim().length > 0;

    const availableTags = useMemo(() => {
        const result = new Map<string, string>();
        [...definedTags, ...projects.flatMap(project => project.tags), ...sessions.flatMap(session => session.tags ?? [])]
            .forEach(tag => {
                const trimmedTag = tag.trim();
                if (trimmedTag && !result.has(trimmedTag.toLocaleLowerCase())) {
                    result.set(trimmedTag.toLocaleLowerCase(), trimmedTag);
                }
            });
        return [...result.values()];
    }, [definedTags, projects, sessions]);

    const groups = useMemo<ProjectGroup[]>(() => {
        const sessionGroups = new Map<string, FocusSession[]>();
        sessions.filter(session => session.provider === 'erebus').forEach(session => {
            const group = sessionGroups.get(session.workspace) ?? [];
            group.push(session);
            sessionGroups.set(session.workspace, group);
        });
        const projectDefinitions = new Map(projects.map(project => [project.name.toLocaleLowerCase(), project]));
        const orderedProjectNames = [
            ...sessionGroups.keys(),
            ...projects.map(project => project.name).filter(name => !sessionGroups.has(name))
        ];
        return orderedProjectNames.flatMap(name => {
            const workspaceSessions = sessionGroups.get(name) ?? [];
            const definition = projectDefinitions.get(name.toLocaleLowerCase());
            const projectTags = definition?.tags ?? Array.from(new Set(workspaceSessions.flatMap(session => session.tags ?? [])));
            const project: ProjectDefinition = definition ?? {
                id: `session-project-${encodeURIComponent(name)}`,
                name,
                kind: workspaceSessions.some(session => session.kind === 'cloud') ? 'remote' : 'local',
                sourceFolders: [],
                tags: projectTags,
                hidden: workspaceSessions.length > 0 && workspaceSessions.every(session => session.hidden === true)
            };
            if (!showHidden && project.hidden) {
                return [];
            }
            const projectMatchesTags = hasSelectedTag(project.tags, selectedTags);
            const projectMatchesSearch = matchesSearchQuery(searchQuery, [
                project.name,
                project.kind,
                ...project.sourceFolders,
                ...project.tags
            ]);
            const visibleSessions = workspaceSessions.filter(session => (showHidden || !session.hidden)
                && (projectMatchesTags || hasSelectedTag(session.tags ?? [], selectedTags))
                && (projectMatchesSearch || sessionMatchesSearch(session, searchQuery)));
            if (selectedTags.size > 0 && !projectMatchesTags && visibleSessions.length === 0) {
                return [];
            }
            if (searching && !projectMatchesSearch && visibleSessions.length === 0) {
                return [];
            }
            return [{ project, sessions: visibleSessions }];
        });
    }, [projects, searchQuery, searching, selectedTags, sessions, showHidden]);
    const externalGroups = useMemo(() => {
        const result = new Map<ConversationProvider, Map<string, FocusSession[]>>();
        EXTERNAL_PROVIDER_ORDER.forEach(provider => result.set(provider, new Map()));
        sessions.filter(session => session.provider !== 'erebus'
            && (showHidden || !session.hidden)
            && hasSelectedTag(session.tags ?? [], selectedTags)
            && matchesSearchQuery(searchQuery, [
                session.provider,
                providerLabels[session.provider as ConversationProvider],
                session.workspace,
                session.title,
                session.summary,
                ...session.tags ?? []
            ])).forEach(session => {
            const provider = session.provider as ConversationProvider;
            const providerGroups = result.get(provider) ?? new Map<string, FocusSession[]>();
            const workspaceSessions = providerGroups.get(session.workspace) ?? [];
            workspaceSessions.push(session);
            providerGroups.set(session.workspace, workspaceSessions);
            result.set(provider, providerGroups);
        });
        return result;
    }, [searchQuery, selectedTags, sessions, showHidden]);
    const categorizedProjects = useMemo(() => new Set(categories.flatMap(category => category.projects)), [categories]);
    const uncategorizedProjects = groups.filter(group => !categorizedProjects.has(group.project.name));

    useEffect(() => {
        try {
            window.localStorage.setItem(CATEGORY_VIEW_STORAGE_KEY, String(categoryView));
            window.localStorage.setItem(SHOW_HIDDEN_STORAGE_KEY, String(showHidden));
            window.localStorage.setItem(PROJECT_TAGS_STORAGE_KEY, JSON.stringify(definedTags));
            window.localStorage.setItem(PROJECT_SELECTED_TAGS_STORAGE_KEY, JSON.stringify([...selectedTags]));
        } catch {
            // Persistence is optional in restricted browser contexts.
        }
    }, [categoryView, definedTags, selectedTags, showHidden]);

    useEffect(() => {
        const newProjectKeys: string[] = [];
        externalGroups.forEach((providerProjects, provider) => providerProjects.forEach((_sessions, workspace) => {
            const key = `${provider}:${workspace}`;
            if (!initializedExternalProjects.current.has(key)) {
                initializedExternalProjects.current.add(key);
                newProjectKeys.push(key);
            }
        }));
        if (newProjectKeys.length > 0) {
            setCollapsedProjects(current => new Set([...current, ...newProjectKeys]));
        }
    }, [externalGroups]);

    const toggleSelectedTag = (tag: string): void => {
        setSelectedTags(current => {
            const next = new Set(current);
            if (next.has(tag)) {
                next.delete(tag);
            } else {
                next.add(tag);
            }
            return next;
        });
    };

    const createTag = (tag: string): void => {
        setDefinedTags(current => current.some(candidate => candidate.toLocaleLowerCase() === tag.toLocaleLowerCase())
            ? current
            : [...current, tag]);
    };

    const toggleProject = (workspace: string): void => {
        setCollapsedProjects(current => {
            const next = new Set(current);
            if (next.has(workspace)) {
                next.delete(workspace);
            } else {
                next.add(workspace);
            }
            return next;
        });
    };

    const toggleCategory = (categoryId: string): void => {
        setCollapsedCategories(current => {
            const next = new Set(current);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
            }
            return next;
        });
    };

    const toggleProvider = (provider: ConversationProvider): void => {
        setCollapsedProviders(current => {
            const next = new Set(current);
            if (next.has(provider)) {
                next.delete(provider);
            } else {
                next.add(provider);
            }
            return next;
        });
    };

    const endProjectDrag = (): void => {
        setDraggedProject(undefined);
        setDropCategoryId(undefined);
    };

    useEffect(() => () => projectDragCleanupRef.current?.(), []);

    const beginProjectInteraction = (
        event: React.PointerEvent<HTMLElement>,
        workspace: string,
        projectKey: string,
        draggable: boolean
    ): void => {
        if (event.button !== 0) {
            return;
        }
        projectDragCleanupRef.current?.();
        suppressedProjectClickRef.current = undefined;
        const startX = event.clientX;
        const startY = event.clientY;
        const startedAt = event.timeStamp;
        let started = false;

        const categoryAtPoint = (x: number, y: number): string | undefined =>
            document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-category-id]')?.dataset.categoryId;
        const cleanup = (): void => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', drop);
            window.removeEventListener('pointercancel', cancel);
            projectDragCleanupRef.current = undefined;
        };
        const move = (moveEvent: PointerEvent): void => {
            if (draggable && !started && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >= 5) {
                started = true;
                setDraggedProject(workspace);
            }
            if (started) {
                moveEvent.preventDefault();
                setDropCategoryId(categoryAtPoint(moveEvent.clientX, moveEvent.clientY));
            }
        };
        const drop = (dropEvent: PointerEvent): void => {
            cleanup();
            if (started || dropEvent.timeStamp - startedAt >= PROJECT_HOLD_THRESHOLD_MS) {
                suppressedProjectClickRef.current = projectKey;
            }
            if (started) {
                const categoryId = categoryAtPoint(dropEvent.clientX, dropEvent.clientY);
                if (categoryId) {
                    onAssignProject(categoryId, workspace);
                } else if (document.elementFromPoint(dropEvent.clientX, dropEvent.clientY)?.closest('[data-new-category]')) {
                    onCreateCategory(workspace);
                }
            }
            endProjectDrag();
        };
        const cancel = (): void => {
            cleanup();
            suppressedProjectClickRef.current = projectKey;
            endProjectDrag();
        };

        projectDragCleanupRef.current = cleanup;
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', drop);
        window.addEventListener('pointercancel', cancel);
    };

    const clickProject = (event: React.MouseEvent<HTMLButtonElement>, projectKey: string): void => {
        if (event.detail !== 0 && suppressedProjectClickRef.current === projectKey) {
            suppressedProjectClickRef.current = undefined;
            return;
        }
        suppressedProjectClickRef.current = undefined;
        toggleProject(projectKey);
    };

    const renderProject = (
        group: ProjectGroup,
        categoryName?: string,
        provider: 'erebus' | ConversationProvider = 'erebus'
    ): React.ReactElement => {
        const workspace = group.project.name;
        const workspaceSessions = group.sessions;
        const projectKey = `${provider}:${workspace}`;
        const projectCollapsed = !searching && collapsedProjects.has(projectKey);
        const projectSessionsId = `erebus-project-sessions-${encodeURIComponent(group.project.id)}`;
        const accessibleProjectLabel = categoryName ? `${workspace} in ${categoryName}` : workspace;
        const draggable = provider === 'erebus';
        return <section className={`erebus-project-group${draggedProject === workspace ? ' is-dragging' : ''}`} key={projectKey}>
            {!collapsed && <button
                type='button'
                className={`erebus-project-heading${draggable ? ' is-draggable' : ''}`}
                onPointerDown={event => beginProjectInteraction(event, workspace, projectKey, draggable)}
                onClick={event => clickProject(event, projectKey)}
                aria-controls={projectSessionsId}
                aria-expanded={!projectCollapsed}
                aria-label={`${projectCollapsed ? 'Expand' : 'Collapse'} ${accessibleProjectLabel} conversations`}
                title={`${projectCollapsed ? 'Expand' : 'Collapse'} ${accessibleProjectLabel}${draggable ? '; drag to categorize' : ''}`}
            >
                <span className='erebus-project-name'>
                    <Icon name='codicon-folder' />
                    <span>{workspace}</span>
                </span>
                <span className='erebus-project-toggle' aria-hidden='true'>
                    <Icon name={projectCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'} />
                </span>
            </button>}
            <div id={projectSessionsId}
                className={`erebus-project-sessions${projectCollapsed ? ' is-collapsed' : ''}`}
                aria-hidden={projectCollapsed}
            >
                {!projectCollapsed && (workspaceSessions.length > 0
                    ? workspaceSessions.map(session => <SessionRow
                        key={session.id}
                        session={session}
                        active={selectedId === session.id}
                        collapsed={collapsed}
                        onSelect={() => onSelect(session.id)}
                    />)
                    : !collapsed && <span className='erebus-empty-project'>No conversations yet</span>)}
            </div>
        </section>;
    };

    const renderCategory = (category: ProjectCategory, categoryProjects: ProjectGroup[], emptyCopy: string): React.ReactElement => {
        const categoryCollapsed = !searching && collapsedCategories.has(category.id);
        const categoryProjectsId = `erebus-category-projects-${category.id}`;
        const dropActive = dropCategoryId === category.id;
        const uncategorized = category.id === UNCATEGORIZED_CATEGORY_ID;
        return <section
            className={`erebus-project-category${uncategorized ? ' is-uncategorized' : ''}${dropActive ? ' is-drop-target' : ''}`}
            key={category.id}
            data-category-id={category.id}
        >
            <div className='erebus-category-heading'>
                <span>{!uncategorized && <Icon name={dropActive ? 'codicon-folder-opened' : 'codicon-folder'} />}{category.name}</span>
                <button
                    type='button'
                    className='erebus-category-toggle'
                    onClick={() => toggleCategory(category.id)}
                    aria-controls={categoryProjectsId}
                    aria-expanded={!categoryCollapsed}
                    aria-label={`${categoryCollapsed ? 'Expand' : 'Collapse'} ${category.name}`}
                    title={`${categoryCollapsed ? 'Expand' : 'Collapse'} ${category.name}`}
                >
                    <Icon name={categoryCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'} />
                </button>
            </div>
            <div
                id={categoryProjectsId}
                className={`erebus-category-projects${categoryCollapsed ? ' is-collapsed' : ''}`}
                aria-hidden={categoryCollapsed}
            >
                {categoryProjects.length > 0
                    ? categoryProjects.map(group => renderProject(group, category.name))
                    : <>
                        <button type='button' className='erebus-empty-category-new-project' onClick={onNewProject}>
                            <Icon name='codicon-new-folder' />
                            Create a project
                        </button>
                        <span className='erebus-empty-category'>{emptyCopy}</span>
                    </>}
            </div>
        </section>;
    };

    return <aside className={`erebus-session-rail${collapsed ? ' is-collapsed' : ''}`} aria-label='Agent sessions'>
        <div className='erebus-session-rail-content'>
            {!collapsed && <RailToolbar
                searchQuery={searchQuery}
                categoryView={categoryView}
                showHidden={showHidden}
                tags={availableTags}
                selectedTags={selectedTags}
                onSearchQueryChange={setSearchQuery}
                onToggleCategoryView={() => setCategoryView(current => !current)}
                onToggleShowHidden={() => setShowHidden(current => !current)}
                onSelectAllTags={() => setSelectedTags(new Set())}
                onToggleTag={toggleSelectedTag}
                onCreateTag={createTag}
            />}
            <button type='button' className='erebus-new-session' onClick={onNewSession} title='New session'>
                <Icon name='codicon-edit' />
                {!collapsed && <span>New session</span>}
            </button>

            {!collapsed && <div className='erebus-rail-label'>Projects</div>}

            <div className='erebus-project-groups'>
                {collapsed
                    ? groups.map(group => renderProject(group))
                    : categoryView
                        ? <>
                            {categories.flatMap(category => {
                                const categoryProjects = category.projects.flatMap(project => {
                                    const projectGroup = groups.find(group => group.project.name === project);
                                    return projectGroup ? [projectGroup] : [];
                                });
                                return searching && categoryProjects.length === 0
                                    ? []
                                    : [renderCategory(category, categoryProjects, 'Drag projects here')];
                            })}
                            {(!searching || uncategorizedProjects.length > 0) && renderCategory({
                                id: UNCATEGORIZED_CATEGORY_ID,
                                name: UNCATEGORIZED_CATEGORY_NAME,
                                projects: uncategorizedProjects.map(group => group.project.name)
                            }, uncategorizedProjects, 'New projects appear here')}
                        </>
                        : groups.map(group => renderProject(group))}
                {!collapsed && !searching && <button
                    type='button'
                    className={`erebus-new-category${draggedProject ? ' is-drop-target' : ''}`}
                    data-new-category
                    onClick={() => onCreateCategory()}
                >
                    <Icon name={draggedProject ? 'codicon-new-folder' : 'codicon-add'} />
                    {draggedProject ? 'Drop to create category' : 'New category'}
                </button>}
                {!collapsed && !searching && <button type='button' className='erebus-new-project' onClick={onNewProject}>
                    <Icon name='codicon-new-folder' />
                    New project
                </button>}
                {(Array.from(externalGroups.entries())).filter(([, providerProjects]) => !searching || providerProjects.size > 0).map(([provider, providerProjects]) => {
                    const status = sources.find(source => source.provider === provider);
                    const providerSessions = [...providerProjects.values()].flat();
                    const providerCollapsed = !searching && collapsedProviders.has(provider);
                    const providerContentId = `erebus-provider-content-${provider}`;
                    return <section className={`erebus-provider-group${providerCollapsed ? ' is-collapsed' : ''}`} key={provider}>
                        {!collapsed && <button
                            type='button'
                            className='erebus-provider-heading'
                            onClick={() => toggleProvider(provider)}
                            aria-controls={providerContentId}
                            aria-expanded={!providerCollapsed}
                            aria-label={`${providerCollapsed ? 'Expand' : 'Collapse'} ${providerLabels[provider]} conversations`}
                            title={`${providerCollapsed ? 'Expand' : 'Collapse'} ${providerLabels[provider]} conversations`}
                        >
                            <span className={`erebus-provider-mark is-${provider}`}>{providerMonograms[provider]}</span>
                            <strong>{providerLabels[provider]}</strong>
                            <span>{providerSessions.length}</span>
                        </button>}
                        <div
                            id={providerContentId}
                            className={`erebus-provider-content${providerCollapsed ? ' is-collapsed' : ''}`}
                            aria-hidden={providerCollapsed}
                        >
                            {!providerCollapsed && (providerProjects.size > 0
                                ? [...providerProjects.entries()]
                                    .sort(([left], [right]) => {
                                        if (left === 'Uncategorized') {
                                            return 1;
                                        }
                                        if (right === 'Uncategorized') {
                                            return -1;
                                        }
                                        return left.localeCompare(right);
                                    })
                                    .map(([workspace, workspaceSessions]) => renderProject({
                                        project: {
                                            id: `${provider}-${encodeURIComponent(workspace)}`,
                                            name: workspace,
                                            kind: 'remote',
                                            sourceFolders: [],
                                            tags: Array.from(new Set(workspaceSessions.flatMap(session => session.tags ?? []))),
                                            hidden: workspaceSessions.length > 0 && workspaceSessions.every(session => session.hidden === true)
                                        },
                                        sessions: workspaceSessions
                                    }, undefined, provider))
                                : !collapsed && <div className='erebus-provider-empty'>
                                    {status?.message ?? `No ${providerLabels[provider]} conversations found.`}
                                </div>)}
                        </div>
                    </section>;
                })}
                {!collapsed && searching && groups.length === 0
                    && [...externalGroups.values()].every(providerProjects => providerProjects.size === 0)
                    && <div className='erebus-rail-search-empty'>No matching projects or conversations</div>}
            </div>

        </div>

        <div className='erebus-profile'>
            <span className='erebus-profile-avatar'>F</span>
            {!collapsed && <span className='erebus-profile-copy'>
                <strong>fromanan</strong>
                <small>Local workspace</small>
            </span>}
            <button type='button' className='erebus-icon-button' aria-label='Settings' title='Settings'>
                <Icon name='codicon-settings-gear' />
            </button>
        </div>
    </aside>;
}

function RailResizeHandle({ width, onResize }: { width: number; onResize: (width: number) => void }): React.ReactElement {
    const stopResizeRef = useRef<(() => void) | undefined>();
    const [dragging, setDragging] = useState(false);

    useEffect(() => () => stopResizeRef.current?.(), []);

    return <div
        className={`erebus-rail-resizer${dragging ? ' is-active' : ''}`}
        role='separator'
        aria-label='Resize projects and conversation sections'
        aria-orientation='vertical'
        aria-valuemin={MIN_RAIL_WIDTH}
        aria-valuemax={MAX_RAIL_WIDTH}
        aria-valuenow={Math.round(width)}
        title='Drag to resize; double-click to reset'
        tabIndex={0}
        onDoubleClick={() => onResize(DEFAULT_RAIL_WIDTH)}
        onPointerDown={event => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            stopResizeRef.current?.();
            const startX = event.clientX;
            const startWidth = width;
            const move = (moveEvent: PointerEvent): void => onResize(startWidth + moveEvent.clientX - startX);
            const stop = (): void => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', stop);
                window.removeEventListener('pointercancel', stop);
                stopResizeRef.current = undefined;
                setDragging(false);
            };
            stopResizeRef.current = stop;
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', stop);
            window.addEventListener('pointercancel', stop);
            setDragging(true);
        }}
        onKeyDown={event => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                onResize(width - 16);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                onResize(width + 16);
            } else if (event.key === 'Home') {
                event.preventDefault();
                onResize(MIN_RAIL_WIDTH);
            } else if (event.key === 'End') {
                event.preventDefault();
                onResize(MAX_RAIL_WIDTH);
            }
        }}
    />;
}

function ToolDisclosure({ count, expanded, onToggle }: { count: number; expanded: boolean; onToggle: () => void }): React.ReactElement {
    return <div className={`erebus-tool-disclosure${expanded ? ' is-expanded' : ''}`}>
        <button type='button' onClick={onToggle} aria-expanded={expanded}>
            <Icon name='codicon-chevron-right' />
            <span>{count} tool calls</span>
            <span className='erebus-tool-duration'>{expanded ? 'Inspecting workspace' : 'Completed'}</span>
        </button>
        {expanded && <div className='erebus-tool-list'>
            <span><Icon name='codicon-search' />Searched project structure</span>
            <span><Icon name='codicon-file-code' />Read relevant frontend sources</span>
            <span><Icon name='codicon-terminal' />Validated generated output</span>
        </div>}
    </div>;
}

function ChangeSummary({ files, onOpenChanges }: { files: string[]; onOpenChanges: () => void }): React.ReactElement {
    return <div className='erebus-change-summary'>
        <span><Icon name='codicon-git-compare' />{files.length} files changed</span>
        <button type='button' onClick={onOpenChanges}>
            <Icon name='codicon-eye' />View changes ({files.length})
        </button>
        <button type='button' className='is-muted' title='Prototype action' onClick={onOpenChanges}>
            <Icon name='codicon-diff' />Review diff
        </button>
    </div>;
}

function MessageContext({ context }: { context: FocusContextItem[] }): React.ReactElement {
    return <div className='erebus-message-context' aria-label='Attached context'>
        {context.map(item => <span key={item.id} title={item.paths?.join('\n') ?? item.detail}>
            <Icon name={item.kind === 'folder' || item.kind === 'workspace'
                ? 'codicon-folder'
                : item.kind === 'session' ? 'codicon-notebook' : 'codicon-file'} />
            <span>{item.label}</span>
            {item.detail && <small>{item.detail}</small>}
        </span>)}
    </div>;
}

function MessageExecutionParameters({ parameters }: { parameters: FocusExecutionParameters }): React.ReactElement {
    return <section className='erebus-message-execution-parameters' aria-label='Execution parameters'>
        <header>Execution parameters</header>
        <pre><code>{JSON.stringify(parameters, undefined, 2)}</code></pre>
    </section>;
}

function ConversationMessage({ message, agentName, expanded, onToggleTools, onOpenChanges }: {
    message: FocusMessage;
    agentName: string;
    expanded: boolean;
    onToggleTools: () => void;
    onOpenChanges: () => void;
}): React.ReactElement {
    if (message.role === 'user') {
        return <article className='erebus-message is-user'>
            {!message.executionParameters && message.context && message.context.length > 0 && <MessageContext context={message.context} />}
            <div className='erebus-user-bubble'>
                {message.executionParameters && <MessageExecutionParameters parameters={message.executionParameters} />}
                <MarkdownContent markdown={message.body.join('\n\n')} className='erebus-user-markdown' />
            </div>
        </article>;
    }

    return <article className='erebus-message is-agent'>
        {message.toolCalls && <ToolDisclosure count={message.toolCalls} expanded={expanded} onToggle={onToggleTools} />}
        <header className='erebus-agent-heading'>
            <AgentMark />
            <strong>{message.agentName ?? agentName}</strong>
            <span>Agent</span>
        </header>
        <MarkdownContent markdown={message.body.join('\n\n')} className='erebus-agent-copy' />
        {message.elapsed && <div className='erebus-message-metrics'>
            <span>Elapsed {message.elapsed}</span>
            {message.executionProfile && <span>{message.executionProfile}</span>}
            <span>Local session</span>
        </div>}
        {message.changedFiles && message.changedFiles.length > 0 && <ChangeSummary files={message.changedFiles} onOpenChanges={onOpenChanges} />}
    </article>;
}

function EmptyConversation({ session }: { session: FocusSession }): React.ReactElement {
    return <div className='erebus-empty-conversation'>
        <div className='erebus-empty-orbit'><AgentMark /></div>
        <span className='erebus-eyebrow'>{session.readOnly ? 'Synced conversation' : 'Ready to work'}</span>
        <h2>{session.title}</h2>
        <p>{session.readOnly
            ? session.loading ? `Loading this ${providerLabels[session.provider as ConversationProvider]} conversation…`
                : 'This conversation does not contain any displayable user or agent messages.'
            : 'Describe an outcome, attach context, or select a structured workflow. Erebus will keep the session visible while it works.'}</p>
    </div>;
}

function Composer({ value, busy, readOnly, providerName, workspace, sessionTitle, onChange, onSubmit }: {
    value: string;
    busy: boolean;
    readOnly: boolean;
    providerName?: string;
    workspace: string;
    sessionTitle: string;
    onChange: (value: string) => void;
    onSubmit: (submission: ComposerSubmission) => void;
}): React.ReactElement {
    const [menuOpen, setMenuOpen] = useState<ComposerMenu | undefined>();
    const [agent, setAgent] = useState<ComposerAgent>(() =>
        loadComposerPreference(COMPOSER_AGENT_STORAGE_KEY, COMPOSER_AGENTS, 'erebus'));
    const [effort, setEffort] = useState<ComposerEffort>(() =>
        loadComposerPreference(COMPOSER_EFFORT_STORAGE_KEY, COMPOSER_EFFORTS, 'balanced'));
    const [access, setAccess] = useState<ComposerAccess>(() =>
        loadComposerPreference(COMPOSER_ACCESS_STORAGE_KEY, COMPOSER_ACCESS_MODES, 'approve'));
    const [autopilot, setAutopilot] = useState(loadComposerAutopilot);
    const [context, setContext] = useState<FocusContextItem[]>([]);
    const composerRef = useRef<HTMLDivElement | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement | undefined>(undefined);
    const folderInputRef = useRef<HTMLInputElement | undefined>(undefined);
    const selectedAgent = COMPOSER_AGENTS.find(option => option.value === agent) ?? COMPOSER_AGENTS[0];
    const selectedEffort = COMPOSER_EFFORTS.find(option => option.value === effort) ?? COMPOSER_EFFORTS[1];
    const selectedAccess = COMPOSER_ACCESS_MODES.find(option => option.value === access) ?? COMPOSER_ACCESS_MODES[1];

    useEffect(() => storeComposerPreference(COMPOSER_AGENT_STORAGE_KEY, agent), [agent]);
    useEffect(() => storeComposerPreference(COMPOSER_EFFORT_STORAGE_KEY, effort), [effort]);
    useEffect(() => storeComposerPreference(COMPOSER_ACCESS_STORAGE_KEY, access), [access]);
    useEffect(() => storeComposerPreference(COMPOSER_AUTOPILOT_STORAGE_KEY, autopilot), [autopilot]);

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }
        const closeOnPointerDown = (event: PointerEvent): void => {
            if (!composerRef.current?.contains(event.target as Node)) {
                setMenuOpen(undefined);
            }
        };
        const closeOnEscape = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                setMenuOpen(undefined);
            }
        };
        window.addEventListener('pointerdown', closeOnPointerDown);
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            window.removeEventListener('pointerdown', closeOnPointerDown);
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [menuOpen]);

    useEffect(() => {
        if (readOnly) {
            setMenuOpen(undefined);
        }
    }, [readOnly]);

    const toggleMenu = (menu: ComposerMenu): void => {
        if (!readOnly) {
            setMenuOpen(current => current === menu ? undefined : menu);
        }
    };

    const addFiles = (files: File[]): void => {
        const batchId = Date.now();
        const nextItems = files.map((file, index): FocusContextItem => {
            const path = pathForAttachedFile(file);
            const size = file.size < 1024 ? `${file.size} B` : `${Math.ceil(file.size / 1024)} KB`;
            return {
                id: `file-${batchId}-${index}`,
                kind: 'file',
                label: file.name,
                detail: size,
                paths: [path]
            };
        });
        setContext(current => [
            ...current,
            ...nextItems.filter(item => !current.some(existing => existing.paths?.[0] === item.paths?.[0]))
        ]);
        setMenuOpen(undefined);
    };

    const addFolder = (files: File[]): void => {
        if (files.length === 0) {
            return;
        }
        const paths = files.map(pathForAttachedFile);
        const relativeRoot = files[0].webkitRelativePath.split('/')[0];
        const firstPath = paths[0];
        const pathParts = firstPath.split(/[\\/]/);
        const fallbackRoot = pathParts.length > 1 ? pathParts[pathParts.length - 2] : undefined;
        const label = relativeRoot || fallbackRoot || 'Attached folder';
        const nextItem: FocusContextItem = {
            id: `folder-${Date.now()}`,
            kind: 'folder',
            label,
            detail: `${files.length} file${files.length === 1 ? '' : 's'}`,
            paths
        };
        setContext(current => current.some(item => item.kind === 'folder' && item.label === label)
            ? current
            : [...current, nextItem]);
        setMenuOpen(undefined);
    };

    const addBuiltInContext = (item: FocusContextItem): void => {
        setContext(current => current.some(existing => existing.kind === item.kind && existing.label === item.label)
            ? current
            : [...current, item]);
        setMenuOpen(undefined);
    };

    const submit = (): void => {
        if (!value.trim() || busy || readOnly) {
            return;
        }
        onSubmit({ agent, effort, access, autopilot, context });
        setContext([]);
        setMenuOpen(undefined);
    };

    return <div className='erebus-composer-wrap'>
        <div ref={element => composerRef.current = element ?? undefined}
            className={`erebus-composer${busy ? ' is-busy' : ''}${readOnly ? ' is-read-only' : ''}`}>
            <div className='erebus-composer-editor'>
                <RichMarkdownEditor
                    value={value}
                    disabled={readOnly}
                    placeholder={readOnly ? `Read-only sync from ${providerName}` : 'Ask a question or describe a task…'}
                    ariaLabel='Message the agent'
                    onChange={onChange}
                    onSubmit={submit}
                />
            </div>
            {context.length > 0 && <div className='erebus-composer-context' aria-label='Pending context'>
                {context.map(item => <span className='erebus-composer-context-chip' key={item.id}
                    title={item.paths?.join('\n') ?? item.detail}>
                    <Icon name={item.kind === 'folder' || item.kind === 'workspace'
                        ? 'codicon-folder'
                        : item.kind === 'session' ? 'codicon-notebook' : 'codicon-file'} />
                    <span>{item.label}</span>
                    {item.detail && <small>{item.detail}</small>}
                    <button type='button' onClick={() => setContext(current => current.filter(candidate => candidate.id !== item.id))}
                        aria-label={`Remove ${item.label}`} title={`Remove ${item.label}`}>
                        <Icon name='codicon-close' />
                    </button>
                </span>)}
            </div>}
            <div className='erebus-composer-toolbar'>
                <div className='erebus-composer-tools'>
                    <span className='erebus-composer-menu-shell'>
                        <button type='button' disabled={readOnly} aria-label='Add context' title='Add context'
                            aria-haspopup='menu' aria-expanded={menuOpen === 'context'}
                            className={menuOpen === 'context' ? 'is-active' : ''} onClick={() => toggleMenu('context')}>
                            <Icon name='codicon-add' />
                        </button>
                        {menuOpen === 'context' && <div className='erebus-composer-menu is-context' role='menu' aria-label='Add context'>
                            <div className='erebus-composer-menu-heading'>Add context</div>
                            <button type='button' className='erebus-composer-menu-item' role='menuitem' onClick={() => fileInputRef.current?.click()}>
                                <Icon name='codicon-files' /><span><strong>Files</strong><small>Choose one or more files</small></span>
                            </button>
                            <button type='button' className='erebus-composer-menu-item' role='menuitem' onClick={() => folderInputRef.current?.click()}>
                                <Icon name='codicon-folder-opened' /><span><strong>Folder</strong><small>Attach the contents of a folder</small></span>
                            </button>
                            <button type='button' className='erebus-composer-menu-item' role='menuitem'
                                disabled={context.some(item => item.kind === 'workspace' && item.label === workspace)}
                                onClick={() => addBuiltInContext({
                                    id: `workspace-${Date.now()}`,
                                    kind: 'workspace',
                                    label: workspace,
                                    detail: 'Workspace context'
                                })}>
                                <Icon name='codicon-root-folder' /><span><strong>Current workspace</strong><small>{workspace}</small></span>
                            </button>
                            <button type='button' className='erebus-composer-menu-item' role='menuitem'
                                disabled={context.some(item => item.kind === 'session' && item.label === sessionTitle)}
                                onClick={() => addBuiltInContext({
                                    id: `session-${Date.now()}`,
                                    kind: 'session',
                                    label: sessionTitle,
                                    detail: 'Active session brief'
                                })}>
                                <Icon name='codicon-notebook' /><span><strong>Session brief</strong><small>{sessionTitle}</small></span>
                            </button>
                        </div>}
                    </span>
                    <button type='button' disabled={readOnly} aria-label='Attach files' title='Attach files'
                        onClick={() => fileInputRef.current?.click()}><Icon name='codicon-attach' /></button>
                    <span className='erebus-composer-menu-shell'>
                        <button type='button' className='erebus-select-button' disabled={readOnly}
                            aria-haspopup='menu' aria-expanded={menuOpen === 'agent'} onClick={() => toggleMenu('agent')}>
                            <AgentMark small />{readOnly ? providerName : selectedAgent.label}<Icon name='codicon-chevron-down' />
                        </button>
                        {menuOpen === 'agent' && <div className='erebus-composer-menu is-agent' role='menu' aria-label='Select agent'>
                            <div className='erebus-composer-menu-heading'>Agent</div>
                            {COMPOSER_AGENTS.map(option => <button type='button' className='erebus-composer-menu-item'
                                role='menuitemradio' aria-checked={agent === option.value} key={option.value}
                                onClick={() => { setAgent(option.value); setMenuOpen(undefined); }}>
                                <Icon name={option.icon} /><span><strong>{option.label}</strong><small>{option.detail}</small></span>
                                {agent === option.value && <Icon name='codicon-check' className='erebus-menu-check' />}
                            </button>)}
                        </div>}
                    </span>
                    <span className='erebus-composer-menu-shell'>
                        <button type='button' className='erebus-select-button erebus-effort-button' disabled={readOnly}
                            aria-haspopup='menu' aria-expanded={menuOpen === 'effort'} onClick={() => toggleMenu('effort')}>
                            {selectedEffort.label}<Icon name='codicon-chevron-down' />
                        </button>
                        {menuOpen === 'effort' && <div className='erebus-composer-menu is-effort' role='menu' aria-label='Select effort'>
                            <div className='erebus-composer-menu-heading'>Effort</div>
                            {COMPOSER_EFFORTS.map(option => <button type='button' className='erebus-composer-menu-item'
                                role='menuitemradio' aria-checked={effort === option.value} key={option.value}
                                onClick={() => { setEffort(option.value); setMenuOpen(undefined); }}>
                                <Icon name={option.icon} /><span><strong>{option.label}</strong><small>{option.detail}</small></span>
                                {effort === option.value && <Icon name='codicon-check' className='erebus-menu-check' />}
                            </button>)}
                        </div>}
                    </span>
                    <span className='erebus-composer-menu-shell'>
                        <button type='button' className={`erebus-select-button erebus-access-button is-${access}`} disabled={readOnly}
                            aria-haspopup='menu' aria-expanded={menuOpen === 'access'} onClick={() => toggleMenu('access')}>
                            <Icon name={selectedAccess.icon} />{selectedAccess.label}<Icon name='codicon-chevron-down' />
                        </button>
                        {menuOpen === 'access' && <div className='erebus-composer-menu is-access' role='menu' aria-label='Select access mode'>
                            <div className='erebus-access-heading'>How should Erebus actions be approved?</div>
                            {COMPOSER_ACCESS_MODES.map(option => <button type='button'
                                className={`erebus-composer-menu-item erebus-access-option${option.value === 'full' ? ' is-full' : ''}`}
                                role='menuitemradio' aria-checked={access === option.value} key={option.value}
                                onClick={() => { setAccess(option.value); setMenuOpen(undefined); }}>
                                <Icon name={option.icon} /><span><strong>{option.label}</strong><small>{option.detail}</small></span>
                                {access === option.value && <Icon name='codicon-check' className='erebus-menu-check' />}
                            </button>)}
                        </div>}
                    </span>
                </div>
                <div className='erebus-composer-actions'>
                    <label className='erebus-autopilot-toggle'>
                        <span>Autopilot</span>
                        <input type='checkbox' checked={autopilot} disabled={readOnly}
                            onChange={event => setAutopilot(event.currentTarget.checked)} />
                        <span className='erebus-toggle-track'><span /></span>
                    </label>
                    <button
                        type='button'
                        className='erebus-send-button'
                        onClick={submit}
                        disabled={readOnly || !value.trim() || busy}
                        aria-label={busy ? 'Agent is working' : 'Send message'}
                        title={busy ? 'Agent is working' : 'Send message'}
                    >
                        <Icon name={busy ? 'codicon-loading' : 'codicon-arrow-up'} className={busy ? 'codicon-modifier-spin' : ''} />
                    </button>
                </div>
            </div>
        </div>
        <input ref={element => fileInputRef.current = element ?? undefined}
            className='erebus-hidden-file-input' type='file' multiple onChange={event => {
            addFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
        }} />
        <input ref={element => folderInputRef.current = element ?? undefined}
            className='erebus-hidden-file-input' type='file' multiple {...{ webkitdirectory: '' }} onChange={event => {
            addFolder(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
        }} />
        <div className='erebus-composer-hint'>{readOnly
            ? `Read-only local sync · Continue this thread in ${providerName}`
            : 'Enter to send · Shift+Enter for a new line'}</div>
    </div>;
}

function ContextPanel({ session, tab, onTabChange, onClose, onRunTasks }: {
    session: FocusSession;
    tab: 'context' | 'changes';
    onTabChange: (tab: 'context' | 'changes') => void;
    onClose: () => void;
    onRunTasks: () => void;
}): React.ReactElement {
    const completedTasks = session.tasks.filter(task => task.complete).length;
    const progress = session.tasks.length === 0 ? 0 : Math.round((completedTasks / session.tasks.length) * 100);

    return <aside className='erebus-context-panel' aria-label='Session context'>
        <header className='erebus-context-header'>
            <div className='erebus-context-tabs' role='tablist' aria-label='Context views'>
                <button type='button' role='tab' aria-selected={tab === 'context'}
                    className={tab === 'context' ? 'is-active' : ''} onClick={() => onTabChange('context')}>Context</button>
                <button type='button' role='tab' aria-selected={tab === 'changes'}
                    className={tab === 'changes' ? 'is-active' : ''} onClick={() => onTabChange('changes')}>Changes</button>
            </div>
            <button type='button' className='erebus-icon-button' onClick={onClose} aria-label='Close context panel' title='Close panel'>
                <Icon name='codicon-close' />
            </button>
        </header>

        {tab === 'context' ? <div className='erebus-context-scroll'>
            <span className='erebus-eyebrow'>Active brief</span>
            <h2>{session.title}</h2>

            <section className='erebus-context-section'>
                <h3>Requirement</h3>
                <p>{session.requirement}</p>
            </section>

            <section className='erebus-context-section'>
                <h3>Design direction</h3>
                <ul>{session.designNotes.map(note => <li key={note}>{note}</li>)}</ul>
            </section>

            <section className='erebus-context-section erebus-task-section'>
                <div className='erebus-section-heading'>
                    <h3>Tasks</h3>
                    <strong>{completedTasks}/{session.tasks.length}</strong>
                </div>
                <div className='erebus-progress-track' aria-label={`${progress}% complete`}>
                    <span style={{ width: `${progress}%` }} />
                </div>
                <button type='button' className='erebus-primary-button erebus-run-tasks-button'
                    onClick={onRunTasks} disabled={completedTasks === session.tasks.length}>
                    <Icon name='codicon-play' />
                    <span>{completedTasks === session.tasks.length ? 'All tasks complete' : 'Run remaining tasks'}</span>
                </button>
                <div className='erebus-task-list'>
                    {session.tasks.map(task => <div className={`erebus-task-row${task.complete ? ' is-complete' : ''}`} key={task.id}>
                        <Icon name={task.complete ? 'codicon-pass-filled' : 'codicon-circle-large-outline'} />
                        <span>{task.label}</span>
                    </div>)}
                </div>
            </section>

            <section className='erebus-context-section'>
                <h3>Changed files</h3>
                <div className='erebus-file-list'>
                    {session.changedFiles.length > 0 ? session.changedFiles.map(file => <button type='button' key={file} onClick={() => onTabChange('changes')}>
                        <Icon name='codicon-file-code' />
                        <span>{file}</span>
                        <Icon name='codicon-chevron-right' />
                    </button>) : <p className='erebus-empty-state'>No files changed in this session.</p>}
                </div>
            </section>
        </div> : <div className='erebus-context-scroll'>
            <div className='erebus-diff-heading'>
                <div>
                    <span className='erebus-eyebrow'>Inline review</span>
                    <h2>{session.changedFiles[0] ?? 'No changes yet'}</h2>
                </div>
                <span className='erebus-diff-stat'>+18 −4</span>
            </div>
            {session.changedFiles.length > 0 ? <div className='erebus-diff-card' aria-label='Example code diff'>
                <div className='erebus-diff-line is-context'><span>42</span><code>{'const selected = sessions.find(session => session.id === selectedId);'}</code></div>
                <div className='erebus-diff-line is-removed'><span>43</span><code>{'- return <LegacyChat session={selected} />;'}</code></div>
                <div className='erebus-diff-line is-added'><span>43</span><code>{'+ return <AgentFocusView session={selected}'}</code></div>
                <div className='erebus-diff-line is-added'><span>44</span><code>{'+   contextPanel="adaptive" />;'}</code></div>
                <div className='erebus-diff-line is-context'><span>45</span><code>{'}'}</code></div>
            </div> : <p className='erebus-empty-state'>Changes will appear here as the agent edits files.</p>}
            <div className='erebus-review-actions'>
                <button type='button'><Icon name='codicon-comment' />Comment</button>
                <button type='button' className='erebus-primary-button'><Icon name='codicon-check' />Accept</button>
            </div>
        </div>}
    </aside>;
}

function AttentionPanel({ sessions, onSelect, onClose, onResolve }: {
    sessions: FocusSession[];
    onSelect: (id: string) => void;
    onClose: () => void;
    onResolve: (id: string) => void;
}): React.ReactElement {
    const attentionSessions = sessions.filter(session => session.status === 'attention');
    return <aside className='erebus-attention-panel' aria-label='Attention requests'>
        <header>
            <div>
                <span className='erebus-eyebrow'>Action required</span>
                <h2>Attention</h2>
            </div>
            <button type='button' className='erebus-icon-button' onClick={onClose} aria-label='Close attention panel'><Icon name='codicon-close' /></button>
        </header>
        {attentionSessions.length === 0 ? <div className='erebus-attention-empty'>
            <Icon name='codicon-pass-filled' />
            <strong>You are all caught up</strong>
            <span>Blocked sessions will collect here.</span>
        </div> : attentionSessions.map(session => <article className='erebus-attention-card' key={session.id}>
            <span className='erebus-attention-project'>{session.workspace}</span>
            <h3>{session.title}</h3>
            <p>The agent wants to run the unsigned Electron packaging command and write preview artifacts to the local dist folder.</p>
            <code>yarn electron package:preview</code>
            <div>
                <button type='button' onClick={() => onResolve(session.id)}>Allow once</button>
                <button type='button' className='erebus-primary-button' onClick={() => {
                    onResolve(session.id);
                    onSelect(session.id);
                }}>Allow &amp; open</button>
            </div>
        </article>)}
    </aside>;
}

function NewSessionDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (workflow?: WorkflowKind) => void }): React.ReactElement {
    const [selected, setSelected] = useState<WorkflowKind | undefined>('Spec');
    return <div className='erebus-dialog-backdrop' role='presentation' onMouseDown={event => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }}>
        <section className='erebus-new-session-dialog' role='dialog' aria-modal='true' aria-labelledby='erebus-new-session-title'>
            <header>
                <div>
                    <span className='erebus-eyebrow'>Start with structure or chat freely</span>
                    <h2 id='erebus-new-session-title'>New agent session</h2>
                </div>
                <button type='button' className='erebus-icon-button' onClick={onClose} aria-label='Close'><Icon name='codicon-close' /></button>
            </header>
            <div className='erebus-dialog-project'>
                <span><Icon name='codicon-folder-opened' />Workspace</span>
                <button type='button'>Erebus<Icon name='codicon-chevron-down' /></button>
            </div>
            <div className='erebus-workflow-grid'>
                {WORKFLOWS.map(workflow => <button
                    type='button'
                    key={workflow.kind}
                    className={selected === workflow.kind ? 'is-selected' : ''}
                    onClick={() => setSelected(workflow.kind)}
                >
                    <span className='erebus-workflow-icon'><Icon name={workflow.icon} /></span>
                    <strong>{workflow.kind}</strong>
                    <span>{workflow.description}</span>
                    {selected === workflow.kind && <Icon name='codicon-check' className='erebus-workflow-check' />}
                </button>)}
            </div>
            <footer>
                <button type='button' onClick={() => onCreate(undefined)}>Start freeform</button>
                <button type='button' className='erebus-primary-button' onClick={() => onCreate(selected)}>
                    Create {selected ?? 'session'}<Icon name='codicon-arrow-right' />
                </button>
            </footer>
        </section>
    </div>;
}

function NewCategoryDialog({ project, categoryNames, onClose, onCreate }: {
    project?: string;
    categoryNames: string[];
    onClose: () => void;
    onCreate: (name: string) => void;
}): React.ReactElement {
    const [name, setName] = useState('');
    const trimmedName = name.trim();
    const duplicateName = categoryNames.some(categoryName => categoryName.toLocaleLowerCase() === trimmedName.toLocaleLowerCase());
    const canCreate = trimmedName.length > 0 && !duplicateName;

    return <div className='erebus-dialog-backdrop' role='presentation' onMouseDown={event => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }}>
        <form className='erebus-new-category-dialog' role='dialog' aria-modal='true' aria-labelledby='erebus-new-category-title'
            onSubmit={event => {
                event.preventDefault();
                if (canCreate) {
                    onCreate(trimmedName);
                }
            }}>
            <header>
                <div>
                    <span className='erebus-eyebrow'>{project ? 'Organize this project' : 'Organize related projects'}</span>
                    <h2 id='erebus-new-category-title'>New category</h2>
                </div>
                <button type='button' className='erebus-icon-button' onClick={onClose} aria-label='Close'><Icon name='codicon-close' /></button>
            </header>
            {project && <p className='erebus-category-project-preview'>
                <Icon name='codicon-folder' />
                <span><strong>{project}</strong> will be moved into this category.</span>
            </p>}
            <label className='erebus-category-name-field'>
                <span>Category name</span>
                <input
                    autoFocus
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                    placeholder='For example, Platform'
                    aria-invalid={duplicateName || undefined}
                    aria-describedby={duplicateName ? 'erebus-category-name-error' : undefined}
                />
            </label>
            {duplicateName && <span id='erebus-category-name-error' className='erebus-category-name-error'>That category already exists.</span>}
            <footer>
                <button type='button' onClick={onClose}>Cancel</button>
                <button type='submit' className='erebus-primary-button' disabled={!canCreate}>Create category</button>
            </footer>
        </form>
    </div>;
}

function NewProjectDialog({ projectNames, onClose, onCreate }: {
    projectNames: string[];
    onClose: () => void;
    onCreate: (project: NewProjectInput) => void;
}): React.ReactElement {
    const [step, setStep] = useState<'type' | 'details'>('type');
    const [kind, setKind] = useState<ProjectKind>('local');
    const [name, setName] = useState('');
    const [sourceFolders, setSourceFolders] = useState<string[]>([]);
    const [remoteFolder, setRemoteFolder] = useState('');
    const folderInputRef = useRef<HTMLInputElement | undefined>(undefined);
    const trimmedName = name.trim();
    const duplicateName = projectNames.some(projectName => projectName.toLocaleLowerCase() === trimmedName.toLocaleLowerCase());
    const canCreate = trimmedName.length > 0 && !duplicateName && sourceFolders.length > 0;

    const addLocalFolder = (files: File[]): void => {
        const folder = folderSelectionFromFiles(files);
        if (!folder) {
            return;
        }
        setSourceFolders(current => current.includes(folder.path) ? current : [...current, folder.path]);
        setName(current => current.trim() ? current : folder.name);
    };
    const addRemoteFolder = (): void => {
        const trimmedFolder = remoteFolder.trim();
        if (!trimmedFolder) {
            return;
        }
        setSourceFolders(current => current.includes(trimmedFolder) ? current : [...current, trimmedFolder]);
        const pathParts = trimmedFolder.split(/[\\/]/).filter(Boolean);
        setName(current => current.trim() ? current : pathParts[pathParts.length - 1] ?? current);
        setRemoteFolder('');
    };

    return <div className='erebus-dialog-backdrop' role='presentation' onMouseDown={event => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }}>
        <form className='erebus-new-project-dialog' role='dialog' aria-modal='true' aria-labelledby='erebus-new-project-title'
            onSubmit={event => {
                event.preventDefault();
                if (step === 'details' && canCreate) {
                    onCreate({ name: trimmedName, kind, sourceFolders });
                }
            }}>
            <header>
                <h2 id='erebus-new-project-title'>Create project</h2>
                <button type='button' className='erebus-icon-button' onClick={onClose} aria-label='Close'><Icon name='codicon-close' /></button>
            </header>
            {step === 'type' ? <>
                <span className='erebus-project-dialog-label'>Project type</span>
                <div className='erebus-project-type-grid'>
                    <button type='button' className={kind === 'local' ? 'is-selected' : ''} onClick={() => setKind('local')}
                        aria-pressed={kind === 'local'}>
                        <Icon name='codicon-device-desktop' />
                        <span><strong>Local</strong><small>Edit, run, and test files on your computer</small></span>
                        <span className='erebus-project-type-radio' aria-hidden='true'><span /></span>
                    </button>
                    <button type='button' className={kind === 'remote' ? 'is-selected' : ''} onClick={() => setKind('remote')}
                        aria-pressed={kind === 'remote'}>
                        <Icon name='codicon-globe' />
                        <span><strong>Remote</strong><small>Use a folder on a connected machine</small></span>
                        <span className='erebus-project-type-radio' aria-hidden='true'><span /></span>
                    </button>
                </div>
                <footer>
                    <button type='button' className='erebus-primary-button' onClick={() => setStep('details')}>Next</button>
                </footer>
            </> : <>
                <button type='button' className='erebus-project-type-summary' onClick={() => setStep('type')}>
                    <Icon name={kind === 'local' ? 'codicon-device-desktop' : 'codicon-globe'} />
                    {kind === 'local' ? 'Local project' : 'Remote project'}
                    <span>Change</span>
                </button>
                <label className='erebus-project-name-field'>
                    <span>Project name</span>
                    <span className='erebus-project-name-input'>
                        <Icon name='codicon-folder' />
                        <input autoFocus value={name} onChange={event => setName(event.currentTarget.value)}
                            placeholder='Project name' aria-invalid={duplicateName || undefined}
                            aria-describedby={duplicateName ? 'erebus-project-name-error' : undefined} />
                    </span>
                </label>
                {duplicateName && <span id='erebus-project-name-error' className='erebus-category-name-error'>That project already exists.</span>}
                <span className='erebus-project-dialog-label'>Source folders</span>
                {kind === 'local' ? <button type='button' className='erebus-project-folder-picker'
                    onClick={() => folderInputRef.current?.click()}>
                    <Icon name='codicon-folder-opened' />
                    <span>{sourceFolders.length === 0 ? 'Add folders Erebus can read and edit' : 'Add another source folder'}</span>
                </button> : <div className='erebus-remote-folder-row'>
                    <input value={remoteFolder} onChange={event => setRemoteFolder(event.currentTarget.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                addRemoteFolder();
                            }
                        }} placeholder='Connected machine path' aria-label='Remote source folder path' />
                    <button type='button' onClick={addRemoteFolder} disabled={!remoteFolder.trim()}>Add</button>
                </div>}
                {sourceFolders.length > 0 && <div className='erebus-project-folder-list' aria-label='Selected source folders'>
                    {sourceFolders.map(folder => <span key={folder} title={folder}>
                        <Icon name={kind === 'local' ? 'codicon-folder' : 'codicon-remote'} />
                        <span>{folder}</span>
                        <button type='button' onClick={() => setSourceFolders(current => current.filter(candidate => candidate !== folder))}
                            aria-label={`Remove ${folder}`} title='Remove folder'><Icon name='codicon-close' /></button>
                    </span>)}
                </div>}
                <footer>
                    <button type='button' onClick={onClose}>Cancel</button>
                    <button type='submit' className='erebus-primary-button' disabled={!canCreate}>Create project</button>
                </footer>
            </>}
            <input ref={element => folderInputRef.current = element ?? undefined} className='erebus-hidden-file-input'
                type='file' multiple {...{ webkitdirectory: '' }} onChange={event => {
                    addLocalFolder(Array.from(event.currentTarget.files ?? []));
                    event.currentTarget.value = '';
                }} />
        </form>
    </div>;
}

function TopBar({ session, railCollapsed, contextOpen, attentionCount, refreshing, onToggleRail, onRefresh, onToggleContext, onToggleAttention, onExitFocusMode }: {
    session: FocusSession;
    railCollapsed: boolean;
    contextOpen: boolean;
    attentionCount: number;
    refreshing: boolean;
    onToggleRail: () => void;
    onRefresh: () => void;
    onToggleContext: () => void;
    onToggleAttention: () => void;
    onExitFocusMode: () => void;
}): React.ReactElement {
    return <header className='erebus-topbar'>
        <div className='erebus-topbar-left'>
            <button type='button' className='erebus-icon-button' onClick={onToggleRail}
                aria-label={railCollapsed ? 'Expand session rail' : 'Collapse session rail'}
                title={railCollapsed ? 'Expand sessions' : 'Collapse sessions'}>
                <Icon name={railCollapsed ? 'codicon-layout-sidebar-left' : 'codicon-layout-sidebar-left-off'} />
            </button>
            <span className='erebus-topbar-divider' />
            <button type='button' className='erebus-icon-button erebus-navigation-control' aria-label='Go back' title='Back'><Icon name='codicon-arrow-left' /></button>
            <button type='button' className='erebus-icon-button erebus-navigation-control' aria-label='Go forward' title='Forward'><Icon name='codicon-arrow-right' /></button>
            <span className='erebus-topbar-divider' />
            <button
                type='button'
                className='erebus-icon-button erebus-navigation-control'
                onClick={onRefresh}
                disabled={refreshing}
                aria-label={refreshing ? 'Refreshing view' : 'Refresh view'}
                aria-busy={refreshing}
                title={refreshing ? 'Refreshing…' : 'Refresh'}
            >
                <Icon name='codicon-refresh' className={refreshing ? 'codicon-modifier-spin' : ''} />
            </button>
        </div>

        <div className='erebus-topbar-title' onDoubleClick={toggleElectronWindowMaximized}
            title='Double-click to maximize or restore'>
            <strong>{session.title}</strong>
            <span>{session.workspace}</span>
        </div>

        <div className='erebus-topbar-actions'>
            <span className='erebus-experimental-badge'>Agent Focus</span>
            <button type='button'
                className={`erebus-icon-button erebus-attention-button${attentionCount > 0 ? ' has-attention' : ''}`}
                onClick={onToggleAttention} aria-label={`${attentionCount} attention requests`} title='Attention requests'>
                <Icon name='codicon-bell' />
                {attentionCount > 0 && <span>{attentionCount}</span>}
            </button>
            <button type='button' className={`erebus-icon-button${contextOpen ? ' is-active' : ''}`}
                onClick={onToggleContext} aria-label='Toggle context panel' title='Toggle context panel'>
                <Icon name='codicon-layout-sidebar-right' />
            </button>
            <button type='button' className='erebus-ide-button' onClick={onExitFocusMode} title='Return to the full Theia IDE'>
                <Icon name='codicon-code' />IDE
            </button>
            <WindowControls />
        </div>
    </header>;
}

export function AgentFocusView({ conversationSyncService, onExitFocusMode }: AgentFocusViewProps): React.ReactElement {
    const [sessions, setSessions] = useState<FocusSession[]>(SEED_SESSIONS);
    const [selectedId, setSelectedId] = useState(SEED_SESSIONS[0].id);
    const [conversationSources, setConversationSources] = useState<ConversationSourceStatus[]>([]);
    const [railWidth, setRailWidth] = useState(loadRailWidth);
    const [projects, setProjects] = useState<ProjectDefinition[]>(loadProjects);
    const [categories, setCategories] = useState<ProjectCategory[]>(loadProjectCategories);
    const [railCollapsed, setRailCollapsed] = useState(() => {
        try {
            return window.localStorage.getItem('erebus.agentFocus.railCollapsed') === 'true';
        } catch {
            return false;
        }
    });
    const [contextOpen, setContextOpen] = useState(true);
    const [contextTab, setContextTab] = useState<'context' | 'changes'>('context');
    const [attentionOpen, setAttentionOpen] = useState(false);
    const [newSessionOpen, setNewSessionOpen] = useState(false);
    const [newProjectOpen, setNewProjectOpen] = useState(false);
    const [categoryDialog, setCategoryDialog] = useState<{ project?: string } | undefined>();
    const [composer, setComposer] = useState('');
    const busy = false;
    const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set(['focus-agent-2']));
    const [toast, setToast] = useState<string | undefined>();
    const [refreshing, setRefreshing] = useState(false);
    const chatEndRef = useRef<HTMLDivElement | undefined>(undefined);
    const selectedIdRef = useRef(selectedId);
    const loadedConversationVersions = useRef(new Map<string, string>());
    const refreshInFlight = useRef(false);

    const selectedSession = sessions.find(session => session.id === selectedId) ?? sessions[0];
    const attentionCount = sessions.filter(session => session.status === 'attention').length;

    const loadSyncedConversation = async (
        provider: ConversationProvider,
        externalId: string,
        sessionId: string,
        expectedUpdatedAt: string
    ): Promise<void> => {
        setSessions(current => current.map(session => session.id === sessionId ? { ...session, loading: true } : session));
        try {
            const detail = await conversationSyncService.readConversation(provider, externalId);
            if (!detail) {
                throw new Error(`${providerLabels[provider]} conversation ${externalId} is no longer available.`);
            }
            loadedConversationVersions.current.set(sessionId, detail.updatedAt || expectedUpdatedAt);
            setSessions(current => current.map(session => session.id === sessionId ? applyConversationDetail(session, detail) : session));
        } catch (error) {
            console.error(`Failed to load ${providerLabels[provider]} conversation`, error);
            setSessions(current => current.map(session => session.id === sessionId ? { ...session, loading: false } : session));
            setToast(`Could not load the ${providerLabels[provider]} conversation`);
        }
    };

    useEffect(() => {
        selectedIdRef.current = selectedId;
    }, [selectedId]);

    useEffect(() => {
        let disposed = false;
        const refresh = async (): Promise<void> => {
            try {
                const snapshot = await conversationSyncService.listConversations();
                if (disposed) {
                    return;
                }
                setConversationSources(current => reconcileConversationSources(current, snapshot.sources));
                setSessions(current => reconcileSyncedSessions(current, snapshot.conversations));

                const selectedSummary = snapshot.conversations.find(summary =>
                    `${summary.provider}:${summary.id}` === selectedIdRef.current);
                if (selectedSummary
                    && loadedConversationVersions.current.get(selectedIdRef.current) !== selectedSummary.updatedAt) {
                    await loadSyncedConversation(
                        selectedSummary.provider,
                        selectedSummary.id,
                        selectedIdRef.current,
                        selectedSummary.updatedAt
                    );
                }
            } catch (error) {
                console.error('Failed to synchronize external conversations', error);
                if (!disposed) {
                    setToast('External conversation sync is unavailable');
                }
            }
        };
        refresh().catch(error => console.error(error));
        const interval = window.setInterval(() => refresh().catch(error => console.error(error)), CONVERSATION_SYNC_INTERVAL_MS);
        return () => {
            disposed = true;
            window.clearInterval(interval);
        };
    }, [conversationSyncService]);

    const refreshView = async (): Promise<void> => {
        if (refreshInFlight.current) {
            return;
        }
        refreshInFlight.current = true;
        setRefreshing(true);
        try {
            const snapshot = await conversationSyncService.listConversations(true);
            setConversationSources(current => reconcileConversationSources(current, snapshot.sources));
            setSessions(current => reconcileSyncedSessions(current, snapshot.conversations));

            const selectedSummary = snapshot.conversations.find(summary =>
                `${summary.provider}:${summary.id}` === selectedIdRef.current);
            if (selectedSummary
                && loadedConversationVersions.current.get(selectedIdRef.current) !== selectedSummary.updatedAt) {
                await loadSyncedConversation(
                    selectedSummary.provider,
                    selectedSummary.id,
                    selectedIdRef.current,
                    selectedSummary.updatedAt
                );
            }
        } catch (error) {
            console.error('Failed to refresh Agent Focus', error);
            setToast('Could not refresh Agent Focus');
        } finally {
            refreshInFlight.current = false;
            setRefreshing(false);
        }
    };

    useEffect(() => {
        try {
            window.localStorage.setItem('erebus.agentFocus.railCollapsed', String(railCollapsed));
        } catch {
            // Persistence is optional in restricted browser contexts.
        }
    }, [railCollapsed]);

    useEffect(() => {
        try {
            window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(railWidth));
        } catch {
            // Persistence is optional in restricted browser contexts.
        }
    }, [railWidth]);

    useEffect(() => {
        try {
            window.localStorage.setItem(PROJECT_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
        } catch {
            // Persistence is optional in restricted browser contexts.
        }
    }, [categories]);

    useEffect(() => {
        try {
            window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
        } catch {
            // Persistence is optional in restricted browser contexts.
        }
    }, [projects]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ block: 'end' });
    }, [selectedSession.messages.length, selectedId]);

    useEffect(() => {
        if (!toast) {
            return undefined;
        }
        const timeout = window.setTimeout(() => setToast(undefined), 2400);
        return () => window.clearTimeout(timeout);
    }, [toast]);

    const updateSession = (sessionId: string, update: (session: FocusSession) => FocusSession): void => {
        setSessions(current => current.map(session => session.id === sessionId ? update(session) : session));
    };

    const selectSession = (sessionId: string): void => {
        selectedIdRef.current = sessionId;
        setSelectedId(sessionId);
        setContextTab('context');
        setComposer('');
        const session = sessions.find(candidate => candidate.id === sessionId);
        if (session?.readOnly && session.externalId && session.sourceUpdatedAt
            && loadedConversationVersions.current.get(sessionId) !== session.sourceUpdatedAt) {
            loadSyncedConversation(
                session.provider as ConversationProvider,
                session.externalId,
                sessionId,
                session.sourceUpdatedAt
            ).catch(error => console.error(error));
        }
    };

    const openChanges = (): void => {
        setContextOpen(true);
        setContextTab('changes');
    };

    const submitMessage = (submission: ComposerSubmission): void => {
        const trimmed = composer.trim();
        if (!trimmed || busy || selectedSession.readOnly) {
            return;
        }

        const targetId = selectedSession.id;
        const selectedAgent = COMPOSER_AGENTS.find(option => option.value === submission.agent) ?? COMPOSER_AGENTS[0];
        const selectedEffort = COMPOSER_EFFORTS.find(option => option.value === submission.effort) ?? COMPOSER_EFFORTS[1];
        const selectedAccess = COMPOSER_ACCESS_MODES.find(option => option.value === submission.access) ?? COMPOSER_ACCESS_MODES[1];
        const userMessage: FocusMessage = {
            id: `${targetId}-user-${Date.now()}`,
            role: 'user',
            body: [trimmed],
            context: submission.context,
            executionParameters: {
                permissions: {
                    mode: submission.access,
                    label: selectedAccess.label
                },
                attachments: submission.context.map(item => ({
                    kind: item.kind,
                    label: item.label,
                    detail: item.detail,
                    paths: item.paths
                })),
                model: {
                    id: submission.agent,
                    label: selectedAgent.label
                },
                reasoningLevel: {
                    id: submission.effort,
                    label: selectedEffort.label
                },
                autopilot: submission.autopilot,
                workspace: selectedSession.workspace,
                session: selectedSession.title
            }
        };
        updateSession(targetId, session => ({
            ...session,
            summary: `Local comment · ${selectedAgent.label} · ${selectedEffort.label}`,
            updated: 'now',
            messages: [...session.messages, userMessage]
        }));
        setComposer('');
    };

    const createSession = (workflow?: WorkflowKind): void => {
        const id = `session-${Date.now()}`;
        const title = workflow ? `${workflow} — Untitled task` : 'Untitled agent session';
        const session: FocusSession = {
            id,
            provider: 'erebus',
            workspace: 'Erebus',
            title,
            summary: workflow ? `${workflow} workflow ready` : 'Ready for a new direction',
            updated: 'now',
            status: 'paused',
            kind: 'local',
            monogram: workflow ? workflow.split(' ').map(word => word[0]).join('').slice(0, 2) : 'NS',
            accent: '#9b6cff',
            messages: [],
            requirement: workflow ? `Define the outcome for this ${workflow.toLowerCase()} workflow.` : 'Describe the outcome you want the agent to own.',
            designNotes: ['Keep the scope explicit', 'Surface blocking decisions', 'Verify the final result'],
            tasks: [],
            changedFiles: []
        };
        setSessions(current => [session, ...current]);
        setSelectedId(id);
        setNewSessionOpen(false);
        setContextTab('context');
    };

    const assignProjectToCategory = (categoryId: string, project: string): void => {
        setCategories(current => current.map(category => ({
            ...category,
            projects: category.id === categoryId && categoryId !== UNCATEGORIZED_CATEGORY_ID
                ? [...category.projects.filter(candidate => candidate !== project), project]
                : category.projects.filter(candidate => candidate !== project)
        })));
        const categoryName = categoryId === UNCATEGORIZED_CATEGORY_ID
            ? UNCATEGORIZED_CATEGORY_NAME
            : categories.find(category => category.id === categoryId)?.name;
        setToast(categoryName ? `${project} moved to ${categoryName}` : `${project} moved`);
    };

    const createProject = (input: NewProjectInput): void => {
        const project: ProjectDefinition = {
            id: `project-${Date.now()}`,
            name: input.name,
            kind: input.kind,
            sourceFolders: input.sourceFolders,
            tags: [],
            hidden: false
        };
        setProjects(current => [...current, project]);
        setCategories(current => current.map(category => ({
            ...category,
            projects: category.projects.filter(candidate => candidate !== project.name)
        })));
        setNewProjectOpen(false);
        setToast(`${project.name} created in ${UNCATEGORIZED_CATEGORY_NAME}`);
    };

    const createCategory = (name: string): void => {
        const project = categoryDialog?.project;
        setCategories(current => [
            ...current.map(category => ({
                ...category,
                projects: project ? category.projects.filter(candidate => candidate !== project) : category.projects
            })),
            {
                id: `category-${Date.now()}`,
                name,
                projects: project ? [project] : []
            }
        ]);
        setCategoryDialog(undefined);
        setToast(project ? `${project} moved to ${name}` : `${name} category created`);
    };

    const resolveAttention = (sessionId: string): void => {
        updateSession(sessionId, session => ({
            ...session,
            status: 'working',
            summary: 'Packaging the approved local preview',
            updated: 'now'
        }));
        setToast('Command approved for this session');
    };

    const runRemainingTasks = (): void => {
        updateSession(selectedSession.id, session => ({
            ...session,
            status: 'working',
            summary: 'Running the remaining tasks',
            tasks: session.tasks.map((task, index) => index === session.tasks.findIndex(candidate => !candidate.complete) ? { ...task, complete: true } : task)
        }));
        setToast('Next task started');
    };

    return <div
        className={`erebus-focus-root${railCollapsed ? ' rail-collapsed' : ''}${contextOpen ? ' context-open' : ''}`}
        style={{ '--erebus-rail-width': `${railWidth}px` } as React.CSSProperties}
    >
        <TopBar
            session={selectedSession}
            railCollapsed={railCollapsed}
            contextOpen={contextOpen}
            attentionCount={attentionCount}
            refreshing={refreshing}
            onToggleRail={() => setRailCollapsed(current => !current)}
            onRefresh={() => refreshView().catch(error => console.error(error))}
            onToggleContext={() => setContextOpen(current => !current)}
            onToggleAttention={() => setAttentionOpen(current => !current)}
            onExitFocusMode={onExitFocusMode}
        />

        <div className='erebus-focus-workspace'>
            <SessionRail
                sessions={sessions}
                projects={projects}
                categories={categories}
                sources={conversationSources}
                selectedId={selectedSession.id}
                collapsed={railCollapsed}
                onSelect={selectSession}
                onNewSession={() => setNewSessionOpen(true)}
                onNewProject={() => setNewProjectOpen(true)}
                onCreateCategory={project => setCategoryDialog({ project })}
                onAssignProject={assignProjectToCategory}
            />

            {!railCollapsed && <RailResizeHandle width={railWidth} onResize={width => setRailWidth(clampRailWidth(width))} />}

            <main className='erebus-chat-panel'>
                <div className='erebus-chat-scroll'>
                    <div className='erebus-chat-column'>
                        {selectedSession.messages.length === 0 ? <EmptyConversation session={selectedSession} /> : selectedSession.messages.map(message => <ConversationMessage
                            key={message.id}
                            message={message}
                            agentName={selectedSession.provider === 'erebus'
                                ? 'Erebus'
                                : providerLabels[selectedSession.provider as ConversationProvider]}
                            expanded={expandedTools.has(message.id)}
                            onToggleTools={() => setExpandedTools(current => {
                                const next = new Set(current);
                                if (next.has(message.id)) {
                                    next.delete(message.id);
                                } else {
                                    next.add(message.id);
                                }
                                return next;
                            })}
                            onOpenChanges={openChanges}
                        />)}
                        {Boolean(selectedSession.truncatedMessages) && <div className='erebus-history-truncated'>
                            Showing the latest {selectedSession.messages.length} messages. {selectedSession.truncatedMessages} earlier messages remain in the source conversation.
                        </div>}
                        {selectedSession.loading && <div className='erebus-agent-working'>
                            <AgentMark small />
                            <span>Synchronizing {providerLabels[selectedSession.provider as ConversationProvider]}</span>
                            <span className='erebus-working-dots'><i /><i /><i /></span>
                        </div>}
                        {busy && <div className='erebus-agent-working'>
                            <AgentMark small />
                            <span>Erebus is working</span>
                            <span className='erebus-working-dots'><i /><i /><i /></span>
                        </div>}
                        <div ref={element => chatEndRef.current = element ?? undefined} />
                    </div>
                </div>
                <Composer
                    key={selectedSession.id}
                    value={composer}
                    busy={busy}
                    readOnly={Boolean(selectedSession.readOnly)}
                    providerName={selectedSession.provider === 'erebus'
                        ? undefined
                        : providerLabels[selectedSession.provider as ConversationProvider]}
                    workspace={selectedSession.workspace}
                    sessionTitle={selectedSession.title}
                    onChange={setComposer}
                    onSubmit={submitMessage}
                />
            </main>

            {contextOpen && <ContextPanel
                session={selectedSession}
                tab={contextTab}
                onTabChange={setContextTab}
                onClose={() => setContextOpen(false)}
                onRunTasks={runRemainingTasks}
            />}

            {attentionOpen && <AttentionPanel
                sessions={sessions}
                onSelect={selectSession}
                onClose={() => setAttentionOpen(false)}
                onResolve={resolveAttention}
            />}
        </div>

        {newSessionOpen && <NewSessionDialog onClose={() => setNewSessionOpen(false)} onCreate={createSession} />}
        {newProjectOpen && <NewProjectDialog
            projectNames={Array.from(new Set([
                ...projects.map(project => project.name),
                ...sessions.filter(session => session.provider === 'erebus').map(session => session.workspace)
            ]))}
            onClose={() => setNewProjectOpen(false)}
            onCreate={createProject}
        />}
        {categoryDialog && <NewCategoryDialog
            project={categoryDialog.project}
            categoryNames={[...categories.map(category => category.name), UNCATEGORIZED_CATEGORY_NAME]}
            onClose={() => setCategoryDialog(undefined)}
            onCreate={createCategory}
        />}
        {toast && <div className='erebus-toast' role='status'><Icon name='codicon-check' />{toast}</div>}
    </div>;
}
