package com.odincodex.smsbridge

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/** Un SMS por enviar, tal como lo entrega el servidor. */
data class PendingMessage(
    val id: String,
    val phoneNumber: String,
    val body: String,
)

/**
 * Cliente HTTP contra el servidor sms-bridge. Usa HttpURLConnection (viene en
 * Android) para no arrastrar dependencias: menos peso y menos que romper.
 *
 * Ningun metodo lanza excepciones hacia arriba: la pasarela corre sola en
 * segundo plano y un fallo de red no puede tumbar el servicio.
 */
class ApiClient(private val baseUrl: String, private val token: String) {

    private fun open(path: String, method: String): HttpURLConnection {
        val conn = URL("$baseUrl$path").openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.connectTimeout = 15_000
        conn.readTimeout = 20_000
        return conn
    }

    private fun readBody(conn: HttpURLConnection): String {
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        return stream?.bufferedReader()?.use(BufferedReader::readText) ?: ""
    }

    private fun postJson(path: String, payload: JSONObject): Boolean {
        return try {
            val conn = open(path, "POST")
            conn.doOutput = true
            conn.outputStream.use { it.write(payload.toString().toByteArray()) }
            val ok = conn.responseCode in 200..299
            conn.disconnect()
            ok
        } catch (e: Exception) {
            false
        }
    }

    /** Reclama los mensajes por enviar. Lista vacia si algo falla. */
    fun fetchPending(): List<PendingMessage> {
        return try {
            val conn = open("/api/device/pending", "GET")
            if (conn.responseCode !in 200..299) {
                conn.disconnect()
                return emptyList()
            }
            val json = JSONObject(readBody(conn))
            conn.disconnect()

            val array: JSONArray = json.optJSONArray("messages") ?: JSONArray()
            (0 until array.length()).mapNotNull { i ->
                val item = array.optJSONObject(i) ?: return@mapNotNull null
                val id = item.optString("id")
                val phone = item.optString("phone_number")
                val body = item.optString("body")
                if (id.isBlank() || phone.isBlank()) null
                else PendingMessage(id, phone, body)
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /** Reporta si el SMS salio o fallo. */
    fun reportResult(id: String, delivered: Boolean, error: String? = null): Boolean {
        val payload = JSONObject()
            .put("id", id)
            .put("status", if (delivered) "delivered" else "failed")
        if (error != null) payload.put("error", error)
        return postJson("/api/device/result", payload)
    }

    /** Sube un SMS entrante. */
    fun uploadInbound(from: String, body: String): Boolean {
        return postJson(
            "/api/device/inbox",
            JSONObject().put("from", from).put("body", body),
        )
    }

    /** Señal de vida para que el servidor sepa que el telefono sigue vivo. */
    fun heartbeat(batteryLevel: Int, appVersion: String): Boolean {
        return postJson(
            "/api/device/heartbeat",
            JSONObject()
                .put("batteryLevel", batteryLevel)
                .put("appVersion", appVersion),
        )
    }

    /** Comprueba que la URL y el token sean correctos (para el boton Probar). */
    fun testConnection(): String {
        return try {
            val conn = open("/api/device/pending", "GET")
            val code = conn.responseCode
            conn.disconnect()
            when {
                code in 200..299 -> "OK: conectado al servidor"
                code == 401 -> "Token incorrecto (401)"
                else -> "El servidor respondio $code"
            }
        } catch (e: Exception) {
            "No se pudo conectar: ${e.message}"
        }
    }
}
