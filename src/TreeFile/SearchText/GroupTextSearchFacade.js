// @ts-nocheck

const vscode = require("vscode");
const GroupTextSearchKinds = require("./GroupTextSearchKinds");
const GroupTextSearchGroupResolver = require("./GroupTextSearchGroupResolver");
const GroupTextSearchInputFlow = require("./GroupTextSearchInputFlow");
const GroupTextSearchOptions = require("./GroupTextSearchOptions");
const GroupTextSearchScope = require("./GroupTextSearchScope");
const GroupTextSearchService = require("./GroupTextSearchService");
const GroupTextSearchBridge = require("./GroupTextSearchBridge");

class GroupTextSearchFacade {
    /**
     * @param {{
     *   bridge: GroupTextSearchBridge,
     *   inputFlow?: GroupTextSearchInputFlow,
     *   searchService?: GroupTextSearchService,
     *   scope?: GroupTextSearchScope,
     *   options?: GroupTextSearchOptions,
     * }} deps
     */
    constructor(deps) {
        const d = deps || {};
        this.bridge = d.bridge;
        this.inputFlow = d.inputFlow || new GroupTextSearchInputFlow();
        this.searchService = d.searchService || new GroupTextSearchService();
        this.scope = d.scope || new GroupTextSearchScope();
        this.options = d.options || new GroupTextSearchOptions();
    }

    /**
     * @param {{ publishSearchResult: (result: any, options?: { reveal?: boolean }) => void }} viewApi
     * @returns {GroupTextSearchFacade}
     */
    static create(viewApi) {
        const bridge = new GroupTextSearchBridge({
            publishSearchResult: viewApi.publishSearchResult,
        });
        return new GroupTextSearchFacade({ bridge });
    }

    /**
     * @param {object} provider
     * @param {GroupTextSearchFacade} facadeInstance
     */
    static attach(provider, facadeInstance) {
        if (!provider) return;
        provider[GroupTextSearchKinds.FACADE_INSTANCE_KEY] = facadeInstance;
    }

    /**
     * @param {object} provider
     * @param {import('vscode').TreeItem} groupElement
     */
    static runFromProvider(provider, groupElement) {
        const facade = provider && provider[GroupTextSearchKinds.FACADE_INSTANCE_KEY];
        if (!facade) {
            void vscode.window.showWarningMessage("Text search is not initialized yet.");
            return undefined;
        }
        return facade.runFromGroupElement(groupElement);
    }

    /**
     * @param {import('vscode').TreeItem} groupElement
     */
    async runFromGroupElement(groupElement) {
        const resolved = GroupTextSearchGroupResolver.resolve(groupElement);
        if (!resolved.ok) {
            GroupTextSearchFacade._showResolveError(resolved);
            return;
        }

        const { groupRoot, groupName } = resolved;
        const queryText = await this.inputFlow.promptQuery(groupName);
        if (queryText === undefined) {
            return;
        }

        const globs = await this.inputFlow.promptExtensions(this.options.getExtensions());
        if (globs === undefined) {
            return;
        }

        const searchFolder = this.scope.resolveSearchFolder(groupRoot);
        if (!searchFolder) {
            void vscode.window.showWarningMessage(`Group ${groupName} has no searchable folder.`);
            return;
        }

        try {
            const result = await this.searchService.searchWithProgress({
                searchFolder,
                groupRoot: this.scope.resolveGroupRoot(groupRoot),
                groupLabel: groupName,
                queryText: String(queryText).trim(),
                globs,
                caseSensitive: this.options.isCaseSensitive(),
            });
            this.bridge.publishWithEmptyNotice(result, { reveal: true });
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            void vscode.window.showErrorMessage(`Text search failed: ${msg}`);
        }
    }

    /**
     * @param {{ ok: false, reason: string, groupName?: string }} resolved
     */
    static _showResolveError(resolved) {
        if (resolved.reason === "no_root") {
            void vscode.window.showWarningMessage(
                `Group ${resolved.groupName || ""} has no root path.`
            );
        }
    }

    dispose() {
        if (this.searchService) {
            this.searchService.dispose();
        }
        if (this.bridge) {
            this.bridge.dispose();
        }
    }
}

module.exports = GroupTextSearchFacade;
