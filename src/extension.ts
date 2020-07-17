import * as vscode from 'vscode';
import * as AWS from 'aws-sdk';
import * as _ from 'lodash';
import { BuildQueryResultsHtml, BuildLogRecordHtml } from './htmlHelper';
import { Initialize as InitializeQueryFiles } from './queryFiles'
import { getFocusedTextSection } from './windowUtils';
import { parseQuery, Query } from './query';
import { getEnvCredentials } from './authenticator';

export function activate(context: vscode.ExtensionContext) {

	InitializeQueryFiles(context);

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

	async function executeQuery(query: Query, panel: vscode.WebviewPanel) {

		const creds = await getEnvCredentials(query.env);
		const logs = new AWS.CloudWatchLogs({ credentials: creds, region: query.region });

		let logGroups = query.logGroup.split(',');

		if (query.logGroup.includes('*')) {
			const describeLogGroupsResponse = await logs.describeLogGroups().promise();

			logGroups =
				_(logGroups).
					map(logGroup => new RegExp(`^${logGroup.replace(/\*/g, '.*')}$`, "i")).
					flatMap(
						logGroupRegex =>
							_.filter(
								describeLogGroupsResponse.logGroups,
								logGroup => logGroupRegex.test(logGroup.logGroupName ?? ""))).
					map(logGroup => logGroup.logGroupName!).
					uniq().
					value();
		}

		const endTimeMs = Date.now();
		const startTimeMS = endTimeMs - query.duration;
		const startQueryResponse =
			await logs.
				startQuery({
					startTime: startTimeMS / 1000,
					endTime: endTimeMs / 1000,
					queryString: query.cwQuery,
					logGroupNames: logGroups
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

				progress.report({ increment: 40 });

				panel.webview.html =
					BuildQueryResultsHtml(
						context.extensionPath,
						query.cwQuery,
						startTimeMS,
						endTimeMs,
						query.fields,
						logGroups,
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
				const query = parseQuery(getFocusedTextSection());
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