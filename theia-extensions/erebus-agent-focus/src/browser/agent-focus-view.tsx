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
import { SEED_SESSIONS, WORKFLOWS } from './agent-focus-fixtures';
import { FocusMessage, FocusSession, SessionKind, SessionStatus, WorkflowKind } from './agent-focus-types';

const { useEffect, useMemo, useRef, useState } = React;

const DEFAULT_RAIL_WIDTH = 290;
const MIN_RAIL_WIDTH = 220;
const MAX_RAIL_WIDTH = 520;
const RAIL_WIDTH_STORAGE_KEY = 'erebus.agentFocus.railWidth';
const PROJECT_CATEGORIES_STORAGE_KEY = 'erebus.agentFocus.projectCategories';

interface ProjectCategory {
    id: string;
    name: string;
    projects: string[];
}

export interface AgentFocusViewProps {
    onExitFocusMode: () => void;
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
        });
    } catch {
        return [];
    }
}

function getElectronWindowApi(): TheiaCoreAPI | undefined {
    return 'electronTheiaCore' in window ? window.electronTheiaCore : undefined;
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
        <button type='button' className='erebus-window-control' onClick={toggleFullScreen}
            aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'} title={fullScreen ? 'Exit full screen' : 'Full screen'}>
            <Icon name={fullScreen ? 'codicon-screen-normal' : 'codicon-screen-full'} />
        </button>
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

function SessionRail({ sessions, categories, selectedId, collapsed, onSelect, onNewSession, onCreateCategory, onAssignProject }: {
    sessions: FocusSession[];
    categories: ProjectCategory[];
    selectedId: string;
    collapsed: boolean;
    onSelect: (id: string) => void;
    onNewSession: () => void;
    onCreateCategory: (project?: string) => void;
    onAssignProject: (categoryId: string, project: string) => void;
}): React.ReactElement {
    const [collapsedProjects, setCollapsedProjects] = useState<ReadonlySet<string>>(() => new Set());
    const [collapsedCategories, setCollapsedCategories] = useState<ReadonlySet<string>>(() => new Set());
    const [draggedProject, setDraggedProject] = useState<string | undefined>();
    const [dropCategoryId, setDropCategoryId] = useState<string | undefined>();
    const groups = useMemo(() => {
        const result = new Map<string, FocusSession[]>();
        sessions.forEach(session => {
            const group = result.get(session.workspace) ?? [];
            group.push(session);
            result.set(session.workspace, group);
        });
        return Array.from(result.entries());
    }, [sessions]);
    const categorizedProjects = useMemo(() => new Set(categories.flatMap(category => category.projects)), [categories]);
    const ungroupedProjects = groups.filter(([workspace]) => !categorizedProjects.has(workspace));

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

    const beginProjectDrag = (event: React.DragEvent<HTMLElement>, workspace: string): void => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', workspace);
        setDraggedProject(workspace);
    };

    const endProjectDrag = (): void => {
        setDraggedProject(undefined);
        setDropCategoryId(undefined);
    };

    const getDroppedProject = (event: React.DragEvent<HTMLElement>): string | undefined =>
        draggedProject ?? (event.dataTransfer.getData('text/plain') || undefined);

    const renderProject = (workspace: string, workspaceSessions: FocusSession[], categoryName?: string): React.ReactElement => {
        const projectCollapsed = collapsedProjects.has(workspace);
        const projectSessionsId = `erebus-project-sessions-${workspaceSessions[0].id}`;
        const projectLabel = categoryName ? `${categoryName} | ${workspace}` : workspace;
        return <section className={`erebus-project-group${draggedProject === workspace ? ' is-dragging' : ''}`} key={workspace}>
            {!collapsed && <div className='erebus-project-heading'>
                <span
                    className='erebus-project-name'
                    draggable
                    onDragStart={event => beginProjectDrag(event, workspace)}
                    onDragEnd={endProjectDrag}
                    title={`Drag ${workspace} into a category`}
                >
                    <Icon name='codicon-folder' />
                    <span>{projectLabel}</span>
                </span>
                <button
                    type='button'
                    className='erebus-project-toggle'
                    onClick={() => toggleProject(workspace)}
                    aria-controls={projectSessionsId}
                    aria-expanded={!projectCollapsed}
                    aria-label={`${projectCollapsed ? 'Expand' : 'Collapse'} ${projectLabel} sessions`}
                    title={`${projectCollapsed ? 'Expand' : 'Collapse'} ${projectLabel}`}
                >
                    <Icon name={projectCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'} />
                </button>
            </div>}
            <div id={projectSessionsId}
                className={`erebus-project-sessions${projectCollapsed ? ' is-collapsed' : ''}`}
                aria-hidden={projectCollapsed}
            >
                {workspaceSessions.map(session => <SessionRow
                    key={session.id}
                    session={session}
                    active={selectedId === session.id}
                    collapsed={collapsed}
                    onSelect={() => onSelect(session.id)}
                />)}
            </div>
        </section>;
    };

    return <aside className={`erebus-session-rail${collapsed ? ' is-collapsed' : ''}`} aria-label='Agent sessions'>
        <div className='erebus-session-rail-content'>
            <button type='button' className='erebus-new-session' onClick={onNewSession} title='New session'>
                <Icon name='codicon-edit' />
                {!collapsed && <span>New session</span>}
            </button>

            {!collapsed && <div className='erebus-rail-label'>Projects</div>}

            <div className='erebus-project-groups'>
                {!collapsed && categories.map(category => {
                    const categoryCollapsed = collapsedCategories.has(category.id);
                    const categoryProjectsId = `erebus-category-projects-${category.id}`;
                    const categoryProjects = category.projects.flatMap(project => {
                        const projectGroup = groups.find(([workspace]) => workspace === project);
                        return projectGroup ? [projectGroup] : [];
                    });
                    const dropActive = dropCategoryId === category.id;
                    return <section
                        className={`erebus-project-category${dropActive ? ' is-drop-target' : ''}`}
                        key={category.id}
                        onDragEnter={event => {
                            event.preventDefault();
                            setDropCategoryId(category.id);
                        }}
                        onDragOver={event => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                        }}
                        onDragLeave={event => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                setDropCategoryId(undefined);
                            }
                        }}
                        onDrop={event => {
                            event.preventDefault();
                            const project = getDroppedProject(event);
                            if (project) {
                                onAssignProject(category.id, project);
                            }
                            endProjectDrag();
                        }}
                    >
                        <div className='erebus-category-heading'>
                            <span><Icon name={dropActive ? 'codicon-folder-opened' : 'codicon-folder'} />{category.name}</span>
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
                                ? categoryProjects.map(([workspace, workspaceSessions]) => renderProject(workspace, workspaceSessions, category.name))
                                : <span className='erebus-empty-category'>Drag projects here</span>}
                        </div>
                    </section>;
                })}
                {ungroupedProjects.map(([workspace, workspaceSessions]) => renderProject(workspace, workspaceSessions))}
            </div>

            {!collapsed && <button
                type='button'
                className={`erebus-new-category${draggedProject ? ' is-drop-target' : ''}`}
                onClick={() => onCreateCategory()}
                onDragOver={event => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const project = getDroppedProject(event);
                    if (project) {
                        onCreateCategory(project);
                    }
                    endProjectDrag();
                }}
            >
                <Icon name={draggedProject ? 'codicon-new-folder' : 'codicon-add'} />
                {draggedProject ? 'Drop to create category' : 'New category'}
            </button>}
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
        tabIndex={0}
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

function ConversationMessage({ message, expanded, onToggleTools, onOpenChanges }: {
    message: FocusMessage;
    expanded: boolean;
    onToggleTools: () => void;
    onOpenChanges: () => void;
}): React.ReactElement {
    if (message.role === 'user') {
        return <article className='erebus-message is-user'>
            <div className='erebus-user-bubble'>{message.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        </article>;
    }

    return <article className='erebus-message is-agent'>
        {message.toolCalls && <ToolDisclosure count={message.toolCalls} expanded={expanded} onToggle={onToggleTools} />}
        <header className='erebus-agent-heading'>
            <AgentMark />
            <strong>Erebus</strong>
            <span>Agent</span>
        </header>
        <div className='erebus-agent-copy'>
            {message.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
        {message.elapsed && <div className='erebus-message-metrics'>
            <span>Elapsed {message.elapsed}</span>
            <span>Local session</span>
        </div>}
        {message.changedFiles && message.changedFiles.length > 0 && <ChangeSummary files={message.changedFiles} onOpenChanges={onOpenChanges} />}
    </article>;
}

function EmptyConversation({ session }: { session: FocusSession }): React.ReactElement {
    return <div className='erebus-empty-conversation'>
        <div className='erebus-empty-orbit'><AgentMark /></div>
        <span className='erebus-eyebrow'>Ready to work</span>
        <h2>{session.title}</h2>
        <p>Describe an outcome, attach context, or select a structured workflow. Erebus will keep the session visible while it works.</p>
    </div>;
}

function Composer({ value, busy, onChange, onSubmit }: {
    value: string;
    busy: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
}): React.ReactElement {
    return <div className='erebus-composer-wrap'>
        <div className={`erebus-composer${busy ? ' is-busy' : ''}`}>
            <textarea
                rows={2}
                value={value}
                onChange={event => onChange(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        onSubmit();
                    }
                }}
                placeholder='Ask a question or describe a task…'
                aria-label='Message the agent'
            />
            <div className='erebus-composer-toolbar'>
                <div className='erebus-composer-tools'>
                    <button type='button' aria-label='Add context' title='Add context'><Icon name='codicon-add' /></button>
                    <button type='button' aria-label='Attach file' title='Attach file'><Icon name='codicon-attach' /></button>
                    <button type='button' className='erebus-select-button'>
                        <AgentMark small />Erebus Agent<Icon name='codicon-chevron-down' />
                    </button>
                    <button type='button' className='erebus-select-button'>Balanced<Icon name='codicon-chevron-down' /></button>
                </div>
                <div className='erebus-composer-actions'>
                    <label className='erebus-autopilot-toggle'>
                        <span>Autopilot</span>
                        <input type='checkbox' defaultChecked />
                        <span className='erebus-toggle-track'><span /></span>
                    </label>
                    <button
                        type='button'
                        className='erebus-send-button'
                        onClick={onSubmit}
                        disabled={!value.trim() || busy}
                        aria-label={busy ? 'Agent is working' : 'Send message'}
                        title={busy ? 'Agent is working' : 'Send message'}
                    >
                        <Icon name={busy ? 'codicon-loading' : 'codicon-arrow-up'} className={busy ? 'codicon-modifier-spin' : ''} />
                    </button>
                </div>
            </div>
        </div>
        <div className='erebus-composer-hint'>Enter to send · Shift+Enter for a new line</div>
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

function TopBar({ session, railCollapsed, contextOpen, attentionCount, onToggleRail, onToggleContext, onToggleAttention, onExitFocusMode }: {
    session: FocusSession;
    railCollapsed: boolean;
    contextOpen: boolean;
    attentionCount: number;
    onToggleRail: () => void;
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
            <button type='button' className='erebus-icon-button' aria-label='Go back' title='Back'><Icon name='codicon-arrow-left' /></button>
            <button type='button' className='erebus-icon-button' aria-label='Go forward' title='Forward'><Icon name='codicon-arrow-right' /></button>
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

export function AgentFocusView({ onExitFocusMode }: AgentFocusViewProps): React.ReactElement {
    const [sessions, setSessions] = useState<FocusSession[]>(SEED_SESSIONS);
    const [selectedId, setSelectedId] = useState(SEED_SESSIONS[0].id);
    const [railWidth, setRailWidth] = useState(loadRailWidth);
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
    const [categoryDialog, setCategoryDialog] = useState<{ project?: string } | undefined>();
    const [composer, setComposer] = useState('');
    const [busy, setBusy] = useState(false);
    const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set(['focus-agent-2']));
    const [toast, setToast] = useState<string | undefined>();
    const chatEndRef = useRef<HTMLDivElement | undefined>(undefined);

    const selectedSession = sessions.find(session => session.id === selectedId) ?? sessions[0];
    const attentionCount = sessions.filter(session => session.status === 'attention').length;

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
        setSelectedId(sessionId);
        setContextTab('context');
        setComposer('');
    };

    const openChanges = (): void => {
        setContextOpen(true);
        setContextTab('changes');
    };

    const submitMessage = (): void => {
        const trimmed = composer.trim();
        if (!trimmed || busy) {
            return;
        }

        const targetId = selectedSession.id;
        const userMessage: FocusMessage = {
            id: `${targetId}-user-${Date.now()}`,
            role: 'user',
            body: [trimmed]
        };
        updateSession(targetId, session => ({
            ...session,
            status: 'working',
            summary: 'Working through your latest direction',
            updated: 'now',
            messages: [...session.messages, userMessage]
        }));
        setComposer('');
        setBusy(true);

        window.setTimeout(() => {
            const response: FocusMessage = {
                id: `${targetId}-agent-${Date.now()}`,
                role: 'agent',
                toolCalls: 2,
                body: [
                    'I have the direction. I would first inspect the relevant ownership path, keep the change bounded to this session, ' +
                    'and surface any decision that changes scope before editing.',
                    'This frontend prototype keeps the exchange local; connect the widget to a Theia AI chat agent ' +
                    'when you are ready to replace fixture responses with live execution.'
                ],
                elapsed: '3s'
            };
            updateSession(targetId, session => ({
                ...session,
                status: 'paused',
                summary: 'Ready for the next instruction',
                messages: [...session.messages, response]
            }));
            setBusy(false);
        }, 720);
    };

    const createSession = (workflow?: WorkflowKind): void => {
        const id = `session-${Date.now()}`;
        const title = workflow ? `${workflow} — Untitled task` : 'Untitled agent session';
        const session: FocusSession = {
            id,
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
            projects: category.id === categoryId
                ? [...category.projects.filter(candidate => candidate !== project), project]
                : category.projects.filter(candidate => candidate !== project)
        })));
        const categoryName = categories.find(category => category.id === categoryId)?.name;
        setToast(categoryName ? `${project} moved to ${categoryName}` : `${project} moved`);
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
            onToggleRail={() => setRailCollapsed(current => !current)}
            onToggleContext={() => setContextOpen(current => !current)}
            onToggleAttention={() => setAttentionOpen(current => !current)}
            onExitFocusMode={onExitFocusMode}
        />

        <div className='erebus-focus-workspace'>
            <SessionRail
                sessions={sessions}
                categories={categories}
                selectedId={selectedSession.id}
                collapsed={railCollapsed}
                onSelect={selectSession}
                onNewSession={() => setNewSessionOpen(true)}
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
                        {busy && <div className='erebus-agent-working'>
                            <AgentMark small />
                            <span>Erebus is working</span>
                            <span className='erebus-working-dots'><i /><i /><i /></span>
                        </div>}
                        <div ref={element => chatEndRef.current = element ?? undefined} />
                    </div>
                </div>
                <Composer value={composer} busy={busy} onChange={setComposer} onSubmit={submitMessage} />
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
        {categoryDialog && <NewCategoryDialog
            project={categoryDialog.project}
            categoryNames={categories.map(category => category.name)}
            onClose={() => setCategoryDialog(undefined)}
            onCreate={createCategory}
        />}
        {toast && <div className='erebus-toast' role='status'><Icon name='codicon-check' />{toast}</div>}
    </div>;
}
