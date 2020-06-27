import * as vscode from 'vscode';
import * as AWS from 'aws-sdk';
import parseDuration from 'parse-duration';
import { execSync } from 'child_process';
import { BuildQueryResultsHtml, BuildLogRecordHtml } from './htmlHelper';
import * as _ from 'lodash';

export function activate(context: vscode.ExtensionContext) {

	let envToCredentials: { [id: string]: AWS.Credentials } = {};

	async function getEnvCredentials(env: string) {

		function validateCredentials(credentials: AWS.Credentials) {
			try {
				new AWS.STS({ credentials }).getCallerIdentity();
				return true;
			}
			catch {
				return false;
			}
		}

		let credentials = envToCredentials[env];
		if (credentials != undefined && validateCredentials(credentials)) {
			return credentials;
		}

		const authenticationCommand = vscode.workspace.getConfiguration('cloudq').get("authenticationCommand") as string;
		if (!_.isEmpty(authenticationCommand)) {
			execSync(authenticationCommand.replace('{env}', env));
		}

		credentials = new AWS.SharedIniFileCredentials({ profile: env });
		if (validateCredentials(credentials)) {
			envToCredentials[env] = credentials;
			return credentials;
		}

		credentials = new AWS.EnvironmentCredentials("AWS");
		if (validateCredentials(credentials)) {
			envToCredentials[env] = credentials;
			return credentials;
		}

		throw "could not find credentials";
	}

	function getQueryText() {
		function isEditorDocumentLineEmpty(line: number) {
			return vscode.window.activeTextEditor!.document.lineAt(line).isEmptyOrWhitespace;
		}

		function findQueryStart(line: number) {
			while (line !== 0 && !isEditorDocumentLineEmpty(line)) {
				line--;
			}

			return line;
		}

		function findQueryEnd(line: number) {
			const editorEnd = vscode.window.activeTextEditor!.document.lineCount - 1;
			while (line !== editorEnd && !isEditorDocumentLineEmpty(line)) {
				line++;
			}

			return line;
		}

		if (!vscode.window.activeTextEditor!.selection.isEmpty) {
			return vscode.window.activeTextEditor!.document.getText(vscode.window.activeTextEditor?.selection)
		}

		let startLine = findQueryStart(vscode.window.activeTextEditor!.selection.start.line);
		let endLine = findQueryEnd(vscode.window.activeTextEditor!.selection.end.line);

		const queryRange =
			new vscode.Range(
				new vscode.Position(startLine, 0),
				new vscode.Position(
					endLine,
					vscode.window.activeTextEditor!.document.lineAt(endLine).range.end.character)
			);

		return vscode.window.activeTextEditor!.document.getText(queryRange).trim();
	}

	async function GoToLog(logPtr: string, env: string, region: string) {
		const credentials = await getEnvCredentials(env);
		const logs = new AWS.CloudWatchLogs({ credentials, region });

		const logRecordResponse = await logs.getLogRecord({ logRecordPointer: logPtr }).promise();
		const panel =
			vscode.window.createWebviewPanel(
				`Log${Date.now()}`,
				`Log`,
				vscode.ViewColumn.Active,
				{
					enableFindWidget: true,
					retainContextWhenHidden: true
				}
			);

		panel.webview.html = BuildLogRecordHtml(logRecordResponse.logRecord!);
	}

	type Query = {
		cwQuery: string,
		fields: string[],
		env: string,
		region: string,
		logGroup: string,
		duration: number
	}

	function parseQuery(query: string): Query {
		const [settings, ...queryLines] = query.trim().split("\n");
		const cwQuery = queryLines.join("\n");
		const fields = query.match(/fields (.+)/)![1].split(",").map(field => field.trim());
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

	async function executeQuery(query: Query, panel: vscode.WebviewPanel) {

		const creds = await getEnvCredentials(query.env);
		const logs = new AWS.CloudWatchLogs({ credentials: creds, region: query.region });

		const endTimeMs = Date.now();
		const startTimeMS = endTimeMs - query.duration;
		const startQueryResponse =
			await logs.
				startQuery({
					startTime: startTimeMS / 1000,
					endTime: endTimeMs / 1000,
					queryString: query.cwQuery,
					logGroupName: query.logGroup
				}).
				promise();

		let queryResultsResponse: AWS.CloudWatchLogs.GetQueryResultsResponse;

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: false,
			title: 'Loading...'
		}, async (progress) => {

			progress.report({ increment: 0 });

			do {
				queryResultsResponse =
					await logs.
						getQueryResults({ queryId: startQueryResponse.queryId! }).
						promise();

				progress.report({ increment: 40, message: queryResultsResponse.status });

				panel.webview.html =
					BuildQueryResultsHtml(
						context.extensionPath,
						query.cwQuery,
						startTimeMS,
						endTimeMs,
						query.fields,
						queryResultsResponse.results!);
			}
			while (queryResultsResponse.status !== "Complete");

			progress.report({ increment: 100 });
		});
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.runQuery',
			async () => {
				const query = parseQuery(getQueryText());
				const panel =
					vscode.window.createWebviewPanel(
						`Query${Date.now()}`,
						`Results ${query.env} ${query.logGroup}`,
						vscode.ViewColumn.Active,
						{
							enableFindWidget: true,
							enableScripts: true,
							retainContextWhenHidden: true
						}
					);

				panel.webview.html = "loading...";
				await executeQuery(query, panel);

				panel.webview.onDidReceiveMessage(
					async message => {
						console.log(message);
						vscode.window.showInformationMessage(message);
						switch (message.command) {
							case 'goToLog':
								await GoToLog(message.text, query.env, query.region);
								return;
							case 'refresh':
								await executeQuery(query, panel);
								return;
						}
					},
					undefined,
					context.subscriptions
				);
			}));
}