import {state} from "../core/estado.js";
import {$} from "../core/formato.js";

export function aplicarTema(){
  var t=state.config.tema||"dark";
  if(t==="auto")document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme",t);
  var mt=$("metaTema");
  if(mt){
    var escuro=t==="dark"||(t==="auto"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
    mt.setAttribute("content",escuro?"#071624":"#0D2236");
  }
}
