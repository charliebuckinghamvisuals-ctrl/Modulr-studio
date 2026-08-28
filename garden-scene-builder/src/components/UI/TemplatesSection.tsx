import { useState } from 'react';
import { Trash2, Save } from 'lucide-react';
import { useStore } from '../../store';
import { listTemplates, saveTemplate, deleteTemplate, templateSize, type UserTemplate } from '../../userTemplates';

/**
 * "My Templates": save the current building as a reusable starting point and
 * re-open it later. Companies using this sell their own ranges, so the
 * templates that matter are theirs, not ours.
 */
export function TemplatesSection() {
  const [templates, setTemplates] = useState<UserTemplate[]>(() => listTemplates());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const commitSave = () => {
    const { room, objects } = useStore.getState().scene;
    setTemplates(saveTemplate(name || `Design ${templates.length + 1}`, room, objects));
    setName('');
    setNaming(false);
  };

  return (
    <div className="space-y-3">
      {naming ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') commitSave();
              if (e.key === 'Escape') { setNaming(false); setName(''); }
            }}
            placeholder="Template name"
            className="flex-1 bg-gray-50 border border-black/5 rounded-lg px-2.5 py-2 text-xs text-[#3b4d4a] outline-none focus:ring-2 focus:ring-[#3b4d4a]"
          />
          <button onClick={commitSave} className="px-3 py-2 rounded-lg bg-[#3b4d4a] text-white text-[10px] font-bold uppercase tracking-wide hover:bg-[#2d3a38]">
            Save
          </button>
        </div>
      ) : (
        <button
          onClick={() => setNaming(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#3b4d4a] text-white text-[10px] font-bold uppercase tracking-wide hover:bg-[#2d3a38] transition-colors"
        >
          <Save size={13} />
          Save current design as template
        </button>
      )}

      {/* The scene now survives reloads, so there has to be a deliberate way
          back to an empty building. Undoable like any other change. */}
      <button
        onClick={() => useStore.getState().applyPreset({}, [])}
        className="w-full py-2 rounded-xl bg-black/5 hover:bg-black/10 text-[#3b4d4a] text-[10px] font-bold uppercase tracking-wide transition-colors"
      >
        Start a new design
      </button>

      {templates.length === 0 ? (
        <p className="text-[10px] text-gray-400 leading-relaxed">
          No templates yet. Set up one of your standard buildings, then save it here to reuse it as a starting point.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="group flex items-center gap-2 p-3 rounded-xl bg-white border border-black/5 hover:border-[#3b4d4a]/40 hover:shadow-sm transition-all">
              <button
                onClick={() => useStore.getState().applyPreset(t.room, t.objects)}
                className="flex-1 text-left min-w-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-[#3b4d4a] truncate">{t.name}</span>
                  <span className="text-[10px] font-mono text-gray-400 shrink-0">{templateSize(t)}</span>
                </div>
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  {t.room.doors?.length ?? 0} doors · {t.room.windows?.length ?? 0} windows · {t.objects.length} items
                </span>
              </button>
              <button
                onClick={() => setTemplates(deleteTemplate(t.id))}
                title="Delete template"
                className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 pt-0.5">Opening a template replaces the current design. Undo restores it.</p>
        </div>
      )}
    </div>
  );
}
