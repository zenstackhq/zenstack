import { loadDocument } from '@zenstackhq/language';

export function loadDocumentWithPlugins(filePath: string, extraPluginModelFiles: string[] = []) {
    const pluginModelFiles = [require.resolve('@zenstackhq/plugin-policy/plugin.zmodel'), ...extraPluginModelFiles];
    return loadDocument(filePath, pluginModelFiles);
}
