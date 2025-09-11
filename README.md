# Power BI Custom Gantt Visual

Un visual personalizado de **Gantt** para Power BI, desarrollado en **TypeScript + D3.js**, que ofrece un alto nivel de personalización y control sobre escalas temporales, jerarquías y estilos.

---

## 🚀 Características principales

- **Escala temporal dinámica**  
  - Zoom y pan horizontales con `d3.zoom`.  
  - Formato automático de ejes según nivel de detalle (`Hora`, `Día`, `Mes`, `Año`, `Todo`).  
  - Doble eje X fijo (superior e inferior).  

- **Filas y jerarquía**  
  - Soporte para **grupos y tareas hijas** (expandir/colapsar).  
  - Columna fija izquierda con nombres, fechas y duración.  
  - Alineación con scroll vertical sincronizado.  

- **Barras de tareas y grupos**  
  - Renderizado de barras rectangulares y trapezoidales para grupos.  
  - Barra secundaria (inicio/fin alternativo).  
  - Colores configurables por grupo/parent.  
  - Barra de progreso interno (`completion`).  

- **Interacción**  
  - Zoom con rueda del mouse.  
  - Pan mediante arrastre.  
  - Doble click para resetear vista.  
  - Tooltip dinámico con campos personalizados.  

- **Extras visuales**  
  - Línea vertical de **Hoy** con etiqueta.  
  - Marcadores de fin de semana.  
  - Líneas de dependencia entre tareas.  
  - Etiquetas de duración y porcentaje completado.  

---

## 🛠️ Tecnologías utilizadas

- [Power BI Custom Visuals SDK](https://learn.microsoft.com/es-es/power-bi/developer/visuals/)  
- [D3.js](https://d3js.org/)  
- TypeScript  
- LESS (estilos)  

---

## 📂 Estructura principal

```
src/
 ├── components/
 │    ├── xAxis/          # Renderizado de ejes X (superior/inferior)
 │    ├── formatButtons/  # Botones de cambio de escala temporal
 │    └── parentButtons/  # Botones expandir/colapsar grupos
 ├── utils/
 │    └── renderLabels.ts # Renderizado de etiquetas de duración
 ├── settings.ts          # Configuración de panel de formato
 ├── visual.ts            # Lógica principal del gráfico
 └── style/visual.less    # Estilos personalizados
```

---

## 📸 Ejemplo

> <img width="1196" height="576" alt="image" src="https://github.com/user-attachments/assets/2ba7ce39-8a81-4c6b-8887-ee49c3d4a292" />


---

## ⚙️ Instalación y uso

1. Clonar el repositorio:  
   ```bash
   git clone https://github.com/<usuario>/<repo>.git
   cd <repo>
   ```

2. Instalar dependencias:  
   ```bash
   npm install
   ```

3. Ejecutar en modo desarrollo:  
   ```bash
   pbiviz start
   ```

4. Empaquetar para producción:  
   ```bash
   pbiviz package
   ```

5. Importar el `.pbiviz` resultante en Power BI.

---

## 📌 Roadmap

- [ ] Ajustes de rendimiento en eventos de scroll.  
- [ ] Mejorar renderizado de dependencias con curvas.  
- [ ] Opciones avanzadas de estilo de barra en el format pane.  
- [ ] Exportar a imagen/PNG desde el visual.  

---

## 👤 Autor

Desarrollado por **Nicolás Pastorini**  
📍 Buenos Aires, Argentina  
🔗 [LinkedIn](https://linkedin.com/in/nicolas-pastorini)  
