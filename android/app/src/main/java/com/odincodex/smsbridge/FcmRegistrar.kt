package com.odincodex.smsbridge

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.concurrent.thread

/**
 * Inscribe el token FCM del telefono en el servidor sms-bridge.
 *
 * Es tolerante a todo: sin Firebase inicializado (APK compilado sin
 * google-services.json) o sin la app configurada, simplemente no hace nada.
 * El servidor guarda el token aunque su FCM este apagado, para que al
 * activarlo despues ya haya telefonos inscritos.
 */
object FcmRegistrar {

    private const val TAG = "FcmRegistrar"

    /** Con token explicito (onNewToken) lo manda directo; sin el, lo pide a FCM. */
    fun register(context: Context, token: String? = null) {
        val settings = Settings(context)
        if (!settings.isConfigured) return
        if (FirebaseApp.getApps(context).isEmpty()) return

        if (token != null) {
            send(settings, token)
            return
        }

        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { current -> send(settings, current) }
            .addOnFailureListener { e ->
                Log.w(TAG, "No se pudo obtener el token FCM: ${e.message}")
            }
    }

    private fun send(settings: Settings, token: String) {
        thread {
            val ok = ApiClient(settings.serverUrl, settings.deviceToken)
                .registerFcmToken(token)
            Log.i(TAG, if (ok) "Token FCM inscrito en el servidor" else "No se pudo inscribir el token FCM")
        }
    }
}
