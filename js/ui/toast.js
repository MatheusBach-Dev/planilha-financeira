import {$} from "../core/formato.js";

export var toastT;

export function toast(msg){
  var t=$("toast");
  t.textContent=msg;t.classList.add("show");
  clearTimeout(toastT);
  toastT=setTimeout(function(){t.classList.remove("show")},2300);
}
