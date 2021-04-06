import parseDuration from 'parse-duration';
import * as _ from 'lodash';

export type Query = {
    query: string,
    env: string,
    region: string,
    logGroup: string,
    times: { start: number, end: number },
    maxResults: number,
    raw: string,
    canceled?: boolean
    queryResults?: AWS.CloudWatchLogs.QueryResults
    queryResultsFieldNames?: string[]
}

function parseTimes(durationStr: string) {
    const now = Date.now();
    const [start, end] = durationStr.trim().split("->");
    return {
        start: Date.parse(start) || now - parseDuration(start)!,
        end: Date.parse(end) || now - parseDuration(end)!
    };
}


export function parseQuery(text: string): Query {
    const [settings, ...queryLines] =
        _.filter(
            text.trim().split("\n"),
            line => !line.startsWith("#"));
    const query = queryLines.join("\n");

    if (settings.includes(";")) {
        const [env, region, logGroup, durations, maxResults] = settings.split(";");
        return {
            query,
            env,
            region,
            logGroup,
            times: parseTimes(durations),
            maxResults: parseInt(maxResults),
            raw: text
        };
    }

    const [env, region, logGroup, ...durationStr] = settings.split(":");
    const times = parseTimes(durationStr.join(":"));

    return {
        query,
        env,
        region,
        logGroup,
        times,
        maxResults: NaN,
        raw: text
    };
}