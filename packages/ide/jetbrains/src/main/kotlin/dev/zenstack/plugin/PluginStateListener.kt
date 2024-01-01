package dev.zenstack.plugin

import com.intellij.ide.plugins.DynamicPluginListener
import com.intellij.ide.plugins.IdeaPluginDescriptor
import dev.zenstack.Utils
import org.jetbrains.plugins.textmate.TextMateService

class PluginStateListener: DynamicPluginListener {
    override fun beforePluginLoaded(pluginDescriptor: IdeaPluginDescriptor) {
        // install TextMate bundle
        Utils.Companion.addTextMateBundle()
    }

    override fun beforePluginUnload(pluginDescriptor: IdeaPluginDescriptor, isUpdate: Boolean) {
        // uninstall TextMate bundle
        Utils.disableTextMateBundle()
    }
}