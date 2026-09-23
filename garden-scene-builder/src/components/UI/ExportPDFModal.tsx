import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { X, Loader2, Upload, Star, ArrowUp, ArrowDown, Trash2, FileText, Download, Eye, ImagePlus, FolderInput, ExternalLink, Check } from 'lucide-react';
import { captureProposalDrawings, type CaptureResult } from '../../pdf/capture';
import { buildProposalPdf, type ProposalVisual } from '../../pdf/proposal';
import { readBrand, saveBrand, type PdfBrand } from '../../pdf/brand';
import { PDF_FONTS, fontById, loadFontSample } from '../../pdf/fonts';

// Debug handle, as __modulrScene: lets a headless check take the drawings.
(window as any).__modulrPdfCapture = captureProposalDrawings;

/**
 * The design proposal export - "proper proper premium... it needs to feel
 * architectural" (Charlie, 23 Sep 2026).
 *
 * The PDF is a set of A3 or A4 drawing sheets (src/pdf/proposal.ts): a cover,
 * the company's own renders, true-scale elevations and the CAD floor plan
 * with dimensions, 3D views, the specification and schedule, and planning
 * guidance, all in the company's branding. The renders are ATTACHED here -
 * whatever the company has produced - rather than generated.
 *
 * Kept for the session (module scope), so closing the dialog to change the
 * design does not throw away the attached images or what was typed.
 */
type Sections = { cover: boolean; visuals: boolean; elevations: boolean; perspectives: boolean; plan: boolean; spec: boolean; planning: boolean };
interface FormState {
  projectName: string; client: string; address: string; reference: string; notes: string;
  priceMode: 'estimate' | 'actual' | 'none'; actualPrice: string;
  sections: Sections;
  paper: 'A3' | 'A4';
}
// The paper is a company's habit rather than a project's, so it is remembered.
const PAPER_KEY = 'modulr_pdf_paper';
const savedPaper = (): 'A3' | 'A4' => { try { return localStorage.getItem(PAPER_KEY) === 'A4' ? 'A4' : 'A3'; } catch { return 'A3'; } };
let sessionForm: FormState = {
  projectName: 'Garden Room', client: '', address: '', reference: '', notes: '',
  priceMode: 'estimate', actualPrice: '',
  sections: { cover: true, visuals: true, elevations: true, perspectives: true, plan: true, spec: true, planning: true },
  paper: savedPaper(),
};
let sessionVisuals: ProposalVisual[] = [];
let sessionCover: number | null = null;
let sessionPlan: ProposalVisual | null = null;

const SECTION_LABELS: [keyof Sections, string, string][] = [
  ['cover', 'Cover', 'Hero image, logo and project'],
  ['visuals', 'Visuals', 'Your attached renders and photos'],
  ['elevations', 'Elevations', 'Front, rear and sides, to scale'],
  ['plan', 'Floor plan', 'CAD plan with dimensions, to scale'],
  ['perspectives', '3D views', 'Two perspectives of the design'],
  ['spec', 'Specification', 'Building, finishes, openings, price'],
  ['planning', 'Planning guidance', 'Permitted development check'],
];

/** Read an image file, shrinking anything huge so the PDF stays a sensible size. */
function readVisual(file: File): Promise<ProposalVisual> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not an image we can read: ' + file.name));
      img.onload = () => {
        const MAX = 3200;
        const k = Math.min(1, MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve({ dataUrl: c.toDataURL('image/jpeg', 0.9), caption: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '), width: c.width, height: c.height, page: 0 });
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not an image we can read'));
      img.onload = () => {
        // PNG keeps a transparent logo transparent; 1200px is plenty for print.
        const k = Math.min(1, 1200 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

/** Inside the app the configurator is an iframe, and the account holds the
 *  branding and the projects. On its own (the standalone configurator) there
 *  is neither, and the dialog edits branding itself. */
const embedded = (() => { try { return window.parent !== window; } catch { return true; } })();

const inputCls = 'w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-xs text-[#1c1f21] focus:outline-none focus:ring-2 focus:ring-[#3b4d4a]/40';
const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-5 border-b border-black/5 last:border-0">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#3b4d4a] mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function ExportPDFModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FormState>(sessionForm);
  const [visuals, setVisuals] = useState<ProposalVisual[]>(sessionVisuals);
  const [cover, setCover] = useState<number | null>(sessionCover);
  const [ownPlan, setOwnPlan] = useState<ProposalVisual | null>(sessionPlan);
  const planRef = useRef<HTMLInputElement>(null);
  const [brand, setBrand] = useState<PdfBrand>(() => readBrand());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; key: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const estimate = Math.round(useStore.getState().calculatePrice());
  const [savedTo, setSavedTo] = useState<string | null>(null);

  // Branding comes from the account: when it is changed in Account settings
  // (another tab, via the "Edit" link) the mirror updates and so does this.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'modulr_branding') setBrand(readBrand()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  // The app says where the proposal was filed.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'PDF_SAVED_TO_PROJECT') setSavedTo(String(e.data.projectName || 'your project'));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Keep for the session.
  useEffect(() => { sessionForm = form; try { localStorage.setItem(PAPER_KEY, form.paper); } catch { /* private mode */ } }, [form]);
  // The chosen font, loaded into the page for the sample line.
  useEffect(() => { loadFontSample(fontById(brand.font)); }, [brand.font]);
  useEffect(() => { sessionVisuals = visuals; }, [visuals]);
  useEffect(() => { sessionCover = cover; }, [cover]);
  useEffect(() => { sessionPlan = ownPlan; }, [ownPlan]);
  // Free the preview's blob URL when it is replaced or the dialog closes.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));
  const setBrandField = <K extends keyof PdfBrand>(k: K, v: PdfBrand[K]) => setBrand(b => { const n = { ...b, [k]: v }; saveBrand(n); return n; });

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => /^image\//.test(f.type));
    if (!list.length) return;
    setError(null);
    try {
      const read = await Promise.all(list.map(readVisual));
      // Each new image starts on a page of its own; group them by choosing
      // the same page number.
      setVisuals(v => {
        let next = Math.max(0, ...v.map(x => x.page)) + 1;
        return [...v, ...read.map(r => ({ ...r, page: next++ }))];
      });
    } catch (e: any) { setError(e?.message || 'Could not read that image.'); }
  };

  const move = (i: number, d: -1 | 1) => setVisuals(v => {
    const j = i + d; if (j < 0 || j >= v.length) return v;
    const n = [...v]; [n[i], n[j]] = [n[j], n[i]];
    setCover(c => (c === i ? j : c === j ? i : c));
    return n;
  });
  const remove = (i: number) => {
    setVisuals(v => v.filter((_, k) => k !== i));
    setCover(c => (c === i ? null : c !== null && c > i ? c - 1 : c));
  };

  /** Everything the PDF depends on - a download reuses the preview if nothing changed. */
  const inputsKey = () => JSON.stringify({ form, brand, cover, v: visuals.map(x => [x.page, x.dataUrl.length]), plan: ownPlan?.dataUrl.length ?? 0, room: useStore.getState().scene.room, objects: useStore.getState().scene.objects.map(o => [o.id, o.x, o.z, o.rot]) });

  const priceValue = () => {
    const parsed = parseFloat(form.actualPrice.replace(/[£,\s]/g, ''));
    return form.priceMode === 'none' ? null : form.priceMode === 'actual' ? (isFinite(parsed) && parsed > 0 ? parsed : null) : estimate;
  };
  const fileName = () => `${(form.projectName || 'design-proposal').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'design-proposal'}.pdf`;

  const build = async (): Promise<{ blob: Blob; key: string }> => {
    const key = inputsKey();
    const S = form.sections;
    const needDrawings = S.elevations || S.perspectives || (S.plan && !ownPlan) || (S.cover && visuals.length === 0);
    let drawings: CaptureResult = { elevations: [], perspectives: [] };
    if (needDrawings) drawings = await captureProposalDrawings(setBusy);

    // Planning guidance, from the server's Class E check.
    let planning: any = null, planningText = '';
    if (S.planning) {
      setBusy('Checking the planning position');
      try {
        const room = useStore.getState().scene.room;
        const isGable = room.shape === 'Gable';
        const extra = isGable ? 0 : (room.baseHeightMm || 100) + (room.roofHeightMm || 200);
        const front = room.heightMm + extra;
        const back = isGable ? front : (room.backHeightMm ?? room.heightMm) + extra;
        const res = await fetch('/api/planning-advice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomDetails: {
            ...room,
            overallTotalFrontHeightMm: front, overallTotalBackHeightMm: back, overallTotalHeightMm: Math.max(front, back),
            eavesHeightMm: isGable ? room.heightMm - (room.roofHeightMm || 200) : Math.max(front, back),
            heightMm: front, backHeightMm: back,
            contents: Array.from(new Set((useStore.getState().scene.objects || []).map(o => o.type))),
          } }),
        });
        if (res.ok) { const data = await res.json(); planningText = data.advice || ''; if (data.verdict) planning = data; }
      } catch (e) { console.warn('Planning guidance unavailable', e); }
    }

    const value = priceValue();
    const { room, objects } = useStore.getState().scene;
    const pdf = await buildProposalPdf({
      brand,
      project: { name: form.projectName, client: form.client, address: form.address, notes: form.notes, date: new Date(), reference: form.reference },
      price: { mode: form.priceMode, value },
      room, objects, drawings, visuals, coverIndex: cover,
      sections: S, planning, planningText, planImage: ownPlan, paper: form.paper,
    }, setBusy);
    return { blob: pdf.output('blob'), key };
  };

  const run = async (then: 'preview' | 'download' | 'save') => {
    setError(null);
    setSavedTo(null);
    try {
      let result = preview && preview.key === inputsKey() ? { blob: preview.blob, key: preview.key } : null;
      if (!result) {
        setBusy('Starting');
        result = await build();
        const url = URL.createObjectURL(result.blob);
        setPreview({ url, blob: result.blob, key: result.key });
      }
      if (then === 'download') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(result.blob);
        a.download = fileName();
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      if (then === 'save') {
        // Up to the app, which asks which project and files it there - with
        // the design itself, so the job can be reopened in 3D.
        window.parent.postMessage({
          type: 'SAVE_PDF_TO_PROJECT',
          pdf: result.blob,
          fileName: fileName(),
          project: { name: form.projectName, client: form.client, address: form.address, reference: form.reference },
          price: priceValue(),
          scene: useStore.getState().scene,
        }, window.location.origin);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'The PDF could not be built.');
    } finally {
      setBusy(null);
    }
  };

  const stale = !!preview && preview.key !== inputsKey();
  const contactLines = brand.contactInfo.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-[#fafaf9] rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex overflow-hidden">
        {/* ---- the form ---- */}
        <div className="w-[400px] shrink-0 flex flex-col border-r border-black/5 bg-white">
          <div className="px-6 pt-6 pb-4 flex items-start justify-between border-b border-black/5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Export</div>
              <h2 className="text-lg font-bold text-[#1c1f21] mt-0.5">Design proposal</h2>
              <p className="text-[11px] text-gray-500 mt-1">A drawing set in your branding: elevations and plan to scale, your renders, specification.</p>
            </div>
            <button onClick={onClose} disabled={!!busy} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40" aria-label="Close"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6">
            <Section title="Project">
              <div className="space-y-3">
                <div><label className={labelCls}>Project name</label><input className={inputCls} value={form.projectName} onChange={e => set('projectName', e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>Client</label><input className={inputCls} value={form.client} placeholder="Mr & Mrs Smith" onChange={e => set('client', e.target.value)} /></div>
                  <div><label className={labelCls}>Reference</label><input className={inputCls} value={form.reference} placeholder="Q-2041" onChange={e => set('reference', e.target.value)} /></div>
                </div>
                <div><label className={labelCls}>Site address</label><input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} /></div>
                <div><label className={labelCls}>Notes</label><textarea rows={3} className={inputCls} value={form.notes} placeholder="Shown on the specification sheet" onChange={e => set('notes', e.target.value)} /></div>
              </div>
            </Section>

            <Section title="Price">
              <div className="grid grid-cols-3 gap-2">
                {([['estimate', 'Estimate'], ['actual', 'Your price'], ['none', 'No price']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => set('priceMode', k)} className={`py-2 rounded-lg text-[11px] font-semibold transition-colors ${form.priceMode === k ? 'bg-[#3b4d4a] text-white' : 'bg-white border border-black/10 text-gray-600 hover:bg-gray-50'}`}>{l}</button>
                ))}
              </div>
              {form.priceMode === 'estimate' && <p className="text-[11px] text-gray-500 mt-2">£{estimate.toLocaleString('en-GB')}, from the configurator's pricing.</p>}
              {form.priceMode === 'actual' && <input className={inputCls + ' mt-2'} placeholder="£" value={form.actualPrice} onChange={e => set('actualPrice', e.target.value)} />}
            </Section>

            <Section title="Visuals">
              <p className="text-[11px] text-gray-500 mb-3">Attach your renders and photos, and choose the page each goes on - pick the same page for up to four to share it. Star one for the cover.</p>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${dragOver ? 'border-[#3b4d4a] bg-[#3b4d4a]/5' : 'border-black/10 hover:border-[#3b4d4a]/40 bg-white'}`}
              >
                <ImagePlus size={20} className="mx-auto text-[#3b4d4a]/70" />
                <div className="text-[11px] font-semibold text-[#3b4d4a] mt-1.5">Drop images here, or click to choose</div>
                <div className="text-[10px] text-gray-400 mt-0.5">JPG or PNG</div>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
              </div>
              {visuals.length > 0 && (
                <div className="mt-3 space-y-2">
                  {visuals.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white border border-black/5 rounded-xl p-2">
                      <img src={v.dataUrl} alt="" className="w-14 h-10 object-cover rounded-md shrink-0" />
                      <select
                        value={v.page}
                        onChange={e => { const p = parseInt(e.target.value) || 0; setVisuals(list => list.map((x, k) => (k === i ? { ...x, page: p } : x))); }}
                        className="flex-1 min-w-0 text-[11px] font-semibold text-[#1c1f21] bg-transparent border border-black/10 rounded-md px-1.5 py-1 focus:outline-none"
                      >
                        {Array.from({ length: Math.max(visuals.length, Math.max(0, ...visuals.map(x => x.page))) + 1 }, (_, k) => k + 1).map(p => (
                          <option key={p} value={p}>Visuals page {p}</option>
                        ))}
                        <option value={0}>Leave out</option>
                      </select>
                      <button title="Use as the cover" onClick={() => setCover(c => (c === i ? null : i))} className={`p-1 rounded ${cover === i ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}`}><Star size={14} fill={cover === i ? 'currentColor' : 'none'} /></button>
                      <button title="Move up" onClick={() => move(i, -1)} className="p-1 rounded text-gray-300 hover:text-gray-600"><ArrowUp size={13} /></button>
                      <button title="Move down" onClick={() => move(i, 1)} className="p-1 rounded text-gray-300 hover:text-gray-600"><ArrowDown size={13} /></button>
                      <button title="Remove" onClick={() => remove(i)} className="p-1 rounded text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Sheets">
              <label className={labelCls}>Paper</label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {([['A3', 'A3 landscape', '420 x 297 mm, the drawing size'], ['A4', 'A4 landscape', '297 x 210 mm, for the office printer']] as const).map(([k, l, hint]) => (
                  <button key={k} onClick={() => set('paper', k)} className={`px-3 py-2 rounded-lg text-left transition-colors ${form.paper === k ? 'bg-[#3b4d4a] text-white' : 'bg-white border border-black/10 text-gray-600 hover:bg-gray-50'}`}>
                    <div className="text-[11px] font-semibold">{l}</div>
                    <div className={`text-[10px] ${form.paper === k ? 'text-white/70' : 'text-gray-400'}`}>{hint}</div>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                {SECTION_LABELS.map(([k, label, hint]) => (
                  <label key={k} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-black/5 cursor-pointer hover:border-black/15">
                    <input type="checkbox" className="accent-[#3b4d4a]" checked={form.sections[k]} onChange={e => set('sections', { ...form.sections, [k]: e.target.checked })} />
                    <span className="text-xs font-semibold text-[#1c1f21] w-28">{label}</span>
                    <span className="text-[10px] text-gray-400 truncate">{hint}</span>
                  </label>
                ))}
              </div>
              {/* The company's own plan, in place of the drawn one. */}
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-black/5">
                {ownPlan ? <img src={ownPlan.dataUrl} alt="" className="w-12 h-9 object-contain bg-gray-50 rounded shrink-0" /> : <FileText size={16} className="text-gray-300 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-[#1c1f21]">{ownPlan ? 'Using your own floor plan' : 'Floor plan: drawn from the design'}</div>
                  <div className="text-[10px] text-gray-400">{ownPlan ? 'Replaces the drawn plan' : 'Or use your own plan image instead'}</div>
                </div>
                {ownPlan
                  ? <button onClick={() => setOwnPlan(null)} className="text-[11px] text-gray-400 hover:text-red-500">Remove</button>
                  : <button onClick={() => planRef.current?.click()} className="text-[11px] font-semibold text-[#3b4d4a] hover:underline">Upload</button>}
                <input ref={planRef} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setOwnPlan(await readVisual(f)); } catch (err: any) { setError(err?.message || 'Could not read that plan.'); } }} />
              </div>
            </Section>

            <Section title="Branding">
              {embedded ? (
                <>
                  <p className="text-[11px] text-gray-500 mb-3">From your account settings - used on every proposal.</p>
                  <div className="rounded-xl bg-white border border-black/10 overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <div className="w-24 h-14 rounded-lg bg-gray-50 border border-black/5 flex items-center justify-center overflow-hidden shrink-0">
                        {brand.logo ? <img src={brand.logo} alt="Logo" className="max-w-full max-h-full object-contain p-1.5" /> : <span className="text-[10px] text-gray-400">No logo</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#1c1f21] truncate">{brand.companyName || 'No company name'}</div>
                        {contactLines.slice(0, 2).map((l, i) => <div key={i} className="text-[10px] text-gray-400 truncate">{l}</div>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2 border-t border-black/5 bg-gray-50/60">
                      <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: brand.primary }} /> Brand</span>
                      <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: brand.secondary }} /> Accent</span>
                      <span className="text-[10px] text-gray-500 truncate" style={{ fontFamily: fontById(brand.font).css }}>{fontById(brand.font).label}</span>
                    </div>
                  </div>
                  <a href="/account#branding" target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#3b4d4a] hover:underline">
                    <ExternalLink size={12} /> Change in Account settings
                  </a>
                </>
              ) : (<>
              <p className="text-[11px] text-gray-500 mb-3">Used on every proposal from this browser.</p>
              <div className="flex items-center gap-3">
                <div className="w-28 h-16 rounded-lg border border-black/10 bg-white flex items-center justify-center overflow-hidden">
                  {brand.logo ? <img src={brand.logo} alt="Logo" className="max-w-full max-h-full object-contain p-1.5" /> : <span className="text-[10px] text-gray-400">No logo</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => logoRef.current?.click()} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3b4d4a] hover:underline"><Upload size={12} /> {brand.logo ? 'Replace logo' : 'Upload logo'}</button>
                  {brand.logo && <button onClick={() => setBrandField('logo', null)} className="text-[11px] text-gray-400 hover:text-red-500 text-left">Remove</button>}
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setBrandField('logo', await readLogo(f)); } catch (err: any) { setError(err?.message || 'Could not read the logo.'); } }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {([['primary', 'Brand colour'], ['secondary', 'Accent colour']] as const).map(([k, l]) => (
                  <div key={k}>
                    <label className={labelCls}>{l}</label>
                    <div className="flex items-center gap-2 bg-white border border-black/10 rounded-lg px-2 py-1.5">
                      <input type="color" value={brand[k]} onChange={e => setBrandField(k, e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent" />
                      <input className="flex-1 min-w-0 text-[11px] font-mono focus:outline-none" value={brand[k]} onChange={e => { const v = e.target.value; if (/^#[0-9a-f]{6}$/i.test(v)) setBrandField(k, v); }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3"><label className={labelCls}>Company name</label><input className={inputCls} value={brand.companyName} onChange={e => setBrandField('companyName', e.target.value)} /></div>
              <div className="mt-3">
                <label className={labelCls}>Font</label>
                <select className={inputCls} value={fontById(brand.font).id} onChange={e => setBrandField('font', e.target.value)}>
                  {PDF_FONTS.map(f => <option key={f.id} value={f.id}>{f.label} - {f.note}</option>)}
                </select>
                <div className="mt-2 px-3 py-2.5 rounded-lg bg-white border border-black/5" style={{ fontFamily: fontById(brand.font).css }}>
                  <div className="text-[15px] font-bold text-[#1c1f21] leading-tight">{form.projectName || 'Garden Room'}</div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mt-1">Front elevation · 1:50 · 4,300 mm</div>
                </div>
              </div>
              <div className="mt-3"><label className={labelCls}>Contact details</label><textarea rows={4} className={inputCls} value={brand.contactInfo} placeholder={'Unit 4, Mill Lane, Kent\n01622 000000\nhello@company.co.uk\nwww.company.co.uk'} onChange={e => setBrandField('contactInfo', e.target.value)} /></div>
              </>)}
            </Section>
          </div>

          <div className="px-6 py-4 border-t border-black/5 bg-white space-y-2">
            {savedTo && <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><Check size={13} /> Saved to "{savedTo}" in Projects</div>}
            <div className="flex gap-2">
              <button disabled={!!busy} onClick={() => run('preview')} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-[#3b4d4a]/30 text-[#3b4d4a] hover:bg-gray-50 disabled:opacity-50"><Eye size={14} /> {preview ? 'Update' : 'Preview'}</button>
              {embedded && <button disabled={!!busy} onClick={() => run('save')} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-[#3b4d4a]/30 text-[#3b4d4a] hover:bg-gray-50 disabled:opacity-50" title="File this proposal in one of your projects"><FolderInput size={14} /> Save to project</button>}
              <button disabled={!!busy} onClick={() => run('download')} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider bg-[#3b4d4a] text-white hover:opacity-90 disabled:opacity-50"><Download size={14} /> Download</button>
            </div>
          </div>
        </div>

        {/* ---- the preview ---- */}
        <div className="flex-1 relative flex flex-col bg-[#e9e9e6]">
          {preview ? (
            <>
              {stale && !busy && <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/95 border border-black/10 shadow rounded-full px-4 py-1.5 text-[11px] text-gray-600">Changed since this preview - press Update preview</div>}
              <iframe title="Proposal preview" src={preview.url + '#view=FitH'} className="flex-1 w-full border-0" />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
              <FileText size={36} className="text-[#3b4d4a]/40" />
              <div className="text-sm font-semibold text-[#3b4d4a] mt-3">Preview your proposal</div>
              <p className="text-xs text-gray-500 mt-1.5 max-w-sm">Fill in the project, attach your visuals and press Preview. The 3D view is used to draw the elevations, so it will move while the drawings are taken.</p>
            </div>
          )}
          {error && <div className="absolute bottom-4 left-4 right-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-3">{error}</div>}
          {busy && (
            <div className="absolute inset-0 bg-[#fafaf9]/85 backdrop-blur-sm flex flex-col items-center justify-center">
              <Loader2 size={28} className="animate-spin text-[#3b4d4a]" />
              <div className="text-sm font-semibold text-[#3b4d4a] mt-3">{busy}</div>
              <div className="text-[11px] text-gray-500 mt-1">Building your proposal</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
