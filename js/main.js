import {localLoad} from "./core/estado.js";
import {conectar} from "./dados/claude.js";
import {conectarFirebase} from "./dados/firebase.js";
import {ligarEventos} from "./ui/eventos.js";
import {mqLargo, render} from "./ui/render.js";
import {aplicarTema} from "./ui/tema.js";

export function iniciar(){
  localLoad();
  aplicarTema();
  render();
  if(mqLargo.addEventListener)mqLargo.addEventListener("change",render);
  else if(mqLargo.addListener)mqLargo.addListener(render);
  if(!conectarFirebase())conectar();
  ligarEventos();
}
iniciar();
