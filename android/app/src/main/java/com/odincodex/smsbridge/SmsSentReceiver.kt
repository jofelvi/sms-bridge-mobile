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
        val isDeliveryReport = intent.getBooleanExtra(EXTRA_IS_DELIVERY, false)
        val code = resultCode

        // Dos eventos distintos, y confundirlos fue un error real:
        //   sentIntent     -> la OPERADORA acepto el mensaje
        //   deliveryIntent -> el TELEFONO DEL DESTINATARIO lo recibio
        // Un SMS puede ser aceptado por la operadora y no llegar nunca (sin
        // saldo, numero inexistente, bloqueo). Solo el acuse de entrega
        // prueba que llego.
        if (isDeliveryReport) {
            val delivered = code == Activity.RESULT_OK
            reportAsync(
                context,
                messageId,
                delivered,
                if (delivered) null else "La operadora no confirmo la entrega",
                markDelivered = true,
            )
            return
        }

        val error = when (code) {
            Activity.RESULT_OK -> null
            SmsManager.RESULT_ERROR_NO_SERVICE -> "Sin servicio"
            SmsManager.RESULT_ERROR_RADIO_OFF -> "Radio apagada"
            SmsManager.RESULT_ERROR_NULL_PDU -> "PDU nulo"
            SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Fallo generico del envio"
            else -> "Error de envio (codigo $code)"
        }

        // Si la operadora lo acepto, NO se marca entregado todavia: se espera
        // el acuse real. Solo se reporta de una cuando fallo.
        if (error == null) {
            Log.i(TAG, "Operadora acepto $messageId; esperando acuse de entrega")
            return
        }
        reportAsync(context, messageId, false, error, markDelivered = false)
    }

    /** El BroadcastReceiver no puede bloquear: se reporta en un hilo aparte. */
    private fun reportAsync(
        context: Context,
        messageId: String,
        ok: Boolean,
        error: String?,
        markDelivered: Boolean,
    ) {
        val settings = Settings(context)
        if (!settings.isConfigured) return

        Thread {
            try {
                ApiClient(settings.serverUrl, settings.deviceToken)
                    .reportResult(messageId, ok && markDelivered, error)
            } catch (e: Exception) {
                Log.w(TAG, "No se pudo reportar el resultado: ${e.message}")
            }
        }.start()
    }

    companion object {
        const val EXTRA_MESSAGE_ID = "message_id"
        const val EXTRA_IS_DELIVERY = "is_delivery_report"
        private const val TAG = "SmsSentReceiver"
    }
}
