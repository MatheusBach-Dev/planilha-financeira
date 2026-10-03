import {mesDoc, mesLeitura} from "./estado.js";
import {uid} from "./formato.js";

// Mexem só no estado em memória. Quem chama salva (salvarMes) e redesenha (render).

export function adicionarLancamento(k,c){
  var doc=mesDoc(k);
  var novo={id:uid(),desc:c.desc,dia:c.dia,tipo:c.tipo,valor:c.valor,cartao:!!c.cartao,cat:c.cat||""};
  doc.lancamentos.push(novo);
  if(novo.tipo==="diario"&&doc.conferidos.indexOf(novo.dia)<0){
    doc.conferidos.push(novo.dia);
    doc.conferidos.sort(function(a,b){return a-b});
  }
  return novo;
}

export function editarLancamento(k,id,c){
  var doc=mesDoc(k),editado=null;
  doc.lancamentos=doc.lancamentos.map(function(l){
    if(l.id!==id)return l;
    editado={id:l.id,desc:c.desc,dia:c.dia,tipo:c.tipo,valor:c.valor,cartao:!!c.cartao,cat:c.cat||""};
    return editado;
  });
  return editado;
}

export function removerLancamento(k,id){
  var doc=mesDoc(k),antes=doc.lancamentos.length;
  doc.lancamentos=doc.lancamentos.filter(function(l){return l.id!==id});
  return doc.lancamentos.length!==antes;
}

export function acharLancamento(k,id){
  return mesLeitura(k).lancamentos.filter(function(l){return l.id===id})[0]||null;
}
