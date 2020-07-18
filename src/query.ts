import parseDuration from 'parse-duration';
import * as _ from 'lodash';

const _defaultFields: Field[] = [{ name: "@timestamp" }, { name: "@message" }];

type Field = {
    name: string,
    alias?: string
}

export type Query = {
    query: string,
    fieldNames: string[],
    fieldAliasToName: Map<string, string>,
    env: string,
    region: string,
    logGroup: string,
    duration: number,
    raw: string,
    canceled?: boolean
}

function parseField(raw: string): Field {
    const split = raw.split(" as ");
    return {
        name: split[0].trim(),
        alias: split[1]?.trim()
    };
}

function parseFields(text: string): [string[], Map<string, string>] {
    const fields =
        text.
            match(/fields (?<fields>[^\|]*[^\s\|])/)?.
            groups?.["fields"].
            split(",").
            map(parseField)

    const displayFields =
        [...(text.matchAll(/display (?<fields>[^\|]*[^\s\|])/g))].
            pop()?.
            groups?.["fields"].
            split(",").
            map(parseField)

    const fieldNames = (displayFields ?? fields ?? _defaultFields).map(_ => _.alias ?? _.name);

    const fieldAliasToName =
        new Map(
            _.concat(fields, displayFields).
                filter(field => field?.alias).
                map(field => [field!.alias!, field!.name]));

    return [fieldNames, fieldAliasToName];
}

export function parseQuery(text: string): Query {
    const [settings, ...queryLines] =
        _.filter(
            text.trim().split("\n"),
            line => !line.startsWith("#"));
    const query = queryLines.join("\n");
    const [fieldNames, fieldAliasToName] = parseFields(text);
    const [env, region, logGroup, durationStr] = settings.split(":");
    const duration = parseDuration(durationStr)!;

    return {
        query,
        fieldNames,
        fieldAliasToName,
        env,
        region,
        logGroup,
        duration,
        raw: text
    };
}