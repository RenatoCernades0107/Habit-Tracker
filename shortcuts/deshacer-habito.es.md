# Deshacer hábito (español) · v1.0

Deshace el último registro de hoy, venga de donde venga, y dice qué deshizo («Deshice Meditar.»).

1. **Texto**: tu token (Pregunta de importación).
2. **Obtener contenido de URL**: `https://<app>/api/v1/check-ins/undo`, POST, cuerpo JSON `{}`,
   encabezados `Authorization` = `Bearer ` + *Texto* y `X-Shortcut-Version` = `1.0`.
3. **Obtener valor del diccionario**: `speech` → **Mostrar resultado**.

Llámalo **Deshacer hábito**. Si no hay nada que deshacer, Siri dice «No hay nada que deshacer hoy.»
