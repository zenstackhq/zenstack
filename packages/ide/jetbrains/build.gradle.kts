plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.21"
    id("org.jetbrains.intellij") version "1.16.1"
}

group = "dev.zenstack"
version = "2.0.0-alpha.1"

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
        sinceBuild.set("231")
        untilBuild.set("241.*")
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
