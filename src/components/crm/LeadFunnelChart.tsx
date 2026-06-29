"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["#3b82f6","#6366f1","#a855f7","#ec4899","#eab308","#f97316","#10b981","#ef4444","#14b8a6"];

export function LeadFunnelChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}
