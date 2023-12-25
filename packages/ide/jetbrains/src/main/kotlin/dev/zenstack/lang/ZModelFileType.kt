package dev.zenstack.lang

import com.intellij.openapi.fileTypes.LanguageFileType
import javax.swing.Icon

object ZModelFileType : LanguageFileType(ZModelLanguage) {
    override fun getName(): String = "ZModel"

    override fun getDescription(): String = "ZModel Language"

    override fun getDefaultExtension(): String = "zmodel"

    override fun getIcon(): Icon = ZModelIcons.ZModel
}