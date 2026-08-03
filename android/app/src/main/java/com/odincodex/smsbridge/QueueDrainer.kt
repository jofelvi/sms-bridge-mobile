package com.odincodex.smsbridge

import android.content.Context
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Vacia la cola del servidor: pide lo pendiente, lo envia por SMS y reporta.
 *
 * Vive aparte del BridgeService porque ahora hay DOS puertas de entrada: el
 * servicio en primer plano y el aviso de FCM (que en Android moderno puede no
 * tener permiso para levantar un foreground service estando en segundo plano).
 * El candado es estatico a proposito: da igual por donde entre el disparo,
 * solo una pasada corre a la vez.
 */
object QueueDrainer {

    private const val TAG = "QueueDrainer"
    private val draining = AtomicBoolean(false)

    /** Resultado del intento. `sent` = SMS despachados en esta pasada. */
    data class Result(val sent: Int, val failed: Boolean = false, val skipped: Boolean = false)

    fun drain(context: Context): Result {
        val settings = Settings(context)
        if (!settings.isConfigured) return Result(0, skipped = true)
        // Ya hay una pasada en curso (p. ej. el sondeo entro justo antes que
        // el aviso de FCM): dejarla terminar, no duplicar envios.
        if (!draining.compareAndSet(false, true)) return Result(0, skipped = true)

        return try {
            val api = ApiClient(settings.serverUrl, settings.deviceToken)
            val sender = SmsSender(context)
            val pending = api.fetchPending()

            for (message in pending) {
                try {
                    sender.send(message)
                    Log.i(TAG, "Enviando ${message.id} a ${message.phoneNumber}")
                } catch (e: Exception) {
                    // Fallo antes de salir: se reporta de una, sin esperar el
                    // callback del sistema que nunca va a llegar.
                    api.reportResult(message.id, false, e.message ?: "Error al enviar")
                }
            }
            Result(pending.size)
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo vaciar la cola: ${e.message}")
            Result(0, failed = true)
        } finally {
            draining.set(false)
        }
    }
}
