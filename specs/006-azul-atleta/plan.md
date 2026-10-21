# Plan técnico

T167 fija la referencia y aceptación antes de modificar código. T168 empieza con pruebas de acceso público a los recursos y recorrido visual funcional. Reutilizar datos y estado de los componentes existentes; limitar cambios al marco, composición y estilos, sin migraciones ni dependencias nuevas. Generar imágenes originales con la herramienta integrada de imágenes y guardar los prompts y rutas en validation.md. Integrar recursos públicos en la lista explícita offline.

Verificar primero unidades, tipos y build, después E2E aislado y comparación mediante capturas. Corregir fallos antes del commit. Recompilar la vista previa interactiva sin resetear su Supabase. La publicación usa el procedimiento existente únicamente después de verificar el artefacto.
