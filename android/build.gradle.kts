plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    // Para el push por FCM (opcional): solo se aplica en app/ si existe
    // google-services.json. Sin ese archivo el proyecto compila igual.
    id("com.google.gms.google-services") version "4.4.2" apply false
}
