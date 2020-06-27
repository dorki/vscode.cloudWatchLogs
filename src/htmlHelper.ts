import * as AWS from 'aws-sdk';
import * as vscode from 'vscode';
import * as path from 'path';
import * as _ from 'lodash';

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
                <h1>Log record</h1>
                <br>
                <table>
                ${getRecordRowsHtml()}
                </table>
            </body>
        </html>
        `);
}

export function BuildQueryResultsHtml(
    extensionPath: string,
    query: string,
    startTimeMs: number,
    endTimeMs: number,
    fields: string[],
    logGroups: string[],
    queryResults: AWS.CloudWatchLogs.QueryResults) {

    const specialColFields = {
        "MessageTemplate": "longCol",
        "@timestamp": "medCol",
        "@message": "longCol"
    };

    function getTh(value: string): string {
        return `<th>${value}<span class="resize-handle"></span></th>`;
    }

    function getTd(value: string | undefined): string {
        return `<td>${value?.trim() ?? ""}</td>`;
    }

    function buildQueryResultHtml(queryResult: AWS.CloudWatchLogs.ResultRows): string {
        const fieldNameToValueMap =
            new Map(
                queryResult.map(
                    queryResultField => [
                        queryResultField.field,
                        queryResultField.value]));
        return (
            `<tr>
                <td><button onclick="goToLog('${fieldNameToValueMap.get("@ptr")}')" />🔍</td>
                ${fields.map(field => getTd(fieldNameToValueMap.get(field)))}
            </tr>`);
    }

    function pathPartsToUri(...pathParts: string[]) {
        return vscode.Uri.file(path.join(extensionPath, ...pathParts)).with({ scheme: 'vscode-resource' });
    }

    function getShortColIndexes() {
        return _(fields).
            map((field, index) => _.has(specialColFields, field) ? undefined : index + 1).
            filter().
            value();
    }

    function getSpecialColIndexes(specialField: string) {
        return _(fields).
            map((field, index) => _.get(specialColFields, field) === specialField ? index + 1 : undefined).
            filter().
            value();
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
                <h1><button class='refreshButton' onclick="refresh()">Refresh</button> Query results (${queryResults.length} results)</h1>
                <h4>Time range: ${formatTime(startTimeMs)} - ${formatTime(endTimeMs)} (local)</h4>
                <h4>Log groups: ${logGroups.join(", ")}</h4>
                <pre>${query}</pre>
                <div class="tableContainer">
                    <div class='toggler'>
                        Toggle columns:
                        ${fields.map((field, index) => `<a class="toggle-vis" data-column="${index + 1}">${field}</a>`).join(" - ")}
                    </div>
                    <table id="resultsTable" class="display compact" style="width:100%">
                        <thead>
                            <tr>
                                <th></th>
                                ${fields.map(getTh).join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${queryResults.map(buildQueryResultHtml).join("")}
                        </tbody>
                    </table>
                </div>
                <script>
                    let {goToLog, refresh} =
                        function () {
                            const vscode = acquireVsCodeApi();
                            return {
                                goToLog: recordPtr => vscode.postMessage({ command: 'goToLog', text: recordPtr }),
                                refresh: () => vscode.postMessage({ command: 'refresh' })
                            };
                        }()
                </script>
                <script>
                    $(document).ready(function () {
                        var table = $('#resultsTable').DataTable(
                            {
                                lengthMenu: [100, 500, 1000],
                                ordering: true,
                                order: [],
                                paging: false,
                                scrollY: '60vh',
                                scrollCollapse: true,
                                orderClasses: false,
                                columnDefs: [
                                    { targets: [0], className: "btnCol" },
                                    { targets: [${getShortColIndexes().join(",")}], className: "shortCol" },
                                    { targets: [${getSpecialColIndexes("medCol").join(",")}], className: "medCol" },
                                    { targets: [${getSpecialColIndexes("longCol").join(",")}], className: "longCol" }
                                ],
                                createdRow: function (row) {
                                    $(row).find("td, th").each(function(){
                                        $(this).attr("title", this.innerText);
                                     });
                                }
                            });

                        $('a.toggle-vis').on( 'click', function (e) {
                            e.preventDefault();
                            var column = table.column( $(this).attr('data-column') );
                            column.visible( ! column.visible() );
                            $(this).css('text-decoration', column.visible() ? 'none' : 'underline')
                        } );
                    });
                </script>
                <script>
                    $('.tableContainer')[0].childNodes.forEach(
                        childNode => {
                            if(childNode.textContent.includes(',,')){
                                childNode.remove();
                            }
                        }
                    );
                </script>
            </body>
        </html>
        `);
}