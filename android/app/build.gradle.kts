plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// FCM es OPCIONAL: el plugin de google-services exige google-services.json y
// truena el build si falta. Quien adopte el proyecto sin Firebase compila
// igual; con el archivo presente, el push por FCM queda activo.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.odincodex.smsbridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.odincodex.smsbridge"
        minSdk = 24
        targetSdk = 35
        // 0.4.0 se compilo sin commitear el numero (el codigo era el mismo).
        // Se salta a 5/0.5.0 para que Android no rechace la instalacion por
        // "downgrade" sobre los telefonos que ya tienen la 0.4.0.
        versionCode = 5
        versionName = "0.5.0"
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
    // Push por FCM (tercer canal, junto al WebSocket y al polling). La clase
    // solo se activa si Firebase inicializa (hay google-services.json);
    // sin el, este jar queda dormido y no pesa en runtime.
    implementation("com.google.firebase:firebase-messaging:24.1.0")
}
