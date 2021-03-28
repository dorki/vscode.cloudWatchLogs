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

    console.log(fieldNames);

    $("#toggles").
        empty().
        append(fieldNames.map((fieldName, index) => `<a class="toggle-vis" data-column="${index + 1}">${fieldName}</a>`).join(" - "))

    $("#resultsTableHead").
        empty().
        append("<th></th>").
        append(fieldNames.map(fieldName => `<th>${fieldName}</th>`).join());

    $('#resultsTable').DataTable().clear().destroy();

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
        $(this).css('text-decoration', column.visible() ? 'none' : 'underline')
    });
}

function handleResults(fieldNames, queryResults) {

    $('#resultsCount').text(queryResults.length);

    const table = $('#resultsTable').DataTable();

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
        debugger;
        const message = event.data;
        switch (message.command) {
            case 'results':
                console.log(message);

                if (message.fieldRefresh) {
                    console.log("refresh");
                    handleFields(message.fieldNames);
                }

                handleResults(
                    message.fieldNames,
                    message.results);

                break;
        }
    });
});