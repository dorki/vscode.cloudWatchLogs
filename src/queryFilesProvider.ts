import * as vscode from 'vscode';
import * as fs from './fs';
import * as path from 'path';
import * as _ from 'lodash'

export class QueryFilesProvider implements vscode.TreeDataProvider<QueryFile> {
    constructor(private queryFilesPath: string) { }

    private _onDidChangeTreeData = new vscode.EventEmitter<QueryFile | undefined>();
    readonly onDidChangeTreeData: vscode.Event<QueryFile | undefined> = this._onDidChangeTreeData.event;

    getTreeItem(element: QueryFile): vscode.TreeItem {
        return element;
    }

    getChildren(element?: QueryFile): Thenable<QueryFile[]> {
        if (element) {
            return Promise.resolve([]);
        } else {

            const existingQueryFileNames = fs.getDirFileNames(this.queryFilesPath);
            return Promise.resolve(
                _.map(
                    existingQueryFileNames,
                    existingQueryFileName => new QueryFile(existingQueryFileName)));
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

class QueryFile extends vscode.TreeItem {
    constructor(public readonly label: string) {
        super(label);
    }

    get tooltip(): string {
        return `query file: ${this.label}`;
    }

    get description(): string {
        return "query file";
    }

    get command(): vscode.Command {
        return {
            command: "extension.openQueryFile",
            title: "Open the file",
            arguments: [this]
        };
    }

    iconPath = {
        light: path.join(__filename, '..', '..', 'media', 'light', 'document.svg'),
        dark: path.join(__filename, '..', '..', 'media', 'dark', 'document.svg')
    };
}