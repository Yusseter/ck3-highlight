const vscode = require('vscode');
const { formatScript } = require('./formatter');
const { classifyDocument } = require('./documents');
const {
  ScriptedSemanticService,
} = require('./semantic/scriptedSemanticService');

const scriptLanguages = ['ck3'];

function fullDocumentRange(document) {
  return new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
}

function activate(context) {
  const output = vscode.window.createOutputChannel('CK3 Syntax');
  const semanticService = new ScriptedSemanticService(context);
  context.subscriptions.push(output, semanticService);
  let semanticStarted = false;
  let disposed = false;
  context.subscriptions.push({
    dispose() {
      disposed = true;
    },
  });

  const reportError = (error) =>
    output.appendLine(error instanceof Error ? error.message : String(error));
  const formatter = {
    provideDocumentFormattingEdits(document, options) {
      return [
        vscode.TextEdit.replace(
          fullDocumentRange(document),
          formatScript(document.getText(), options),
        ),
      ];
    },
    provideDocumentRangeFormattingEdits(document, range, options) {
      const lastLine =
        range.end.character === 0 && range.end.line > range.start.line
          ? range.end.line - 1
          : range.end.line;
      const editRange = new vscode.Range(
        range.start.line,
        0,
        lastLine,
        document.lineAt(lastLine).text.length,
      );
      const lines = formatScript(document.getText(), options).split(
        /\r\n|\r|\n/,
      );
      const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
      return [
        vscode.TextEdit.replace(
          editRange,
          lines.slice(range.start.line, lastLine + 1).join(eol),
        ),
      ];
    },
  };

  for (const language of scriptLanguages) {
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(
        language,
        formatter,
      ),
      vscode.languages.registerDocumentRangeFormattingEditProvider(
        language,
        formatter,
      ),
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('ck3Highlight.format', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && scriptLanguages.includes(editor.document.languageId)) {
        await vscode.commands.executeCommand('editor.action.formatDocument');
      }
    }),
    vscode.languages.registerDocumentSemanticTokensProvider(
      scriptLanguages.map((language) => ({ language, scheme: 'file' })),
      {
        onDidChangeSemanticTokens: semanticService.onDidChangeSemanticTokens,
        provideDocumentSemanticTokens: (document) =>
          semanticService.provideDocumentSemanticTokens(document),
      },
      semanticService.legend,
    ),
  );

  async function updateDocument(document) {
    if (disposed || document.isClosed) return;
    try {
      const config = vscode.workspace.getConfiguration(
        'ck3Highlight',
        document.uri,
      );
      const associations = vscode.workspace
        .getConfiguration('files', document.uri)
        .get('associations', {});
      const explicitAssociation = Object.keys(associations).some((pattern) => {
        const normalized = pattern.replace(/\\/g, '/');
        return (
          vscode.languages.match(
            {
              pattern: normalized.includes('/')
                ? normalized
                : '**/' + normalized,
            },
            document,
          ) > 0
        );
      });
      if (config.get('autoDetect', true) && !explicitAssociation) {
        const roots = (vscode.workspace.workspaceFolders || []).map(
          (folder) => folder.uri.fsPath,
        );
        const modPath =
          config.get('modPath', '') ||
          vscode.workspace
            .getConfiguration('ck3tiger', document.uri)
            .get('modPath', '');
        const language = await classifyDocument(document, roots, modPath);
        if (disposed || document.isClosed) return;
        if (language && language !== document.languageId) {
          await vscode.languages.setTextDocumentLanguage(document, language);
        }
      }
      if (!semanticStarted && scriptLanguages.includes(document.languageId)) {
        semanticStarted = true;
        await semanticService.initialize();
      }
    } catch (error) {
      reportError(error);
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      void updateDocument(document);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('ck3Highlight.autoDetect') ||
        event.affectsConfiguration('ck3Highlight.modPath')
      ) {
        for (const document of vscode.workspace.textDocuments)
          void updateDocument(document);
      }
    }),
  );
  for (const document of vscode.workspace.textDocuments)
    void updateDocument(document);
}

function deactivate() {}

module.exports = { activate, deactivate };
