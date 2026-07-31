package com.odincodex.smsbridge

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

/**
 * Canal push: mantiene un WebSocket abierto contra el servidor y avisa en
 * cuanto hay un mensaje por enviar.
 *
 * El servicio ya corre 24/7 en primer plano (obligatorio para poder enviar),
 * asi que sostener el socket no cuesta nada extra. El polling del servicio
 * queda como red de seguridad a intervalo largo por si el socket se cae sin
 * avisar (tipico en redes moviles).
 */
class PushClient(
    private val serverUrl: String,
    private val token: String,
    private val onNewMessage: () -> Unit,
    private val onStateChange: (Boolean) -> Unit,
) {

    private val client = OkHttpClient.Builder()
        // Ping propio: si la red movil se cae sin cerrar el socket, esto lo
        // detecta y dispara la reconexion en vez de quedarse mudo para siempre.
        .pingInterval(30, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private var socket: WebSocket? = null
    private var closedByUs = false
    private var retryAttempt = 0

    @Volatile
    var connected: Boolean = false
        private set

    fun connect() {
        closedByUs = false
        open()
    }

    private fun open() {
        val wsUrl = serverUrl
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            .trimEnd('/') + "/ws/device?token=$token"

        val request = Request.Builder().url(wsUrl).build()

        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true
                retryAttempt = 0
                onStateChange(true)
                Log.i(TAG, "Push conectado")
                // Al (re)conectar puede haber quedado trabajo pendiente
                // mientras el socket estuvo caido.
                onNewMessage()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.contains("new-message")) {
                    Log.i(TAG, "Push: hay mensajes")
                    onNewMessage()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                connected = false
                onStateChange(false)
                Log.w(TAG, "Push caido: ${t.message}")
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                connected = false
                onStateChange(false)
                scheduleReconnect()
            }
        })
    }

    /** Backoff exponencial con tope de 60s: no martillea al servidor caido. */
    private fun scheduleReconnect() {
        if (closedByUs) return
        val delaySeconds = minOf(60, 2 shl minOf(retryAttempt, 5))
        retryAttempt++

        Thread {
            try {
                Thread.sleep(delaySeconds * 1000L)
                if (!closedByUs) open()
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }.start()
    }

    fun disconnect() {
        closedByUs = true
        connected = false
        socket?.close(1000, "cerrado por la app")
        socket = null
    }

    companion object {
        private const val TAG = "PushClient"
    }
}
