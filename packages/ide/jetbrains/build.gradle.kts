import org.jetbrains.changelog.Changelog
import org.jetbrains.changelog.date

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.21"
    id("org.jetbrains.intellij") version "1.16.1"
    id("org.jetbrains.changelog") version "2.2.0"
}

group = "dev.zenstack"
version = "2.3.2"

repositories {
    mavenCentral()
}

// Configure Gradle IntelliJ Plugin
// Read more: https://plugins.jetbrains.com/docs/intellij/tools-gradle-intellij-plugin.html
intellij {
    version.set("2023.3.2")
    type.set("IU") // Target IDE Platform

    plugins.set(listOf("JavaScript", "org.jetbrains.plugins.textmate"))
}

tasks {
    // Set the JVM compatibility versions
    withType<JavaCompile> {
        sourceCompatibility = "17"
        targetCompatibility = "17"
    }
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }

    prepareSandbox {
        doLast {
            copy {
                from("${project.projectDir}/../../schema/bundle/language-server/main.js")
                into("${destinationDir.path}/zenstack/language-server/")
            }
            copy {
                from("${project.projectDir}/../../schema/src/res/stdlib.zmodel")
                into("${destinationDir.path}/zenstack/res/")
            }
            copy {
                from("${project.projectDir}/src/main/textMate/zmodel.tmbundle")
                into("${destinationDir.path}/zenstack/res/zmodel.tmbundle")
            }
            copy {
                from("${project.projectDir}/../../language/syntaxes/zmodel.tmLanguage")
                into("${destinationDir.path}/zenstack/res/zmodel.tmbundle/Syntaxes/")
            }
        }
    }

    patchPluginXml {
        sinceBuild.set("233.2")
        untilBuild.set("251.*")
        changeNotes.set(provider {
            changelog.renderItem(
                    changelog
                            .getUnreleased()
                            .withHeader(false)
                            .withEmptySections(false),
                    Changelog.OutputType.HTML
            )
        })
    }

    signPlugin {
        certificateChain.set(System.getenv("CERTIFICATE_CHAIN"))
        privateKey.set(System.getenv("PRIVATE_KEY"))
        password.set(System.getenv("PRIVATE_KEY_PASSWORD"))
    }

    publishPlugin {
        token.set(System.getenv("PUBLISH_TOKEN"))
    }
}

changelog {
    header.set(provider { "[${version.get()}] - ${date()}" })
    introduction.set(
            """
        [ZenStack](https://zenstack.dev) is a toolkit that simplifies the development of a web app's backend. This plugin provides code editing experiences for its ZModel schema language.
        
        ## Features
        
        - Syntax highlighting
        - Error highlighting
        - Go to definition
        - Code completion
        - Formatting
        """.trimIndent()
    )
    groups.set(listOf("Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"))
}
