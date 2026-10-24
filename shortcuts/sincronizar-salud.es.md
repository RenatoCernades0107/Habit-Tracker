# Sincronizar Salud (español) · v1.0

Envía los totales diarios de Apple Salud de hoy y de ayer a Restart, que completa los hábitos con
una regla de Salud (por ejemplo, pasos ≥ 5.000). Ejecútalo con automatizaciones varias veces al día.

Para **cada métrica que usen tus hábitos** (pasos, minutos de ejercicio, energía activa, distancia
caminando y corriendo, minutos de atención plena, entrenamientos, sueño):

1. **Buscar muestras de Salud** cuyo *Tipo* es la métrica y *Fecha de inicio* es *hoy*.
2. **Calcular estadísticas** → *Suma* de las muestras (para entrenamientos: *Recuento*).
3. **Diccionario**: `metric` = `steps` (el nombre de la API), `date` = **Formatear fecha** (hoy,
   formato personalizado `yyyy-MM-dd`), `value` = la suma. **Añadir a variable** `Métricas`.
4. Repite los pasos 1–3 para **ayer** (datos que llegan tarde desde un Apple Watch).

Después:

5. **Texto**: tu token (Pregunta de importación).
6. **Obtener contenido de URL**: `https://<app>/api/v1/health`, POST, cuerpo JSON `metrics` =
   *Métricas*, encabezados `Authorization` = `Bearer ` + *Texto* y `X-Shortcut-Version` = `1.0`.
7. **Obtener valor del diccionario**: `speech` → **Mostrar resultado** (no se ve si lo ejecuta una
   automatización).

Nombres de la API: `steps`, `exercise_minutes`, `active_energy_kcal`, `distance_km`,
`mindful_minutes`, `workouts`, `sleep_hours`.

## Automatizaciones

Atajos → **Automatización** → **Hora del día**: 12:00, 18:00, 21:00 y 15 minutos antes de tu
resumen diario. Elige **Ejecutar inmediatamente** y desactiva **Notificar al ejecutar**.

## Notas (spike S3)

- El iPhone y el Apple Watch registran pasos; comprueba que la suma coincide con la app Salud. Si es
  mayor, filtra las muestras por origen o usa un solo dispositivo.
- Sueño: suma las muestras *Dormido* de la noche que termina hoy, para que cuente el día en que te
  despiertas.
- Salud no se puede leer con el iPhone bloqueado; varias automatizaciones y la pasada de «ayer» lo
  compensan.
