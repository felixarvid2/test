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
}
