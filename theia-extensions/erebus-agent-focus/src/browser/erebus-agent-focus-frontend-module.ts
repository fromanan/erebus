/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/agent-focus.css';

import { FrontendApplicationContribution, RemoteConnectionProvider, ServiceConnectionProvider, WidgetFactory } from '@theia/core/lib/browser';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { CommandContribution } from '@theia/core/lib/common/command';
import { ContainerModule } from '@theia/core/shared/inversify';
import { ConversationSyncService, ConversationSyncServicePath } from '../common/conversation-sync-protocol';
import { ErebusAgentFocusContribution } from './erebus-agent-focus-contribution';
import { ErebusAgentFocusWidget } from './erebus-agent-focus-widget';

export default new ContainerModule(bind => {
    bind(ConversationSyncService).toDynamicValue(context => {
        const connection = context.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return connection.createProxy<ConversationSyncService>(ConversationSyncServicePath);
    }).inSingletonScope();

    bind(ErebusAgentFocusWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: ErebusAgentFocusWidget.ID,
        createWidget: () => context.container.get(ErebusAgentFocusWidget)
    })).inSingletonScope();

    bind(ErebusAgentFocusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ErebusAgentFocusContribution);
    bind(CommandContribution).toService(ErebusAgentFocusContribution);
    bind(KeybindingContribution).toService(ErebusAgentFocusContribution);
});
