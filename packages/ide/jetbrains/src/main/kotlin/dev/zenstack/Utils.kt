package dev.zenstack

import com.intellij.lang.javascript.service.JSLanguageServiceUtil
import org.jetbrains.plugins.textmate.TextMateService
import org.jetbrains.plugins.textmate.configuration.TextMateUserBundlesSettings

class Utils {
    companion object {
        fun addTextMateBundle() {
            println("Adding ZenStack textmate bundle")
            val textMateBundle = JSLanguageServiceUtil.getPluginDirectory(javaClass, "res/zmodel.tmbundle")
            TextMateUserBundlesSettings.instance?.addBundle(textMateBundle.path, "zmodel")
            reloadTextMateBundles()
        }

        fun disableTextMateBundle() {
            println("Disabling ZenStack textmate bundle")
            val textMateBundle = JSLanguageServiceUtil.getPluginDirectory(javaClass, "res/zmodel.tmbundle")
            TextMateUserBundlesSettings.instance?.disableBundle(textMateBundle.path)
            reloadTextMateBundles()
        }

        private fun reloadTextMateBundles() {
            val textMateService = TextMateService.getInstance();
            textMateService.reloadEnabledBundles()
        }
    }
}