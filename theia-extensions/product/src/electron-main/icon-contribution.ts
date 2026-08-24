/********************************************************************************
 * Copyright (C) 2021 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as path from 'path';

import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';

import { injectable } from '@theia/core/shared/inversify';
import { app, BrowserWindow } from '@theia/core/electron-shared/electron';

@injectable()
export class IconContribution implements ElectronMainApplicationContribution {

    static readonly APPLICATION_NAME = 'Erebus';
    static readonly APP_USER_MODEL_ID = 'com.fromanium.erebus';

    onStart(application: ElectronMainApplication): void {
        const iconPath = path.join(__dirname, '../../resources/icons/Erebus.png');

        app.setName(IconContribution.APPLICATION_NAME);
        if (process.platform === 'win32') {
            app.setAppUserModelId(IconContribution.APP_USER_MODEL_ID);
        }

        const windowOptions = application.config.electron.windowOptions;
        if (windowOptions) {
            windowOptions.icon = iconPath;
            windowOptions.title ??= IconContribution.APPLICATION_NAME;
        }

        for (const window of BrowserWindow.getAllWindows()) {
            window.setIcon(iconPath);
            if (!window.getTitle() || window.getTitle() === 'Electron') {
                window.setTitle(IconContribution.APPLICATION_NAME);
            }
        }
    }
}
