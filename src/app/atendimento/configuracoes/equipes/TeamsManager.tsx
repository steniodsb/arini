"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AtendimentoTeam, type AgentOption } from "@/lib/types";
import { Trash2, Plus } from "lucide-react";

type Member = { team_id: string; profile_id: string };

export function TeamsManager({
  initialTeams, agents, initialMembers,
}: {
  initialTeams: AtendimentoTeam[];
  agents: AgentOption[];
  initialMembers: Member[];
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [nome, setNome] = useState("");
  const [selected, setSelected] = useState<string | null>(initialTeams[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const supabase = () => createSupabaseBrowser();

  async function addTeam() {
    if (!nome.trim()) return;
    setError(null);
    const { data, error } = await supabase().from("atendimento_teams").insert({ nome: nome.trim() }).select("*").single();
    if (error) { setError(error.message); return; }
    setTeams((p) => [...p, data as AtendimentoTeam]);
    setSelected((data as AtendimentoTeam).id);
    setNome("");
  }
  async function removeTeam(id: string) {
    const { error } = await supabase().from("atendimento_teams").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setTeams((p) => p.filter((t) => t.id !== id));
    setMembers((p) => p.filter((m) => m.team_id !== id));
    if (selected === id) setSelected(null);
  }
  async function toggleMember(teamId: string, profileId: string, on: boolean) {
    setError(null);
    if (on) {
      const { error } = await supabase().from("atendimento_team_members").insert({ team_id: teamId, profile_id: profileId });
      if (error) { setError(error.message); return; }
      setMembers((p) => [...p, { team_id: teamId, profile_id: profileId }]);
    } else {
      const { error } = await supabase().from("atendimento_team_members").delete().eq("team_id", teamId).eq("profile_id", profileId);
      if (error) { setError(error.message); return; }
      setMembers((p) => p.filter((m) => !(m.team_id === teamId && m.profile_id === profileId)));
    }
  }

  const sel = teams.find((t) => t.id === selected) ?? null;
  const isMember = (pid: string) => sel != null && members.some((m) => m.team_id === sel.id && m.profile_id === pid);

  return (
    <div className="grid md:grid-cols-2 gap-6 max-w-3xl">
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4 flex gap-2">
          <Input placeholder="Nova equipe (ex.: Comercial)" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addTeam(); }} />
          <Button type="button" variant="gold" onClick={() => void addTeam()} disabled={!nome.trim()}><Plus size={15} /></Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="rounded-xl border bg-card divide-y">
          {teams.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma equipe.</p>}
          {teams.map((t) => (
            <div key={t.id} className={`flex items-center justify-between p-3 cursor-pointer ${selected === t.id ? "bg-arini/5" : "hover:bg-muted/40"}`} onClick={() => setSelected(t.id)}>
              <span className="text-sm font-medium">{t.nome}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); void removeTeam(t.id); }} className="text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-2">{sel ? `Membros — ${sel.nome}` : "Selecione uma equipe"}</h2>
        {sel && (
          <div className="space-y-1.5">
            {agents.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isMember(a.id)} onChange={(e) => void toggleMember(sel.id, a.id, e.target.checked)} />
                {a.nome}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
