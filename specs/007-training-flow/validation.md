# Validación — Spec 007

Estado inicial: tareas pendientes. La implementación no se considera disponible hasta registrar controles y commit por tarea. El código publicado de partida aprobó CI 39611110162 (check, base/integración y E2E); no equivale a pruebas de estas funciones nuevas. Capturas y protocolo previos en baseline.md. Aceptación con teléfonos físicos pendiente.

## T170

Especificación aprobada registrada antes de código, tres referencias visuales previas y protocolo de acciones conservados. `npm run check` en verde: 462 unitarias, formato, lint sin errores, tipos y build; log privado `work/t170-check.log` en directorio padre. Huella de base interactiva idéntica. Sin cambios de pantalla ni esquema. Los conteos base son un inventario reproducible de controles, no una medición cronometrada con usuarios.

## T171

Primero E2E de consulta sin borrador y recuperación del mismo ID; fallo previo por ausencia de Ver rutina (`work/t171-red.log`). Implementada consulta autenticada de la semana vigente con getWorkoutContext/RLS, sin escrituras. Inicio reconoce copia local y distingue retomar de recuperar pendiente; estados vacíos enlazan a programas, historial, progreso o resumen. Consulta accesible con cierre/Escape, retorno de foco, error y reintento.

Check final en verde (462 unitarias, formato, tipos, lint sin errores y build). Cuatro E2E nuevas/enfocadas aprobadas en ambos motores; suite completa final: **149 aprobadas y un skip CDP exclusivo de WebKit, cero fallos y reintentos, 13,4 minutos**. Axe también audita la consulta en ambos temas. Logs fuera de Git: t171-check-final.log, t171-focused.log y t171-e2e.log. Huella interactiva idéntica a T170. Sin cambios de esquema ni producción.
