### version 0.4.3
- new command: GetHistory. Opens new tab with recent query history

### version 0.4.2
- paste plain text only in the query editor (in results view)
- add "duplicate" button to results view
- fix - "limit" keyword didnt work
- fix - rendering results

### version 0.4.1
- refresh results tab title while query is running
- fix - query cancellation

### version 0.4.0
- change the way results are sent to display, improving performance and responsiveness
- improve "open raw" in results, supporting table filter, columns visibilty and ordering
- support setting the max results, it can now be set to more then 1000 (see in the README)

### version 0.3.6
- update datatables package (security patch)
- remove "empty" folder in query files
- avoid excessive querying while waiting for query results from cloudwatch
- fix - refresh bug in "open raw" in results page

### version 0.3.5
- add table export to the results window

### version 0.3.4
- fix - query time range parsing

### version 0.3.3
- support time range
- extract results table column names from results and not from query
- refresh results view by pressing Ctrl+Enter in the raw query edit box

### version 0.3.2
- support custom query files locations (can be added in extension's setting)
- fix - results view - button's column should not be sortable
- fix - query files should not open in perview mode

### version 0.3.1
- show authentication progress
- support for field aliases (`as`) both in `fields` and in `display` commands
- added action buttons to log record view (`copy to clipboard` and `show raw json`)
- fix - results view opens too soon (in case of an error it used to be left blank)
- fix - supports for neglecting the "fields" command
- fix - closing results view while query in progress throw excpetion

### version 0.3.0
- added new ConatinerView for storing query files
- allow editing the query in the results view
- added context menu to the editor so right click can also fire the query
- fix authentication logic

### version 0.2.0
- support multiple logGroups 
- support logGroup name wildcard ('*')
- fixed datetime locale issues

### version 0.1.0
- first release :)