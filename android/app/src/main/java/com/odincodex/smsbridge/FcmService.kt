package com.odincodex.smsbridge

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Tercer canal de aviso (junto al WebSocket y al polling): FCM.
 *
 * Su gracia es la bateria: viaja por la conexion unica que Google Play
 * Services ya mantiene para todo el telefono, asi que puede despertar la app
 * aunque Android la tenga dormida (Doze) sin que nosotros sostengamos nada.
 *
 * Solo funciona si el APK se compilo con google-services.json; sin el,
 * Firebase nunca inicializa y esta clase simplemente no recibe nada.
 * Drenar la cola es idempotente: si llegan a la vez el aviso del socket,
 * el de FCM y el sondeo, el AtomicBoolean del BridgeService deja pasar uno.
 */
class FcmService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["type"] == "new-message") {
            Log.i(TAG, "Aviso por FCM: hay mensajes en cola")
            BridgeService.drainNow(applicationContext)
        }
    }

    /** FCM rota el token cuando quiere: hay que reinscribirlo en el servidor. */
    override fun onNewToken(token: String) {
        FcmRegistrar.register(applicationContext, token)
    }

    private companion object {
        const val TAG = "FcmService"
    }
}
