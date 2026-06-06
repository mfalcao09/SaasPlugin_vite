import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({ icon: Icon, label, value, sub, color = "orange", trend }) {
  const colorMap = {
    orange: "text-gym-orange bg-gym-orange/12",
    green: "text-gym-green bg-gym-green/12",
    red: "text-gym-red bg-gym-red/12",
    yellow: "text-gym-yellow bg-gym-yellow/12",
    blue: "text-gym-blue bg-gym-blue/12",
    purple: "text-gym-purple bg-gym-purple/12",
  };

  return (
    <div className="bg-white border border-gym-border rounded-xl p-5 flex flex-col gap-3 hover:shadow-sm transition-all shadow-sm">
      <div className="flex items-center justify-between">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colorMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", trend >= 0 ? "text-gym-green" : "text-gym-red")}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold text-gym-text text-tabular">{value}</div>
        <div className="text-sm text-gym-muted mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gym-subtle mt-1">{sub}</div>}
      </div>
    </div>
  );
}