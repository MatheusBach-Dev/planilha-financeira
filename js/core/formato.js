export var MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

export var DOW=["dom","seg","ter","qua","qui","sex","sáb"];

export var BRL=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});

export var NUM=new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

export function money(v){return BRL.format(v||0)}

export function num(v){return NUM.format(v||0)}

export function pad(n){return n<10?"0"+n:""+n}

export function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

export function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}

export function $(id){return document.getElementById(id)}
