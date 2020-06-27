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
- `log-group-name`: the [log group][2] to query (support for multiple log groups and name wildcards will come soon)
- `duration`: the time range in duration human readable syntax, eg. 1h, 30m, 2d etc..

### usage
just make sure your curser is somewhere inside a query and press `ctrl`+`enter` or run vscode command `excecute CloudWatchlogs query`
![simpleQuery][simpleQuery]

you can also highlight any part of existing query (as long as it contains the first line of args as mentions before)
![selectedQuery][selectedQuery]

click the magnifying glass button to open the log record in new page.
this will also format json values
![openLogRecord][openLogRecord]

### aws authentication
CloudWatchLogs client will use the `env` parameter as the [aws shared credentials profile][1] to use.
when no profile exists by that name, CloudWatchLogs client will fallback to [AWS environment variables][4]

CloudWatchLogs client will store the credentials in memmory until they expire and only then will try to 
require new ones.

if you need to run some executable in order to prepare the share credentials profile, you can configure 
authentication command in the extension setting. The authentication command will be the first step each time
the client tries to regain the credentials.
![settings][settings]


[1]: https://docs.aws.amazon.com/ses/latest/DeveloperGuide/create-shared-credentials-file.html
[2]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html
[3]: https://docs.aws.amazon.com/general/latest/gr/cwl_region.html
[4]: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html#envvars-list

[simpleQuery]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/simpleQuery.gif?raw=true
[selectedQuery]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/selectedQuery.gif?raw=true 
[openLogRecord]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/openLogRecord.gif?raw=true 
[settings]: https://github.com/dorki/vscode.cloudWatchLogs/blob/master/media/settings.png?raw=true