import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Brain,
  Target,
  Sliders,
  Check,
  RotateCcw,
  BookOpen,
  Zap,
  HelpCircle,
  Award,
  Layers,
  Shield,
  Lightbulb,
  FileText,
  AlertTriangle
} from 'lucide-react';

export interface AIDirectives {
  selectedTopics: string[];
  customTopicFocus: string;
  excludedTopics: string;
  learningMethod:
    | 'balanced'
    | 'feynman'
    | 'active_recall'
    | 'exam_sim'
    | 'spaced_reinforcement'
    | 'socratic'
    | 'cause_consequence'
    | 'youtube_speed'
    | 'exam_patterns_clone';
  difficultyBias: 'all' | '1' | '2' | '3' | '4';
  questionStyle: 'standard' | 'case_study' | 'trap_detector' | 'conceptual_contrast';
  customPrompt: string;
}

export const DEFAULT_AI_DIRECTIVES: AIDirectives = {
  selectedTopics: [],
  customTopicFocus: '',
  excludedTopics: '',
  learningMethod: 'balanced',
  difficultyBias: 'all',
  questionStyle: 'standard',
  customPrompt: '',
};

interface AIDirectivesModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderName: string;
  availableTopics: string[];
  currentDirectives?: AIDirectives;
  onSaveDirectives: (directives: AIDirectives) => void;
}

export default function AIDirectivesModal({
  isOpen,
  onClose,
  folderName,
  availableTopics = [],
  currentDirectives = DEFAULT_AI_DIRECTIVES,
  onSaveDirectives,
}: AIDirectivesModalProps) {
  const [directives, setDirectives] = useState<AIDirectives>({
    ...DEFAULT_AI_DIRECTIVES,
    ...currentDirectives,
  });

  // Re-sync when modal opens or folder changes
  useEffect(() => {
    if (isOpen) {
      setDirectives({
        ...DEFAULT_AI_DIRECTIVES,
        ...currentDirectives,
      });
    }
  }, [isOpen, currentDirectives]);

  if (!isOpen) return null;

  // Toggle chapter/topic selection
  const handleToggleTopic = (topic: string) => {
    setDirectives((prev) => {
      const exists = prev.selectedTopics.includes(topic);
      const nextTopics = exists
        ? prev.selectedTopics.filter((t) => t !== topic)
        : [...prev.selectedTopics, topic];
      return { ...prev, selectedTopics: nextTopics };
    });
  };

  const handleSelectAllTopics = () => {
    setDirectives((prev) => ({
      ...prev,
      selectedTopics: [...availableTopics],
    }));
  };

  const handleClearAllTopics = () => {
    setDirectives((prev) => ({
      ...prev,
      selectedTopics: [],
    }));
  };

  // Quick Preset Configurations
  const applyPreset = (presetKey: 'feynman' | 'exam' | 'active_recall' | 'balanced') => {
    if (presetKey === 'feynman') {
      setDirectives((prev) => ({
        ...prev,
        learningMethod: 'feynman',
        questionStyle: 'conceptual_contrast',
        customPrompt: 'Exige explicar el concepto esencial sin memorización vacía. Incluye una analogía memorable en la explicación.',
      }));
    } else if (presetKey === 'exam') {
      setDirectives((prev) => ({
        ...prev,
        learningMethod: 'exam_sim',
        questionStyle: 'case_study',
        difficultyBias: '4',
        customPrompt: 'Simula preguntas reales de examen oficial u oposición. Enunciados de caso práctico con 4 opciones hiper-verosímiles y trampas sutiles.',
      }));
    } else if (presetKey === 'active_recall') {
      setDirectives((prev) => ({
        ...prev,
        learningMethod: 'active_recall',
        questionStyle: 'trap_detector',
        customPrompt: 'Enfócate en los detalles críticos, excepciones a la regla y los errores conceptuales más frecuentes de los estudiantes.',
      }));
    } else if (presetKey === 'balanced') {
      setDirectives((prev) => ({
        ...prev,
        learningMethod: 'balanced',
        questionStyle: 'standard',
        difficultyBias: 'all',
        customPrompt: '',
      }));
    }
  };

  // Add suggestion pill to customPrompt
  const handleAppendPrompt = (snippet: string) => {
    setDirectives((prev) => {
      const trimmed = prev.customPrompt.trim();
      const next = trimmed ? `${trimmed}. ${snippet}` : snippet;
      return { ...prev, customPrompt: next };
    });
  };

  const handleSave = () => {
    onSaveDirectives(directives);
    onClose();
  };

  const handleReset = () => {
    setDirectives(DEFAULT_AI_DIRECTIVES);
  };

  // Check how many custom restrictions are active
  const activeFiltersCount =
    (directives.selectedTopics.length > 0 ? 1 : 0) +
    (directives.customTopicFocus.trim() ? 1 : 0) +
    (directives.excludedTopics.trim() ? 1 : 0) +
    (directives.learningMethod !== 'balanced' ? 1 : 0) +
    (directives.questionStyle !== 'standard' ? 1 : 0) +
    (directives.customPrompt.trim() ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#14141e] border border-[#2b2b3d] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-[#252536] flex items-center justify-between bg-[#171723]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-900/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Instrucciones & Directivas para la IA</h3>
                {activeFiltersCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {activeFiltersCount} activas
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm sm:max-w-md">
                Carpeta: <span className="text-blue-300 font-semibold">{folderName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-sm text-gray-200 divide-y divide-[#222233]">

          {/* Quick Presets Bar */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Preajustes Rápidos de Aprendizaje</span>
              </label>
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restablecer todo</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('feynman')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  directives.learningMethod === 'feynman'
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                    : 'bg-[#181825] border-[#29293b] text-gray-300 hover:border-gray-600'
                }`}
              >
                <div className="text-sm">🧠 Feynman</div>
                <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">Analogías y comprensión profunda</div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('exam')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  directives.learningMethod === 'exam_sim'
                    ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm'
                    : 'bg-[#181825] border-[#29293b] text-gray-300 hover:border-gray-600'
                }`}
              >
                <div className="text-sm">🏛️ Examen Oficial</div>
                <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">Casos reales y nivel maestro</div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('active_recall')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  directives.learningMethod === 'active_recall'
                    ? 'bg-amber-600/20 border-amber-500 text-white shadow-sm'
                    : 'bg-[#181825] border-[#29293b] text-gray-300 hover:border-gray-600'
                }`}
              >
                <div className="text-sm">⚡ Active Recall</div>
                <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">Trampas y alta dificultad</div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('balanced')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  directives.learningMethod === 'balanced'
                    ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-sm'
                    : 'bg-[#181825] border-[#29293b] text-gray-300 hover:border-gray-600'
                }`}
              >
                <div className="text-sm">🌿 Balanceado</div>
                <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">Progresión 4 niveles estándar</div>
              </button>
            </div>
          </div>

          {/* Section 1: Enfoque Temático (Capítulos / Temas específicos del documento o apuntes) */}
          <div className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-sky-400" />
                  <span>1. Enfoque Temático (Capítulos o Temas a Evaluar)</span>
                </label>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Si tu PDF o material tiene varios temas mezclados, selecciona solo los que deseas estudiar hoy.
                </p>
              </div>

              {availableTopics.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllTopics}
                    className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                  >
                    Todos
                  </button>
                  <span className="text-gray-600 text-xs">·</span>
                  <button
                    type="button"
                    onClick={handleClearAllTopics}
                    className="text-[11px] text-gray-400 hover:underline cursor-pointer"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>

            {/* Chips of available detected topics from document/folder */}
            {availableTopics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-[#12121a] border border-[#252536] max-h-36 overflow-y-auto">
                {availableTopics.map((topic, idx) => {
                  const isSelected = directives.selectedTopics.includes(topic);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleToggleTopic(topic)}
                      className={`text-xs px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-900/40'
                          : 'bg-[#1c1c2b] text-gray-300 hover:bg-[#252538] border border-[#2b2b3d]'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span className="truncate max-w-[200px]">{topic}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-400 italic bg-[#12121a] border border-[#252536] p-2.5 rounded-xl">
                No hay capítulos detectados automáticamente todavía. Puedes escribir temas específicos abajo:
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  Enfoque Específico (Opcional)
                </label>
                <input
                  type="text"
                  value={directives.customTopicFocus}
                  onChange={(e) => setDirectives({ ...directives, customTopicFocus: e.target.value })}
                  placeholder="Ej: Artículos 10 al 25, o Enzimas del Ciclo de Krebs..."
                  className="w-full bg-[#121218] border border-[#2e2e42] focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-red-300 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span>Temas a Excluir / Ignorar</span>
                </label>
                <input
                  type="text"
                  value={directives.excludedTopics}
                  onChange={(e) => setDirectives({ ...directives, excludedTopics: e.target.value })}
                  placeholder="Ej: Ignorar fechas, omitir introducción histórica..."
                  className="w-full bg-[#121218] border border-[#2e2e42] focus:border-red-500 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Metodología de Aprendizaje Acelerado & Avanzado */}
          <div className="pt-5 space-y-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                <span>2. Metodología de Aprendizaje Acelerado</span>
              </label>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Define cómo la IA estructura los desafíos cognitivos para maximizar tu retención.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                {
                  id: 'balanced',
                  title: 'Progresión 4 Niveles',
                  badge: 'Estándar',
                  desc: 'Del concepto a la maestría equilibrada.',
                  icon: '🌱',
                },
                {
                  id: 'feynman',
                  title: 'Método Feynman',
                  badge: 'Síntesis',
                  desc: 'Analogías memorables y comprensión profunda sin jerga.',
                  icon: '🧠',
                },
                {
                  id: 'active_recall',
                  title: 'Active Recall Extremo',
                  badge: 'Alta fricción',
                  desc: 'Preguntas desafiantes con trampas sutiles deliberadas.',
                  icon: '⚡',
                },
                {
                  id: 'exam_sim',
                  title: 'Simulador Examen',
                  badge: 'Oposiciones',
                  desc: 'Casos prácticos de diagnóstico y juicio profesional.',
                  icon: '🏛️',
                },
                {
                  id: 'spaced_reinforcement',
                  title: 'Refuerzo de Errores',
                  badge: 'Puntos ciegos',
                  desc: 'Ataca las excepciones y confusiones más frecuentes.',
                  icon: '🔄',
                },
                {
                  id: 'socratic',
                  title: 'Deducción Socrática',
                  badge: 'Causa-Efecto',
                  desc: 'Preguntas que exigen inferir el mecanismo lógico.',
                  icon: '💡',
                },
                {
                  id: 'cause_consequence',
                  title: 'Mapa Causa-Efecto',
                  badge: 'Interconectado',
                  desc: 'Pilares de detonantes, quiebre central y consecuencias.',
                  icon: '🗺️',
                },
                {
                  id: 'youtube_speed',
                  title: 'Modo "A Toda Leche"',
                  badge: 'Estilo YouTube',
                  desc: 'Divulgación ágil, trepidante y sin libros aburridos.',
                  icon: '⚡',
                },
                {
                  id: 'exam_patterns_clone',
                  title: 'Clon de Admisión',
                  badge: 'Adaptativo',
                  desc: 'Mimetiza preguntas reales y frecuencias del examen.',
                  icon: '🎯',
                },
              ].map((m) => {
                const isSelected = directives.learningMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDirectives({ ...directives, learningMethod: m.id as any })}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 shadow-md shadow-blue-900/20'
                        : 'bg-[#181825] border-[#29293b] hover:bg-[#1d1d2d] text-gray-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-base">{m.icon}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
                          {m.badge}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-white mt-1.5">{m.title}</div>
                      <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{m.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Estilo de Pregunta Preferido */}
          <div className="pt-5 space-y-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. Formato y Enfoque de las Preguntas</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'standard', label: 'Estándar Oficial', desc: 'Equilibrado' },
                { id: 'case_study', label: 'Casos Prácticos', desc: 'Escenarios reales' },
                { id: 'trap_detector', label: 'Trampas de Examen', desc: 'Distractores verosímiles' },
                { id: 'conceptual_contrast', label: 'Contraste Directo', desc: 'Diferencias clave' },
              ].map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setDirectives({ ...directives, questionStyle: style.id as any })}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    directives.questionStyle === style.id
                      ? 'bg-emerald-600/20 border-emerald-500 text-white'
                      : 'bg-[#181825] border-[#29293b] text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="text-xs font-bold">{style.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{style.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Instrucciones Libres del Usuario para la IA (Custom Prompt Directives) */}
          <div className="pt-5 space-y-2.5">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>4. Instrucciones Directas para la IA (Prompt Libre)</span>
              </label>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Dale órdenes específicas a la IA como si fuera tu profesor particular.
              </p>
            </div>

            <textarea
              rows={3}
              value={directives.customPrompt}
              onChange={(e) => setDirectives({ ...directives, customPrompt: e.target.value })}
              placeholder="Ej: 'Prioriza preguntas de aplicación clínica', 'No preguntes nombres de autores', 'Enfócate en fórmulas y cálculos paso a paso'..."
              className="w-full bg-[#121218] border border-[#2e2e42] focus:border-blue-500 rounded-xl p-3 text-xs text-white placeholder-gray-500 focus:outline-none font-sans leading-relaxed resize-y"
            />

            {/* Quick snippet suggestion tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-gray-400">Insertar rápido:</span>
              {[
                '+ Casos Clínicos / Prácticos',
                '+ Evitar preguntas de fechas',
                '+ Énfasis en excepciones a la ley',
                '+ Trampas de examen difíciles',
                '+ Incluir analogías en explicación',
                '+ Exigir razonamiento causal',
              ].map((tag, tIdx) => (
                <button
                  key={tIdx}
                  type="button"
                  onClick={() => handleAppendPrompt(tag.replace(/^\+\s*/, ''))}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-[#1d1d2c] hover:bg-[#27273a] text-blue-300 border border-[#2f2f45] transition cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#252536] flex items-center justify-between bg-[#171723]">
          <div className="text-xs text-gray-400">
            {activeFiltersCount > 0 ? (
              <span className="text-emerald-400 font-medium">✓ Directivas listas para esta carpeta</span>
            ) : (
              <span>Modo estándar predeterminado</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Guardar Directivas</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
