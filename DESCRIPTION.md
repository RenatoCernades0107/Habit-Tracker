# Habit Tracker

Una app ue permite rastrear tus habitos. Puediendo registrarlos a traves de Siri con comando de voz y ver tus estadisticas en una app PWA desde el celular o el ordenador.

## Requerimientos funcionales

### Registro de hábitos

1. Los habitos se registran desde la app.
2. Se define la categoria del habito, la frecuencia, los dias, la descripcion.

### Registro de cumplimiento

1. A travez de Siri, con un comando personalizado uno podra registrar el cumplimiento de uno de los habitos.
2. A travez de app se podra registrar el cumplimiento tmb. 

### Recordatorio

1. Para las personas con la app PWA en el cel o en el ordenador, recibiran recordatorios 5 minutos antes (o que ellos eligan que tanto antes).
2. Informe diario: Al final del día (el usuario elige la hora). Se le enviara una notificacion con el % de cumplimiento del día.
3. Al inicio del día y casi al final del se le enviara una lista con las actividades de la mañana o noche. La idea es que la rutina normalmente se divida en 2, rutina de mañana y rutina de noche. Pero se podrían haber más.

### Integraciones

1. Se conecta con la app Salud de Iphone de acuerdo a tus habitos. Por ejemplo dar 5000 pasos diarios -> App verifica si pasos diarios >= 5000. O Entrenar 4 veces a la semana (L, M, J y V) -> App verifica datos de entrenamiento de de la app Salud. 
2. Conexion con Calendar, agrega a tu calendario los habitos. Y cuando le dices a Siri que ya completaste un habito, se marca en tu calendar como completado.

## Requerimientos no funcionales

1. Se ve desde celular o ordenador
2. La carga de las vista y las actualizaciones deben ser en poco < 100ms.
3. Interfaz intuitiva
4. Patrones de diseño UI/UX avanzados