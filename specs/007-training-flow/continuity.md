# Continuidad de seguimiento — T180

La ficha del alumno prioriza el programa vigente (o el próximo, o la preparación de uno), el último entrenamiento y todos los comentarios pendientes de ese alumno, incluso si pertenecen a un entrenamiento fuera de los diez recientes. Una lectura fallida de comentarios se muestra como error recuperable, nunca como cero. Se conservan los accesos a historial, marcas, medidas y cuenta.

El periodo de progreso conserva el valor existente por defecto: ocho semanas. Admite cuatro, ocho o doce; la métrica es 1RM o volumen (en peso corporal sigue correspondiendo repeticiones). Se conserva alumno, periodo y métrica al abrir evidencia, volver a progreso/ficha y adaptar, copiar o asignar una planificación. No cambia qué representa el último entrenamiento ni se filtran comentarios pendientes por el periodo del gráfico.

Las direcciones de retorno se construyen con rutas internas conocidas, UUID válidos y valores cerrados. No se acepta returnTo ni una URL arbitraria. En resultados, la identidad del alumno procede del entrenamiento autorizado por RLS; una query ajena no la reemplaza. Volver a un ejercicio requiere que pertenezca al entrenamiento consultado. Las rutas del coach mantienen requireCoach y las consultas usan el cliente autenticado.

Las bases asignadas muestran alumno y fechas para distinguir programas con el mismo nombre. La búsqueda admite también el nombre del alumno de la base. Elegir esa base conserva el alumno destinatario independiente de quién realizó el programa anterior. No se amplían permisos ni hay nuevas escrituras automáticas.

Aceptación: ficha con comentario de un entrenamiento anterior a los diez recientes → evidencia → ficha; ficha → progreso a doce semanas/volumen → evidencia → mismo progreso → ficha; ficha → planificación/base → copia → revisión/asignación → ficha sin perder contexto. Comprobar 360 px, ambos temas, teclado y contraste. Queries malformadas o ajenas no crean retornos externos ni cambian el propietario visible.
