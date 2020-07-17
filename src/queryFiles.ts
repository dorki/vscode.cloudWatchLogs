import * as vscode from 'vscode';
import * as path from 'path';
import * as _ from 'lodash';
import { QueryFilesProvider } from './queryFilesProvider';
import * as fs from './fs'

async function getNewQueryFileName(queryFilesPath: string, existingName?: string): Promise<string | undefined> {

    const existingQueryFileNames =
        _.without(
            fs.getDirFileNames(queryFilesPath),
            existingName);

    const newQeuryFileName =
        await vscode.window.showInputBox({
            value: existingName,
            valueSelection: undefined,
            placeHolder: 'Choose query file name (without the file ext)',
            validateInput: text =>
                _.includes(existingQueryFileNames, text)
                    ? `Name ${text} is already in use`
                    : /^[0-9a-zA-Z_-]+$/.test(text)
                        ? null
                        : "Should be valid file name [0-9,a-z,A-Z,_,-]"
        });

    return newQeuryFileName;
}

export function Initialize(context: vscode.ExtensionContext) {

    const queryFilesPath = path.join(context.globalStoragePath, "queryFiles");
    const queryFilesProvider = new QueryFilesProvider(queryFilesPath);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(
            'query-files',
            queryFilesProvider));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.openQueryFile',
            async (item: vscode.TreeItem) => {
                const queryFileName = item.label;
                if (!queryFileName) {
                    return;
                }

                await vscode.window.showTextDocument(
                    await vscode.workspace.openTextDocument(path.join(queryFilesPath, queryFileName)),
                    vscode.ViewColumn.Active);
            }));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.openQueryFileNewColumn',
            async (item: vscode.TreeItem) => {
                const queryFileName = item.label;
                if (!queryFileName) {
                    return;
                }

                await vscode.window.showTextDocument(
                    await vscode.workspace.openTextDocument(path.join(queryFilesPath, queryFileName)),
                    vscode.ViewColumn.Beside);
            }));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.addQueryFile',
            async () => {
                const newQeuryFileName = await getNewQueryFileName(queryFilesPath);
                if (newQeuryFileName) {
                    fs.createFile(queryFilesPath, newQeuryFileName);
                    queryFilesProvider.refresh()
                }
            }));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.editQueryFile',
            async (item: vscode.TreeItem) => {

                const existingQueryFileName = item.label;
                if (!existingQueryFileName) {
                    return;
                }

                const newQeuryFileName = await getNewQueryFileName(queryFilesPath, existingQueryFileName);
                if (newQeuryFileName) {
                    fs.renameFile(queryFilesPath, existingQueryFileName, newQeuryFileName);
                    queryFilesProvider.refresh()
                }
            }));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.refreshQueryFiles',
            () => queryFilesProvider.refresh()));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.deleteQueryFile',
            async (item: vscode.TreeItem) => {
                const queryFileName = item.label;
                if (!queryFileName) {
                    return;
                }

                const result = await vscode.window.showQuickPick(['Delete', 'Cancel'], {
                    placeHolder: `Are you sure you want to delete ${queryFileName}`
                });

                if (result === 'Delete') {
                    fs.deleteFile(queryFilesPath, queryFileName);
                    queryFilesProvider.refresh()
                }
            }));
}