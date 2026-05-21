import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nome, whatsapp, telefone, email, mensagem, imovel_interesse_id, interesse_tipo, referencia } = body;
    if (!nome || !whatsapp) {
      return NextResponse.json({ error: "Nome e WhatsApp são obrigatórios" }, { status: 400 });
    }
    const interesse: Record<string, boolean> = {
      compra: interesse_tipo === "compra",
      locacao: interesse_tipo === "locacao",
      rural: interesse_tipo === "rural",
      urbano: false,
      investimento: interesse_tipo === "investimento",
    };
    const supabase = createSupabaseAdmin();
    const observacoes = [mensagem, referencia].filter(Boolean).join("\n\n");
    const { data, error } = await supabase
      .from("leads")
      .insert({
        nome,
        whatsapp,
        telefone: telefone || whatsapp,
        email: email || null,
        origem: "site",
        interesse,
        imovel_interesse_id: imovel_interesse_id || null,
        observacoes: observacoes || null,
        stage: "novo",
      })
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // notifica setor recepcao
    await supabase.from("notifications").insert({
      sector: "recepcao",
      tipo: "novo_lead",
      titulo: "Novo lead recebido pelo site",
      mensagem: `${nome} demonstrou interesse${referencia ? ` em ${referencia}` : ""}.`,
      link: "/admin/leads",
      payload: { lead_id: data?.id },
    });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
