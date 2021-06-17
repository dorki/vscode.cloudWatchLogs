const fieldTypeToMatchFunction = {
    "shortCol": (field) => !field.includes("time") && !field.includes("message") && !field.includes("msg"),
    "medCol": (field) => field.includes("time"),
    "longCol": (field) => field.includes("message") || field.includes("msg")
};

function getColTypeIndexes(fieldNames, specialField) {
    return fieldNames.
        map(field => field.toLowerCase()).
        map((field, index) => fieldTypeToMatchFunction[specialField](field) ? index + 1 : undefined).
        filter(value => value != undefined);
}

function handleFields(fieldNames) {

    $('.tableContainer').
        empty().
        append(tableContainerInnerHtml);

    $("#toggles").
        append(fieldNames.map((fieldName, index) => `<a class="toggle-vis" data-column="${index + 1}">${fieldName}</a>`).join(" - "))

    $("#resultsTableHead").
        append("<th></th>").
        append(fieldNames.map(fieldName => `<th>${fieldName}</th>`).join());

    const table =
        $('#resultsTable').DataTable(
            {
                lengthMenu: [100, 500, 1000],
                ordering: true,
                order: [],
                paging: false,
                scrollY: '60vh',
                scrollCollapse: true,
                orderClasses: false,
                colReorder: true,

                columnDefs: [
                    { targets: [0], className: "btnCol", orderable: false },
                    { targets: getColTypeIndexes(fieldNames, "shortCol"), className: "shortCol" },
                    { targets: getColTypeIndexes(fieldNames, "medCol"), className: "medCol" },
                    { targets: getColTypeIndexes(fieldNames, "longCol"), className: "longCol" }
                ],
                createdRow: function (row) {
                    $(row).find("td, th").each(function () {
                        $(this).attr("title", this.innerText);
                    });
                }
            });

    $('a.toggle-vis').on('click', function (e) {
        e.preventDefault();
        var column = table.column($(this).attr('data-column'));
        column.visible(!column.visible());
        $(this).css('text-decoration', column.visible() ? 'underline' : 'none')
    });
}

function handleResults(fieldNames, queryResults) {

    $('#resultsCount').text(queryResults.length);

    const table = $('#resultsTable').DataTable().clear();

    for (queryResult of queryResults) {
        const fieldNameToValueMap =
            new Map(
                queryResult.map(
                    queryResultField => [
                        queryResultField.field,
                        queryResultField.value]));

        table.row.add([
            `<button onclick="goToLog(\'${fieldNameToValueMap.get("@ptr")}\')">🔍</button>`,
            ...fieldNames.map(fieldName => fieldNameToValueMap.get(fieldName))
        ]);
    }

    table.draw();
}

$(document).ready(function () {
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'results':

                if (message.fieldRefresh) {
                    handleFields(message.fieldNames);
                }

                handleResults(
                    message.fieldNames,
                    message.results);

                break;
        }
    });
});

// consts function for page events
const vscode = acquireVsCodeApi();
const goToLog = recordPtr => vscode.postMessage({ command: 'goToLog', text: recordPtr });
const refresh = () => vscode.postMessage({ command: 'refresh', query: $("#rawQuery")[0].textContent });
const refreshOnCtrlEnter = () => {
    if (event.key === 'Enter' && event.ctrlKey) {
        refresh()
    }
}
const formatPastedText = () => {
    event.preventDefault()
    const text = event.clipboardData.getData("text/plain");
    document.execCommand('insertText', false, text)
}
const duplicate = () => {
    vscode.postMessage({
        command: 'duplicate'
    });
}
const changeTitle = () => {
    vscode.postMessage({
        command: 'changeTitle'
    });
}
const openRaw = () => {

    const table = $('#resultsTable').DataTable();
    const visibleColumns = table.columns().visible();

    visibleColumns[0] = false; // button

    const fieldNames =
        table.
            columns().
            header().
            filter((_, index) => visibleColumns[index]).
            map(header => header.innerText).
            toArray();

    const rows =
        table.
            rows({ search: "applied" }).
            data().
            map(row => row.filter((_, index) => visibleColumns[index])).
            toArray();

    vscode.postMessage({
        command: 'openRaw',
        fieldNames,
        rows
    });
}