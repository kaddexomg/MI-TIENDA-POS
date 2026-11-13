# PLAN DE IMPLEMENTACIÓN — Estabilización V6 de MI-TIENDA-POS

> **Destinatario**: agente implementador
> **Repositorio**: `C:\Users\PC\Desktop\MI-TIENDA-POS` (GitHub `kaddexomg/MI-TIENDA-POS`, rama `main`, último commit `e92af6b`)
> **Objetivo**: dejar el sistema **estable, correcto en lo fiscal y entendible para un dueño mayor**, ANTES de cualquier función nueva, despliegue en VPS o app móvil.
> **Entorno destino**: Windows 7, Chromium 109, pantallas 1366x768 y 1024x768, 100% offline.

---

## 0. Reglas de trabajo para el agente (obligatorias)

1. **Congelar funciones nuevas.** Solo se corrige, se simplifica y se estabiliza lo que ya existe.
2. Trabajar en la rama `estabilizacion-v6`. **Un commit por tarea**, con mensaje claro (`fix(iva): ...`, `ui(lenguaje): ...`).
3. **No declarar nada "verificado al 100%" sin pruebas reales.** `node --check` solo revisa sintaxis. Cada fase cierra con su lista de verificación (§8).
4. No romper la compatibilidad con Chromium 109: sin `structuredClone` obligatorio, sin CSS `:has()`, sin `top-level await`.
5. Preservar los comentarios existentes que no tengan que ver con el cambio.
6. El archivo `assets/js/config.js.bak` está ignorado por git. No usarlo como fuente.

Orden de ejecución: **Fase 1 → 2 → 3 → 4 → 5 → 6**. La Fase 1 es la más crítica porque toca dinero.

---

## FASE 1 — Corrección del IVA y el IGTF (CRÍTICO: dinero)

### 1.1 Errores confirmados en el código actual

| # | Problema | Dónde |
|---|---|---|
| F1 | **El IVA se calcula pero NO se suma al total cobrado.** `totalUsd = subtotal + IGTF`; `ivaUsd` solo se guarda como dato informativo. Al cliente se le cobra sin IVA, pero el comprobante muestra IVA. | `config.js` ~L2777–2809 |
| F2 | **Dos campos de impuesto que se contradicen.** El catálogo usa `ivaType: 'E'/'G'` y además `taxExempt: true/false`, pero el cálculo fiscal solo lee `taxExempt`. Los platos tienen `ivaType:'E'` sin `taxExempt`, así que en el cálculo terminan como gravados. | `config.js` catálogo L250–1440, `pos-engine.js` L622 y L641 |
| F3 | **Clasificación legal incorrecta:** todas las comidas preparadas (empanadas, arepas, almuerzos, café) tienen `ivaType: 'E'`. La comida preparada está **gravada al 16%**. | `config.js` catálogo |
| F4 | **La pantalla de Caja no calcula ni muestra el IVA.** El total del ticket, el modal de cobro y el vuelto se calculan sin impuesto. | `pos-engine.js` |
| F5 | **El IGTF se calcula sobre el subtotal SIN IVA** (`min(totalUsd, usdPagado)`), y se aplica siempre, sin importar si el negocio es Contribuyente Especial. | `config.js` ~L2779–2786 |
| F6 | **Datos fiscales falsos escritos en el código:** serial `Z4A2098124`, RIF `J-50128940-1`, Reporte Z `142`, factura `4892`. Pueden salir impresos en documentos reales. | `config.js` ~L2749–2798 y `fiscalConfig` ~L1829 |
| F7 | `fiscalCfg.currentInvoiceNumber++` modifica un objeto de respaldo que puede no persistirse, así que el correlativo se puede repetir. | `config.js` ~L2759 |
| F8 | Dinero calculado con decimales flotantes y `toFixed`, lo que produce errores de redondeo. | Todo el flujo de venta |

### 1.2 Reglas fiscales venezolanas a implementar

- **Alícuota general: 16%.** Dejar soportada la reducida de 8% aunque hoy no se use.
- **Exentos en venta al detal (Ley de IVA, art. 18, num. 1):** arroz, harinas de origen vegetal (Harina P.A.N.), pan y pastas alimenticias, margarina y mantequilla.
- **Comida preparada / servicio de comida: gravada al 16%**, aunque sus ingredientes sean exentos. Una empanada se grava aunque la harina de maíz esté exenta.
- **IGTF 3%:** aplica **solo si el negocio es Contribuyente Especial**. Se cobra **únicamente sobre la parte pagada en divisas** (efectivo USD, Zelle, USDT), y la base **incluye el IVA**. Los pagos en bolívares (efectivo Bs, Pago Móvil, punto de venta, transferencia nacional) no pagan IGTF.
- **Todo documento debe mostrar los montos en Bolívares a la tasa BCV del día**: base exenta, base gravada, IVA, IGTF y total. El USD es referencial.

**Clasificación por defecto del catálogo:**

| Familia | IVA |
|---|---|
| Empanadas, pastelitos, tequeños, papas rellenas, arepas, almuerzos, cafetería | **G16** (comida preparada) |
| Harina P.A.N., arroz, pasta, margarina | **E** (exento) |
| Refrescos, maltas, cervezas, chucherías, galletas, cigarros | **G16** |
| Agua mineral | Hoy está marcada como exenta. **Dejarla G16 y marcarla "pendiente de confirmar con el contador".** |

> [!IMPORTANT]
> El sistema calcula y desglosa el IVA, pero **un comprobante con IVA solo tiene validez legal si sale de una máquina fiscal homologada o de una imprenta digital autorizada** (Providencias 0071, 0141 y SNAT/2024/000102). El agente NO debe presentar la nota interna como factura fiscal. La clasificación final de cada producto la confirma el contador del negocio.

### 1.3 Tareas

1. **Crear `assets/js/tax.js`** (objeto global `window.MTPTax`) con **funciones puras**, sin acceso al DOM ni al estado:
   - `classify(item) → 'G16' | 'R8' | 'E'`
   - `computeTotals({ lines, payments, rateBcv, settings })` → `{ exentoCents, baseG16Cents, iva16Cents, baseR8Cents, iva8Cents, igtfCents, totalCents, totalBs, ... }`
   - Cálculos internos en **centavos enteros**. Redondeo a 2 decimales **por documento**, no por línea.
2. **Unificar el campo de impuesto**: un solo campo `iva: 'G16'|'R8'|'E'` en productos, variantes e inventario de venta. Escribir una **migración** que convierta `ivaType`/`taxExempt` a `iva` y aplique la tabla de §1.2. Subir la versión del esquema.
3. **Ajuste de precios** en `state.settings`:
   - `ivaMode: 'RECARGO'` (por defecto, según pidió el dueño): el precio del catálogo es la base y el 16% se suma al cobrar.
   - `ivaMode: 'INCLUIDO'`: el precio del catálogo ya trae el IVA y se desglosa con `base = precio / 1.16`.
   - Mostrar el modo activo en Ajustes con texto simple: *"¿Los precios que cargo ya incluyen IVA?"*
4. **`isContribuyenteEspecial: false`** por defecto. Si es `false`, el IGTF es 0 y no se muestra.
5. **Conectar una sola fuente de verdad**: ticket de Caja (`pos-engine.js`), modal de cobro, cálculo de vuelto, registro de venta (`config.js`), cierre de caja, dashboard y facturas **deben usar `MTPTax.computeTotals`**. Ninguno calcula impuestos por su cuenta.
6. **El ticket de Caja muestra**: Subtotal · Exento · Base imponible 16% · IVA 16% · IGTF 3% (solo si aplica) · **TOTAL A COBRAR ($ y Bs)**.
7. **IGTF con vuelto**: la base es lo pagado en divisas **menos el vuelto entregado en divisas**, con tope en el total con IVA.
8. **Eliminar los datos fiscales falsos.** Si no hay serial de máquina fiscal configurado: modo `INTERNO`, el documento dice *"NOTA DE ENTREGA — CONTROL INTERNO — NO ES FACTURA FISCAL"* y no se inventan número de control, serial ni Reporte Z.
9. **Persistir el correlativo** en el estado guardado, nunca en un objeto de respaldo.

### 1.4 Casos de prueba obligatorios (`tests/tax.test.js`, ejecutar con `node`)

| Caso | Entrada | Esperado |
|---|---|---|
| A | 2 Empanada Mechada ($1.30) + 1 Malta ($0.80) + 1 Harina PAN ($1.20), modo RECARGO, sin IGTF | Exento 1.20 · Base 16% 3.40 · IVA 0.54 · **Total 5.14** |
| B | Caso A pagado completo en efectivo USD, Contribuyente Especial | IGTF = 3% de 5.14 = 0.15 · **Total 5.29** |
| C | Caso A pagado mitad Pago Móvil y mitad USD, Contribuyente Especial | IGTF solo sobre la parte en USD |
| D | Modo INCLUIDO, empanada de $1.16 | Base 1.00 · IVA 0.16 · Total 1.16 |
| E | Solo víveres exentos | IVA 0 |
| F | Total en Bs = total en centavos × tasa BCV, redondeado a 2 decimales | Sin diferencias de 0.01 entre el ticket, el cobro y el cierre |

---

## FASE 2 — Orden de familias y catálogo

**Problema:** en `DEFAULT_FAMILIES` (`config.js` L110–120), Víveres está de último (`order: 9`). Para este negocio, los víveres son centrales.

**Nuevo orden y teclas:**

| Tecla | Familia |
|---|---|
| 1 | Empanadas y Fritos |
| 2 | Arepas |
| 3 | Almuerzos |
| 4 | **Víveres** |
| 5 | Refrescos y Maltas |
| 6 | Cafetería |
| 7 | Chucherías |
| 8 | Cervezas |
| 9 | Cigarros |

Tareas:
1. Actualizar `DEFAULT_FAMILIES` y escribir una **migración** que reordene las familias de las instalaciones existentes sin borrar productos.
2. Revisar que la columna de familias en Caja, los atajos `1`–`9` y los filtros de `productos.html` / `inventario.html` usen `order`.
3. Corregir el texto de la sección 1.2 de `AGENTS.md`, que hoy pone Víveres de último.

---

## FASE 3 — Lenguaje simple para el dueño

El dueño es una persona mayor. **Ningún texto visible puede usar jerga técnica.** Conteo actual de términos en pantallas: Insumo ×98, Kardex ×34, Lote ×20, Auditoría ×17, Merma ×12, Escandallo ×9, Brecha ×6, RBAC ×3, Multi-Ítem ×3.

**Glosario obligatorio (solo para texto visible; NO renombrar variables ni IDs internos):**

| Hoy dice | Debe decir |
|---|---|
| Kardex / Movimientos de Kardex | Historial de lo que entró y salió |
| Insumos / Insumos de Cocina | Ingredientes de cocina |
| Merma | Se dañó o se perdió |
| Autoconsumo / Consumo personal | Comida del personal |
| Auditoría por conteo físico ciego | Contar lo que hay |
| Ajuste de auditoría | Corrección después de contar |
| Recepción de factura multi-ítem | Llegó mercancía |
| Cierre de lote / Lote POS | Cierre del punto de venta |
| Escandallo | Receta (cuánto lleva cada plato) |
| Salida a Olla / Batea | Lo que salió para cocinar hoy |
| Brecha cambiaria | Diferencia entre tasas |
| RBAC / Matriz de permisos | Quién puede hacer qué |
| Multicuenta / Ticket en espera | Cuenta en espera |
| Margen comercial | Ganancia por unidad |

Tareas:
1. Reemplazar en todas las vistas de `admin/`, `caja/`, `index.html`, `sidenav.js` y `pos-engine.js`.
2. Cada botón dice **qué pasa al tocarlo** ("Guardar compra", "Cobrar", "Anular venta"), nunca nombres técnicos.
3. Los mensajes de error deben explicar **qué hacer**: "Falta la referencia del Pago Móvil (los últimos 4 números)", no "Error de validación".
4. Las confirmaciones de acciones peligrosas (anular, borrar, ajustar inventario) piden confirmar con palabras claras.

---

## FASE 4 — Menú simplificado y letra legible

### 4.1 Menú del dueño: 5 opciones grandes

1. **Vender** → `pos.html`
2. **Lo que hay en la tienda** → `inventario.html` (comida e ingredientes / víveres y productos)
3. **Compras y gastos** → registrar compra de ingredientes o mercancía
4. **Cuadre del día** → `cierres.html`
5. **Precios y tasa del dólar** → `precios.html`

Todo lo demás (Usuarios, Ajustes, Recetas, Facturas, Historial detallado, Dashboard) va en un grupo **"Más opciones"** plegado, visible solo para los roles `encargado` y `admin` según `permissions.js`.

### 4.2 Legibilidad

- Fuente base **15px** en admin y **16px** en Caja (hoy son 12px). Precios y totales a 20px o más.
- Botones de acción con al menos 40px de alto.
- **Una tarea principal por pantalla.** Si una vista mezcla varias cosas (por ejemplo `inventario.html`, de 62KB, con historial, mermas, conteo y recepción), separarlas en **pestañas grandes con nombre claro** en vez de apilarlas.
- Mantener Zero-Scroll en Caja a 1366x768. En admin se permite scroll vertical suave, pero nunca horizontal.
- Sin paneles que se abran solos ni saltos de diseño (ya se corrigió en `e92af6b`; verificar que no vuelva a pasar).

### 4.3 Errores visuales a revisar (reportados por el usuario)

- Barra lateral colapsada: textos cortados (corregido en `e92af6b`, **verificar** en 1024x768).
- Gráficos del dashboard (`admin/index.html`): revisar etiquetas y escalas.
- Imágenes gigantes al abrir variedades (`#posVariantModal`): revisar que se mantenga la miniatura fija.

---

## FASE 5 — Imágenes reales de los productos

**Problema actual:** solo existen 17 imágenes genéricas en `assets/img/productos/`. Las 24 variedades de fritos usan todas `empanadas.jpg`, y familias completas comparten una sola foto (`chucherias.jpg`, `refrescos.jpg`, `viveres.jpg`).

### 5.1 Fuentes (en este orden)

1. **Productos empaquetados (víveres, refrescos, maltas, cervezas, chucherías):** API de **Open Food Facts** (licencia abierta).
   - Por código de barras: `https://world.openfoodfacts.org/api/v2/product/{EAN}.json` → `image_front_url`
   - Por nombre: `https://world.openfoodfacts.org/cgi/search.pl?search_terms=harina+pan&countries_tags=venezuela&json=1`
2. **Platos venezolanos (empanadas, pastelitos, tequeños, papa rellena, arepas, pabellón, arroz chino, pollo broaster, café):** **Wikimedia Commons** mediante su API, tomando el autor y la licencia (CC BY / CC BY-SA / dominio público) desde `imageinfo&iiprop=url|extmetadata`.
3. **Prohibido** tomar la primera imagen que aparezca sin revisarla. Prohibidas las imágenes con marca de agua o sin licencia.

### 5.2 Criterio de precisión

- **Cada producto debe verse como lo que es.** Arepa Reina Pepiada = arepa abierta con relleno de pollo y aguacate. Pabellón = arroz, caraotas negras, carne mechada y tajadas. Tequeños = palitos de masa con queso. Pastelito ≠ empanada.
- **Empanadas:** basta con una foto fiel de la **empanada venezolana de maíz frita** (por fuera se ven iguales) por grupo. Si se consigue, diferenciar pelúa y pabellón abiertas.
- **Empaquetados:** foto del **empaque real de la marca** (Harina P.A.N. blanca ≠ amarilla, Malta Polar lata ≠ 1.5L, Frescolita, Pepito, Cheese Tris, Polar Pilsen, Zulia, Solera Verde, Mavesa, Primor, Capri, Nevada).
- **Cigarros:** NO usar fotos de cajetillas con marca (la ley antitabaco restringe la promoción en el punto de venta). Usar un icono neutro de `MTPIcons`.
- **El agente debe abrir y mirar cada imagen descargada** (con `read_file` sobre la imagen) y confirmar que corresponde al producto antes de asignarla. Si no está seguro, dejar el icono SVG de la familia y anotarlo como pendiente.

### 5.3 Formato y rendimiento (Windows 7)

- Descargar **localmente**. Nada de enlaces externos en tiempo de ejecución, porque el sistema es offline.
- Ruta: `assets/img/productos/{id-producto}.jpg` (por ejemplo `var-arepa-reina.jpg`, `inv-harina-pan-blanca.jpg`).
- Recortar en cuadrado, **240x240 px, JPG calidad ~75, máximo ~25 KB**.
- Crear `assets/img/productos/CREDITOS.md` con producto, URL de origen, autor y licencia de cada imagen.
- Actualizar el campo `img` de cada producto y variante, con una migración para las instalaciones existentes.
- Si una imagen no carga, mostrar el icono de la familia (`onerror`), nunca un recuadro roto.

### 5.4 Lista mínima de imágenes

Empanada (de maíz frita), Empanada Pelúa, Pastelito, Tequeños, Papa Rellena, Arepa Reina Pepiada, Arepa Pelúa, Arepa Dominó, Arepa de Queso, Pabellón Criollo, Arroz Chino, Arroz con Pollo, Pollo Broaster, Café Negro/Guayoyo, Café con Leche/Marrón, Harina P.A.N. Blanca, Harina P.A.N. Amarilla, Pasta Capri, Arroz Primor, Margarina Mavesa, Frescolita 1.5L, Coca-Cola 1.5L, Malta Polar 250ml, Malta Polar 1.5L, Agua Nevada, Polar Pilsen, Zulia, Solera Verde, Pepito, Cheetos, Cheese Tris, Doritos, Galletas Samba/Savoy.

---

## FASE 6 — Pruebas, limpieza y documentación coherente

1. **Pruebas automáticas** (`tests/`, se ejecutan con `node tests/run.js`, sin dependencias externas):
   - `tax.test.js` (casos de §1.4)
   - Vuelto mixto ($ + Bs + Pago Móvil)
   - Descuento de ingredientes de cocina al vender un plato según su receta
   - Compra de ingredientes: suma inventario y resta dinero de la gaveta
   - Migraciones: un estado v5 viejo migra sin perder ventas ni productos
2. **Prueba manual de los 5 flujos críticos** en Chromium 109 a 1366x768 y 1024x768, **con la consola sin errores**:
   1. Vender 2 empanadas + 1 malta + 1 Harina PAN, cobrar en efectivo $ con vuelto en Bs
   2. Cobrar por Pago Móvil y que detecte una referencia repetida
   3. Que la venta de un plato descuente sus ingredientes
   4. Registrar una compra de ingredientes
   5. Hacer el cuadre del día y que cuadre al centavo con las ventas (incluido el IVA)
3. **Captura de pantalla** de cada pantalla principal, antes y después, en el informe final.
4. **Documentación:**
   - En `AGENTS.md`: corregir la contradicción entre "Notas de despacho sin validez fiscal" (§3) y el punto 18 "Máquinas fiscales homologadas". Debe quedar: *el sistema calcula IVA/IGTF y prepara la información para una máquina fiscal; sin máquina fiscal configurada, solo emite notas de control interno.*
   - Actualizar el orden de familias (§1.2) y registrar el paquete V6 en la bitácora (§5.1).
   - Actualizar `PROJECT_BRAIN.md` (añadir `tax.js`, `tests/`, `server/`).

---

## 7. Fuera de alcance (NO hacer en este plan)

- Despliegue en VPS, dominio, rutas limpias tipo `/caja`, sincronización y app móvil (se hará después de estabilizar).
- Integración real con máquina fiscal por puerto serial.
- Funciones nuevas de cualquier tipo.

---

## 8. Criterio de "terminado" por fase

- [ ] Las pruebas de la fase pasan con `node tests/run.js`
- [ ] Sin errores en la consola en las pantallas tocadas
- [ ] Verificado a 1366x768 y 1024x768
- [ ] Commit propio con mensaje descriptivo
- [ ] Informe corto: qué se cambió, qué quedó pendiente y qué debe confirmar el contador o el dueño

## 9. Decisiones que debe confirmar el dueño o el contador

1. ¿Los precios cargados ya incluyen IVA o se suma al cobrar? **Por defecto: se suma (RECARGO).**
2. ¿El negocio es Contribuyente Especial? (de eso depende el IGTF) **Por defecto: No.**
3. ¿Hay máquina fiscal homologada? ¿Marca y serial? **Por defecto: no hay, modo control interno.**
4. Clasificación del agua mineral y de cualquier producto dudoso.
