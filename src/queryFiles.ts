import * as vscode from 'vscode';
import * as path from 'path';
import * as _ from 'lodash';
import { QueryFile, QueryFilesProvider } from './queryFilesProvider';
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
            async (queryFile: QueryFile) => {
                await vscode.window.showTextDocument(
                    await vscode.workspace.openTextDocument(path.join(queryFile.fileFolderPath, queryFile.label)),
                    {
                        viewColumn: vscode.ViewColumn.Active,
                        preview: false
                    });
            }));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.openQueryFileNewColumn',
            async (queryFile: QueryFile) => {
                await vscode.window.showTextDocument(
                    await vscode.workspace.openTextDocument(path.join(queryFile.fileFolderPath, queryFile.label)),
                    {
                        viewColumn: vscode.ViewColumn.Beside,
                        preview: false
                    });
            }));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.addQueryFile',
            async () => {

                const queryFilesFoldersSettings = vscode.workspace.getConfiguration('cloudwatchlogs').get("queryFilesFolders") as string;
                const queryFilesFolderPaths = queryFilesFoldersSettings ? queryFilesFoldersSettings.split(";") : [];
                const folderNameToPath =
                    _(queryFilesFolderPaths).
                        map(queryFilesFolderPath => queryFilesFolderPath.trim()).
                        keyBy(queryFilesFolderPath => path.basename(queryFilesFolderPath)).
                        value();

                let selectedFolderPath: string | undefined = queryFilesPath;
                if (!_.isEmpty(folderNameToPath)) {
                    folderNameToPath["default"] = queryFilesPath;
                    const folderName =
                        await vscode.window.showQuickPick(_.keys(folderNameToPath), {
                            placeHolder: 'select folder'
                        });
                    selectedFolderPath = folderName && folderNameToPath[folderName];
                }

                if (!selectedFolderPath) {
                    return;
                }

                const newQeuryFileName = await getNewQueryFileName(selectedFolderPath);
                if (newQeuryFileName) {
                    fs.createFile(selectedFolderPath, newQeuryFileName);
                    queryFilesProvider.refresh()
                }
            }));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.editQueryFile',
            async (queryFile: QueryFile) => {
                const newQeuryFileName = await getNewQueryFileName(queryFile.fileFolderPath, queryFile.label);
                if (newQeuryFileName) {
                    fs.renameFile(queryFile.fileFolderPath, queryFile.label, newQeuryFileName);
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
            async (queryFile: QueryFile) => {
                const result = await vscode.window.showQuickPick(['Delete', 'Cancel'], {
                    placeHolder: `Are you sure you want to delete ${queryFile.label}`
                });

                if (result === 'Delete') {
                    fs.deleteFile(queryFile.fileFolderPath, queryFile.label);
                    queryFilesProvider.refresh()
                }
            }));
}