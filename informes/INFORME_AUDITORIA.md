# INFORME DE AUDITORÍA: Geovisor Tocancipá

## 1. Inventario General
- PDFs: 64
- PNGs: 194
- Excel: 1
- DOCX: 3
- GeoJSON: 17

## 2. Resumen de Documentos Base
**Ficha Técnica:**
Ficha técnica - Clasificación de coberturas, Tocancipá (1977–2025)
Objetivo y alcance
Esta ficha documenta cómo se elaboraron los mapas de cobertura de la tierra del municipio de Tocancipá para 1977, 2000, 2015 y 2025, y qué contiene el paquete entregado para el geovisor.
Las cuatro fechas usan la misma leyenda de cuatro clases y el mismo método, de modo que los cambios entre años sean comparables. El área de estudio es el límite municipal de Tocancipá (Cundinamarca), y los mapas sirven de insum...

**Texto Geovisor:**
Texto para el geovisor
Sobre este visor (ventana de bienvenida o botón "Acerca de")
Este visor muestra cómo cambió la cobertura del suelo en el municipio de Tocancipá entre 1977 y 2025. Las coberturas se obtuvieron clasificando imágenes de satélite de cuatro fechas (7 de enero de 1977, 31 de marzo de 2000, 4 de enero de 2015 y 22 de enero de 2025) en cuatro clases: vegetación natural, cultivos y pastos, zona urbana y zona industrial/minera. Es un insumo del trabajo de grado sobre conflictos terr...

## 3. Sitios Sagrados (Excel)
Columnas detectadas: ['Unnamed: 0', 'Unnamed: 1', 'Unnamed: 2', 'Unnamed: 3']
(Nota: Hay imágenes y datos fusionados, requiere extracción cuidadosa en etapa 4).

## 4. Teselas
Capas detectadas: ['cambio_1977_2025', 'cobertura_1977', 'cobertura_2000', 'cobertura_2015', 'cobertura_2025', 'teselas_info.json']
Esquema probable: XYZ
Faltan: Diagnóstico profundo de por qué no cargan (posiblemente falta servidor local o URLs relativas incorrectas en JS).

## 5. Decisiones Requeridas (Para el Usuario)
1. **Autorización de publicación:** ¿Todos los sitios sagrados tienen autorización explícita para mostrar su ubicación? (Piedra de los Lamentos y Pozo de las Ofrendas no tenían coordenadas).
2. **Textos 1970:** El relato menciona fechas históricas sin capa (ej. 1970). Confirmar si mostramos solo el texto sin mapa, o mapa base limpio.
