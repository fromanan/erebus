/********************************************************************************
 * Copyright (C) 2026 Fromanium.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ApplicationShell, FrontendApplicationContribution, WidgetManager } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { MAXIMIZED_CLASS } from '@theia/core/lib/browser/shell/application-shell';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ErebusAgentFocusCommands } from './erebus-agent-focus-commands';
import { ErebusAgentFocusWidget } from './erebus-agent-focus-widget';

@injectable()
export class ErebusAgentFocusContribution implements FrontendApplicationContribution, CommandContribution, KeybindingContribution {
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    onStart(): void {
        this.stateService.reachedState('ready').then(() => this.openFocusMode()).catch(error => console.error(error));
    }

    onStop(): void {
        document.body.classList.remove('erebus-agent-focus-mode');
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ErebusAgentFocusCommands.OPEN, {
            execute: () => this.openFocusMode(),
            isEnabled: () => !document.body.classList.contains('erebus-agent-focus-mode')
        });
        commands.registerCommand(ErebusAgentFocusCommands.LEAVE, {
            execute: () => this.leaveFocusMode(),
            isEnabled: () => document.body.classList.contains('erebus-agent-focus-mode')
        });
        commands.registerCommand(ErebusAgentFocusCommands.TOGGLE, {
            execute: () => document.body.classList.contains('erebus-agent-focus-mode') ? this.leaveFocusMode() : this.openFocusMode()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: ErebusAgentFocusCommands.TOGGLE.id,
            keybinding: 'ctrlcmd+alt+a'
        });
    }

    protected async openFocusMode(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget<ErebusAgentFocusWidget>(ErebusAgentFocusWidget.ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main' });
        }

        document.body.classList.add('erebus-agent-focus-mode');
        await this.shell.activateWidget(widget.id);
        this.shell.getTabBarFor(widget)?.hide();

        if (!this.shell.mainPanel.hasClass(MAXIMIZED_CLASS)) {
            this.shell.toggleMaximized(widget);
        }
    }

    protected async leaveFocusMode(): Promise<void> {
        const widget = await this.widgetManager.getWidget<ErebusAgentFocusWidget>(ErebusAgentFocusWidget.ID);

        if (this.shell.mainPanel.hasClass(MAXIMIZED_CLASS)) {
            this.shell.toggleMaximized(widget);
        }

        if (widget) {
            this.shell.getTabBarFor(widget)?.show();
        }
        document.body.classList.remove('erebus-agent-focus-mode');

        if (widget) {
            await this.shell.closeWidget(widget.id);
        }
    }
}
