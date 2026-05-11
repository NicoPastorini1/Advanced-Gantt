// src/components/formatButtons.ts
import * as d3 from "d3";

interface FormatButtonsProps {
  container: HTMLElement;
  onFormatChange: (fmt: string) => void;
}

export function renderFormatButtons({ container, onFormatChange }: FormatButtonsProps) {
  d3.select(container).selectAll(".btn-container").remove();

  const formatos = ["Hora", "Día", "Mes", "Año", "Todo"];
  const btnContainer = d3.select(container)
    .append("div")
    .attr("class", "btn-container");

  const btns = btnContainer.selectAll("button")
    .data(formatos)
    .enter()
    .append("button")
    .text(fmt => fmt)
    .attr("data-format", fmt => fmt)
    .attr("type", "button");

  // cuando clickeás, dispara el cambio de rango
  btns.on("click", (event, fmt) => {
    console.log(`[FormatButton] Clicked: ${fmt}`);
    onFormatChange(fmt);

    // visualmente marcamos el activo
    btns.attr("class", d => d === fmt ? "active" : "");
  });
}
