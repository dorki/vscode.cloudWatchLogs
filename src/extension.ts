import * as asTable from 'as-table';
import * as AWS from 'aws-sdk';
import * as clipboardy from 'clipboardy';
import * as _ from 'lodash';
import * as vscode from 'vscode';
import { getEnvCredentials } from './authenticator';
import { BuildLogRecordHtml, BuildQueryResultsHtml, formatTime } from './htmlHelper';
import { parseQuery, Query } from './query';
import { Initialize as InitializeQueryFiles } from './queryFiles';
import { getFocusedTextSection } from './windowUtils';

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
				`Results ${query.env} (0)`,
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
						return;
					case 'refresh':
						query = parseQuery(message.query, query)
						await executeQuery(query, panel);
						return;
					case 'duplicate':
						const duplicatedPanel = createQueryWebViewPanel(query);
						duplicatedPanel.webview.html =
							BuildQueryResultsHtml(
								context.extensionPath,
								query,
								[]);
						return;
					case 'changeTitle':
						const title =
							await vscode.window.showInputBox({
								placeHolder: 'Set title text',
								prompt: 'Tab Title',
								value: query.title
							});

						if (title == undefined) {
							return;
						}
						else if (query.title) {
							panel.title = panel.title.replace(query.title, title);
						}
						else {
							panel.title = panel.title.replace("Results", title);
						}

						query.title = title;
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

		const currentPanel = panel ?? createQueryWebViewPanel(query);

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: 'Loading...'
		}, async (progress, token) => {

			progress.report({ increment: 0 });

			currentPanel.iconPath = getPanelIconPath("hourglass");

			// build results page
			currentPanel.webview.html =
				BuildQueryResultsHtml(
					context.extensionPath,
					query,
					logGroups);

			let queryResultsResponse: AWS.CloudWatchLogs.GetQueryResultsResponse;

			do {
				queryResultsResponse =
					await logs.
						getQueryResults({ queryId: startQueryResponse.queryId! }).
						promise();

				if (query.canceled || token.isCancellationRequested) {
					break;
				}

				progress.report({ increment: 40 });

				// dont refresh if there are no new results
				if (queryResultsResponse.results != undefined &&
					queryResultsResponse.results.length > (query.queryResults?.length ?? 0)) {

					currentPanel.title = getPanelTitle(query, queryResultsResponse.results?.length);

					const fields =
						_(queryResultsResponse.results).
							flatMap(queryResult => queryResult.map(_ => _.field!)).
							uniq().
							without("@ptr").
							value();

					if (fields.length > 0) {
						const newFieldExists = !unorderedEquals(fields, query.queryResultsFieldNames ?? [])
						if (newFieldExists) {
							query.queryResultsFieldNames = fields;
						}

						currentPanel.webview.postMessage({
							command: 'results',
							fieldNames: query.queryResultsFieldNames,
							fieldRefresh: newFieldExists,
							results: queryResultsResponse.results
						});

						query.queryResults = queryResultsResponse.results;
					}
				}

				await new Promise(resolve => setTimeout(resolve, 1000));
			}
			while (queryResultsResponse.status !== "Complete" && !query.canceled && !token.isCancellationRequested);

			currentPanel.title = getPanelTitle(query, queryResultsResponse.results?.length);
			currentPanel.iconPath =
				getPanelIconPath(
					query.canceled || token.isCancellationRequested
						? "error"
						: "done")
		});
	}

	function getPanelIconPath(status: string) {
		return vscode.Uri.joinPath(context.extensionUri, "media/panel", `${status}.svg`);
	}

	function getPanelTitle(query: Query, results?: number) {
		return `${query.title ?? 'Results'} ${query.env} (${results ?? 0})`;
	}

	async function getHistory(query: Query) {

		const env =
			!_.isEmpty(query.env)
				? query.env
				: await vscode.window.showInputBox({ placeHolder: 'Enter environment name' });
		if (env == undefined) {
			return;
		}

		const region =
			!_.isEmpty(query.region)
				? query.region
				: await vscode.window.showInputBox({ placeHolder: 'Enter region' });
		if (region == undefined) {
			return;
		}

		const creds = await getEnvCredentials(env);
		const logs = new AWS.CloudWatchLogs({ credentials: creds, region });
		const describeQueriesResponse = await logs.describeQueries().promise();

		var queries =
			_(describeQueriesResponse.queries).
				map(
					query => {
						return {
							createTime: query.createTime,
							queryString: query.queryString?.substr(query.queryString?.indexOf("|") + 2)
						}
					}).
				groupBy(query => query.queryString).
				map(
					(queries, queryString) => {
						return {
							queryString,
							createTime: _(queries).map(query => query.createTime).max()!
						}
					}).
				orderBy(_ => _.createTime, "desc").
				value();

		let content = `Query History (${queries.length})\n\n`;
		for (const query of queries) {
			content += formatTime(query.createTime) + "\n";
			content += query.queryString.trim() + "\n";
			content += "\n";
		}

		await vscode.window.showTextDocument(
			await vscode.workspace.openTextDocument({ content }),
			vscode.ViewColumn.Active);
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.runQuery',
			async () => {
				const query = parseQuery(getFocusedTextSection());
				await executeQuery(query);
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.getHistory',
			async () => {
				const query = parseQuery(getFocusedTextSection());
				await getHistory(query);
			}));
}