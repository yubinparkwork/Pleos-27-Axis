// Separate realm: archived apps namespace window.localStorage for scene autosave.
// Only named presets are shared. Legacy keys are read, never modified or removed.
(() => {
  const key = 'pleos-named-settings-shared-v1';
  const legacy = /^(?:(?:saved-\d+|pleos-history:[^:]+):)?pleos-named-settings-v1$/;
  const valid = v => v && typeof v.id === 'string' && typeof v.name === 'string' && v.state && typeof v.state === 'object' && !Array.isArray(v.state);
  function list() {
    const entries = [];
    const warnings = [];
    const keys = [key];
    for (let i = 0; i < localStorage.length; i++) {
      const candidate = localStorage.key(i);
      if (legacy.test(candidate)) keys.push(candidate);
    }
    for (const source of keys.sort((a,b) => a === key ? -1 : b === key ? 1 : a.localeCompare(b))) {
      const raw = localStorage.getItem(source);
      if (!raw) continue;
      let values;
      try { values = JSON.parse(raw); if (!Array.isArray(values) || !values.every(valid)) throw Error(); }
      catch { warnings.push(source); continue; }
      for (const value of values) {
        // Stable source-qualified ids preserve conflicting historical UUIDs, too.
        const entry = source === key ? value : {...value, id: source + '::' + value.id, sourceStorage:source};
        if (!entries.some(v => v.id === entry.id)) entries.push(entry);
      }
    }
    return {entries, warnings};
  }
  window.pleosNamedSettings = {
    list,
    save(entry) {
      if (!valid(entry)) throw Error('INVALID_SETTINGS');
      const current = list();
      // Never overwrite a damaged shared store; leave all original bytes recoverable.
      if (current.warnings.includes(key)) throw Error('DAMAGED_STORE');
      localStorage.setItem(key, JSON.stringify([...current.entries,entry]));
      return list();
    }
  };
})();
