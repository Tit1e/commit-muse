# Commit Muse

Commit Muse is a VS Code extension that generates Git commit messages from your current diff using OpenAI or OpenAI-compatible APIs.

## Features

- Generate commit messages from Source Control with one click.
- Supports `staged` diff first, falls back to `unstaged` diff.
- Configurable language: `English` or `Chinese`.
- Optional emoji prefix based on commit type (e.g. `feat` -> `✨`, `fix` -> `🐛`).
- Custom API settings: key, base URL, model.
- Custom prompt template with placeholders.
- Output mode:
  - `single`: one commit entry
  - `multi`: multiple commit entries (newline separated)

## Command

- `AI: Generate Commit Message`

This command also appears as a button in the Source Control title bar for Git repositories.

## Extension Settings

Commit Muse contributes the following settings:

- `commitMuse.language`: `English` or `Chinese` (default: `Chinese`)
- `commitMuse.useEmoji`: enable/disable emoji prefix
- `commitMuse.outputMode`: `single` or `multi` (default: `single`)
- `commitMuse.provider`: `OpenAI` or `OpenAI-Compatible` (default: `OpenAI-Compatible`)
- `commitMuse.apiKey`: API key
- `commitMuse.baseUrl`: API base URL (default: `https://api.deepseek.com/v1`)
- `commitMuse.model`: model name (default: `deepseek-chat`)
- `commitMuse.promptTemplate`: custom prompt template

Prompt placeholders:

- `{{language}}`
- `{{outputModeInstruction}}`
- `{{emojiInstruction}}`
- `{{diff}}`

## Requirements

- VS Code `^1.109.0`
- A Git repository in your workspace
- A valid API key for your selected provider

## Usage

1. Open a Git repository in VS Code.
2. Make changes (recommended: stage changes first).
3. Configure `commitMuse` settings (`apiKey`, `baseUrl`, `model`, etc.).
4. Run `AI: Generate Commit Message` or click the SCM button.
5. Review the generated message in the SCM input box, then commit.

## Notes

- Untracked files are not included in `git diff` unless you stage them.
- If no diff is available, Commit Muse will show a message and stop.

## Development

- Install dependencies: `npm install`
- Build: `npm run compile`
- Run extension host: `F5` in VS Code
- Package: `npx @vscode/vsce package`
- Publish from a version tag: push `v*` tags to trigger the GitHub Actions release workflow

## License

MIT
