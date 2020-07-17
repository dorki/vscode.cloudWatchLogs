
import * as vscode from 'vscode';

export function getFocusedTextSection() {
    function isEditorDocumentLineEmpty(line: number) {
        return vscode.window.activeTextEditor!.document.lineAt(line).isEmptyOrWhitespace;
    }

    function findQueryStart(line: number) {
        while (line !== 0 && !isEditorDocumentLineEmpty(line)) {
            line--;
        }

        return line;
    }

    function findQueryEnd(line: number) {
        const editorEnd = vscode.window.activeTextEditor!.document.lineCount - 1;
        while (line !== editorEnd && !isEditorDocumentLineEmpty(line)) {
            line++;
        }

        return line;
    }

    if (!vscode.window.activeTextEditor!.selection.isEmpty) {
        return vscode.window.activeTextEditor!.document.getText(vscode.window.activeTextEditor?.selection)
    }

    let startLine = findQueryStart(vscode.window.activeTextEditor!.selection.start.line);
    let endLine = findQueryEnd(vscode.window.activeTextEditor!.selection.end.line);

    const queryRange =
        new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(
                endLine,
                vscode.window.activeTextEditor!.document.lineAt(endLine).range.end.character)
        );

    return vscode.window.activeTextEditor!.document.getText(queryRange).trim();
}