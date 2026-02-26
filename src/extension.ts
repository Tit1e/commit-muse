import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

			const message = await buildPlaceholderMessage(repository.rootUri.fsPath, Boolean(stagedDiff.trim()));
			repository.inputBox.value = message;
			vscode.window.showInformationMessage('Commit message generated. Review and commit when ready.');
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

async function buildPlaceholderMessage(repoPath: string, useStagedChanges: boolean): Promise<string> {
	const statArgs = useStagedChanges ? ['diff', '--cached', '--numstat'] : ['diff', '--numstat'];
	const nameArgs = useStagedChanges ? ['diff', '--cached', '--name-only'] : ['diff', '--name-only'];
	const [numstat, names] = await Promise.all([
		runGit(statArgs, repoPath),
		runGit(nameArgs, repoPath),
	]);

	let additions = 0;
	let deletions = 0;
	for (const line of numstat.split('\n')) {
		if (!line.trim()) {
			continue;
		}
		const [add, del] = line.split('\t');
		additions += Number(add) || 0;
		deletions += Number(del) || 0;
	}

	const files = names
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	const fileCount = files.length;
	const fileLabel = fileCount === 1 ? 'file' : 'files';

	return `chore: update ${fileCount} ${fileLabel} (+${additions} -${deletions})`;
}

async function runGit(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync('git', args, { cwd });
	return stdout;
}
