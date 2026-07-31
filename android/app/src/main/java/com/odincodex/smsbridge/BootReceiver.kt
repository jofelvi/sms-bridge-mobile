package com.odincodex.smsbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Reanuda la pasarela al reiniciar el telefono, pero solo si el usuario la
 * habia dejado encendida. Sin esto, un corte de luz deja la pasarela muerta
 * hasta que alguien note que no salen mensajes.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val settings = Settings(context)
        if (settings.isConfigured && settings.running) {
            BridgeService.start(context)
        }
    }
}
