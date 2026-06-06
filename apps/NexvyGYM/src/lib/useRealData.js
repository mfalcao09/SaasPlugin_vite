// Hook genérico para buscar dados reais isolados por academy_id
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useRealData(entityName, academyId, extraFilter = {}, sort = "-created_date") {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!academyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await base44.entities[entityName].filter(
        { academy_id: academyId, ...extraFilter },
        sort,
        200
      );
      setData(result);
    } catch (e) {
      console.error(`Erro ao carregar ${entityName}:`, e);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [academyId, entityName]);

  return { data, loading, reload: load, setData };
}