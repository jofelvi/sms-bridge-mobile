package com.odincodex.smsbridge

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsManager

/**
 * Envia el SMS por la linea del telefono.
 *
 * Los mensajes de mas de 160 caracteres se parten con divideMessage y se
 * mandan como multipart: si se enviaran de una, la operadora los corta.
 */
class SmsSender(private val context: Context) {

    private val smsManager: SmsManager
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

    fun send(message: PendingMessage) {
        val parts = smsManager.divideMessage(message.body)

        val sentIntent = Intent(context, SmsSentReceiver::class.java)
            .putExtra(SmsSentReceiver.EXTRA_MESSAGE_ID, message.id)

        // FLAG_IMMUTABLE es obligatorio desde Android 12.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        if (parts.size == 1) {
            val pending = PendingIntent.getBroadcast(
                context,
                message.id.hashCode(),
                sentIntent,
                flags,
            )
            smsManager.sendTextMessage(
                message.phoneNumber,
                null,
                message.body,
                pending,
                null,
            )
            return
        }

        // Multipart: solo la ULTIMA parte reporta el resultado, para no mandar
        // varias confirmaciones del mismo mensaje al servidor.
        val sentIntents = ArrayList<PendingIntent>(parts.size)
        parts.forEachIndexed { index, _ ->
            val isLast = index == parts.size - 1
            val intent = if (isLast) sentIntent else Intent(context, SmsSentReceiver::class.java)
            sentIntents.add(
                PendingIntent.getBroadcast(
                    context,
                    message.id.hashCode() + index,
                    intent,
                    flags,
                )
            )
        }

        smsManager.sendMultipartTextMessage(
            message.phoneNumber,
            null,
            parts,
            sentIntents,
            null,
        )
    }
}
