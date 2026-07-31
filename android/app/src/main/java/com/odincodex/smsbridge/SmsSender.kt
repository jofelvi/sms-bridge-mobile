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
        val destination = message.phoneNumber

        val sentIntent = Intent(context, SmsSentReceiver::class.java)
            .putExtra(SmsSentReceiver.EXTRA_MESSAGE_ID, message.id)

        val deliveryIntent = Intent(context, SmsSentReceiver::class.java)
            .putExtra(SmsSentReceiver.EXTRA_MESSAGE_ID, message.id)
            .putExtra(SmsSentReceiver.EXTRA_IS_DELIVERY, true)

        // FLAG_IMMUTABLE es obligatorio desde Android 12.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        if (parts.size == 1) {
            val pending = PendingIntent.getBroadcast(
                context,
                message.id.hashCode(),
                sentIntent,
                flags,
            )
            // requestCode distinto del sentIntent: con el mismo, Android
            // reutilizaria el PendingIntent y se perderia uno de los dos avisos.
            val delivery = PendingIntent.getBroadcast(
                context,
                message.id.hashCode() + DELIVERY_OFFSET,
                deliveryIntent,
                flags,
            )
            smsManager.sendTextMessage(
                destination,
                null,
                message.body,
                pending,
                delivery,
            )
            return
        }

        // Multipart: solo la ULTIMA parte reporta, para no mandar varias
        // confirmaciones del mismo mensaje al servidor.
        val sentIntents = ArrayList<PendingIntent>(parts.size)
        val deliveryIntents = ArrayList<PendingIntent>(parts.size)

        parts.forEachIndexed { index, _ ->
            val isLast = index == parts.size - 1
            val sent = if (isLast) sentIntent else Intent(context, SmsSentReceiver::class.java)
            val delivered =
                if (isLast) deliveryIntent else Intent(context, SmsSentReceiver::class.java)

            sentIntents.add(
                PendingIntent.getBroadcast(
                    context,
                    message.id.hashCode() + index,
                    sent,
                    flags,
                )
            )
            deliveryIntents.add(
                PendingIntent.getBroadcast(
                    context,
                    message.id.hashCode() + DELIVERY_OFFSET + index,
                    delivered,
                    flags,
                )
            )
        }

        smsManager.sendMultipartTextMessage(
            destination,
            null,
            parts,
            sentIntents,
            deliveryIntents,
        )
    }

    private companion object {
        /** Separa los requestCode de envio y de entrega del mismo mensaje. */
        const val DELIVERY_OFFSET = 1_000_000
    }
}
