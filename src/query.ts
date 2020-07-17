import parseDuration from 'parse-duration';

export type Query = {
    cwQuery: string,
    fields: string[],
    env: string,
    region: string,
    logGroup: string,
    duration: number
}

export function parseQuery(text: string): Query {
    const [settings, ...queryLines] = text.trim().split("\n");
    const cwQuery = queryLines.join("\n");
    const fields = text.match(/fields (.+)/)![1].split(",").map(field => field.trim());
    const [env, region, logGroup, durationStr] = settings.split(":");
    const duration = parseDuration(durationStr)!;

    return {
        cwQuery,
        fields,
        env,
        region,
        logGroup,
        duration
    };
}