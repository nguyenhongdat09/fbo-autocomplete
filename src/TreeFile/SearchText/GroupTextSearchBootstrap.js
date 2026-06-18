// @ts-nocheck

const TextSearchResultTreeView = require("./TextSearchResultTreeView");
const GroupTextSearchFacade = require("./GroupTextSearchFacade");
const GroupTextSearchMatchOpener = require("./GroupTextSearchMatchOpener");

/**
 * Khởi tạo toàn bộ Search text in group — gọi 1 lần từ extension.js.
 * @param {import('vscode').ExtensionContext} context
 * @param {object} treeDataProvider
 * @returns {{ textSearchView: TextSearchResultTreeView, facade: GroupTextSearchFacade }}
 */
function activateGroupTextSearch(context, treeDataProvider) {
    const textSearchView = new TextSearchResultTreeView();
    textSearchView.run(context);

    GroupTextSearchMatchOpener.register(context);

    const facade = GroupTextSearchFacade.create({
        publishSearchResult: (result, options) => textSearchView.publishResult(result, options),
    });

    if (treeDataProvider) {
        GroupTextSearchFacade.attach(treeDataProvider, facade);
    }

    context.subscriptions.push({
        dispose: () => {
            facade.dispose();
        },
    });

    return { textSearchView, facade };
}

module.exports = { activateGroupTextSearch };
