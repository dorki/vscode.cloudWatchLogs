import parseDuration from 'parse-duration';
import * as _ from 'lodash';

export type Query = {
    query: string,
    fields: string[],
    env: string,
    region: string,
    logGroup: string,
    duration: number,
    raw: string
}

export function parseQuery(text: string): Query {
    const [settings, ...queryLines] =
        _.filter(
            text.trim().split("\n"),
            line => !line.startsWith("#"));
    const query = queryLines.join("\n");
    const fields = text.match(/fields (.+)/)![1].split(",").map(field => field.trim());
    const [env, region, logGroup, durationStr] = settings.split(":");
    const duration = parseDuration(durationStr)!;

    return {
        query,
        fields,
        env,
        region,
        logGroup,
        duration,
        raw: text
    };
}