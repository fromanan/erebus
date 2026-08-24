/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { Command } from '@theia/core/lib/common/command';

export namespace ErebusAgentFocusCommands {
    export const CATEGORY = 'Erebus';
    export const OPEN: Command = {
        id: 'erebus.agentFocus.open',
        category: CATEGORY,
        label: 'Open Agent Focus'
    };
    export const LEAVE: Command = {
        id: 'erebus.agentFocus.leave',
        category: CATEGORY,
        label: 'Return to IDE'
    };
    export const TOGGLE: Command = {
        id: 'erebus.agentFocus.toggle',
        category: CATEGORY,
        label: 'Toggle Agent Focus'
    };
}
