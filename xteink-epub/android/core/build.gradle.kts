plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    api(libs.jsoup)
    testImplementation(libs.junit)
}

tasks.test {
    useJUnit()
    // Sökvägar till riktiga böcker för end-to-end-testet (hoppas över om de saknas).
    systemProperty("xteink.e2e.dir", System.getProperty("xteink.e2e.dir") ?: "")
    systemProperty("xteink.e2e.out", System.getProperty("xteink.e2e.out") ?: "")
    maxHeapSize = "1g"
    testLogging {
        events("failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = true
    }
}
