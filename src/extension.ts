import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CONFIG_SECTION = 'commitMuse';
const DEFAULT_PROMPT_TEMPLATE =
	'Generate a git commit message from the diff below.\n\n' +
	'Requirements:\n' +
	'- Language: {{language}}\n' +
	'- Use Conventional Commits format\n' +
	'- Keep subject concise (around 72 chars max when possible)\n' +
	'- {{emojiInstruction}}\n' +
	'- Output only the final commit message text, no explanation, no markdown code fence\n\n' +
	'Git diff:\n' +
	'{{diff}}';

interface GitRepository {
	rootUri: vscode.Uri;
	inputBox: vscode.SourceControlInputBox;
}

interface GitApi {
	repositories: GitRepository[];
}

interface GitExtension {
	getAPI(version: number): GitApi;
}

type Language = 'English' | 'Chinese';
type Provider = 'OpenAI' | 'OpenAI-Compatible';

interface CommitMuseConfig {
	language: Language;
	useEmoji: boolean;
	provider: Provider;
	apiKey: string;
	baseUrl: string;
	model: string;
	promptTemplate: string;
}

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('commit-muse.generateCommitMessage', async () => {
		try {
			const repository = getRepositoryForActiveEditor();
			if (!repository) {
				vscode.window.showErrorMessage('No Git repository found for this workspace.');
				return;
			}

			const stagedDiff = await runGit(['diff', '--cached'], repository.rootUri.fsPath);
			const unstagedDiff = stagedDiff.trim() ? '' : await runGit(['diff'], repository.rootUri.fsPath);
			const diff = stagedDiff.trim() ? stagedDiff : unstagedDiff;
			if (!diff.trim()) {
				vscode.window.showInformationMessage('No changes found. Stage or edit files first.');
				return;
			}

			const config = readConfig();
			if (!config.apiKey.trim()) {
				const choice = await vscode.window.showErrorMessage(
					'Commit Muse API key is empty. Configure "commitMuse.apiKey" in settings.',
					'Open Settings'
				);
				if (choice === 'Open Settings') {
					await vscode.commands.executeCommand('workbench.action.openSettings', 'commitMuse');
				}
				return;
			}

			const message = await generateCommitMessageWithAI(diff, config);
			repository.inputBox.value = message;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Failed to generate commit message: ${message}`);
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}

function getRepositoryForActiveEditor(): GitRepository | undefined {
	const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
	if (!extension) {
		return undefined;
	}

	const gitExtension = extension.isActive ? extension.exports : extension.activate();
	const api = (gitExtension as GitExtension).getAPI(1);
	if (api.repositories.length === 0) {
		return undefined;
	}

	const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
	if (!activeEditorUri) {
		return api.repositories[0];
	}

	return (
		api.repositories.find((repository) => {
			const repoRoot = repository.rootUri.fsPath;
			return activeEditorUri.fsPath.startsWith(repoRoot);
		}) ?? api.repositories[0]
	);
}

function readConfig(): CommitMuseConfig {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return {
		language: config.get<Language>('language', 'English'),
		useEmoji: config.get<boolean>('useEmoji', false),
		provider: config.get<Provider>('provider', 'OpenAI'),
		apiKey: config.get<string>('apiKey', ''),
		baseUrl: config.get<string>('baseUrl', 'https://api.openai.com/v1'),
		model: config.get<string>('model', 'gpt-4o-mini'),
		promptTemplate: config.get<string>('promptTemplate', DEFAULT_PROMPT_TEMPLATE),
	};
}

async function generateCommitMessageWithAI(diff: string, config: CommitMuseConfig): Promise<string> {
	const prompt = renderPrompt(config.promptTemplate, diff, config.language, config.useEmoji);
	const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
	const providerContext =
		config.provider === 'OpenAI'
			? 'OpenAI API style'
			: 'OpenAI-compatible API style';

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify({
			model: config.model,
			messages: [
				{
					role: 'system',
					content: `You are a senior engineer writing concise git commit messages. Use ${providerContext}.`,
				},
				{
					role: 'user',
					content: prompt,
				},
			],
			temperature: 0.2,
		}),
	});

	if (!response.ok) {
		const errorBody = await safeReadErrorBody(response);
		throw new Error(`AI request failed (${response.status}): ${errorBody}`);
	}

	const data = (await response.json()) as OpenAIChatResponse;
	const content = data.choices?.[0]?.message?.content?.trim();
	if (!content) {
		throw new Error('AI response was empty.');
	}

	return normalizeCommitMessage(content);
}

function renderPrompt(template: string, diff: string, language: Language, useEmoji: boolean): string {
	const safeTemplate = template?.trim() ? template : DEFAULT_PROMPT_TEMPLATE;
	const emojiInstruction = useEmoji
		? 'Emoji is allowed when it improves clarity.'
		: 'Do not use emoji.';

	let rendered = safeTemplate
		.replaceAll('{{language}}', language)
		.replaceAll('{{emojiInstruction}}', emojiInstruction)
		.replaceAll('{{diff}}', diff);

	if (!safeTemplate.includes('{{diff}}')) {
		rendered = `${rendered}\n\nGit diff:\n${diff}`;
	}

	return rendered;
}

function normalizeCommitMessage(raw: string): string {
	let value = raw.trim();
	if (value.startsWith('```')) {
		value = value.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
	}
	return value.replace(/^["']|["']$/g, '').trim();
}

async function safeReadErrorBody(response: Response): Promise<string> {
	try {
		const text = await response.text();
		return text.trim() || response.statusText;
	} catch {
		return response.statusText;
	}
}

async function runGit(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync('git', args, { cwd });
	return stdout;
}

interface OpenAIChatResponse {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
}
