import { useState, useCallback } from "react";

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    // eslint-disable-next-line no-mixed-operators
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const Advancedselect_trigger = (defaultField = "SERIAL") => {
  const createCondition = () => ({
    id: generateUUID(),
    field: defaultField,
    operator: ">=",
    cctype : "017",
    index: 0,
    maxIndex: 0,
    values: []
  });

  const [conditions, setConditions] = useState([createCondition()]);

  // ➕ 新增
  const addCondition = useCallback(() => {
    setConditions(prev => [...prev, createCondition()]);
  }, []);

  // ➖ 刪除指定 id
  const removeCondition = useCallback((id) => {
    setConditions(prev => {
      if (prev.length === 1) {
        return [createCondition()];
      }
      return prev.filter(c => c.id !== id);
    });
  }, []);

  // 🔁 更新某一組（通用）
  const updateCondition = useCallback((id, patch) => {
    setConditions(prev =>
      prev.map(c => (c.id === id ? { ...c, ...patch } : c))
    );
  }, []);

  // 🔄 API 搜尋後同步 index
  const syncValues = useCallback((id, values = []) => {
    updateCondition(id, {
      values,
      maxIndex: Math.max(values.length - 1, 0),
      index: 0
    });
  }, [updateCondition]);

  // 📦 組 backend query
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();

    conditions.forEach(c => {
      if (!c.values.length) return;

      params.append(`${c.field}_op`, c.operator , c.cctype);
      params.append(c.field, c.values[c.index]);
    });

    return params.toString();
  }, [conditions]);

  return {
    conditions,
    addCondition,
    removeCondition,
    updateCondition,
    syncValues,
    buildQuery
  };
};
