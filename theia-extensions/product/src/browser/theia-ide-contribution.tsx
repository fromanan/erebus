/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { Command, CommandContribution, CommandRegistry, CommandService } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry, MenuPath } from '@theia/core/lib/common/menu';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

export namespace TheiaIDEMenus {
    export const THEIA_IDE_HELP: MenuPath = [...CommonMenus.HELP, 'theia-ide'];
}
export namespace TheiaIDECommands {
    export const CATEGORY = 'TheiaIDE';
    export const REPORT_ISSUE: Command = {
        id: 'theia-ide:report-issue',
        category: CATEGORY,
        label: 'Report Issue'
    };
    export const DOCUMENTATION: Command = {
        id: 'theia-ide:documentation',
        category: CATEGORY,
        label: 'Documentation'
    };
}

@injectable()
export class TheiaIDEContribution implements FrontendApplicationContribution, CommandContribution, MenuContribution {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    protected agentFocusButton: HTMLButtonElement | undefined;
    protected agentFocusButtonFrame: number | undefined;

    protected readonly openAgentFocus = (): void => {
        this.commandService.executeCommand('erebus.agentFocus.open').catch(error => console.error(error));
    };

    static REPORT_ISSUE_URL = 'https://github.com/eclipse-theia/theia-ide/issues/new?assignees=&labels=&template=bug_report.md';
    static DOCUMENTATION_URL = 'https://theia-ide.org/docs/user_getting_started/';

    onStart(app: FrontendApplication): void {
        document.body.classList.add('erebus-ide-shell');
        if (!this.installAgentFocusButton(app.shell.node)) {
            this.agentFocusButtonFrame = window.requestAnimationFrame(() => {
                this.agentFocusButtonFrame = undefined;
                this.installAgentFocusButton(document);
            });
        }
    }

    onStop(): void {
        if (this.agentFocusButtonFrame !== undefined) {
            window.cancelAnimationFrame(this.agentFocusButtonFrame);
            this.agentFocusButtonFrame = undefined;
        }
        this.agentFocusButton?.removeEventListener('click', this.openAgentFocus);
        this.agentFocusButton?.remove();
        this.agentFocusButton = undefined;
        document.body.classList.remove('erebus-ide-shell');
    }

    protected installAgentFocusButton(root: ParentNode): boolean {
        const existingButton = root.querySelector<HTMLButtonElement>('#erebus-agent-focus-titlebar-button');
        if (existingButton) {
            this.agentFocusButton = existingButton;
            return true;
        }

        const windowControls = root.querySelector<HTMLElement>('#window-controls');
        if (!windowControls?.parentElement) {
            return false;
        }

        const button = document.createElement('button');
        button.id = 'erebus-agent-focus-titlebar-button';
        button.type = 'button';
        button.title = 'Open Agent Focus (Ctrl+Alt+A)';
        button.setAttribute('aria-label', 'Open Agent Focus');

        const icon = document.createElement('i');
        icon.className = 'codicon codicon-sparkle';
        icon.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'erebus-agent-focus-titlebar-label';
        label.textContent = 'Agent Focus';

        button.append(icon, label);
        button.addEventListener('click', this.openAgentFocus);
        windowControls.parentElement.insertBefore(button, windowControls);
        this.agentFocusButton = button;
        return true;
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(TheiaIDECommands.REPORT_ISSUE, {
            execute: () => this.windowService.openNewWindow(TheiaIDEContribution.REPORT_ISSUE_URL, { external: true })
        });
        commandRegistry.registerCommand(TheiaIDECommands.DOCUMENTATION, {
            execute: () => this.windowService.openNewWindow(TheiaIDEContribution.DOCUMENTATION_URL, { external: true })
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(TheiaIDEMenus.THEIA_IDE_HELP, {
            commandId: TheiaIDECommands.REPORT_ISSUE.id,
            label: TheiaIDECommands.REPORT_ISSUE.label,
            order: '1'
        });
        menus.registerMenuAction(TheiaIDEMenus.THEIA_IDE_HELP, {
            commandId: TheiaIDECommands.DOCUMENTATION.id,
            label: TheiaIDECommands.DOCUMENTATION.label,
            order: '2'
        });
    }
}
