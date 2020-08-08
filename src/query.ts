import parseDuration from 'parse-duration';
import * as _ from 'lodash';

const _defaultFields: Field[] = [{ name: "@timestamp" }, { name: "@message" }];

type Field = {
    name: string,
    alias?: string
}

export type Query = {
    query: string,
    env: string,
    region: string,
    logGroup: string,
    times: { start: number, end: number },
    raw: string,
    canceled?: boolean
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
    const [env, region, logGroup, ...durationStr] = settings.split(":");
    const times = parseTimes(durationStr.join(":"));

    return {
        query,
        env,
        region,
        logGroup,
        times,
        raw: text
    };
}