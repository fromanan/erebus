/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export type ConversationProvider = 'codex' | 'kiro';

export interface SyncedConversationMessage {
    id: string;
    role: 'user' | 'agent';
    body: string[];
    toolCalls?: number;
}

export interface SyncedConversationSummary {
    id: string;
    provider: ConversationProvider;
    title: string;
    workspace: string;
    cwd?: string;
    updatedAt: string;
    active: boolean;
    messageCount?: number;
}

export interface SyncedConversationDetail extends SyncedConversationSummary {
    messages: SyncedConversationMessage[];
    truncatedMessages: number;
}

export interface ConversationSourceStatus {
    provider: ConversationProvider;
    available: boolean;
    conversationCount: number;
    message?: string;
}

export interface ConversationSyncSnapshot {
    conversations: SyncedConversationSummary[];
    sources: ConversationSourceStatus[];
}

export const ConversationSyncServicePath = '/services/erebus/conversation-sync';
export const ConversationSyncService = Symbol('ConversationSyncService');

/**
 * Read-only access to conversation data owned by external agent products.
 * Erebus never writes to Codex or Kiro storage through this service.
 */
export interface ConversationSyncService {
    listConversations(): Promise<ConversationSyncSnapshot>;
    readConversation(provider: ConversationProvider, id: string): Promise<SyncedConversationDetail | undefined>;
}
