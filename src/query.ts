import * as _ from 'lodash';
import parseDuration from 'parse-duration';

export type Query = {
    query: string,
    env: string,
    title?: string,
    regions: string[],
    logGroup: string,
    times: { start: number, end: number },
    maxResults: number,
    raw: string,
    canceled?: boolean
    queryResultsFieldNames?: string[]
}

function parseRegions(regions: string) {
    return _(regions).
        split(",").
        map(region => region.trim()).
        uniq().
        value();
}

function parseTimes(durationStr: string) {
    const now = Date.now();
    const [start, end] = durationStr.trim().split("->");
    return {
        start: Date.parse(start) || now - parseDuration(start)!,
        end: Date.parse(end) || now - parseDuration(end)!
    };
}

export function parseQuery(text: string, existing?: Query): Query {
    const lines = text.trim().split("\n");
    const title =
        _(lines).
            find(line => line.startsWith("#@") || line.startsWith("#!"))?.
            slice(2).
            trim();
    const [settings, ...queryLines] =
        _.filter(
            lines,
            line => !line.startsWith("#"));
    const query = queryLines.join("\n");

    if (settings.includes(";")) {
        const [env, regions, logGroup, durations, maxResults] = settings.split(";");
        return {
            query,
            env,
            regions: parseRegions(regions),
            logGroup,
            times: parseTimes(durations),
            maxResults: parseInt(maxResults),
            raw: text,
            title: existing?.title ?? title
        };
    }

    const [env, regions, logGroup, ...durationStr] = settings.split(":");
    return {
        query,
        env,
        regions: parseRegions(regions),
        logGroup,
        times: parseTimes(durationStr.join(":")),
        maxResults: NaN,
        raw: text,
        title: existing?.title ?? title
    };
}