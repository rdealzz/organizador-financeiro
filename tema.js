/* Tema, antes do primeiro pixel.

   Este arquivo existe por causa de UM detalhe: o app.js só carrega no fim do
   <body>, e até lá a splash já foi pintada. Se o tema fosse decidido só lá, a
   abertura piscava — splash num tema, app no outro. Aqui ele é decidido no
   <head>, antes de qualquer coisa aparecer.

   A regra: vale o que a pessoa escolheu NESTE aparelho; quando ela nunca
   escolheu, o app abre CLARO. O tema do sistema não entra na conta — quem
   quiser escuro toca no botão uma vez e a escolha fica guardada.

   Não dá pra ser um <script> inline: o CSP do vercel.json é `script-src
   'self'`, que recusa código escrito dentro do HTML. Por isso um arquivo. */
(function(){
  try{
    var t=localStorage.getItem('sobra:tema'), esc=(t==='escuro');
    document.documentElement.setAttribute('data-tema', esc?'escuro':'claro');
    // a barra do navegador junto, senão ela pisca na cor do outro tema
    var m=document.querySelector('meta[name="theme-color"]');
    if(m) m.setAttribute('content', esc?'#000000':'#F4F8FD');
  }catch(e){ /* localStorage bloqueado: fica o "claro" que já está no HTML */ }
})();
