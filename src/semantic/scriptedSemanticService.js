const path = require('path');
const vscode = require('vscode');

const {
  getDirectChildren,
  normalizePathKey,
  rangeHasPlaceholderMacro,
} = require('./shallowScriptParser');
const { buildLoadOrderIndex, combineFamilies } = require('./loadOrderIndex');
const {
  OpenDocumentOverlay,
  detectFamilyForPath,
} = require('./openDocumentOverlay');
const {
  resolveTigerCompatibleLoadOrder,
} = require('./tigerCompatibleResolver');
const { getSemanticSettings, isPathWithin } = require('./semanticSettings');

class ScriptedSemanticService {
  constructor() {
    this.overlay = new OpenDocumentOverlay();
    this.legend = new vscode.SemanticTokensLegend(['scriptedParameter'], []);
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeSemanticTokens = this.changeEmitter.event;
    this.currentIndex = null;
    this.resolvedLoadOrder = null;
    this.fullRebuildTimer = null;
    this.semanticRefreshTimer = null;
    this.rebuilding = false;
    this.rebuildController = null;
    this.pendingRebuild = false;
    this.disposed = false;
    this.initialized = false;
    this.revision = 0;
    this.subscriptions = [];
    this.watchers = [];
    this.watcherKey = '';
    this.lastError = null;
  }

  dispose() {
    this.disposed = true;
    this.rebuildController?.abort();
    this.pendingRebuild = false;
    clearTimeout(this.fullRebuildTimer);
    clearTimeout(this.semanticRefreshTimer);
    this.fullRebuildTimer = null;
    this.semanticRefreshTimer = null;
    for (const subscription of this.subscriptions) subscription.dispose();
    this.subscriptions = [];
    this.disposeWatchers();
    this.overlay.records.clear();
    this.currentIndex = null;
    this.changeEmitter.dispose();
  }

  async initialize() {
    if (this.disposed || this.initialized) return;
    this.initialized = true;
    this.refreshOpenDocuments();
    this.registerWorkspaceHooks();
    await this.rebuildIndex();
  }

  refreshOpenDocuments() {
    this.overlay.records.clear();
    if (this.disposed || !getSemanticSettings().enabled) return;
    for (const document of vscode.workspace.textDocuments) {
      if (this.supportsDocument(document) || this.isMetadataDocument(document))
        this.overlay.update(document);
    }
  }

  supportsDocument(document) {
    return (
      !this.disposed &&
      getSemanticSettings().enabled &&
      document?.uri.scheme === 'file' &&
      document.languageId === 'ck3'
    );
  }

  isMetadataDocument(document) {
    if (document?.uri.scheme !== 'file') return false;
    const name = path.basename(document.uri.fsPath).toLowerCase();
    return name === 'ck3-tiger.conf' || name.endsWith('.mod');
  }

  registerWorkspaceHooks() {
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) =>
        this.handleDocumentChange(document),
      ),
      vscode.workspace.onDidChangeTextDocument((event) =>
        this.handleDocumentChange(event.document),
      ),
      vscode.workspace.onDidSaveTextDocument((document) =>
        this.handleDocumentChange(document, true),
      ),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (this.disposed || document.uri.scheme !== 'file') return;
        this.overlay.remove(document);
        const global = this.isGlobalScriptedDocument(document);
        if (this.isHeavyRebuildDocument(document) || global)
          this.scheduleFullRebuild(0);
        if (global) this.recomputeGlobalSymbols();
        this.refreshSemanticTokens();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          [
            'ck3Highlight.semantic.enabled',
            'ck3Highlight.gamePath',
            'ck3Highlight.modPath',
            'ck3tiger.ck3Path',
            'ck3tiger.modPath',
          ].some((name) => event.affectsConfiguration(name))
        ) {
          this.currentIndex = null;
          this.refreshOpenDocuments();
          if (!getSemanticSettings().enabled) this.disposeWatchers();
          this.scheduleFullRebuild(0);
          this.refreshSemanticTokens();
        }
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() =>
        this.scheduleFullRebuild(0),
      ),
    );
  }

  handleDocumentChange(document, saved = false) {
    if (
      this.disposed ||
      !getSemanticSettings().enabled ||
      document.uri.scheme !== 'file'
    )
      return;
    const heavy = this.isHeavyRebuildDocument(document);
    if (
      !heavy &&
      !this.supportsDocument(document) &&
      !this.isMetadataDocument(document)
    )
      return;
    this.overlay.update(document);
    const global = this.isGlobalScriptedDocument(document);
    if (
      heavy ||
      (global &&
        (saved ||
          !this.currentIndex.sourceFiles.has(
            normalizePathKey(document.uri.fsPath),
          )))
    ) {
      this.scheduleFullRebuild(saved ? 0 : 180);
    }
    if (global) this.recomputeGlobalSymbols();
    this.refreshSemanticTokens();
  }

  isHeavyRebuildDocument(document) {
    const key = normalizePathKey(document.uri.fsPath);
    return Boolean(
      [...(this.resolvedLoadOrder?.watchPaths || [])].some(
        (file) => normalizePathKey(file) === key,
      ),
    );
  }

  isGlobalDocument(document) {
    return (
      vscode.workspace.isTrusted !== false &&
      Boolean(
        this.currentIndex?.roots.some((root) =>
          isPathWithin(document.uri.fsPath, root.root),
        ),
      )
    );
  }

  isGlobalScriptedDocument(document) {
    return (
      this.isGlobalDocument(document) &&
      Boolean(detectFamilyForPath(document.uri.fsPath))
    );
  }

  disposeWatchers() {
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
    this.watcherKey = '';
  }

  updateWatchers(resolved) {
    const patterns = [];
    if (resolved.ready) {
      const roots = [
        ...(resolved.ck3Path ? [path.join(resolved.ck3Path, 'game')] : []),
        ...resolved.loadedMods.map((mod) => mod.root),
        resolved.main.root,
      ];
      for (const root of new Set(roots))
        patterns.push([
          root,
          'common/{scripted_effects,scripted_triggers,scripted_modifiers}/**/*.txt',
        ]);
    }
    for (const file of resolved.watchPaths || [])
      patterns.push([path.dirname(file), path.basename(file)]);
    const key = JSON.stringify(patterns);
    if (key === this.watcherKey) return;
    this.disposeWatchers();
    this.watcherKey = key;
    for (const [base, pattern] of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(base, pattern),
      );
      this.watchers.push(watcher);
      for (const event of [
        watcher.onDidCreate,
        watcher.onDidChange,
        watcher.onDidDelete,
      ]) {
        this.watchers.push(event(() => this.scheduleFullRebuild(180)));
      }
    }
  }

  scheduleFullRebuild(delayMs) {
    if (this.disposed) return;
    this.revision++;
    this.rebuildController?.abort();
    clearTimeout(this.fullRebuildTimer);
    this.fullRebuildTimer = setTimeout(() => {
      this.fullRebuildTimer = null;
      void this.rebuildIndex();
    }, delayMs);
  }

  async rebuildIndex() {
    if (this.disposed) return;
    if (this.rebuilding) {
      this.revision++;
      this.rebuildController?.abort();
      this.pendingRebuild = true;
      return;
    }
    this.rebuilding = true;
    this.rebuildController = new AbortController();
    const { signal } = this.rebuildController;
    const revision = this.revision;
    try {
      const resolved = await resolveTigerCompatibleLoadOrder(
        this.overlay,
        signal,
      );
      if (this.disposed || revision !== this.revision) return;
      this.resolvedLoadOrder = resolved;
      this.updateWatchers(resolved);
      const index = resolved.ready
        ? await buildLoadOrderIndex(resolved, signal)
        : null;
      if (this.disposed || revision !== this.revision) return;
      this.currentIndex = index;
      this.recomputeGlobalSymbols();
      this.lastError = null;
      this.refreshSemanticTokens();
    } catch (error) {
      if (this.disposed || revision !== this.revision) return;
      this.currentIndex = null;
      const message = `CK3 Highlight semantic index: ${error.message}`;
      if (message !== this.lastError) {
        this.lastError = message;
        void vscode.window.showWarningMessage(message);
      }
      this.refreshSemanticTokens();
    } finally {
      this.rebuilding = false;
      this.rebuildController = null;
      if (this.pendingRebuild && !this.disposed) {
        this.pendingRebuild = false;
        this.scheduleFullRebuild(0);
      }
    }
  }

  recomputeGlobalSymbols() {
    if (this.currentIndex)
      Object.assign(
        this.currentIndex,
        combineFamilies(this.currentIndex.recordsByFamily, this.overlay),
      );
  }

  refreshSemanticTokens() {
    if (this.disposed) return;
    clearTimeout(this.semanticRefreshTimer);
    this.semanticRefreshTimer = setTimeout(() => {
      this.semanticRefreshTimer = null;
      if (!this.disposed) this.changeEmitter.fire();
    }, 120);
  }

  provideDocumentSemanticTokens(document) {
    const builder = new vscode.SemanticTokensBuilder(this.legend);
    if (!this.supportsDocument(document)) return builder.build();
    const record = this.overlay.update(document);
    const names = new Set(
      this.isGlobalDocument(document) ? this.currentIndex.any : [],
    );
    for (const [name, parameterized] of record.definitions) {
      if (parameterized) names.add(name);
      else if (record.family) names.delete(name);
    }
    if (names.size === 0) return builder.build();
    for (const assignment of record.parsed.assignments) {
      if (
        assignment.operator !== '=' ||
        assignment.valueKind !== 'block' ||
        !names.has(assignment.lhs)
      )
        continue;
      if (
        assignment.depth === 0 &&
        (record.family ||
          rangeHasPlaceholderMacro(
            record.parsed.text,
            assignment.valueStart + 1,
            assignment.valueEnd - 1,
          ))
      )
        continue;
      for (const child of getDirectChildren(
        record.parsed,
        assignment.blockId,
      )) {
        builder.push(
          new vscode.Range(
            document.positionAt(child.lhsStart),
            document.positionAt(child.lhsEnd),
          ),
          'scriptedParameter',
        );
      }
    }
    return builder.build();
  }
}

module.exports = { ScriptedSemanticService };
