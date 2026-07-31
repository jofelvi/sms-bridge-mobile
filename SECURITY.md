# Seguridad

## Modelo de amenazas

Este proyecto mueve **SMS reales que cuestan dinero** y da acceso a la línea
telefónica de quien lo instala. Las decisiones de seguridad parten de eso.

### Dos credenciales, no una

| Credencial | Quién la usa | Qué permite |
|---|---|---|
| `API_KEY` | Tu backend | Encolar SMS y consultar mensajes |
| `DEVICE_TOKEN` | El teléfono | Tomar la cola, reportar resultados, subir entrantes |

Están separadas **a propósito**: si pierdes el teléfono, revocas su token sin
tocar la clave de tu backend. El token del dispositivo **no puede encolar
mensajes**, así que un teléfono robado no puede gastar tu saldo.

El servidor **no arranca** si ambas son iguales o si falta alguna.

### Qué está implementado

- **Comparación en tiempo constante** de los tokens (`timingSafeEqual`): el
  tiempo de respuesta no filtra cuántos caracteres acertó un atacante.
- **Autenticación del WebSocket en el handshake**: un token inválido recibe
  401 y el socket nunca llega a establecerse.
- **Token del WebSocket por cabecera** en el cliente Android, no por query: las
  URLs quedan escritas en los logs de nginx y de cualquier proxy intermedio.
  El servidor acepta `?token=` para clientes que no puedan mandar cabeceras,
  pero úsalo solo en pruebas.
- **Rate limit** por IP: 120 req/min en la API pública y 240 req/min en la del
  dispositivo. Frena la fuerza bruta sobre los tokens y evita que un bug en tu
  backend vacíe tu saldo antes de que lo notes.
- **Consultas parametrizadas** en todo el acceso a SQLite (sin concatenar SQL).
- **Cuerpo limitado** a 256 kB y `limit` de los listados acotado a 500.
- **Idempotencia** por `clientMessageId`: un reintento no manda dos SMS.

### Lo que TIENES que hacer tú

1. **Pon HTTPS en producción.** El token viaja en cada petición. Sin TLS,
   cualquiera en la red lo lee. Usa nginx, Caddy o Cloudflare Tunnel delante.
   La app permite HTTP en claro para poder probar en una red local; eso **no**
   es una configuración de producción.
2. **Genera claves largas y aleatorias.** Están los comandos en el README. No
   uses palabras.
3. **No expongas el servidor a internet si no hace falta.** Si tu backend y la
   pasarela están en la misma red, mantenlo dentro.
4. **Cuida el teléfono.** Quien lo tenga desbloqueado puede leer el token en la
   pantalla de configuración.

### Privacidad

Los cuerpos de los SMS se guardan en tu base SQLite, en tu servidor. Nadie más
los ve — esa es la razón de ser del proyecto. Aun así, **son datos personales**:
si guardas mensajes de clientes, aplica la retención que exija tu jurisdicción y
limita el acceso al archivo `.db`.

### Limitaciones conocidas

- El rate limit vive **en memoria**: si algún día corres el servidor replicado,
  hay que mover el contador a un almacén compartido.
- No hay rotación automática de tokens: se cambian editando el `.env` y
  reiniciando.
- El APK de las releases está firmado con la clave de depuración de Android (es
  para instalar por sideload, no para Play Store). Si te importa la cadena de
  confianza, **compílalo tú** desde el código: son dos comandos.

## Reportar una vulnerabilidad

Abre un issue con el prefijo `[security]`. Si el fallo permite enviar mensajes
en nombre de otro o extraer tokens, escribe en privado al autor antes de
publicarlo.
