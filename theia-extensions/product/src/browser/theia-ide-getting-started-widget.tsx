/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';

import { Message } from '@theia/core/lib/browser';
import { PreferenceService } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { renderProductName } from './branding-util';

import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { VSXEnvironment } from '@theia/vsx-registry/lib/common/vsx-environment';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

@injectable()
export class TheiaIDEGettingStartedWidget extends GettingStartedWidget {

    @inject(VSXEnvironment)
    protected readonly environment: VSXEnvironment;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected vscodeApiVersion: string;

    protected async doInit(): Promise<void> {
        super.doInit();
        this.vscodeApiVersion = await this.environment.getVscodeApiVersion();
        await this.preferenceService.ready;
        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const htmlElement = document.getElementById('alwaysShowWelcomePage');
        if (htmlElement) {
            htmlElement.focus();
        }
    }

    protected render(): React.ReactNode {
        return <div className='erebus-welcome'>
            <main className='erebus-welcome-main'>
                <header className='erebus-welcome-hero'>
                    <span className='erebus-welcome-mark' aria-hidden='true'><span /><span /></span>
                    <div>
                        <span className='erebus-welcome-eyebrow'>Erebus agentic workspace</span>
                        <h1>Build with an agent at your side.</h1>
                        <p>Move between focused agent direction and a full editor without losing the shape of your work.</p>
                    </div>
                </header>

                <section className='erebus-welcome-grid'>
                    <article className='erebus-welcome-card is-primary'>
                        <span className='erebus-welcome-card-label'>Workspace</span>
                        <h2>Start coding</h2>
                        <p>Open a project, create a file, or restore a workspace.</p>
                        <div className='erebus-welcome-actions'>
                            <button type='button' className='is-primary' onClick={this.doOpenFolder}>
                                <i className='codicon codicon-folder-opened' aria-hidden='true' />
                                <span><strong>Open folder</strong><small>Choose a local project</small></span>
                                <i className='codicon codicon-arrow-right' aria-hidden='true' />
                            </button>
                            <button type='button' onClick={this.doCreateFile}>
                                <i className='codicon codicon-new-file' aria-hidden='true' />
                                <span><strong>New file</strong><small>Begin in an empty editor</small></span>
                            </button>
                            <button type='button' onClick={this.doOpenWorkspace}>
                                <i className='codicon codicon-window' aria-hidden='true' />
                                <span><strong>Open workspace</strong><small>Restore a multi-root setup</small></span>
                            </button>
                        </div>
                    </article>

                    <article className='erebus-welcome-card is-agent'>
                        <span className='erebus-welcome-card-label'>Agent</span>
                        <h2>Choose your working mode</h2>
                        <p>Direct parallel work in Agent Focus or keep an assistant docked beside the editor.</p>
                        <div className='erebus-welcome-actions'>
                            <button type='button' className='is-agent' onClick={() => this.commandRegistry.executeCommand('erebus.agentFocus.open')}>
                                <i className='codicon codicon-sparkle' aria-hidden='true' />
                                <span><strong>Open Agent Focus</strong><small>Plan, delegate, and review</small></span>
                                <span className='erebus-welcome-shortcut'>Ctrl Alt A</span>
                            </button>
                            <button type='button' onClick={this.doOpenAIChatView}>
                                <i className='codicon codicon-comment-discussion' aria-hidden='true' />
                                <span><strong>Open AI Chat</strong><small>Dock an agent beside your code</small></span>
                            </button>
                        </div>
                    </article>

                    <article className='erebus-welcome-card is-recent'>
                        {this.renderRecentWorkspaces()}
                    </article>

                    <article className='erebus-welcome-card is-layout'>
                        <span className='erebus-welcome-card-label'>Flexible layout</span>
                        <h2>Your views, where you need them</h2>
                        <p>Drag any editor or tool tab to the left, right, bottom, or another editor group. Erebus preserves the layout for your next session.</p>
                        <div className='erebus-layout-diagram' aria-hidden='true'>
                            <span className='is-rail' />
                            <span className='is-editor' />
                            <span className='is-agent' />
                            <span className='is-panel' />
                        </div>
                    </article>
                </section>

                <footer className='erebus-welcome-footer'>
                    <span>Version {this.applicationInfo?.version ?? '-'} · VS Code API {this.vscodeApiVersion}</span>
                    <span><i className='codicon codicon-grabber' aria-hidden='true' /> Drag tabs to reposition views</span>
                </footer>
            </main>
            <div className='erebus-welcome-preferences'>
                {this.renderPreferences()}
            </div>
        </div>;
    }

    protected renderActions(): React.ReactNode {
        return <div className='gs-container'>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderStart()}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderRecentWorkspaces()}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderSettings()}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderHelp()}
                </div>
            </div>
        </div>;
    }

    protected renderHeader(): React.ReactNode {
        return <div className='gs-header'>
            {renderProductName()}
            {this.renderVersion()}
        </div>;
    }

    protected renderVersion(): React.ReactNode {
        return <div>
            <p className='gs-sub-header' >
                {this.applicationInfo ? 'Version ' + this.applicationInfo.version : '-'}
            </p>

            <p className='gs-sub-header' >
                {'VS Code API Version: ' + this.vscodeApiVersion}
            </p>
        </div>;
    }

    protected renderAIBanner(): React.ReactNode {
        const framework = super.renderAIBanner();
        if (React.isValidElement<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>>(framework)) {
            return React.cloneElement(framework, { className: 'gs-section' });
        }
        return framework;
    }
}
