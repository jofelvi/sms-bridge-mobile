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
        versionCode = 3
        versionName = "0.3.0"
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
    // Las llamadas REST van con HttpURLConnection + org.json (vienen en
    // Android): sin dependencias que resolver y APK mas liviano.
    //
    // OkHttp entra SOLO por el WebSocket del push: Android no trae un cliente
    // WebSocket usable (el de java.net.http exige API 33+ y nuestro minSdk
    // es 24). Ademas aporta ping/pong y reconexion, que habria que reescribir
    // a mano sobre sockets crudos.
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
