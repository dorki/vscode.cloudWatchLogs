import { execSync } from 'child_process';
import * as vscode from 'vscode';
import * as AWS from 'aws-sdk';

let envToCredentials: { [id: string]: AWS.Credentials } = {};

export async function getEnvCredentials(env: string) {

    async function validateCredentials(credentials: AWS.Credentials) {
        try {
            await new AWS.STS({ credentials }).getCallerIdentity().promise();
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
    return await vscode.window.withProgress<AWS.Credentials>(
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

            credentials = new AWS.SharedIniFileCredentials({ profile: env });
            if (await validateCredentials(credentials)) {
                envToCredentials[env] = credentials;
                return credentials;
            }

            credentials = new AWS.EnvironmentCredentials("AWS");
            if (await validateCredentials(credentials)) {
                envToCredentials[env] = credentials;
                return credentials;
            }

            throw "could not find credentials";
        });
}