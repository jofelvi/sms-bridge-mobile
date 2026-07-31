package com.odincodex.smsbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Captura los SMS entrantes y los sube al servidor.
 *
 * Un SMS largo llega partido en varios PDU del mismo remitente: se juntan
 * antes de subirlo para no reportar tres mensajes cortados.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val settings = Settings(context)
        if (!settings.isConfigured) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        val from = messages[0]?.originatingAddress ?: return
        val body = messages.joinToString("") { it?.messageBody ?: "" }
        if (body.isBlank()) return

        // El receiver no puede bloquear el hilo principal.
        Thread {
            try {
                ApiClient(settings.serverUrl, settings.deviceToken)
                    .uploadInbound(from, body)
            } catch (e: Exception) {
                Log.w(TAG, "No se pudo subir el SMS entrante: ${e.message}")
            }
        }.start()
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
