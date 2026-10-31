# Componentes compartidos — T226

Aplicar los fundamentos de la propuesta aprobada el 31-oct-2026 al cliente Expo existente, sin cambiar controladores, contratos o almacenamiento. No convertir el estado volátil del prototipo en estado de la app.

- Paletas: grafito #0b0c0e / neutro #fafafa, superficies y campos diferenciados, texto de sistema, acción azul y estados legibles. Conservar Claro/Oscuro/Sistema y su clave/formato actuales.
- Tipografía y geometría en los estilos compartidos existentes: título 30, subtítulo 20, cuerpo 15, caption 13, campo 16, números tabulares; botones/campos de al menos 48 px, radios discretos y menos bordes en tarjetas.
- Un Input compartido exige etiqueta accesible, conserva los props nativos, cadenas controladas, eventos, edición, teclado y selección. Foco visible mediante color de control, sin recortar texto ampliado. Adoptarlo primero en ToolField; la migración de los campos específicos de registro y biblioteca continúa en sus entregas.
- Action conserva su etiqueta visible durante busy, comunica estado y bloquea pulsaciones repetidas. El indicador no reemplaza el texto o la geometría del botón.
- SetCheck conserva el círculo de 26 px dentro de 48 px táctiles. El símbolo contrasta con el fondo de marca en ambos temas.

Aceptación: AA en texto/campos/marcas, sin desbordamiento a 360 px; un formulario numérico conserva su cadena y foco al cambiar el tema y guarda exactamente el valor elegido. Login pendiente conserva texto y tamaño del botón, rechaza doble envío y permite reintentar tras el error. Recuperación, preferencias y sesión no se reinician por cambiar el tema. Pruebas de interfaz con APIs simuladas, más check móvil/raíz y exportaciones de los componentes cambiados; no requiere SQL, integración destructiva o nuevas dependencias.

Referencias técnicas contrastadas: Expo SDK58 y temas; React Native0.88 StyleSheet, Pressable y TextInput. Sin APIs de animación nuevas. Revisión React: hooks incondicionales, foco local al campo, callbacks y valores controlados preservados, sin recrear proveedores o claves por tema.
