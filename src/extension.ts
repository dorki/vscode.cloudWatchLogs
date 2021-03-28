import * as vscode from 'vscode';
import * as AWS from 'aws-sdk';
import * as _ from 'lodash';
import { BuildQueryResultsHtml, BuildLogRecordHtml } from './htmlHelper';
import { Initialize as InitializeQueryFiles } from './queryFiles'
import { getFocusedTextSection } from './windowUtils';
import { parseQuery, Query } from './query';
import { getEnvCredentials } from './authenticator';
import * as clipboardy from 'clipboardy';
import * as asTable from 'as-table';
import { off } from 'process';

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
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);

		panel.webview.onDidReceiveMessage(
			async message => {
				const logJson =
					JSON.stringify(
						logRecordResponse.logRecord!,
						null,
						4);
				switch (message.command) {
					case 'copy':
						clipboardy.writeSync(logJson);
						vscode.window.showInformationMessage("log copied to clipboard");
						return;
					case 'openRaw':
						await vscode.window.showTextDocument(
							await vscode.workspace.openTextDocument({
								content: logJson,
								language: "json"
							}),
							vscode.ViewColumn.Active);
						return;
				}
			},
			undefined,
			context.subscriptions
		);

		panel.webview.html = BuildLogRecordHtml(logRecordResponse.logRecord!);
	}

	function formatResultsRawTable(fieldNames: string[], rows: string[][]): string {
		const table = [];

		for (const row of rows) {

			const txtTableRow: { [id: string]: string } = {};

			for (const [fieldName, value] of _.zip(fieldNames, row)) {
				if (value != undefined) {
					txtTableRow[fieldName!] = value;
				}
			}

			table.push(txtTableRow);
		}

		return asTable.configure({ delimiter: " | " })(table);
	}

	function createQueryWebViewPanel(query: Query): vscode.WebviewPanel {
		const panel =
			vscode.window.createWebviewPanel(
				`Query${Date.now()}`,
				`Results ${query.env} ${query.logGroup}`,
				{
					viewColumn: vscode.ViewColumn.Active,
					preserveFocus: true
				},
				{
					enableFindWidget: true,
					enableScripts: true,
					retainContextWhenHidden: true
				},
			);

		panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'goToLog':
						await GoToLog(message.text, query.env, query.region);
						return;
					case 'openRaw':
						await vscode.window.showTextDocument(
							await vscode.workspace.openTextDocument({
								content: formatResultsRawTable(message.fieldNames, message.rows),
								language: "json"
							}),
							vscode.ViewColumn.Active);
					case 'refresh':
						query = parseQuery(message.query)
						await executeQuery(query, panel);
						return;
				}
			},
			undefined,
			context.subscriptions
		);

		panel.onDidDispose(
			() => query.canceled = true,
			null,
			context.subscriptions
		);

		return panel;
	}

	function unorderedEquals(values: string[], otherValues: string[]) {
		if (values.length !== otherValues.length) return false;
		if (_.difference(values, otherValues).length !== 0) return false;
		if (_.difference(otherValues, values).length !== 0) return false;
		return true;
	}

	async function executeQuery(query: Query, panel?: vscode.WebviewPanel) {
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

		let startQueryResponse: AWS.CloudWatchLogs.StartQueryResponse;
		try {
			startQueryResponse =
				await logs.
					startQuery({
						startTime: query.times.start / 1000,
						endTime: query.times.end / 1000,
						queryString: query.query,
						logGroupNames: logGroups,
						limit: query.maxResults
					}).
					promise();
		}
		catch (error) {
			vscode.window.showErrorMessage(`${error.name}, error: ${error.message}`)
			return;
		}

		let queryResultsResponse: AWS.CloudWatchLogs.GetQueryResultsResponse;

		const currentPanel = panel ?? createQueryWebViewPanel(query);

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: 'Loading...'
		}, async (progress) => {

			progress.report({ increment: 0 });

			do {
				queryResultsResponse =
					await logs.
						getQueryResults({ queryId: startQueryResponse.queryId! }).
						promise();

				console.log(queryResultsResponse);

				if (query.canceled) {
					return;
				}

				progress.report({ increment: 40 });

				// dont refresh if there are no new results
				if (query.queryResults == undefined ||
					query.queryResults.length !== queryResultsResponse.results?.length) {

					if (query.queryResults == undefined) {
						currentPanel.webview.html =
							BuildQueryResultsHtml(
								context.extensionPath,
								query,
								logGroups,
								queryResultsResponse.results!);

						await new Promise(resolve => setTimeout(resolve, 100));
					}

					query.queryResults = queryResultsResponse.results;

					const fields =
						_(queryResultsResponse.results).
							flatMap(queryResult => queryResult.map(_ => _.field!)).
							uniq().
							without("@ptr").
							value();

					if (fields.length > 0) {
						currentPanel.webview.postMessage({
							command: 'results',
							fieldNames: fields,
							fieldRefresh: !unorderedEquals(fields, query.queryResultsFieldNames ?? []),
							results: queryResultsResponse.results
						});

						query.queryResultsFieldNames = fields;
					}
				}

				await new Promise(resolve => setTimeout(resolve, 1000));
			}
			while (queryResultsResponse.status !== "Complete" && !query.canceled);

			progress.report({ increment: 100 });
		});
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.runQuery',
			async () => {
				const query = parseQuery(getFocusedTextSection());
				await executeQuery(query);
			}));
}