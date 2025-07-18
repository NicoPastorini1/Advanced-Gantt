# Power BI Gantt Custom Visual

Visual personalizado de diagrama de Gantt desarrollado para Power BI, con funcionalidades avanzadas de interacción, visualización jerárquica y control temporal.

## 🚀 Características principales

- Ejes X **superior e inferior sincronizados**, con formatos dinámicos (hora, día, mes, año).
- **Zoom con rueda del mouse**, con cambio automático de formato temporal.
- **Scroll vertical y horizontal** con soporte de pan.
- Soporte para jerarquías **padre-hijo** con expansión y colapso.
- Renderizado de:
  - Tareas individuales
  - Grupos de tareas (barra trapezoidal)
  - Barras de duración y porcentaje de avance
  - Días de fin de semana con color personalizado
  - Líneas divisorias por día, mes y año
- Ejes X fijos, que permanecen visibles durante el scroll.
- Opciones de formato desde el **format pane** de Power BI:
  - Tipografía
  - Colores por grupo
  - Tamaños y estilos de barra
  - Formato de fechas
- Compatibilidad completa con Power BI (`pbiviz`) y `TypeScript + D3.js`.

## 📷 Capturas

_📌 Agregá aquí imágenes del gráfico funcionando (opcional)_

## 🛠️ Tecnologías

- Power BI Custom Visuals (`pbiviz`)
- D3.js (v7)
- TypeScript
- SVG y HTML dinámico
- Formato `visual.ts` y `settings.ts` desacoplado

## 📦 Estructura del Proyecto

```
/src
├── visual.ts          # Lógica principal de renderizado y eventos
├── settings.ts        # Configuración del panel de formato
├── barCompletion.ts   # Lógica de barra de completado
├── assets/            # Imágenes y estilos
/gantt-custom-visual.pbiviz.json
```

## 📈 Cómo compilar

1. Instalá Power BI tools:
   ```bash
   npm install -g powerbi-visuals-tools
   ```
2. Instalá dependencias:
   ```bash
   npm install
   ```
3. Ejecutá el servidor local:
   ```bash
   pbiviz start
   ```
4. Exportá el visual:
   ```bash
   pbiviz package
   ```

## 📄 Licencia

Este proyecto está desarrollado con fines educativos y profesionales internos. Se puede adaptar y reutilizar respetando la estructura original y dando crédito al autor.

---

### ✍️ Autor

**Nico Pastorini**  
Ingeniero de Datos | Backend Developer | Power BI Specialist 
