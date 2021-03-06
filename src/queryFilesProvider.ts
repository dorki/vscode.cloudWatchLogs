import * as vscode from 'vscode';
import * as fs from './fs';
import * as path from 'path';
import * as _ from 'lodash'

export class QueryFilesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(private queryFilesPath: string) { }

    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            const folderPath = (element as QueryFolder).folderPath;
            const fileNames = fs.getDirFileNames(folderPath);
            return Promise.resolve(
                _.map(
                    fileNames,
                    fileName =>
                        new QueryFile(
                            fileName,
                            folderPath)));
        } else {
            const queryFilesFoldersSettings = vscode.workspace.getConfiguration('cloudwatchlogs').get("queryFilesFolders") as string;
            const queryFilesFolderPaths = queryFilesFoldersSettings ? queryFilesFoldersSettings.split(";") : [];
            return Promise.resolve(
                _(queryFilesFolderPaths).
                    map(queryFilesFolderPath => queryFilesFolderPath.trim()).
                    map(
                        queryFilesFolderPath =>
                            new QueryFolder(
                                path.basename(queryFilesFolderPath),
                                queryFilesFolderPath)).
                    orderBy(queryFolder => queryFolder.label).
                    unshift(
                        new QueryFolder(
                            "default",
                            this.queryFilesPath)).
                    value());
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

class QueryFolder extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly folderPath: string) {
        super(
            label,
            vscode.TreeItemCollapsibleState.Expanded);
    }

    contextValue = "QueryFolder";
}

export class QueryFile extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fileFolderPath: string) {
        super(label);
    }

    contextValue = "QueryFile";
    tooltip = `query file: ${this.label}`;
    description = "query file";
    command = {
        command: "extension.openQueryFile",
        title: "Open the file",
        arguments: [this]
    };
    iconPath = {
        light: path.join(__filename, '..', '..', 'media', 'light', 'document.svg'),
        dark: path.join(__filename, '..', '..', 'media', 'dark', 'document.svg')
    };
}