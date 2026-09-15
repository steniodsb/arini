import { redirect } from "next/navigation";

// A "Comunicação entre setores" virou o Chat (/admin/chat), que mostra a
// conversa inteira num fio só em vez de partir a MESMA conversa nas abas
// "Recebidas" e "Enviadas". Este redirect fica porque o endereço antigo
// está em favorito de gente e no histórico do navegador — 404 aqui pareceria
// que o sistema perdeu as mensagens.
export default function ComunicacaoPage() {
  redirect("/admin/chat");
}
