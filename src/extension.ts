import * as asTable from 'as-table';
import { CloudWatchLogsClient, CloudWatchLogsServiceException } from '@aws-sdk/client-cloudwatch-logs';
import { LogGroup, GetLogRecordCommand, DescribeLogGroupsCommand, StartQueryCommand, GetQueryResultsCommand, ResultField, GetQueryResultsResponse, DescribeQueriesCommand } from '@aws-sdk/client-cloudwatch-logs';
import { paginateDescribeLogGroups } from '@aws-sdk/client-cloudwatch-logs';
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

		if (_.isEmpty(logPtr)) {
			vscode.window.showInformationMessage("Stats queries does not have log record pointer");
			return;
		}

		const credentials = await getEnvCredentials(env, region);
		const logsClient = new CloudWatchLogsClient({ credentials, region });

		const logRecordResponse = await logsClient.send(new GetLogRecordCommand({ logRecordPointer: logPtr }));
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
					case 'goToLog': {
						await GoToLog(message.text, query.env, message.region);
						return;
					}
					case 'openRaw': {
						await vscode.window.showTextDocument(
							await vscode.workspace.openTextDocument({
								content: formatResultsRawTable(message.fieldNames, message.rows),
								language: "json"
							}),
							vscode.ViewColumn.Active);
						return;
					}
					case 'refresh': {
						query.canceled = true;
						query = parseQuery(message.query, query);
						await executeQuery(query, panel);
						return;
					}
					case 'duplicate': {
						const duplicatedPanel = createQueryWebViewPanel(query);
						duplicatedPanel.webview.html =
							BuildQueryResultsHtml(
								context.extensionPath,
								query,
								{});
						return;
					}
					case 'changeTitle': {
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

	const logGroupsCache: { [envRegion: string]: LogGroup[] } = {};

	async function executeQuery(query: Query, panel?: vscode.WebviewPanel) {
		const creds = await getEnvCredentials(query.env, query.regions[0]);

		const regionToLogsClientMap =
			_(query.regions).
				keyBy().
				mapValues(region => new CloudWatchLogsClient({ credentials: creds, region })).
				value();

		const logGroups = query.logGroup.split(',');
		const regionToLogGroupsMap: { [region: string]: string[] } = {};

		for (const [region, logsClient] of _.entries(regionToLogsClientMap)) {

			const logGroupsCacheKey = `${query.env}.${region}`;

			if (!logGroupsCache[logGroupsCacheKey]) {
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					cancellable: false,
					title: `Fetching log groups from ${region} in '${query.env}''...`
				}, async () => {
					const regionLogGroups: LogGroup[] = [];
					for await (const page of paginateDescribeLogGroups({ client: logsClient }, {})) {
						regionLogGroups.push.apply(
							regionLogGroups,
							page.logGroups as LogGroup[]);
					}

					logGroupsCache[logGroupsCacheKey] = regionLogGroups;
				});
			}

			regionToLogGroupsMap[region] =
				_(logGroups).
					map(logGroup => new RegExp(`^${logGroup.replace(/\*/g, '.*')}$`, "i")).
					flatMap(
						logGroupRegex =>
							_.filter(
								logGroupsCache[logGroupsCacheKey],
								logGroup => logGroupRegex.test(logGroup.logGroupName ?? ""))).
					map(logGroup => logGroup.logGroupName!).
					uniq().
					value();
		}

		const regionToStartQueryIdMap: { [x: string]: string } = {};
		for (const [region, logsClient] of _.entries(regionToLogsClientMap)) {
			try {
				const startQueryResponse =
					await logsClient.send(
						new StartQueryCommand({
							startTime: query.times.start / 1000,
							endTime: query.times.end / 1000,
							queryString: query.query,
							logGroupNames: regionToLogGroupsMap[region],
							limit: query.maxResults
						}));

				regionToStartQueryIdMap[region] = startQueryResponse.queryId!;
			}
			catch (error) {
				const serviceException = error as CloudWatchLogsServiceException
				vscode.window.showErrorMessage(`${serviceException.name}, error: ${serviceException.message}`);
				return;
			}
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
					regionToLogGroupsMap);

			let results: ResultField[][] = [];
			const regionToQueryResultsMap: { [x: string]: GetQueryResultsResponse } = {};
			do {
				for (const [region, logsClient] of _.entries(regionToLogsClientMap)) {
					if (regionToQueryResultsMap[region]?.status !== "Complete") {
						regionToQueryResultsMap[region] = await logsClient.send(new GetQueryResultsCommand({ queryId: regionToStartQueryIdMap[region] }));
					}
				}

				if (query.canceled || token.isCancellationRequested) {
					break;
				}

				progress.report({ increment: 40 });

				if (_.some(regionToQueryResultsMap, queryResultsResponse => queryResultsResponse.results != undefined)) {

					results =
						_.flatMap(
							regionToQueryResultsMap,
							queryResultsResponse => queryResultsResponse.results ?? []);

					currentPanel.title = getPanelTitle(query, results.length);

					const fields =
						_(results).
							flatMap(queryResult => queryResult.map(_ => _.field!)).
							uniq().
							without("@ptr").
							value();

					if (fields.length > 0) {
						const newFieldExists = !unorderedEquals(fields, query.queryResultsFieldNames ?? []);
						if (newFieldExists) {
							query.queryResultsFieldNames = fields;
						}

						currentPanel.webview.postMessage({
							command: 'results',
							fieldNames: query.queryResultsFieldNames,
							fieldRefresh: newFieldExists,
							regionToQueryResultsMap: regionToQueryResultsMap
						});
					}
				}

				await new Promise(resolve => setTimeout(resolve, 1000));
			}
			while (
				_.some(
					regionToQueryResultsMap,
					queryResultsResponse => queryResultsResponse.status !== "Complete") &&
				!query.canceled &&
				!token.isCancellationRequested);

			currentPanel.title = getPanelTitle(query, results.length);
			currentPanel.iconPath =
				getPanelIconPath(
					query.canceled || token.isCancellationRequested
						? "error"
						: "done");
		});
	}

	function getPanelIconPath(status: string) {
		return vscode.Uri.joinPath(context.extensionUri, "media/panel", `${status}.svg`);
	}

	function getPanelTitle(query: Query, results: number) {
		return `${query.title ?? 'Results'} ${query.env} (${results})`;
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
			!_.isEmpty(query.regions)
				? query.regions[0]
				: await vscode.window.showInputBox({ placeHolder: 'Enter region' });
		if (region == undefined) {
			return;
		}

		const creds = await getEnvCredentials(env, region);
		const logsClient = new CloudWatchLogsClient({ credentials: creds, region });
		const describeQueriesResponse = await logsClient.send(new DescribeQueriesCommand({}));

		const queries =
			_(describeQueriesResponse.queries).
				map(
					query => {
						return {
							createTime: query.createTime,
							queryString: query.queryString?.substr(query.queryString?.indexOf("|") + 2)
						};
					}).
				groupBy(query => query.queryString).
				map(
					(queries, queryString) => {
						return {
							queryString,
							createTime: _(queries).map(query => query.createTime).max()!
						};
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