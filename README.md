## CloudWatchLogs client
### Description
Allows running cloudwatch insight queries from within vscode.
Removes the hussle of switching accounts when queries differante environments logs.

### syntax
each query should looks like the following:
```
env:region:log-group-name:duration
fields @timestamp, Level, MessageTemplate
| sort @timestamp desc
| limit 10
```

- `env`: name of environment to query, should usually correspond with [aws shared credentials profile][1] that will be used to run the query
- `region`: the [region][3] to run query in, eg. 'us-east-1' (without the quotes)
- `log-group-name`: the [log group][2] to query, you can specify multiple names with "," as seperator or using wildcards ("*")
- `duration`: the time range in duration human readable syntax, eg. 1h, 30m, 2d etc.. Its also support explicit time range with "->". For example, 2020-09-03T01:40+00:00->2020-09-03T01:50+00:00 (omit the +00 to use local time)

### usage
just make sure your curser is somewhere inside a query and press `ctrl`+`enter` or run vscode command `Execute CloudWatchlogs query`
![simpleQuery][simpleQuery]

you can also highlight any part of existing query (as long as it contains the first line of args as mentions before)
![selectedQuery][selectedQuery]

click the magnifying glass button to open the log record in new page.  
this will also format json values
![openLogRecord][openLogRecord]

seperate vscode container view allows you to save query files for easy access.  
right click query file to open in new column
![contianerView][contianerView]

results view allows you to edit the query before refreshing the results
![editQuery][editQuery]

### aws authentication
CloudWatchLogs client will use the `env` parameter as the [aws shared credentials profile][1] to use.  
when no profile exists by that name, CloudWatchLogs client will fallback to [AWS environment variables][4]  

CloudWatchLogs client will store the credentials in memmory until they expire and only then will try to  
require new ones.

required permission for the active credentials are:
- logs:DescribeLogGroups
- logs:StartQuery
- logs:GetQueryResults

if you need to run some executable in order to prepare the share credentials profile, you can configure 
authentication command in the extension setting. The authentication command will be the first step each time
the client tries to regain the credentials.
![settings][settings]


[1]: https://docs.aws.amazon.com/ses/latest/DeveloperGuide/create-shared-credentials-file.html
[2]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html
[3]: https://docs.aws.amazon.com/general/latest/gr/cwl_region.html
[4]: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html#envvars-list

[simpleQuery]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/gifs/simpleQuery.gif?raw=true
[selectedQuery]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/gifs/selectedQuery.gif?raw=true 
[openLogRecord]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/gifs/openLogRecord.gif?raw=true 
[settings]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/gifs/settings.png?raw=true
[contianerView]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/gifs/contianerView.gif?raw=true
[editQuery]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/gifs/editQuery.gif?raw=true