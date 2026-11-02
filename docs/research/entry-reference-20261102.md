# Referencias para la entrada de Iron Strength · 2-nov-2026

Objetivo: mejorar carga, acceso y primera pantalla móvil con jerarquía y detalles propios. La petición del propietario autoriza ejecutar; T234 define los criterios en spec011/entry.md.

## Adquisición e inspección

- [Hevy, cliente público de acceso](https://hevy.com/login): HTML, CSS y los dos archivos enlazados _app/login adquiridos por HTTPS sin sesión, ejecución de bundles o solicitud de datos. Identidad, URLs, tamaños y SHA-256 en el archivo privado work/t234-reference/acquisition.json. No se reutilizan los archivos archivados de octubre como si fueran actuales.
- CLI oficial REA6.7.0 ya instalado, siguiendo su SKILL.md y guías de JavaScript/conexión. MCP no registrado; no se instaló/actualizó ninguna herramienta. Selección explícita de dos JavaScript actuales y resumen inspect-analysis-view con Evidence conservada fuera de Git.
- Evidence ev_a603ffc7db1746b135ba4004675c11862ea000835d85622f8c619389c612ba80: 2JavaScript/7.447.302bytes/281módulos/0fallos de parseo. Inventario completo del contenedor, análisis de fuentes seleccionado y grafo parcial; un archivo inventariado no analizado. Límite semántico y relaciones desconocidas conservados, sin inferir ausencia o recuperar código móvil/servidor. La primera selección usó un nombre antiguo que ya no existía y falló: solo se acredita el análisis posterior sobre los nombres del inventario actual.
- [TeamBuildr, app móvil oficial](https://www.teambuildr.com/mobile-app): imagen oficial de pantallas consultada desde Phone Cluster.png. Es evidencia visual de organización, no de código nativo ni de su acceso. También se consultó [el registro de Hevy](https://www.hevyapp.com/features/track-workouts/) y su ilustración oficial de series.

## Observación y decisión propia

El módulo login de Hevy declara maxWidth400 para bloques del acceso; inspección focalizada sobre el artefacto identificado, sin trasplantar su implementación. El resumen REA prueba identidad/selección/parseo; el valor de estilo procede de leer ese mismo archivo. La separación entre formulario y acciones auxiliares, y el entrenamiento del día visible en la imagen de TeamBuildr, orientan el trabajo.

Iron Strength adopta un acceso centrado de ancho contenido, identidad monocroma, campos de56px con foco y visibilidad de contraseña integrada. Una acción primaria Entrar; invitación/recuperación y privacidad en un pie discreto. La carga comparte identidad sin añadir demoras. Inicio mantiene rutina/Retomar prioritarios y mejora la lectura del programa actual. Paletas, iconos y componentes propios; no se incorporan bundles, marcas, imágenes oficiales, endpoints o dependencias de terceros al producto.

No se afirma haber decompilado Hevy/TeamBuildr móvil o clonado su backend. Ambos recursos oficiales quedan solo en el workspace de investigación. Capturas de la implementación, contratos y controles se registran en spec011/validation.md.
