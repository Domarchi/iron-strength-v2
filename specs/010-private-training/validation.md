# Estado y evidencia

## T209 · Inicio del alcance

26 de octubre de 2026: el propietario pidió la experiencia y funciones de Hevy y confirmó entrenamiento/planificación privados para coach y alumnos. Se inventariaron cliente nativo, contratos, guardado y RLS existentes. El SQL admite FKs nulas por compatibilidad histórica, pero la API/borrador actual exige programa/sesión: eso no acredita un recorrido de entrenamiento libre.

La biblioteca SQL tiene al menos 467 entradas según su integración vigente; listExercises tiene límite predeterminado 200, por lo que T210 debe leer páginas y comprobar completitud. Los alumnos ven base y ejercicios activos de su coach; no pueden escribir ejercicios. Se conserva esa frontera hasta la extensión explícita de propiedad personal.

Referencias primarias: [funciones de Hevy](https://www.hevyapp.com/features/), [rutinas y carpetas](https://www.hevyapp.com/features/gym-routines/), [tipos de serie](https://www.hevyapp.com/features/workout-set-types/), [entrenamiento libre](https://www.hevyapp.com/features/start-empty-workout/) y [calculadora de discos](https://www.hevyapp.com/features/weight-plate-calculator/). Son referencias funcionales; no código original recuperado o aceptación de nuestra app.

REA de T208 se conserva en docs/research/hevy-rea.md. Se adquirieron seis recursos JavaScript públicos enumerados en el manifiesto actual y se inició análisis focalizado de rutinas/editor/ejercicio con REA 6.7.0; resultados y límites se registran al terminar. Archivos, hashes y Evidence completos fuera de Git, en work/hevy-training-20261026. No inicio de sesión, ejecución de bundles ni acceso a datos de usuarios de Hevy.

Las funciones de este alcance todavía no se declaran implementadas. El código base aa2f945 conserva check raíz 634, móvil 108, Hermes y 142 E2E Expo aprobadas. La documentación nueva requiere formato/diff y su control de cierre; cada tarea funcional tendrá su evidencia propia.

REA final: Evidence ev_04b3a31c19765be870d8391b917bc78faf18803a589463b4b02ecefe8d6e4360, cuatro archivos seleccionados de seis adquiridos, 255.824 bytes leídos, 77.805 nodos AST, 28 nodos de módulo y cero errores de parseo. Se corrigió la frontera del directorio de adquisición para que las salidas del analizador quedaran fuera de su propio inventario; la pasada anterior no es la identidad de referencia. El grafo de aplicación es parcial y el semántico alcanzó los límites explícitos de 12.000 nodos/3.000 desconocidos; no inferir ausencias a partir de esos cortes.

Lectura focalizada del mismo archivo 5575-96e3af73edd3ae39.js, SHA-256 28cf70c8339552c4e8a04a8f0a543da66c669f1292fa2796b73d65c5a8b16486, factory 55575: el serializador incluye carga, rango, esfuerzo, duración, distancia, grupo, descanso, notas y carpeta (offsets originales 9769/9932/9829/10291/10241/10802/10827/11043/11116). Esto confirma que sus datos de rutina son más amplios que nuestro registro peso/repeticiones; no establece el comportamiento de todas las pantallas ni las reglas del servidor. La reconstrucción propia se implementa en las tareas posteriores, sin copiar ese serializador.

Cierre T209: npm run check aprobado con 634 pruebas/86 archivos, formato, lint sin errores (diez avisos previos), tipos, build y 66 recursos offline. No cambió código, API, esquema o datos, por lo que no se repitieron pruebas destructivas o E2E del producto. Evidencia privada t209-check.log y hevy-training-20261026/final-{evidence,summary,analysis}.*. T210 es la siguiente tarea funcional.
