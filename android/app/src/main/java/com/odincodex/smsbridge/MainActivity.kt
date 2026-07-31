package com.odincodex.smsbridge

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings as AndroidSettings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private lateinit var settings: Settings
    private lateinit var urlInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        settings = Settings(this)

        urlInput = findViewById(R.id.input_url)
        tokenInput = findViewById(R.id.input_token)
        statusText = findViewById(R.id.text_status)

        urlInput.setText(settings.serverUrl)
        tokenInput.setText(settings.deviceToken)
        refreshStatus()

        findViewById<Button>(R.id.button_save).setOnClickListener { save() }
        findViewById<Button>(R.id.button_test).setOnClickListener { testConnection() }
        findViewById<Button>(R.id.button_start).setOnClickListener { startBridge() }
        findViewById<Button>(R.id.button_stop).setOnClickListener { stopBridge() }
        findViewById<Button>(R.id.button_battery).setOnClickListener { askBatteryExemption() }

        requestPermissions()
    }

    private fun requestPermissions() {
        val needed = mutableListOf(Manifest.permission.SEND_SMS, Manifest.permission.RECEIVE_SMS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1)
        }
    }

    private fun save() {
        val url = urlInput.text.toString().trim()
        val token = tokenInput.text.toString().trim()

        if (url.isBlank() || token.isBlank()) {
            toast("Completa la URL y el token")
            return
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            toast("La URL debe empezar con http:// o https://")
            return
        }

        settings.serverUrl = url
        settings.deviceToken = token
        toast("Guardado")
        refreshStatus()
    }

    private fun testConnection() {
        if (!settings.isConfigured) {
            toast("Guarda primero la configuracion")
            return
        }
        statusText.text = "Probando conexion..."
        thread {
            val result = ApiClient(settings.serverUrl, settings.deviceToken).testConnection()
            runOnUiThread { statusText.text = result }
        }
    }

    private fun startBridge() {
        if (!settings.isConfigured) {
            toast("Guarda primero la configuracion")
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            toast("Falta el permiso para enviar SMS")
            requestPermissions()
            return
        }

        settings.running = true
        BridgeService.start(this)
        toast("Pasarela encendida")
        refreshStatus()
    }

    private fun stopBridge() {
        settings.running = false
        BridgeService.stop(this)
        toast("Pasarela apagada")
        refreshStatus()
    }

    /**
     * Sin esta exclusion Android duerme la app y la pasarela deja de responder
     * despues de un rato. Es la causa numero uno de fallos silenciosos.
     */
    private fun askBatteryExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            toast("No aplica en esta version de Android")
            return
        }
        val power = getSystemService(POWER_SERVICE) as PowerManager
        if (power.isIgnoringBatteryOptimizations(packageName)) {
            toast("Ya esta excluida de la optimizacion de bateria")
            return
        }
        try {
            startActivity(
                Intent(
                    AndroidSettings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName"),
                )
            )
        } catch (e: Exception) {
            startActivity(Intent(AndroidSettings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun refreshStatus() {
        statusText.text = when {
            !settings.isConfigured -> "Sin configurar"
            settings.running ->
                "Pasarela ENCENDIDA · push instantaneo\n" +
                    "(respaldo cada ${settings.pollSeconds / 60} min por si el push se cae)"
            else -> "Configurada · pasarela apagada"
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
