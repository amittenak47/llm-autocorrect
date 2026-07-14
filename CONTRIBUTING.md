# Contributing (maintainers)

Not shipped in the extension package. User docs live in [README.md](README.md).

## Build

```bash
npm install
npm run compile
npm test
```

Press **F5** for Extension Development Host. Set API key in the host window.

Manual test cases: `tests/README.md`.

## Package locally

```bash
npm run compile
npx @vscode/vsce package
```

Install: **Extensions → ⋯ → Install from VSIX**.

## Publish

**VS Code Marketplace** — [create publisher](https://marketplace.visualstudio.com/manage), then:

```bash
vsce login <publisher-id>
vsce publish
```

Uses an Azure DevOps PAT (not GitHub).

**Open VSX** (Cursor search):

```bash
npx ovsx publish llm-autocorrect-<version>.vsix -p <open-vsx-pat>
```

**GitHub Releases** — attach the `.vsix` for manual installs.
