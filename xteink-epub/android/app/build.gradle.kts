import com.android.build.api.variant.impl.VariantOutputImpl

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val appVersionName = "0.1.0"
val appVersionCode = 1

android {
    namespace = "se.felixarvid.xteinkepub"
    compileSdk = 35

    defaultConfig {
        applicationId = "se.felixarvid.xteinkepub"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
    }

    // The key is committed on purpose (see android/README.md): every build, local or CI, is signed
    // with the same key so that updates install over each other. It is only for personal sideloading.
    signingConfigs {
        create("release") {
            storeFile = file("xteink-release.jks")
            storePassword = "xteink-epub"
            keyAlias = "xteink"
            keyPassword = "xteink-epub"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/LICENSE*", "/META-INF/DEPENDENCIES")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// APK file name: xteink-epub-<versionName>.apk
androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { output ->
            if (output is VariantOutputImpl) {
                val suffix = if (variant.buildType == "release") "" else "-${variant.buildType}"
                output.outputFileName.set("xteink-epub-$appVersionName$suffix.apk")
            }
        }
    }
}

// Used by CI to name the release: ./gradlew -q :app:printVersionName
tasks.register("printVersionName") {
    val name = appVersionName
    doLast { println(name) }
}

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.documentfile)
    implementation(libs.androidx.exifinterface)
    implementation(libs.kotlinx.coroutines.android)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.core)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}

tasks.withType<Test>().configureEach {
    maxHeapSize = "2g"
    // Real books for the end-to-end test (skipped when unset), see android/README.md.
    systemProperty("xteink.e2e.dir", System.getProperty("xteink.e2e.dir") ?: "")
    systemProperty("xteink.e2e.out", System.getProperty("xteink.e2e.out") ?: "")
    testLogging {
        events("failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = true
    }
}
