package dev.zenstack.lsp

import com.intellij.execution.ExecutionException
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.javascript.nodejs.interpreter.NodeCommandLineConfigurator
import com.intellij.javascript.nodejs.interpreter.NodeJsInterpreterManager
import com.intellij.javascript.nodejs.interpreter.local.NodeJsLocalInterpreter
import com.intellij.javascript.nodejs.interpreter.wsl.WslNodeInterpreter
import com.intellij.lang.javascript.service.JSLanguageServiceUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor
import com.intellij.platform.lsp.api.customization.LspFormattingSupport
import dev.zenstack.lang.ZModelFileType
import dev.zenstack.Utils

class ZenStackLspServerDescriptor(project: Project) : ProjectWideLspServerDescriptor(project, "ZenStack") {

    override fun isSupportedFile(file: VirtualFile) = file.fileType == ZModelFileType

    override fun createCommandLine(): GeneralCommandLine {

        Utils.Companion.addTextMateBundle()

        // start language server
        val interpreter = NodeJsInterpreterManager.getInstance(project).interpreter
        if (interpreter !is NodeJsLocalInterpreter && interpreter !is WslNodeInterpreter) {
            throw ExecutionException("Interpreter not configured")
        }

        val lsp = JSLanguageServiceUtil.getPluginDirectory(javaClass, "language-server/main.js")
        if (lsp == null || !lsp.exists()) {
            // broken plugin installation?
            throw ExecutionException("Language server not found")
        }

        return GeneralCommandLine().apply {
            withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
            withCharset(Charsets.UTF_8)
            addParameter(lsp.path)
            addParameter("--stdio")

            NodeCommandLineConfigurator.find(interpreter)
                    .configure(this, NodeCommandLineConfigurator.defaultOptions(project))
        }
    }

    override val lspGoToDefinitionSupport = true

    override val lspHoverSupport = true

    override val lspFormattingSupport = object : LspFormattingSupport() {
        override fun shouldFormatThisFileExclusivelyByServer(file: VirtualFile, ideCanFormatThisFileItself: Boolean, serverExplicitlyWantsToFormatThisFile: Boolean) = file.fileType == ZModelFileType
    }
}
