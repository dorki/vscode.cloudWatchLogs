import * as AWS from 'aws-sdk';
import * as vscode from 'vscode';
import * as path from 'path';
import * as _ from 'lodash';
import { Query } from './query';

function formatTime(timeMs: string | number) {
    return new Date(Number(timeMs)).toLocaleString(undefined, { hour12: false });
}

export function BuildLogRecordHtml(logRecord: AWS.CloudWatchLogs.LogRecord) {

    const timeFields = ["@ingestionTime", "@timestamp"];

    function getRecordRowsHtml() {
        function stringify(fieldName: string, value: string) {
            try {
                return _.includes(timeFields, fieldName)
                    ? `${formatTime(value)} (local)`
                    : JSON.stringify(JSON.parse(value), null, 4);
            }
            catch {
                return value;
            }
        }

        function getRow(fieldName: string, value: string): string {
            return (`
                <tr>
                    <td>${fieldName}</td>
                    <td><pre>${stringify(fieldName, value)}</pre></td>
                </tr>
            `);
        }

        return _(logRecord).
            keys().
            sortBy(key => key.toLowerCase()).
            map(key => getRow(key, logRecord[key])).
            join("");
    }

    return (`
        <!DOCTYPE html>
        <html>
            <head>
                <style>
                    table {
                        border-collapse: collapse;
                        border-spacing: 0px;
                    }
                    th, td {
                        border: 1px solid dimgrey;
                        padding: 5px;
                    }
                    pre {
                        font-family: arial;
                        margin: 0px;
                        line-height: 1.1rem;
                    }
                </style>
            </head>
            <body>
                <div style='padding:18px 0px'>
                    <h1 style='display:inline'>Log record</h1> <br>
                    <a href onClick='copy()'>copy to clipboard</a> - <a href onClick='openRaw()'>open raw json</a>
                </div>
                <table>
                ${getRecordRowsHtml()}
                </table>
            </body>
            <script>
                let {copy, openRaw} =
                    function () {
                        const vscode = acquireVsCodeApi();
                        return {
                            copy: () => vscode.postMessage({ command: 'copy' }),
                            openRaw: () => vscode.postMessage({ command: 'openRaw' })
                        };
                    }()
            </script>
        </html>
        `);
}

export function BuildQueryResultsHtml(
    extensionPath: string,
    query: Query,
    logGroups: string[],
    queryResults: AWS.CloudWatchLogs.QueryResults) {

    function pathPartsToUri(...pathParts: string[]) {
        return vscode.Uri.file(path.join(extensionPath, ...pathParts)).with({ scheme: 'vscode-resource' });
    }

    return (`
        <!DOCTYPE html>
        <html>
            <head>
                <link rel="stylesheet" href="${pathPartsToUri('src', 'tableStyle.css')}">
                <link rel="stylesheet" href="${pathPartsToUri('node_modules', 'datatables.net-dt', 'css', 'jquery.dataTables.min.css')}">
                <script type="text/javascript" charset="utf8" src="${pathPartsToUri('node_modules', 'jquery', 'dist', 'jquery.min.js')}"></script>
                <script type="text/javascript" charset="utf8" src="${pathPartsToUri('node_modules', 'datatables.net', 'js', 'jquery.dataTables.min.js')}"></script>
            </head>
            <body>
                <div style='padding:18px 0px'>
                    <h1 style='display:inline'><button class='refreshButton' onclick="refresh()">Refresh</button> Query results (<div style='display:inline' id='resultsCount'>0</div> results)</h1>
                    <a href onClick='openRaw()'>open raw json</a>
                </div>
                <h4>Time range: ${formatTime(query.times.start)} - ${formatTime(query.times.end)} (local)</h4>
                <h4>Log groups: ${logGroups.join(", ")}</h4>
                <pre id='rawQuery' contenteditable onkeyup="refreshOnCtrlEnter()">${query.raw}</pre>
                <div class="tableContainer">
                    <div class='toggler'>
                        Toggle columns: <div style='display:inline' id='toggles' />
                    </div>
                    <table id='resultsTable' class='display compact' style='width:100%'>
                        <thead>
                            <tr id="resultsTableHead"></tr>
                        </thead>
                        <tbody>
                        </tbody>
                    </table>
                </div>
                <script type="text/javascript" charset="utf8" src="${pathPartsToUri('src', 'script.js')}"></script>
            </body>
        </html>
        `);
}