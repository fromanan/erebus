/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { FocusSession, WorkflowKind } from './agent-focus-types';

export const WORKFLOWS: Array<{ kind: WorkflowKind; icon: string; description: string }> = [
    {
        kind: 'Spec',
        icon: 'codicon-notebook',
        description: 'Shape requirements, design, and an implementation task list.'
    },
    {
        kind: 'Plan',
        icon: 'codicon-list-tree',
        description: 'Investigate the workspace and propose a plan without editing files.'
    },
    {
        kind: 'Bug Fix',
        icon: 'codicon-debug-alt',
        description: 'Reproduce, diagnose, repair, and verify a concrete problem.'
    },
    {
        kind: 'Quick Spec',
        icon: 'codicon-zap',
        description: 'Move from a short idea to an execution-ready brief quickly.'
    }
];

export const SEED_SESSIONS: FocusSession[] = [
    {
        id: 'agent-focus-polish',
        workspace: 'Erebus',
        title: 'Agent Focus polish',
        summary: 'Refined the chat-first shell and violet color system',
        updated: 'now',
        status: 'complete',
        kind: 'local',
        monogram: 'AF',
        accent: '#9b6cff',
        messages: [
            {
                id: 'focus-user-1',
                role: 'user',
                body: [
                    'Recreate the Agent Focus experience as a distinct Erebus surface. ' +
                    'Prioritize the three-panel hierarchy, dense session monitoring, and the near-black violet palette.'
                ]
            },
            {
                id: 'focus-agent-1',
                role: 'agent',
                toolCalls: 6,
                body: [
                    'The maintained Theia Electron template is in place. I mapped the experience around three persistent jobs: ' +
                    'choosing agent sessions, directing the active task, and reviewing its artifacts.',
                    'The color system now separates the near-black session rail from the warmer violet workspace, ' +
                    'then reserves saturated purple for intent, focus, and primary actions.'
                ],
                changedFiles: [
                    'agent-focus-view.tsx',
                    'agent-focus.css',
                    'erebus-agent-focus-contribution.ts'
                ],
                elapsed: '2m 16s'
            },
            {
                id: 'focus-agent-2',
                role: 'agent',
                toolCalls: 3,
                body: [
                    'The interaction pass is complete. Sessions can be switched or collapsed into a monogram rail, ' +
                    'attention requests can be handled without leaving the conversation, and changed files open in the contextual review panel.',
                    'Use the IDE control when you need the underlying editor. Agent Focus remains a direction surface; ' +
                    'Theia continues to provide terminals, source control, extensions, and direct file editing.'
                ],
                changedFiles: [
                    'README.md',
                    'applications/electron/package.json'
                ],
                elapsed: '48s'
            }
        ],
        requirement: 'Create a calm, information-dense agent direction surface that keeps parallel work legible without turning the interface into a dashboard.',
        designNotes: [
            'Session rail remains darker than the active workspace',
            'Conversation owns the widest visual column',
            'Artifacts appear only when they help a decision',
            'Purple indicates agency, selection, and forward motion'
        ],
        tasks: [
            { id: 't1', label: 'Establish Electron IDE substrate', complete: true },
            { id: 't2', label: 'Build three-panel focus shell', complete: true },
            { id: 't3', label: 'Add session and composer interactions', complete: true },
            { id: 't4', label: 'Verify responsive states', complete: false }
        ],
        changedFiles: [
            'agent-focus-view.tsx',
            'agent-focus.css',
            'erebus-agent-focus-contribution.ts',
            'applications/electron/package.json',
            'README.md'
        ]
    },
    {
        id: 'terminal-approval',
        workspace: 'Erebus',
        title: 'Package the Windows preview',
        summary: 'Waiting to run the unsigned packaging command',
        updated: '4 min',
        status: 'attention',
        kind: 'local',
        monogram: 'WP',
        accent: '#ffb454',
        messages: [
            {
                id: 'package-user-1',
                role: 'user',
                body: ['Create a Windows preview build and keep signing disabled for local validation.']
            },
            {
                id: 'package-agent-1',
                role: 'agent',
                toolCalls: 4,
                body: [
                    'The production bundle is ready. I need approval before running the packaging step because it will create ' +
                    'a large local distribution under applications/electron/dist.'
                ]
            }
        ],
        requirement: 'Produce a locally installable preview without publishing or signing it.',
        designNotes: [
            'Use electron-builder preview mode',
            'Do not publish artifacts',
            'Keep the source workspace untouched outside build output'
        ],
        tasks: [
            { id: 'p1', label: 'Compile extensions', complete: true },
            { id: 'p2', label: 'Bundle Electron frontend', complete: true },
            { id: 'p3', label: 'Package preview', complete: false }
        ],
        changedFiles: ['applications/electron/electron-builder.yml']
    },
    {
        id: 'indexing-worker',
        workspace: 'Nightfall API',
        title: 'Trace indexing worker stalls',
        summary: 'Reading queue ownership and retry behavior',
        updated: '8 min',
        status: 'working',
        kind: 'cloud',
        monogram: 'IW',
        accent: '#5ed6c0',
        messages: [
            {
                id: 'index-user-1',
                role: 'user',
                body: ['Find why repository indexing can remain at 92% after a transient network failure.']
            },
            {
                id: 'index-agent-1',
                role: 'agent',
                toolCalls: 9,
                body: [
                    'I am tracing the retry boundary between the queue consumer and the progress aggregator. ' +
                    'The current evidence points to a completed shard whose terminal event is not replayed after reconnect.'
                ]
            }
        ],
        requirement: 'Explain and reproduce the progress stall before proposing a narrow correction.',
        designNotes: [
            'Trace queue ownership first',
            'Separate terminal events from progress snapshots',
            'Avoid changing retry limits without evidence'
        ],
        tasks: [
            { id: 'i1', label: 'Trace consumer lifecycle', complete: true },
            { id: 'i2', label: 'Reproduce reconnect sequence', complete: false },
            { id: 'i3', label: 'Propose correction', complete: false }
        ],
        changedFiles: []
    },
    {
        id: 'command-palette',
        workspace: 'Nightfall API',
        title: 'Command palette accessibility',
        summary: 'Audit complete with seven recommendations',
        updated: '1 hr',
        status: 'paused',
        kind: 'cli',
        monogram: 'CP',
        accent: '#6aa9ff',
        messages: [
            {
                id: 'palette-user-1',
                role: 'user',
                body: ['Audit the command palette for keyboard and screen-reader usability.']
            },
            {
                id: 'palette-agent-1',
                role: 'agent',
                toolCalls: 12,
                body: [
                    'The audit is complete. The highest-impact gaps are focus restoration after execution, ' +
                    'a missing live-region update for result counts, and inconsistent labeling for contributed commands.'
                ],
                elapsed: '6m 04s'
            }
        ],
        requirement: 'Identify accessibility failures without changing application behavior.',
        designNotes: [
            'Test keyboard-only navigation',
            'Inspect accessible names and live regions',
            'Keep findings evidence-backed'
        ],
        tasks: [
            { id: 'c1', label: 'Keyboard navigation pass', complete: true },
            { id: 'c2', label: 'Screen reader semantics pass', complete: true },
            { id: 'c3', label: 'Write findings', complete: true }
        ],
        changedFiles: []
    }
];
