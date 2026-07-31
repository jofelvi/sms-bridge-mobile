package com.odincodex.smsbridge

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import android.util.Log

/**
 * Recibe el resultado REAL del envio desde el sistema y se lo reporta al
 * servidor.
 *
 * Es la diferencia entre "llame a la API de Android" y "el SMS salio": sin
 * esto marcariamos como entregado un mensaje que murio por falta de saldo o
 * sin senal.
 */
class SmsSentReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val messageId = intent.getStringExtra(EXTRA_MESSAGE_ID) ?: return
        val code = resultCode

        val error = when (code) {
            Activity.RESULT_OK -> null
            SmsManager.RESULT_ERROR_NO_SERVICE -> "Sin servicio"
            SmsManager.RESULT_ERROR_RADIO_OFF -> "Radio apagada"
            SmsManager.RESULT_ERROR_NULL_PDU -> "PDU nulo"
            SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Fallo generico del envio"
            else -> "Error de envio (codigo $code)"
        }

        val settings = Settings(context)
        if (!settings.isConfigured) return

        // El BroadcastReceiver no puede bloquear: se reporta en un hilo aparte.
        Thread {
            try {
                ApiClient(settings.serverUrl, settings.deviceToken)
                    .reportResult(messageId, error == null, error)
            } catch (e: Exception) {
                Log.w(TAG, "No se pudo reportar el resultado: ${e.message}")
            }
        }.start()
    }

    companion object {
        const val EXTRA_MESSAGE_ID = "message_id"
        private const val TAG = "SmsSentReceiver"
    }
}
