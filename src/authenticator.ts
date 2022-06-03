import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromIni, fromEnv } from "@aws-sdk/credential-providers";
import { Credentials } from "@aws-sdk/types";
import { execSync } from 'child_process';
import * as vscode from 'vscode';

let envToCredentials: { [id: string]: Credentials } = {};

export async function getEnvCredentials(env: string, region: string) {

    async function validateCredentials(credentials: Credentials) {
        try {
            await new STSClient({ credentials, region }).send(new GetCallerIdentityCommand({}))
            return true;
        }
        catch {
            return false;
        }
    }

    const withPrograssOptions = {
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: 'Authenticating...'
    };
    return await vscode.window.withProgress<Credentials>(
        withPrograssOptions,
        async () => {
            let credentials = envToCredentials[env];
            if (credentials != undefined && await validateCredentials(credentials)) {
                return credentials;
            }

            const authenticationCommand = vscode.workspace.getConfiguration('cloudwatchlogs').get("authenticationCommand") as string;
            if (authenticationCommand) {
                execSync(authenticationCommand.replace('{env}', env));
            }

            credentials = await fromIni({ profile: env })();
            if (await validateCredentials(credentials)) {
                envToCredentials[env] = credentials;
                return credentials;
            }

            credentials = await fromEnv()();
            if (await validateCredentials(credentials)) {
                envToCredentials[env] = credentials;
                return credentials;
            }

            throw "could not find credentials";
        });
}