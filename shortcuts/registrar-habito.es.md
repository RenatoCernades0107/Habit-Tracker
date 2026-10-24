# Registrar hábito (español) · v1.0

Siri pregunta qué hábito, lo registra y dice el resultado («Listo, Meditar ✅. Llevas 12 días seguidos.»).

1. **Texto**: pega tu token (`ht_…`). Conviértelo en Pregunta de importación: «Pega tu token de Restart».
2. **Obtener contenido de URL**
   - URL: `https://<app>/api/v1/today`
   - Método: GET
   - Encabezados: `Authorization` = `Bearer ` + *Texto*; `X-Shortcut-Version` = `1.0`
3. **Obtener valor del diccionario**: `pending_count` de *Contenido de URL*.
4. **Si** *Valor del diccionario* es `0`:
   - **Obtener valor del diccionario**: `speech` → **Mostrar resultado** → **Detener este atajo**.
5. **Fin de Si**
6. **Obtener valor del diccionario**: `choices` de *Contenido de URL*.
7. **Elegir de la lista**: *Valor del diccionario*, mensaje «¿Cuál hábito?».
8. **Obtener valor del diccionario**: *Elemento elegido* del diccionario `choices` (paso 6) → el ID del hábito.
9. **Obtener contenido de URL**
   - URL: `https://<app>/api/v1/check-ins`
   - Método: POST, Cuerpo de la solicitud: JSON
   - JSON: `habit_id` = *Valor del diccionario* (paso 8)
   - Encabezados: como en el paso 2
10. **Obtener valor del diccionario**: `speech` → **Mostrar resultado**. Si lo iniciaste con la voz, Siri lo lee.

Llama al atajo **Registrar hábito**. Los errores también traen `speech`: con *Mostrar resultado*
sobre `speech`, Siri dice qué falló (por ejemplo, un token revocado).

## Un solo hábito, sin preguntar («Ya medité»)

1. Duplica **Registrar hábito** y renómbralo, por ejemplo **Ya medité**.
2. Borra los pasos 2–8.
3. En el paso 9, pon en `habit_id` el ID del hábito: ábrelo en Restart → **Copiar ID para Atajos**.

El ID sigue funcionando aunque cambies el nombre del hábito.

## Sin lista: di el nombre

Cambia los pasos 2–8 por **Dictar texto** y envía `query` = *Texto dictado* en lugar de `habit_id`.
El servidor ignora mayúsculas y tildes, entiende alias y responde «¿Cuál? …» (HTTP 409 con
`choices`) si dos hábitos se parecen.
