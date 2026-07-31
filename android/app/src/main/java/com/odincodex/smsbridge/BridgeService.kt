package com.odincodex.smsbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Servicio en primer plano que mantiene viva la pasarela.
 *
 * Tiene que ser foreground service con notificacion fija: Android mata los
 * servicios en segundo plano, y una pasarela que se muere en silencio es peor
 * que no tenerla. Aun asi, el usuario debe excluir la app de la optimizacion
 * de bateria (la app se lo pide desde la pantalla principal).
 */
class BridgeService : Service() {

    private var job: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification("Iniciando..."))

        if (job?.isActive != true) {
            job = scope.launch { loop() }
        }

        // START_STICKY: si el sistema mata el proceso, que lo reviva.
        return START_STICKY
    }

    private suspend fun loop() {
        val settings = Settings(applicationContext)
        val sender = SmsSender(applicationContext)
        var heartbeatTick = 0

        while (scope.isActive) {
            if (!settings.isConfigured) {
                updateNotification("Sin configurar")
                delay(10_000)
                continue
            }

            val api = ApiClient(settings.serverUrl, settings.deviceToken)

            try {
                val pending = api.fetchPending()
                for (message in pending) {
                    try {
                        sender.send(message)
                        Log.i(TAG, "Enviando ${message.id} a ${message.phoneNumber}")
                    } catch (e: Exception) {
                        // El envio fallo antes de salir: se reporta de una, sin
                        // esperar el callback que nunca va a llegar.
                        api.reportResult(message.id, false, e.message ?: "Error al enviar")
                    }
                }

                // Heartbeat cada ~4 vueltas para no gastar bateria de mas.
                if (heartbeatTick++ % 4 == 0) {
                    api.heartbeat(batteryLevel(), BuildConfig.VERSION_NAME)
                }

                updateNotification(
                    if (pending.isEmpty()) "Conectado · esperando mensajes"
                    else "Enviados ${pending.size} mensaje(s)"
                )
            } catch (e: Exception) {
                Log.w(TAG, "Ciclo fallido: ${e.message}")
                updateNotification("Sin conexion con el servidor")
            }

            delay(settings.pollSeconds * 1000L)
        }
    }

    private fun batteryLevel(): Int {
        return try {
            val manager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        } catch (e: Exception) {
            -1
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Pasarela SMS",
            NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "Mantiene la pasarela conectada" }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("Pasarela SMS activa")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    override fun onDestroy() {
        job?.cancel()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "BridgeService"
        private const val CHANNEL_ID = "sms_bridge"
        private const val NOTIFICATION_ID = 1

        fun start(context: Context) {
            val intent = Intent(context, BridgeService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, BridgeService::class.java))
        }
    }
}
