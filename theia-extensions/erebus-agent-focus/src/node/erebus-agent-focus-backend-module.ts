/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { ConversationSyncService, ConversationSyncServicePath } from '../common/conversation-sync-protocol';
import { ConversationSyncServiceImpl } from './conversation-sync-service';

export default new ContainerModule(bind => {
    bind(ConversationSyncServiceImpl).toSelf().inSingletonScope();
    bind(ConversationSyncService).toService(ConversationSyncServiceImpl);
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler(ConversationSyncServicePath, () => context.container.get(ConversationSyncService))
    ).inSingletonScope();
});
