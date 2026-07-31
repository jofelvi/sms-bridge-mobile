package com.odincodex.smsbridge

import android.content.Context

/**
 * Configuracion del emparejado. Se guarda en SharedPreferences: es lo unico
 * que la app necesita recordar entre arranques.
 */
class Settings(context: Context) {

    private val prefs =
        context.getSharedPreferences("sms-bridge", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString(KEY_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_URL, value.trim().trimEnd('/')).apply()

    var deviceToken: String
        get() = prefs.getString(KEY_TOKEN, "") ?: ""
        set(value) = prefs.edit().putString(KEY_TOKEN, value.trim()).apply()

    /**
     * Intervalo de la RED DE SEGURIDAD, no del canal principal: los mensajes
     * llegan por push (WebSocket) al instante. Este sondeo largo solo cubre el
     * caso de que el socket se caiga sin avisar, sin gastar bateria.
     */
    var pollSeconds: Int
        get() = prefs.getInt(KEY_POLL, 300)
        set(value) = prefs.edit().putInt(KEY_POLL, value.coerceIn(30, 3600)).apply()

    /** Si el usuario dejo el puente encendido; se usa para reanudar al reiniciar. */
    var running: Boolean
        get() = prefs.getBoolean(KEY_RUNNING, false)
        set(value) = prefs.edit().putBoolean(KEY_RUNNING, value).apply()

    val isConfigured: Boolean
        get() = serverUrl.isNotBlank() && deviceToken.isNotBlank()

    companion object {
        private const val KEY_URL = "server_url"
        private const val KEY_TOKEN = "device_token"
        private const val KEY_POLL = "poll_seconds"
        private const val KEY_RUNNING = "running"
    }
}
