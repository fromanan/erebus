/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export type SessionStatus = 'working' | 'attention' | 'paused' | 'complete';

export type SessionKind = 'local' | 'cloud' | 'cli';

export type SessionProvider = 'erebus' | 'claude' | 'codex' | 'kiro';

export type MessageRole = 'user' | 'agent';

export interface FocusMessage {
    id: string;
    role: MessageRole;
    body: string[];
    toolCalls?: number;
    changedFiles?: string[];
    elapsed?: string;
}

export interface SpecTask {
    id: string;
    label: string;
    complete: boolean;
}

export interface FocusSession {
    id: string;
    provider: SessionProvider;
    externalId?: string;
    workspace: string;
    title: string;
    summary: string;
    updated: string;
    status: SessionStatus;
    kind: SessionKind;
    monogram: string;
    accent: string;
    messages: FocusMessage[];
    requirement: string;
    designNotes: string[];
    tasks: SpecTask[];
    changedFiles: string[];
    sourceUpdatedAt?: string;
    readOnly?: boolean;
    loading?: boolean;
    truncatedMessages?: number;
}

export type WorkflowKind = 'Spec' | 'Plan' | 'Bug Fix' | 'Quick Spec';
