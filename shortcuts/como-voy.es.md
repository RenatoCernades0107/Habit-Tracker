# Cómo voy (español) · v1.0

Dice la puntuación de hoy y lo que falta («Vas 56%. Te faltan Leer, Agua y Diario. Gimnasio: 2 de 4 esta semana.»).

1. **Texto**: tu token (Pregunta de importación).
2. **Obtener contenido de URL**: `https://<app>/api/v1/summary`, GET, encabezados
   `Authorization` = `Bearer ` + *Texto* y `X-Shortcut-Version` = `1.0`.
3. **Obtener valor del diccionario**: `speech` → **Mostrar resultado**.

Llámalo **Cómo voy**.
