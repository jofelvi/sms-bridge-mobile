plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.odincodex.smsbridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.odincodex.smsbridge"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            // Firmado con la clave de debug a proposito: es un APK de prueba
            // para instalar por sideload, no una publicacion de Play Store.
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        // BridgeService reporta BuildConfig.VERSION_NAME en el heartbeat.
        // En AGP 8 esto viene apagado por defecto.
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Sin OkHttp ni Retrofit a proposito: HttpURLConnection y org.json vienen
    // en Android, asi el APK queda minimo y la compilacion no depende de
    // resolver dependencias externas.
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
