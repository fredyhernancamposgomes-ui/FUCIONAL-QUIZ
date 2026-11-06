import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Layers,
  FileText,
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Star,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Flame,
  Volume2,
  VolumeX,
  Upload,
  Download,
  Shuffle,
  Shield,
  Zap,
  Award,
  BarChart3,
  Lightbulb,
  FileCheck2,
  ListFilter,
  Folder,
  FolderPlus,
  FolderOpen,
  Trash2,
  Edit3,
  Plus,
  Save,
  CheckSquare,
  PanelLeft,
  PanelLeftClose,
  Menu,
  X,
  Cloud,
  Sliders,
  Target,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Send,
  Compass
} from 'lucide-react';
import DriveAndOcrModal, { ImportedDocumentData } from './components/DriveAndOcrModal';
import AIDirectivesModal, { AIDirectives, DEFAULT_AI_DIRECTIVES } from './components/AIDirectivesModal';

// ============================================================================
// AUDIO SYNTHESIZER (WEB AUDIO API - ZERO DEPENDENCIES)
// ============================================================================
class SoundEffects {
  private ctx: AudioContext | null = null;
  public soundEnabled = true;

  private getContext(): AudioContext | null {
    if (!this.soundEnabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  playClick() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(850, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (_) {}
  }

  playCorrect() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);
        gain.gain.setValueAtTime(0.1, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.22);
      });
    } catch (_) {}
  }

  playWrong() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [240, 190].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.08, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.18);
      });
    } catch (_) {}
  }

  playLevelUp() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [440, 554.37, 659.25, 880, 1108.73, 1318.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.12, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.35);
      });
    } catch (_) {}
  }

  playFlip() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.07);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch (_) {}
  }
}

const sfx = new SoundEffects();

// ============================================================================
// DATA MODELS
// ============================================================================
interface Question {
  id: string;
  pregunta: string;
  opciones: string[];
  correcta: number;
  nivel: number; // 1, 2, 3 o 4
  explicacion: string;
  analisisDistractores?: string;
  evidenciaApuntes?: string;
  tipExamen?: string;
}

interface Flashcard {
  id: string;
  concepto: string;
  definicion: string;
  categoria?: string;
  nemotecnia?: string;
  dificultad?: string;
}

interface MaterialAnalysis {
  titulo: string;
  temasClave: string[];
  densidad: string;
  resumenBreve: string;
}

export interface SourceDocument {
  title: string;
  fileName: string;
  fileSize: string;
  summary: string;
  chapters: string[];
  conceptualContext: string;
  addedAt: number;
  tipoDocumento?: string;
  materias?: string[];
  preguntasBanco?: Question[];
}

export interface StudyFolder {
  id: string;
  name: string;
  icon: string;
  color?: string;
  notes: string;
  sourceDoc?: SourceDocument | null;
  sourceDocs?: SourceDocument[];
  aiDirectives?: AIDirectives;
  analysis: MaterialAnalysis | null;
  preguntas: Question[];
  quizIndex: number;
  score: number;
  streak: number;
  maxStreak: number;
  totalAnswered: number;
  evaluatedQuestions: Record<string, boolean>;
  feedbackVote: Record<string, 'up' | 'down'>;
  levelScores: Record<number, { correct: number; total: number }>;
  flashcards: Flashcard[];
  cardIndex: number;
  cardIntervals: Record<string, 'again' | 'hard' | 'good' | 'easy'>;
  guideContent: string;
  createdAt: number;
  updatedAt: number;
}

// 4 Progressive Level Definitions
const LEVEL_METADATA: Record<number, { title: string; subtitle: string; color: string; badge: string; icon: string }> = {
  1: {
    title: 'Nivel 1: Fundamentos y Definiciones',
    subtitle: 'Memorización activa de términos y hechos esenciales',
    color: 'from-blue-600 to-indigo-600',
    badge: 'Básico',
    icon: '🌱',
  },
  2: {
    title: 'Nivel 2: Comprensión y Mecanismos',
    subtitle: 'Interconexión lógica, causas, efectos y procesos',
    color: 'from-indigo-600 to-purple-600',
    badge: 'Intermedio',
    icon: '⚡',
  },
  3: {
    title: 'Nivel 3: Aplicación y Casos Prácticos',
    subtitle: 'Resolución de escenarios y diagnóstico de problemas',
    color: 'from-purple-600 to-pink-600',
    badge: 'Avanzado',
    icon: '🎯',
  },
  4: {
    title: 'Nivel 4: Nivel Maestro & Juicio Crítico',
    subtitle: 'Síntesis extrema y trampas típicas de examen oficial',
    color: 'from-amber-500 via-orange-500 to-rose-600',
    badge: 'Maestría',
    icon: '👑',
  },
};

// Rich presets designed for deep test
const SAMPLE_PRESETS = [
  {
    title: '🧬 Biología Molecular: Mitocondrias y Bioenergética Celular',
    content: `La mitocondria es un orgánulo celular eucariota especializado en la producción de energía química mediante la respiración celular aeróbica, culminando en la fosforilación oxidativa generadora de adenosín trifosfato (ATP).

1. ARQUITECTURA ULTRAESTRUCTURAL:
- Membrana Externa: Presenta una bicapa lipídica lisa con alta densidad de porinas (canales proteicos transmembrana voltaje-dependientes, VDAC), haciéndola libremente permeable a iones, azúcares y nucleótidos de hasta 5,000 Daltons.
- Espacio Intermembrana: Compartimento con composición similar al citosol, crucial para la acumulación activa de protones (H+). Contiene citocromo c, cuya liberación al citosol dispara la apoptosis intrínseca mediada por caspasas.
- Membrana Interna: Altamente impermeable y rica en cardiolipina (difosfatidilglicerol), lípido que previene fugas protónicas. Se repliega en crestas mitocondriales, aumentando drásticamente la superficie catalítica disponible para los complejos de la cadena de transporte de electrones (Complejos I, II, III, IV) y la ATP sintasa (Complejo V).
- Matriz Mitocondrial: Contiene las enzimas hidrosolubles del ciclo de Krebs (ácido cítrico), la beta-oxidación de ácidos grasos, el ciclo de la urea hepático y la enzima piruvato deshidrogenasa. Además, aloja el genoma mitocondrial (ADNmt) circular bicatenario sin histonas y ribosomas 70S propios.

2. MECANISMO DE QUIMIÓSMOSIS (HIPÓTESIS DE PETER MITCHELL):
Los electrones de alta energía derivados del NADH y FADH2 son transportados secuencialmente a través de los complejos proteicos:
- Complejo I (NADH deshidrogenasa) bombea 4 H+ al espacio intermembrana por cada molécula de NADH oxidada.
- Complejo II (Succinato deshidrogenasa) transfiere electrones desde succinato a ubiquinona (coenzima Q) sin bombeo directo de protones.
- Complejo III (Citocromo bc1) opera el ciclo Q y bombea 4 H+.
- Complejo IV (Citocromo c oxidasa) transfiere 4 electrones al oxígeno molecular (el aceptor final), reduciéndolo a agua (H2O) y bombeando 2 H+.
Este flujo direccional genera una fuerza protón-motriz compuesta por un gradiente de concentración de pH (ΔpH) y un potencial de membrana eléctrico (ΔΨm).

3. SÍNTESIS DE ATP Y ACOPLAMIENTO QUIMIOOSMÓTICO:
Los protones acumulados en el espacio intermembrana fluyen a favor de su gradiente electroquímico de regreso a la matriz a través de la porción F0 de la ATP sintasa. Este flujo hace rotar el anillo de subunidades c, provocando cambios conformacionales en la porción catalítica F1 (mecanismo de alternancia de conformaciones de Boyer: abierta, laxa y tensa), fosforilando ADP + Pi en ATP. Desacopladores químicos como el 2,4-dinitrofenol (DNP) o la termogenina (UCP-1) disipan el gradiente protónico generando calor sin producir ATP.

4. ENDOSIMBIOSIS Y HERENCIA:
La teoría endosimbiótica de Lynn Margulis demuestra que las mitocondrias derivan evolutivamente de una alfaproteobacteria fagocitada por una célula protoeucariota. En mamíferos, la herencia del ADN mitocondrial es estrictamente materna; las mitocondrias de los espermatozoides son marcadas con ubiquitina y degradadas selectivamente tras la fertilización.`
  },
  {
    title: '⚖️ Derecho Constitucional y Tutelar de Garantías Fundamentales',
    content: `Las garantías constitucionales son el conjunto de instrumentos procesales instituidos por la norma fundamental para asegurar la efectividad, vigencia y defensa judicial tutelar de los derechos humanos y libertades individuales frente a arbitrariedades estatales o particulares.

1. ACCIÓN DE TUTELA / RECURSO DE AMPARO:
- Finalidad: Protección inmediata y preferente de los derechos fundamentales ante acciones u omisiones de autoridades públicas o particulares en situaciones de subordinación o indefensión.
- Subsidiariedad y Residualidad: Solo procede cuando el afectado no disponga de otro mecanismo de defensa judicial idóneo y eficaz, salvo que se interponga como mecanismo transitorio para conjurar un perjuicio irremediable inminente y grave.
- Inmediatez: La acción debe interponerse dentro de un plazo temporal razonable y oportuno tras la ocurrencia del hecho vulnerador.

2. HABEAS CORPUS:
- Naturaleza: Garantía de la libertad personal e indemnidad física frente a privaciones de libertad arbitrarias o prolongaciones ilegales de la detención.
- Principios Rectores: Trámite inmediato preferencial que debe resolverse en un término perentorio no mayor a 36 horas; no admite suspensiones por estados de excepción; puede ser interpuesto por el propio detenido o por cualquier tercero en su nombre sin necesidad de apoderado judicial.

3. HABEAS DATA:
- Faculta a toda persona a conocer, actualizar y rectificar las informaciones recolectadas sobre ella en bancos de datos públicos y privados (derecho a la autodeterminación informativa). Consagra además el derecho al olvido y la caducidad del dato negativo comercial o crediticio tras un periodo temporal razonable.

4. TEST DE PROPORCIONALIDAD Y PONDERACIÓN (ROBERT ALEXY):
Para determinar la constitucionalidad de una medida legislativa o ejecutiva que restrinja un derecho fundamental, el tribunal debe examinar:
- Idoneidad: La medida debe ser apta causalmente para alcanzar un fin constitucionalmente legítimo.
- Necesidad: No debe existir una medida alternativa menos lesiva para el derecho fundamental que alcance el mismo fin con idéntica eficacia.
- Proporcionalidad en sentido estricto: Las ventajas de alcanzar el fin buscado deben compensar con holgura los sacrificios y costos impuestos al derecho restringido.`
  },
  {
    title: '🪐 Astrofísica Teórica: Relatividad General y Física de Agujeros Negros',
    content: `La Relatividad General, formulada por Albert Einstein en 1915, redefinió la comprensión gravitatoria: la gravedad no es una fuerza newtoniana a distancia, sino la manifestación de la curvatura dinámica del espacio-tiempo de cuatro dimensiones inducida por la densidad de masa, energía y momento (descrita formalmente por el tensor de energía-impulso en las Ecuaciones de Campo de Einstein).

1. GEOMETRÍA DEL ESPACIO-TIEMPO:
- Principio de Equivalencia Débil y Fuerte: La aceleración inercial y los efectos de la gravedad son localmente indistinguibles en un marco de referencia en caída libre.
- Geodésicas Nulas y Temporales: La luz y los cuerpos masivos siguen geodésicas (las trayectorias más rectas posibles en una variedad geométrica curva de Riemann). Fenómenos como la deflexión de la luz y las lentes gravitacionales confirman que la masa curva la luz.
- Dilatación Gravitacional del Tiempo: Los relojes situados en campos gravitatorios más intensos (más cerca de una masa concentrada) transcurren a un ritmo temporal mediblemente más lento respecto a observadores distantes.

2. AGUJEROS NEGROS DE SCHWARZSCHILD Y KERR:
- Solución de Schwarzschild: Describe un agujero negro estático sin carga ni rotación. El Radio de Schwarzschild define el Horizonte de Sucesos: Rs = 2GM / c^2. Para la masa solar, Rs ≈ 3 kilómetros.
- Horizonte de Sucesos: Superficie matemática unidireccional y membrana causal. La velocidad de escape en su interior supera la constante cósmica c (velocidad de la luz en el vacío); ningún cuanto de información o fotón puede escapar hacia el infinito espacial.
- Agujero Negro de Kerr: Describe cuerpos colapsados con momento angular (rotación). Genera la ergosfera exterior mediante el arrastre de marcos de referencia (efecto Lense-Thirring), permitiendo extraer energía rotacional mediante el Proceso de Penrose.
- Singularidad Espaciotemporal: Región central donde la métrica geométrica y la curvatura del tensor de Riemann divergen al infinito, indicando el límite de validez de la relatividad general y la necesidad ineludible de una gravedad cuántica unificada.

3. TERMODINÁMICA Y RADIACIÓN DE HAWKING:
Jacob Bekenstein y Stephen Hawking demostraron que los agujeros negros no son totalmente fríos ni negros:
- La entropía de un agujero negro es estrictamente proporcional al área superficial de su horizonte de sucesos (S_BH = k_B * A / (4 * l_Planck^2)), no a su volumen interno (Principio Holográfico).
- Radiación de Hawking: Fluctuaciones cuánticas de pares partícula-antipartícula en el vacío próximo al horizonte provocan la captura de una partícula con energía negativa relativa al infinito y la emisión de otra partícula al exterior, causando la lenta evaporación térmica del agujero negro.`
  }
];

// Pre-seeded folders for immediate independent topic navigation
const INITIAL_FOLDERS: StudyFolder[] = [
  {
    id: 'folder-bio',
    name: 'Biología Molecular: Bioenergética Celular',
    icon: '🧬',
    color: 'emerald',
    notes: SAMPLE_PRESETS[0].content,
    analysis: {
      titulo: 'Bioenergética y Fosforilación Oxidativa',
      temasClave: ['Arquitectura Ultraestructural', 'Quimiósmosis de Mitchell', 'ATP Sintasa F0F1', 'Endosimbiosis de Margulis'],
      densidad: 'Alta (Científica)',
      resumenBreve: 'Estudio exhaustivo del transporte mitocondrial de electrones, fuerza protón-motriz y síntesis quimiosmótica de ATP.',
    },
    preguntas: [],
    quizIndex: 0,
    score: 0,
    streak: 0,
    maxStreak: 0,
    totalAnswered: 0,
    evaluatedQuestions: {},
    feedbackVote: {},
    levelScores: { 1: { correct: 0, total: 0 }, 2: { correct: 0, total: 0 }, 3: { correct: 0, total: 0 }, 4: { correct: 0, total: 0 } },
    flashcards: [],
    cardIndex: 0,
    cardIntervals: {},
    guideContent: '',
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: 'folder-der',
    name: 'Derecho Constitucional: Garantías Fundamentales',
    icon: '⚖️',
    color: 'blue',
    notes: SAMPLE_PRESETS[1].content,
    analysis: null,
    preguntas: [],
    quizIndex: 0,
    score: 0,
    streak: 0,
    maxStreak: 0,
    totalAnswered: 0,
    evaluatedQuestions: {},
    feedbackVote: {},
    levelScores: { 1: { correct: 0, total: 0 }, 2: { correct: 0, total: 0 }, 3: { correct: 0, total: 0 }, 4: { correct: 0, total: 0 } },
    flashcards: [],
    cardIndex: 0,
    cardIntervals: {},
    guideContent: '',
    createdAt: 1710001000000,
    updatedAt: 1710001000000,
  },
  {
    id: 'folder-astro',
    name: 'Astrofísica: Relatividad y Agujeros Negros',
    icon: '🪐',
    color: 'purple',
    notes: SAMPLE_PRESETS[2].content,
    analysis: null,
    preguntas: [],
    quizIndex: 0,
    score: 0,
    streak: 0,
    maxStreak: 0,
    totalAnswered: 0,
    evaluatedQuestions: {},
    feedbackVote: {},
    levelScores: { 1: { correct: 0, total: 0 }, 2: { correct: 0, total: 0 }, 3: { correct: 0, total: 0 }, 4: { correct: 0, total: 0 } },
    flashcards: [],
    cardIndex: 0,
    cardIntervals: {},
    guideContent: '',
    createdAt: 1710002000000,
    updatedAt: 1710002000000,
  },
];

const loadInitialFolders = (): { folders: StudyFolder[]; activeId: string } => {
  if (typeof window === 'undefined') {
    return { folders: INITIAL_FOLDERS, activeId: INITIAL_FOLDERS[0].id };
  }
  try {
    const raw = localStorage.getItem('thea_study_folders_v2');
    const savedActiveId = localStorage.getItem('thea_active_folder_id_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const activeId = parsed.some((f: StudyFolder) => f.id === savedActiveId)
          ? savedActiveId!
          : parsed[0].id;
        return { folders: parsed, activeId };
      }
    }
  } catch (e) {
    console.warn('Error loading stored folders:', e);
  }
  return { folders: INITIAL_FOLDERS, activeId: INITIAL_FOLDERS[0].id };
};

export default function App() {
  // Navigation tabs
  const [currentView, setCurrentView] = useState<'materiales' | 'quiz' | 'flashcards' | 'guia' | 'consulta'>('materiales');

  // Audio mute toggle
  const [soundOn, setSoundOn] = useState<boolean>(true);

  // Collapsible Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('thea_sidebar_open');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('thea_sidebar_open', String(next));
      } catch {}
      sfx.playClick();
      return next;
    });
  };

  // Multi-Folder Workspace System
  const [folders, setFolders] = useState<StudyFolder[]>(() => loadInitialFolders().folders);
  const [activeFolderId, setActiveFolderId] = useState<string>(() => loadInitialFolders().activeId);
  const isSwitchingFolderRef = useRef<boolean>(false);

  // Folder Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showOcrModal, setShowOcrModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [newFolderIcon, setNewFolderIcon] = useState<string>('📚');
  const [newFolderStarterNotes, setNewFolderStarterNotes] = useState<string>('');
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string; icon: string } | null>(null);

  // Active folder entity
  const activeFolder = folders.find((f) => f.id === activeFolderId) || folders[0] || INITIAL_FOLDERS[0];

  // Notes and material for currently active folder
  const [notes, setNotes] = useState<string>(activeFolder.notes || '');
  const [sourceDocs, setSourceDocs] = useState<SourceDocument[]>(
    activeFolder.sourceDocs || (activeFolder.sourceDoc ? [activeFolder.sourceDoc] : [])
  );
  const [sourceDoc, setSourceDoc] = useState<SourceDocument | null>(
    activeFolder.sourceDoc || (activeFolder.sourceDocs?.[0] || null)
  );
  const [aiDirectives, setAiDirectives] = useState<AIDirectives>(
    activeFolder.aiDirectives || DEFAULT_AI_DIRECTIVES
  );
  const [showDirectivesModal, setShowDirectivesModal] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<MaterialAnalysis | null>(activeFolder.analysis || null);
  const [analyzingDoc, setAnalyzingDoc] = useState<boolean>(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File upload drag
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Progressive 4-Level Quiz
  const [preguntas, setPreguntas] = useState<Question[]>(activeFolder.preguntas || []);
  const [activeLevelFilter, setActiveLevelFilter] = useState<number | 'all'>('all');
  const [quizIndex, setQuizIndex] = useState<number>(activeFolder.quizIndex || 0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [score, setScore] = useState<number>(activeFolder.score || 0);
  const [levelScores, setLevelScores] = useState<Record<number, { correct: number; total: number }>>(
    activeFolder.levelScores || {
      1: { correct: 0, total: 0 },
      2: { correct: 0, total: 0 },
      3: { correct: 0, total: 0 },
      4: { correct: 0, total: 0 },
    }
  );
  const [evaluatedQuestions, setEvaluatedQuestions] = useState<Record<string, boolean>>(
    activeFolder.evaluatedQuestions || {}
  );
  const [feedbackVote, setFeedbackVote] = useState<Record<string, 'up' | 'down'>>(
    activeFolder.feedbackVote || {}
  );
  const [quizNotice, setQuizNotice] = useState<string>('');
  const [showLevelUpCelebration, setShowLevelUpCelebration] = useState<number | null>(null);

  // Collapsible explanation, deep context exploration and in-quiz doubt solver
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [questionContexts, setQuestionContexts] = useState<Record<string, any>>({});
  const [loadingContext, setLoadingContext] = useState<boolean>(false);
  const [showDoubtBox, setShowDoubtBox] = useState<boolean>(false);
  const [userDoubtInput, setUserDoubtInput] = useState<string>('');
  const [askingDoubt, setAskingDoubt] = useState<boolean>(false);
  const [questionDoubts, setQuestionDoubts] = useState<Record<string, { query: string; answer: string; time: number }[]>>({});
  const [contextActiveTab, setContextActiveTab] = useState<'mapa' | 'todaLeche' | 'trampas'>('mapa');
  const [selectedMentalNode, setSelectedMentalNode] = useState<string | null>(null);

  // Admission Exam Intelligence & Pattern Radiography
  const [examPatterns, setExamPatterns] = useState<any>(null);
  const [loadingPatterns, setLoadingPatterns] = useState<boolean>(false);
  const [showPatternsModal, setShowPatternsModal] = useState<boolean>(false);

  // Infinite Quiz Continuous Engine State
  const [isInfiniteMode, setIsInfiniteMode] = useState<boolean>(true);
  const [fetchingMore, setFetchingMore] = useState<boolean>(false);
  const [streak, setStreak] = useState<number>(activeFolder.streak || 0);
  const [maxStreak, setMaxStreak] = useState<number>(activeFolder.maxStreak || 0);
  const [totalAnswered, setTotalAnswered] = useState<number>(activeFolder.totalAnswered || 0);

  // Flashcards (Anki Leitner System)
  const [flashcards, setFlashcards] = useState<Flashcard[]>(activeFolder.flashcards || []);
  const [cardIndex, setCardIndex] = useState<number>(activeFolder.cardIndex || 0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [cardIntervals, setCardIntervals] = useState<Record<string, 'again' | 'hard' | 'good' | 'easy'>>(
    activeFolder.cardIntervals || {}
  );

  // Study Guide
  const [guideContent, setGuideContent] = useState<string>(activeFolder.guideContent || '');
  const [copiedGuide, setCopiedGuide] = useState<boolean>(false);

  // Tutor
  const [tutorQuery, setTutorQuery] = useState<string>('');
  const [tutorResponse, setTutorResponse] = useState<string>('');
  const [tutorLoading, setTutorLoading] = useState<boolean>(false);

  // TTS Reader
  const [speaking, setSpeaking] = useState<boolean>(false);

  // Toggle sound
  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    sfx.soundEnabled = next;
  };

  // Synchronize changes back to the active folder in `folders` and `localStorage`
  useEffect(() => {
    if (isSwitchingFolderRef.current) {
      isSwitchingFolderRef.current = false;
      return;
    }
    if (!activeFolderId) return;

    setFolders((prevFolders) => {
      const updated = prevFolders.map((f) => {
        if (f.id !== activeFolderId) return f;
        return {
          ...f,
          notes,
          sourceDoc: sourceDocs[0] || null,
          sourceDocs,
          aiDirectives,
          analysis,
          preguntas,
          quizIndex,
          score,
          streak,
          maxStreak,
          totalAnswered,
          evaluatedQuestions,
          feedbackVote,
          levelScores,
          flashcards,
          cardIndex,
          cardIntervals,
          guideContent,
          updatedAt: Date.now(),
        };
      });
      try {
        localStorage.setItem('thea_study_folders_v2', JSON.stringify(updated));
        localStorage.setItem('thea_active_folder_id_v2', activeFolderId);
      } catch (_) {}
      return updated;
    });
  }, [
    activeFolderId,
    notes,
    sourceDoc,
    sourceDocs,
    aiDirectives,
    analysis,
    preguntas,
    quizIndex,
    score,
    streak,
    maxStreak,
    totalAnswered,
    evaluatedQuestions,
    feedbackVote,
    levelScores,
    flashcards,
    cardIndex,
    cardIntervals,
    guideContent,
  ]);

  // Switch between study folders smoothly with full state preservation
  const switchFolder = (targetFolderId: string) => {
    if (targetFolderId === activeFolderId) return;
    const targetFolder = folders.find((f) => f.id === targetFolderId);
    if (!targetFolder) return;

    // Snapshot current active folder state first
    const updatedFolders = folders.map((f) => {
      if (f.id !== activeFolderId) return f;
      return {
        ...f,
        notes,
        sourceDoc: sourceDocs[0] || null,
        sourceDocs,
        aiDirectives,
        analysis,
        preguntas,
        quizIndex,
        score,
        streak,
        maxStreak,
        totalAnswered,
        evaluatedQuestions,
        feedbackVote,
        levelScores,
        flashcards,
        cardIndex,
        cardIntervals,
        guideContent,
        updatedAt: Date.now(),
      };
    });
    setFolders(updatedFolders);
    try {
      localStorage.setItem('thea_study_folders_v2', JSON.stringify(updatedFolders));
      localStorage.setItem('thea_active_folder_id_v2', targetFolderId);
    } catch (_) {}

    // Mark switching ref to avoid effect overriding target folder
    isSwitchingFolderRef.current = true;

    // Load target folder state
    setActiveFolderId(targetFolderId);
    setNotes(targetFolder.notes || '');
    setSourceDocs(targetFolder.sourceDocs || (targetFolder.sourceDoc ? [targetFolder.sourceDoc] : []));
    setSourceDoc(targetFolder.sourceDoc || (targetFolder.sourceDocs?.[0] || null));
    setAiDirectives(targetFolder.aiDirectives || DEFAULT_AI_DIRECTIVES);
    setAnalysis(targetFolder.analysis || null);
    setPreguntas(targetFolder.preguntas || []);
    setQuizIndex(targetFolder.quizIndex || 0);
    setScore(targetFolder.score || 0);
    setStreak(targetFolder.streak || 0);
    setMaxStreak(targetFolder.maxStreak || 0);
    setTotalAnswered(targetFolder.totalAnswered || 0);
    setEvaluatedQuestions(targetFolder.evaluatedQuestions || {});
    setFeedbackVote(targetFolder.feedbackVote || {});
    setLevelScores(
      targetFolder.levelScores || {
        1: { correct: 0, total: 0 },
        2: { correct: 0, total: 0 },
        3: { correct: 0, total: 0 },
        4: { correct: 0, total: 0 },
      }
    );
    setFlashcards(targetFolder.flashcards || []);
    setCardIndex(targetFolder.cardIndex || 0);
    setCardIntervals(targetFolder.cardIntervals || {});
    setGuideContent(targetFolder.guideContent || '');
    setSelectedOption(null);
    setRevealed(false);
    setIsFlipped(false);
    setErrorMessage(null);
    setQuizNotice('');

    sfx.playClick();
  };

  // Create a brand new independent study folder
  const handleCreateFolder = (
    name: string,
    icon: string,
    starterNotes: string = '',
    starterDoc: SourceDocument | null = null,
    starterDocs: SourceDocument[] = []
  ) => {
    const newId = 'folder-' + Date.now();
    const docs = starterDocs.length > 0 ? starterDocs : (starterDoc ? [starterDoc] : []);
    const initialExamQuestions: Question[] = [];
    docs.forEach((d) => {
      if (Array.isArray(d.preguntasBanco) && d.preguntasBanco.length > 0) {
        initialExamQuestions.push(...d.preguntasBanco);
      }
    });

    const newFolder: StudyFolder = {
      id: newId,
      name: name.trim() || 'Nuevo Tema de Estudio',
      icon: icon || (docs[0]?.tipoDocumento === 'EXAMEN_ADMISION' ? '🏛️' : '📚'),
      notes: starterNotes,
      sourceDoc: starterDoc || docs[0] || null,
      sourceDocs: docs,
      aiDirectives: DEFAULT_AI_DIRECTIVES,
      analysis: null,
      preguntas: initialExamQuestions,
      quizIndex: 0,
      score: 0,
      streak: 0,
      maxStreak: 0,
      totalAnswered: 0,
      evaluatedQuestions: {},
      feedbackVote: {},
      levelScores: { 1: { correct: 0, total: 0 }, 2: { correct: 0, total: 0 }, 3: { correct: 0, total: 0 }, 4: { correct: 0, total: 0 } },
      flashcards: [],
      cardIndex: 0,
      cardIntervals: {},
      guideContent: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const currentUpdated = folders.map((f) => {
      if (f.id !== activeFolderId) return f;
      return {
        ...f,
        notes,
        sourceDoc: sourceDocs[0] || null,
        sourceDocs,
        aiDirectives,
        analysis,
        preguntas,
        quizIndex,
        score,
        streak,
        maxStreak,
        totalAnswered,
        evaluatedQuestions,
        feedbackVote,
        levelScores,
        flashcards,
        cardIndex,
        cardIntervals,
        guideContent,
        updatedAt: Date.now(),
      };
    });

    const nextFolders = [newFolder, ...currentUpdated];
    setFolders(nextFolders);

    isSwitchingFolderRef.current = true;
    setActiveFolderId(newId);
    setNotes(starterNotes);
    setSourceDocs(docs);
    setSourceDoc(starterDoc || docs[0] || null);
    setAiDirectives(DEFAULT_AI_DIRECTIVES);
    setAnalysis(null);
    setPreguntas([]);
    setQuizIndex(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setTotalAnswered(0);
    setEvaluatedQuestions({});
    setFeedbackVote({});
    setLevelScores({ 1: { correct: 0, total: 0 }, 2: { correct: 0, total: 0 }, 3: { correct: 0, total: 0 }, 4: { correct: 0, total: 0 } });
    setFlashcards([]);
    setCardIndex(0);
    setCardIntervals({});
    setGuideContent('');
    setSelectedOption(null);
    setRevealed(false);
    setIsFlipped(false);
    setErrorMessage(null);
    setQuizNotice('');
    setShowCreateModal(false);
    setCurrentView('materiales');

    try {
      localStorage.setItem('thea_study_folders_v2', JSON.stringify(nextFolders));
      localStorage.setItem('thea_active_folder_id_v2', newId);
    } catch (_) {}

    sfx.playLevelUp();
  };

  // Create folder instantly from currently pasted notes
  const handleCreateFolderFromPastedNotes = () => {
    if (!notes || notes.trim().length === 0) return;
    // Extract first line or summary for name
    const lines = notes.trim().split('\n').filter((l) => l.trim().length > 0);
    let autoName = 'Nuevo Tema';
    if (lines.length > 0) {
      const firstLine = lines[0].replace(/[#*_-]/g, '').trim();
      autoName = firstLine.length > 45 ? firstLine.slice(0, 42) + '...' : firstLine;
    }
    setNewFolderName(autoName);
    setNewFolderIcon('📖');
    setNewFolderStarterNotes(notes);
    setShowCreateModal(true);
  };

  // Rename folder
  const handleRenameFolder = (folderId: string, newName: string, newIcon?: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setFolders((prev) => {
      const updated = prev.map((f) =>
        f.id === folderId ? { ...f, name: trimmed, icon: newIcon || f.icon, updatedAt: Date.now() } : f
      );
      try {
        localStorage.setItem('thea_study_folders_v2', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
    setEditingFolder(null);
    sfx.playClick();
  };

  // Delete folder (instant, safe, non-blocking)
  const handleDeleteFolder = (folderId: string) => {
    if (folders.length <= 1) {
      setErrorMessage('Debes mantener al menos una carpeta activa en Thea Pro.');
      return;
    }

    const remaining = folders.filter((f) => f.id !== folderId);
    setFolders(remaining);

    if (activeFolderId === folderId) {
      const nextTarget = remaining[0];
      isSwitchingFolderRef.current = true;
      setActiveFolderId(nextTarget.id);
      setNotes(nextTarget.notes || '');
      setSourceDocs(nextTarget.sourceDocs || (nextTarget.sourceDoc ? [nextTarget.sourceDoc] : []));
      setSourceDoc(nextTarget.sourceDoc || (nextTarget.sourceDocs?.[0] || null));
      setAiDirectives(nextTarget.aiDirectives || DEFAULT_AI_DIRECTIVES);
      setAnalysis(nextTarget.analysis || null);
      setPreguntas(nextTarget.preguntas || []);
      setQuizIndex(nextTarget.quizIndex || 0);
      setScore(nextTarget.score || 0);
      setStreak(nextTarget.streak || 0);
      setMaxStreak(nextTarget.maxStreak || 0);
      setTotalAnswered(nextTarget.totalAnswered || 0);
      setEvaluatedQuestions(nextTarget.evaluatedQuestions || {});
      setFeedbackVote(nextTarget.feedbackVote || {});
      setLevelScores(
        nextTarget.levelScores || {
          1: { correct: 0, total: 0 },
          2: { correct: 0, total: 0 },
          3: { correct: 0, total: 0 },
          4: { correct: 0, total: 0 },
        }
      );
      setFlashcards(nextTarget.flashcards || []);
      setCardIndex(nextTarget.cardIndex || 0);
      setCardIntervals(nextTarget.cardIntervals || {});
      setGuideContent(nextTarget.guideContent || '');
      setSelectedOption(null);
      setRevealed(false);
      setIsFlipped(false);
    }

    try {
      localStorage.setItem('thea_study_folders_v2', JSON.stringify(remaining));
      localStorage.setItem(
        'thea_active_folder_id_v2',
        activeFolderId === folderId ? remaining[0].id : activeFolderId
      );
    } catch (_) {}

    sfx.playClick();
  };

  // Duplicate folder
  const handleDuplicateFolder = (folderId: string) => {
    const source = folders.find((f) => f.id === folderId);
    if (!source) return;
    const newId = 'folder-' + Date.now();
    const copy: StudyFolder = {
      ...source,
      id: newId,
      name: `${source.name} (Copia)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [copy, ...folders];
    setFolders(updated);
    try {
      localStorage.setItem('thea_study_folders_v2', JSON.stringify(updated));
    } catch (_) {}
    sfx.playClick();
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if inside textarea or input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (currentView === 'quiz' && filteredQuestions.length > 0) {
        if (['1', '2', '3', '4'].includes(e.key) && !revealed) {
          handleSelectOption(parseInt(e.key, 10) - 1);
        } else if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (revealed) handleNextQuestion();
        }
      } else if (currentView === 'flashcards' && flashcards.length > 0) {
        if (e.code === 'Space') {
          e.preventDefault();
          handleFlipCard();
        } else if (e.key === 'ArrowRight') {
          handleNextCard();
        } else if (e.key === 'ArrowLeft') {
          handlePrevCard();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, revealed, quizIndex, cardIndex, preguntas, flashcards]);

  // Read with Text to Speech
  const handleSpeakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const cleanText = text.replace(/[*_#`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = 1.05;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // Stop speaking on view change
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [currentView]);

  // Ingestion Callback for Single or Multiple Google Drive and Heavy Local OCR Documents
  const handleDocumentsImported = (dataList: ImportedDocumentData[]) => {
    if (!dataList || dataList.length === 0) return;

    const newDocs: SourceDocument[] = dataList.map((d) => ({
      title: d.title || d.fileName.replace(/\.[^/.]+$/, ''),
      fileName: d.fileName,
      fileSize: d.fileSize,
      summary: d.summary,
      chapters: d.chapters || [],
      conceptualContext: d.conceptualContext,
      addedAt: Date.now(),
      tipoDocumento: d.tipoDocumento,
      materias: d.materias,
      preguntasBanco: d.preguntasBanco,
    }));

    if (dataList[0].createNewFolder) {
      const folderTitle =
        newDocs.length === 1
          ? newDocs[0].title
          : `${newDocs[0].title} (+${newDocs.length - 1} docs)`;
      handleCreateFolder(
        folderTitle,
        newDocs[0].tipoDocumento === 'EXAMEN_ADMISION' ? '🏛️' : '📄',
        '', // We do NOT fill notes with wall of text!
        newDocs[0],
        newDocs
      );
    } else {
      setSourceDocs((prev) => {
        const combined = [...prev];
        for (const nd of newDocs) {
          if (!combined.some((c) => c.fileName === nd.fileName && c.fileSize === nd.fileSize)) {
            combined.push(nd);
          }
        }
        return combined;
      });
      setSourceDoc(newDocs[0]);

      // If document contains real exam questions, merge them into current questions pool
      const extraQuestions: Question[] = [];
      newDocs.forEach((d) => {
        if (Array.isArray(d.preguntasBanco) && d.preguntasBanco.length > 0) {
          extraQuestions.push(...d.preguntasBanco);
        }
      });
      if (extraQuestions.length > 0) {
        setPreguntas((prev) => [...extraQuestions, ...prev]);
      }

      sfx.playLevelUp();
    }
  };

  const handleDocumentImported = (data: ImportedDocumentData) => {
    handleDocumentsImported([data]);
  };

  // Detach source document (specific index or all)
  const handleDetachSourceDoc = (index?: number) => {
    if (typeof index === 'number') {
      setSourceDocs((prev) => {
        const next = prev.filter((_, i) => i !== index);
        setSourceDoc(next[0] || null);
        return next;
      });
    } else {
      setSourceDocs([]);
      setSourceDoc(null);
    }
    sfx.playClick();
  };

  // Build effective combined content (Source document concepts + User personal notes)
  const getEffectiveStudyContent = () => {
    const parts: string[] = [];
    if (sourceDocs && sourceDocs.length > 0) {
      sourceDocs.forEach((doc, idx) => {
        parts.push(
          `=== DOCUMENTO FUENTE ASIMILADO #${idx + 1}: ${doc.title || doc.fileName} (${doc.fileSize}) ===\n` +
          `RESUMEN EJECUTIVO: ${doc.summary}\n` +
          `EJES TEMÁTICOS: ${doc.chapters?.join(', ')}\n\n` +
          `BASE DE CONOCIMIENTO Y CONCEPTOS EXTRAÍDOS:\n${doc.conceptualContext}`
        );
      });
    } else if (sourceDoc && sourceDoc.conceptualContext) {
      parts.push(
        `=== DOCUMENTO FUENTE ASIMILADO: ${sourceDoc.title || sourceDoc.fileName} (${sourceDoc.fileSize}) ===\n` +
        `RESUMEN EJECUTIVO: ${sourceDoc.summary}\n` +
        `EJES TEMÁTICOS: ${sourceDoc.chapters?.join(', ')}\n\n` +
        `BASE DE CONOCIMIENTO Y CONCEPTOS EXTRAÍDOS:\n${sourceDoc.conceptualContext}`
      );
    }
    if (notes && notes.trim().length > 0) {
      parts.push(`=== APUNTES Y NOTAS DEL ESTUDIANTE ===\n${notes.trim()}`);
    }
    return parts.join('\n\n');
  };

  // File Upload Handlers (for massive texts, heavy PDFs and OCR images)
  const handleFileUpload = (file: File) => {
    if (!file) return;

    const isPdfOrImage =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf') ||
      file.type.startsWith('image/');

    if (isPdfOrImage) {
      setShowOcrModal(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setNotes(text);
        setErrorMessage(null);
        sfx.playClick();
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Analyze massive material
  const handleAnalyzeMaterial = async () => {
    const content = getEffectiveStudyContent();
    if (!content || content.trim().length < 20) return;
    setAnalyzingDoc(true);
    try {
      const res = await fetch('/api/analyze-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: content }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        setAnalysis(data.analysis);
        sfx.playClick();
      }
    } catch (_) {
    } finally {
      setAnalyzingDoc(false);
    }
  };

  // Extract all available chapters/topics for the active folder
  const availableTopics = React.useMemo(() => {
    const list: string[] = [];
    if (sourceDocs && sourceDocs.length > 0) {
      sourceDocs.forEach((doc) => {
        if (doc.chapters && Array.isArray(doc.chapters)) {
          list.push(...doc.chapters);
        }
      });
    } else if (sourceDoc?.chapters && Array.isArray(sourceDoc.chapters)) {
      list.push(...sourceDoc.chapters);
    }
    if (analysis?.temasClave && Array.isArray(analysis.temasClave)) {
      analysis.temasClave.forEach((t) => {
        if (!list.includes(t)) list.push(t);
      });
    }
    if (notes) {
      const headerMatches = notes.match(/^[#*•\d\.\-]+\s*([^:\n]{4,60})/gm);
      if (headerMatches) {
        headerMatches.slice(0, 8).forEach((h) => {
          const clean = h.replace(/^[#*•\d\.\-\s]+/, '').trim();
          if (clean.length > 3 && clean.length < 50 && !list.includes(clean)) {
            list.push(clean);
          }
        });
      }
    }
    return Array.from(new Set(list));
  }, [sourceDocs, sourceDoc, analysis, notes]);

  const activeDirectivesCount =
    (aiDirectives.selectedTopics?.length || 0) +
    (aiDirectives.customTopicFocus?.trim() ? 1 : 0) +
    (aiDirectives.excludedTopics?.trim() ? 1 : 0) +
    (aiDirectives.learningMethod !== 'balanced' ? 1 : 0) +
    (aiDirectives.questionStyle !== 'standard' ? 1 : 0) +
    (aiDirectives.customPrompt?.trim() ? 1 : 0);

  // 1. Generate Progressive 4-Level Quiz
  const handleGenerateQuiz = async (specificLevel?: number | 'all', overrideDirectives?: AIDirectives) => {
    const content = getEffectiveStudyContent();
    if (!content || content.trim().length < 15) {
      setErrorMessage('⚠️ Sube un documento (Drive/PDF) o escribe al menos 15 caracteres de material de estudio.');
      return;
    }
    setLoadingAction('quiz');
    setErrorMessage(null);
    setQuizNotice('');

    try {
      const res = await fetch('/api/generate/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: content,
          targetLevel: specificLevel || activeLevelFilter,
          aiDirectives: overrideDirectives || aiDirectives,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al invocar Gemini API.');

      setPreguntas(data.preguntas);
      setQuizIndex(0);
      setSelectedOption(null);
      setRevealed(false);
      setScore(0);
      setStreak(0);
      setTotalAnswered(0);
      setEvaluatedQuestions({});
      setFeedbackVote({});
      setLevelScores({
        1: { correct: 0, total: 0 },
        2: { correct: 0, total: 0 },
        3: { correct: 0, total: 0 },
        4: { correct: 0, total: 0 },
      });
      setCurrentView('quiz');
      sfx.playLevelUp();
    } catch (err: any) {
      setErrorMessage(`❌ ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Continuous background prefetcher for Infinite Questions Mode
  const fetchMoreQuestions = async (lvl: number | 'all' = activeLevelFilter) => {
    const content = getEffectiveStudyContent();
    if (fetchingMore || !content || content.trim().length < 15) return;
    setFetchingMore(true);

    try {
      const existingQuestions = preguntas.map((q) => q.pregunta);
      const res = await fetch('/api/generate/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: content,
          targetLevel: lvl,
          batchSize: 6,
          previousQuestions: existingQuestions,
          aiDirectives,
        }),
      });

      const data = await res.json();
      if (res.ok && Array.isArray(data.preguntas) && data.preguntas.length > 0) {
        setPreguntas((prev) => {
          const prevMap = new Set(prev.map((p) => p.pregunta.trim().toLowerCase()));
          const newUnique = data.preguntas.filter(
            (p: Question) => !prevMap.has(p.pregunta.trim().toLowerCase())
          );
          return [...prev, ...newUnique];
        });
      }
    } catch (err) {
      console.warn('Error fetching more questions in background:', err);
    } finally {
      setFetchingMore(false);
    }
  };

  // 2. Generate Enhanced Flashcards
  const handleGenerateFlashcards = async () => {
    const content = getEffectiveStudyContent();
    if (!content || content.trim().length < 15) {
      setErrorMessage('⚠️ Sube un documento (Drive/PDF) o escribe al menos 15 caracteres de material de estudio.');
      return;
    }
    setLoadingAction('flashcards');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/generate/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: content, count: 12, aiDirectives }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando flashcards');

      setFlashcards(data.flashcards);
      setCardIndex(0);
      setIsFlipped(false);
      setCardIntervals({});
      setCurrentView('flashcards');
      sfx.playLevelUp();
    } catch (err: any) {
      setErrorMessage(`❌ ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // 3. Generate Dossier / Guide
  const handleGenerateGuide = async () => {
    const content = getEffectiveStudyContent();
    if (!content || content.trim().length < 15) {
      setErrorMessage('⚠️ Sube un documento (Drive/PDF) o escribe al menos 15 caracteres de material de estudio.');
      return;
    }
    setLoadingAction('guide');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/generate/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: content, aiDirectives }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando dossier');

      setGuideContent(data.guide);
      setCurrentView('guia');
      sfx.playLevelUp();
    } catch (err: any) {
      setErrorMessage(`❌ ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // 4. Tutor Question
  const handleAskTutor = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = getEffectiveStudyContent();
    if (!tutorQuery.trim() || !content.trim()) return;

    setTutorLoading(true);
    sfx.playClick();
    try {
      const res = await fetch('/api/generate/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: tutorQuery,
          notes: content,
          aiDirectives,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en tutor');
      setTutorResponse(data.explanation);
      sfx.playClick();
    } catch (err: any) {
      setTutorResponse(`Error: ${err.message}`);
    } finally {
      setTutorLoading(false);
    }
  };

  // Real Exam Questions Bank extracted from Admission Exam PDFs
  const examBankQuestions = React.useMemo(() => {
    const bank: Question[] = [];
    (sourceDocs || (sourceDoc ? [sourceDoc] : [])).forEach((doc) => {
      if (Array.isArray(doc.preguntasBanco) && doc.preguntasBanco.length > 0) {
        bank.push(...doc.preguntasBanco);
      }
    });
    return bank;
  }, [sourceDocs, sourceDoc]);

  // Filtered questions based on Level
  const filteredQuestions = activeLevelFilter === 'all'
    ? preguntas
    : preguntas.filter((q) => q.nivel === activeLevelFilter);

  const currentQ = filteredQuestions[quizIndex] || null;

  // Selección de opción: EVALUACIÓN INMEDIATA Y AUTOMÁTICA
  const handleSelectOption = (idx: number) => {
    if (revealed || !currentQ) return;

    setSelectedOption(idx);
    setRevealed(true);
    setShowExplanation(true);
    setQuizNotice('');

    const isCorrect = idx === currentQ.correcta;
    setTotalAnswered((prev) => prev + 1);

    // Pre-populate instant mental map in memory so it's ready in 0ms!
    const instantCtx = getInstantQuestionContext(currentQ);
    setQuestionContexts((prev) => ({
      ...prev,
      [currentQ.id]: prev[currentQ.id] || instantCtx,
    }));

    // Silently enrich in the background without blocking the UI
    handleExploreContext(currentQ);

    if (!evaluatedQuestions[currentQ.id]) {
      setEvaluatedQuestions((prev) => ({ ...prev, [currentQ.id]: true }));

      const qLvl = currentQ.nivel || 1;
      setLevelScores((prev) => ({
        ...prev,
        [qLvl]: {
          correct: prev[qLvl].correct + (isCorrect ? 1 : 0),
          total: prev[qLvl].total + 1,
        },
      }));

      if (isCorrect) {
        setScore((prev) => prev + 1);
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        if (nextStreak > maxStreak) setMaxStreak(nextStreak);
        sfx.playCorrect();

        // Level milestone check
        const nextScore = score + 1;
        if (nextScore > 0 && nextScore % 4 === 0) {
          const reachedLvl = Math.min(Math.floor(nextScore / 2), 4);
          setShowLevelUpCelebration(reachedLvl);
          sfx.playLevelUp();
          setTimeout(() => setShowLevelUpCelebration(null), 3500);
        }
      } else {
        setStreak(0);
        sfx.playWrong();
      }
    }

    // Prefetch next questions in background if near the end of current list
    if (isInfiniteMode && quizIndex >= filteredQuestions.length - 2 && !fetchingMore) {
      fetchMoreQuestions(activeLevelFilter);
    }
  };

  // Instant local synthesizer for Mental Map & A Toda Leche narrative (0ms latency, zero freezing)
  const getInstantQuestionContext = (q: Question) => {
    const qText = (q.pregunta || '').toLowerCase();
    const correctOpt = q.opciones?.[q.correcta] || 'Concepto Demostrado';
    const optLower = correctOpt.toLowerCase();
    const exp = q.explicacion || '';
    const dist = q.analisisDistractores || '';
    const tip = q.tipExamen || '';
    const fullContext = `${qText} ${optLower} ${exp.toLowerCase()}`;

    // 1. Biología Celular / Síntesis de Proteínas / Ribosomas / Orgánulos
    if (
      fullContext.includes('ribosom') ||
      fullContext.includes('proteín') ||
      fullContext.includes('arn') ||
      fullContext.includes('traducc') ||
      fullContext.includes('golgi') ||
      fullContext.includes('retículo') ||
      fullContext.includes('organelo') ||
      fullContext.includes('célula')
    ) {
      return {
        tituloTema: 'Línea de Ensamblaje Celular: Del Núcleo a la Proteína Funcional',
        narracionATodaLeche: `¡Paren las rotativas y miren cómo funciona la fábrica de la vida! 🏭⚡

Imagínate a la célula como una megafábrica industrial altamente coordinada. El plano maestro jamás puede salir de la bóveda: **el ADN se queda seguro en el Núcleo**. Para que el sistema funcione, la célula saca una copia portátil: **el ARNm (mensajero)**, que sale por los poros nucleares directo al citoplasma.

¿Y quién tiene la maquinaria pesada para ensamblar los ladrillos? **¡El Ribosoma!** Este complejo no trabaja solo ni en el vacío:
1. **La subunidad menor** atrapa la cinta de ARNm y busca el codón de inicio (AUG).
2. **Los camiones de transporte (ARNt)** van trayendo uno a uno los aminoácidos exactos.
3. **La subunidad mayor (con su enzima peptidil transferasa)** forja los enlaces peptídicos a toda velocidad.

¿Y qué pasa después? La proteína no sale cruda a la calle: pasa al **Retículo Endoplasmático Rugoso (RER)** para plegarse, y de ahí viaja en vesículas al **Aparato de Golgi** (el centro logístico tipo Amazon) para empaquetarse, recibir etiquetas químicas (glucosilación) y enviarse a los lisosomas, membrana o al exterior celular. ¡Esa es la cadena completa que te evalúan en admisión!`,
        mapaMental: {
          ejeCentral: 'Ruta Molecular Completa: Núcleo (Transcripción) ➔ Ribosoma (Traducción) ➔ RER ➔ Golgi (Empaque)',
          causas: [
            {
              id: 'c1',
              titulo: '1. Origen del Mensaje (El Plano)',
              actorOPrincipio: 'Núcleo Celular & Transcripción',
              detalle: 'El ADN se transcribe en ARNm en el núcleo. El mensajero atraviesa el poro nuclear cargando el código genético hacia el citoplasma.',
            },
            {
              id: 'c2',
              titulo: '2. Transporte de Materia Prima',
              actorOPrincipio: 'ARN de Transferencia (ARNt) & Aminoácidos',
              detalle: 'Cada ARNt acopla su anticodón específico y transporta el aminoácido correspondiente desde el pool citosólico hacia el sitio de ensamblaje.',
            },
          ],
          hechoCentral: {
            titulo: 'El Núcleo Operativo: Ribosoma en Acción',
            hitoOFormula: 'Subunidad Menor + Mayor (Sitios A, P, E)',
            quePaso: 'El ribosoma lee los tripletes (codones) del ARNm y cataliza los enlaces peptídicos entre aminoácidos. Traduce el lenguaje nucleotídico a secuencia polipeptídica funcional.',
            quiebreClave: 'Sin ribosomas, la célula es incapaz de fabricar enzimas, transportadores ni componentes estructurales, provocando muerte celular inmediata.',
          },
          consecuencias: [
            {
              id: 'e1',
              titulo: '3. Maduración y Plegamiento',
              impactoDirecto: 'La cadena naciente ingresa al lumen del Retículo Endoplasmático Rugoso (RER) para adquirir su conformación tridimensional terciaria.',
              conexionFutura: 'Transporte vesicular hacia el Aparato de Golgi',
            },
            {
              id: 'e2',
              titulo: '4. Distribución y Destino Final',
              impactoDirecto: 'El Complejo de Golgi empaqueta, añade glúcidos y distribuye las proteínas hacia lisosomas, membrana plasmática o secreción extracelular.',
              conexionFutura: 'Homeostasia celular y funciones metabólicas',
            },
          ],
        },
        pilaresExamen: {
          laTrampaDelEvaluador: 'El examen busca confundir el SITIO DE SÍNTESIS (Ribosoma / RER) con el SITIO DE EMPAQUETAMIENTO (Aparato de Golgi) o de DIGESTIÓN (Lisosoma).',
          comoDescartarRapido: 'Verbo clave rector: "Sintetizar / Traducir" = Ribosoma. "Modificar / Empaquetar" = Golgi. "Digerir / Hidrolizar" = Lisosoma. "Oxidar / Respiración" = Mitocondria.',
          frecuenciaEnAdmision: 'Muy Alta (Pregunta fija en ciencias de la salud)',
        },
        reglaNemotecnica: 'Nemotecnia "NA-RI-GO": Núcleo (plano) ➔ Ribosoma (fabricación) ➔ Golgi (envío a domicilio).',
      };
    }

    // 2. Historia Universal / Procesos Sociales / Revolución Francesa
    if (
      fullContext.includes('revoluc') ||
      fullContext.includes('guerra') ||
      fullContext.includes('siglo') ||
      fullContext.includes('imperio') ||
      fullContext.includes('tratado') ||
      fullContext.includes('historia') ||
      fullContext.includes('bastilla') ||
      fullContext.includes('republic')
    ) {
      const isRevFrancesa = fullContext.includes('frances') || fullContext.includes('francia') || fullContext.includes('bastilla') || fullContext.includes('1789');

      if (isRevFrancesa) {
        return {
          tituloTema: 'Revolución Francesa (1789): De la Crisis del Pan a la Caída del Absolutismo',
          narracionATodaLeche: `¡Ojo al tremendo drama humano que desató la Revolución Francesa! 🥖👑⚡

Francia estaba literalmente en quiebra total por el despilfarro de la corte de Versalles (Luis XVI y María Antonieta) y por haber financiado la independencia de EE.UU. Para colmo, las heladas arruinaron las cosechas de trigo y el precio del pan se disparó: ¡el pueblo se estaba muriendo de hambre en las calles de París!

Aquí viene la trampa que colmó el vaso: la sociedad estaba dividida en 3 estamentos. El 1º (Clero, 1%) y el 2º (Nobleza, 2%) vivían de pensiones de oro y no pagaban ni un céntimo de impuestos. Todo el peso tributario recaía en el **Tercer Estado (97% de la población)**. Asfixiado por las deudas, Luis XVI convoca los **Estados Generales en 1789** para inventar más impuestos. Pero arman una jugada sucia: la votación era "por estamento" (1 voto clero + 1 voto nobleza = 2 votos de los ricos contra 1 solo voto del pueblo). 

El Tercer Estado dijo "¡Basta!" y exigió el voto por cabeza (un hombre, un voto). Cuando el rey cerró con candado su sala de reuniones, los diputados del pueblo marcharon al **Salón del Juego de la Pelota (*Jeu de Paume*)** y juraron solemnemente: *"¡No nos separaremos jamás hasta darle a Francia una Constitución escrita!"*. El 14 de julio, ante los rumores de que el rey mandaría al ejército a masacrarlos, el pueblo enfurecido asalta la prisión real de la **Bastilla** para tomar pólvora y cañones. ¡Ahí se derrumbó el Antiguo Régimen!`,
          mapaMental: {
            ejeCentral: 'Bancarrota & Hambruna ➔ Trampa de los Estados Generales ➔ Juramento de la Pelota ➔ Toma de la Bastilla ➔ Caída del Feudalismo',
            causas: [
              {
                id: 'c1',
                titulo: '1. El Abuso Estamental y la Crisis del Pan',
                actorOPrincipio: 'Tercer Estado (97%) vs. Nobleza y Clero (3%)',
                detalle: 'El 97% del pueblo pagaba la talla, el diezmo y la gabela mientras el clero y la nobleza estaban exentos. La ruina de las cosechas de trigo causó una hambruna atroz que enfureció a París.',
              },
              {
                id: 'c2',
                titulo: '2. La Trampa de los Estados Generales (Mayo 1789)',
                actorOPrincipio: 'Voto por Estamento (2 vs 1) de Luis XVI',
                detalle: 'Luis XVI convocó a los 3 estados para aprobar nuevos impuestos. Los privilegiados impusieron el voto por estamento para derrotar siempre al pueblo 2 a 1, rechazando el voto por cabeza.',
              },
            ],
            hechoCentral: {
              titulo: '3. El Juramento de la Pelota y la Toma de la Bastilla (14 de Julio)',
              hitoOFormula: 'Salón del Juego de Pelota (Jeu de Paume) & Bastilla (1789)',
              quePaso: 'Al ser expulsados, los diputados del Tercer Estado juraron en el Jeu de Paume no disolverse hasta redactar una Constitución. El pueblo asaltó la fortaleza militar de la Bastilla para conseguir pólvora y fusiles.',
              quiebreClave: 'La monarquía absoluta perdió el control militar; el poder soberano pasó de manos del rey a la Asamblea Nacional del pueblo.',
            },
            consecuencias: [
              {
                id: 'e1',
                titulo: '4. Abolición del Feudalismo y Derechos del Hombre (Agosto 1789)',
                impactoDirecto: 'La Asamblea abolió las servidumbres señoriales y promulgó la Declaración de los Derechos del Hombre y del Ciudadano (Libertad, Igualdad, Fraternidad).',
                conexionFutura: 'Fin legal de la sociedad de castas y privilegios',
              },
              {
                id: 'e2',
                titulo: '5. La Guillotina a Luis XVI y la Era Republicana (1792-1793)',
                impactoDirecto: 'Se proclamó la Primera República Francesa. Luis XVI y María Antonieta fueron juzgados por traición y ejecutados en la guillotina.',
                conexionFutura: 'Fase del Terror Jacobino (Robespierre) y posterior ascenso de Napoleón',
              },
            ],
          },
          pilaresExamen: {
            laTrampaDelEvaluador: 'En los exámenes suelen trampear con: ¿Por qué convocó Luis XVI los Estados Generales? NO fue por generosidad, sino por la bancarrota fiscal. ¿Qué pedía el Tercer Estado? Voto por diputado/cabeza, no por estamento.',
            comoDescartarRapido: 'Recuerda el orden cronológico estricto: 1. Estados Generales ➔ 2. Juramento de la Pelota ➔ 3. Toma de la Bastilla ➔ 4. Derechos del Hombre ➔ 5. Guillotina a Luis XVI.',
            frecuenciaEnAdmision: 'Muy Alta (El tema más repetido de Historia Universal en exámenes de admisión)',
          },
          reglaNemotecnica: 'Nemotecnia "E-J-B-D": Estados Generales ➔ Juramento de Pelota ➔ Bastilla ➔ Derechos del Hombre.',
        };
      }

      return {
        tituloTema: `Proceso Histórico y Conflicto Real: ${correctOpt}`,
        narracionATodaLeche: `¡Paren todo y miren el verdadero conflicto detrás de esto! 📜⚡

Nada en la historia pasa por casualidad ni por frases abstractas de manual. Aquí había dos bandos enfrentados con intereses concretos: una élite que concentraba la riqueza y el poder político, y una masa oponente que ya no aguantaba el abuso y la asfixia económica.

Cuando el bando dominante intenta una maniobra o sube la presión, estalla el conflicto. **${correctOpt}** representa el momento exacto en que los oprimidos o rebeldes rompen las reglas del juego, se organizan y desafían al poder establecido.

A partir de ese quiebre, el mapa político cambia para siempre: caen las autoridades previas, nacen nuevas leyes y se forja el precedente que hoy te preguntan en los simulacros y exámenes de admisión. ¡El que entiende a quién beneficiaba el poder y quién dio el golpe, saca puntaje perfecto!`,
        mapaMental: {
          ejeCentral: `Abuso del Régimen Antiguo ➔ Detonante & Rebelión (${correctOpt}) ➔ Caída de Autoridades & Nuevas Leyes`,
          causas: [
            {
              id: 'c1',
              titulo: '1. Desigualdad y Opresión de Fondo',
              actorOPrincipio: 'Los Bandos en Conflicto',
              detalle: 'Una clase dominante privilegiada que acaparaba tierras y rentas frente a una mayoría productiva sobrecargada de tributos y sin representación.',
            },
            {
              id: 'c2',
              titulo: '2. La Chispa del Conflicto',
              actorOPrincipio: 'El Abuso o Maniobra Detonante',
              detalle: 'Un intento de imponer mayores cargas fiscales o una maniobra de poder que agotó la paciencia del bando opositor y desató la insurrección.',
            },
          ],
          hechoCentral: {
            titulo: `3. El Hito de Ruptura: ${correctOpt}`,
            hitoOFormula: correctOpt,
            quePaso: exp || 'La acción directa donde el bando sublevado desconoce la autoridad del régimen y proclama su autonomía.',
            quiebreClave: 'Marcó el colapso del orden anterior; el poder ya no volvió a las manos de los gobernantes derrotados.',
          },
          consecuencias: [
            {
              id: 'e1',
              titulo: '4. Transformación Institucional Inmediata',
              impactoDirecto: 'Derogación de leyes abusivas, captura de plazas estratégicas y redacción de nuevos marcos normativos.',
              conexionFutura: 'Disputa interna entre facciones moderadas y radicales',
            },
            {
              id: 'e2',
              titulo: '5. Impacto Evaluado en Admisión',
              impactoDirecto: 'Fin del modelo de dominación previo y establecimiento de un nuevo régimen político o económico.',
              conexionFutura: 'Pregunta fija de causalidad histórica en exámenes preuniversitarios',
            },
          ],
        },
        pilaresExamen: {
          laTrampaDelEvaluador: 'Los exámenes suelen cambiar los personajes de bando o mezclar causas económicas profundas con pretextos diplomáticos secundarios.',
          comoDescartarRapido: 'Identifica siempre la causa económica de fondo (quién pagaba los platos rotos) antes que la causa superficial.',
          frecuenciaEnAdmision: 'Alta en bancos de preguntas preuniversitarios',
        },
        reglaNemotecnica: `Asocia siempre "${correctOpt}" con la crisis fiscal de fondo y la rebelión de las clases no privilegiadas.`,
      };
    }

    // 3. Modelo Sistémico General (Flujo en 3 fases sin jerga corporativa ni palabras abstractas)
    return {
      tituloTema: `Fundamento Directo de Examen: ${correctOpt}`,
      narracionATodaLeche: `¡Vamos directo al grano sin rodeos de manual! ⚡

Este concepto no es un dato de memoria ciega: forma parte de un proceso donde una causa real produce una respuesta directa.

1. **El Escenario Previo:** Para que esto ocurra, se requiere una condición inicial o problema concreto que active el proceso.
2. **El Núcleo en Acción:** Aquí es donde interviene **${correctOpt}**: es el elemento clave que ejecuta la acción específica o resuelve la condición planteada.
3. **El Desenlace:** Al completarse esta acción, se produce el resultado final evaluado en el examen, permitiendo diferenciarlo con precisión de los distractores.

¡Por eso en el examen no buscas palabras sueltas, sino la relación directa entre el detonante y la respuesta!`,
      mapaMental: {
        ejeCentral: `Condición Inicial ➔ Acción Clave (${correctOpt}) ➔ Desenlace Evaluado`,
        causas: [
          {
            id: 'c1',
            titulo: '1. El Escenario y la Condición Previa',
            actorOPrincipio: 'Elementos que entran en juego',
            detalle: 'Los factores y condiciones indispensables que están presentes antes de que se produzca la acción.',
          },
          {
            id: 'c2',
            titulo: '2. El Detonante Inmediato',
            actorOPrincipio: 'Factor de Activación',
            detalle: 'La necesidad o evento que pone en marcha el proceso y conduce a la respuesta.',
          },
        ],
        hechoCentral: {
          titulo: `3. El Hito Central: ${correctOpt}`,
          hitoOFormula: correctOpt,
          quePaso: exp || 'La función específica o el concepto demostrado que resuelve la pregunta planteada.',
          quiebreClave: 'Es la única opción que cumple con exactitud las condiciones planteadas en el enunciado.',
        },
        consecuencias: [
          {
            id: 'e1',
            titulo: '4. El Resultado Directo',
            impactoDirecto: 'Lo que se produce o transforma inmediatamente al completarse este paso.',
            conexionFutura: 'Se enlaza con la siguiente fase o con la solución del problema',
          },
          {
            id: 'e2',
            titulo: '5. Clave de Admisión y Descarte',
            impactoDirecto: dist ? `Permite descartar de inmediato distractores como: ${dist.slice(0, 120)}` : 'Permite descartar con total seguridad las alternativas incorrectas o fuera de tema.',
            conexionFutura: 'Criterio infalible de descarte en preguntas de examen de admisión',
          },
        ],
      },
      pilaresExamen: {
        laTrampaDelEvaluador: dist ? `Distractor habitual del examen: ${dist.slice(0, 140)}` : 'Confundir el factor causante con la consecuencia o alterar el orden del proceso.',
        comoDescartarRapido: 'Verifica la función exacta: descarta de inmediato opciones que pertenezcan a otro tema o cumplan roles distintos.',
        frecuenciaEnAdmision: 'Alta en bancos de preguntas preuniversitarios',
      },
      reglaNemotecnica: tip && tip.length > 5 ? `Truco clave: ${tip}` : `Regla mental: Asocia "${correctOpt}" directamente con su función operativa principal.`,
    };
  };

  // Explore deep historical/scientific context for the current question
  const handleExploreContext = async (q: Question) => {
    if (!q) return;
    if ((questionContexts[q.id] as any)?.isAIEnriched) return;
    // Guarantee instant presence so UI never hangs or freezes
    if (!questionContexts[q.id]) {
      const instant = getInstantQuestionContext(q);
      setQuestionContexts((prev) => ({ ...prev, [q.id]: instant }));
    }
    setLoadingContext(true);
    try {
      const res = await fetch('/api/generate/question-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          notes: getEffectiveStudyContent(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.context) {
        setQuestionContexts((prev) => ({
          ...prev,
          [q.id]: { ...data.context, isAIEnriched: true },
        }));
      }
    } catch (e) {
      console.warn('Background AI enhancement failed, instant context preserved:', e);
    } finally {
      setLoadingContext(false);
    }
  };

  // Ask doubts directly about this question without leaving the quiz
  const handleAskQuestionDoubt = async (q: Question, customQuery?: string) => {
    const query = (customQuery || userDoubtInput).trim();
    if (!query || !q) return;

    setAskingDoubt(true);
    try {
      const res = await fetch('/api/generate/ask-question-doubt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userDoubt: query,
          question: q,
          userSelectedOption: selectedOption,
          notes: getEffectiveStudyContent(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        setQuestionDoubts((prev) => {
          const list = prev[q.id] || [];
          return {
            ...prev,
            [q.id]: [...list, { query, answer: data.answer, time: Date.now() }],
          };
        });
        setUserDoubtInput('');
        sfx.playClick();
      }
    } catch (e) {
      console.warn('Error asking doubt:', e);
    } finally {
      setAskingDoubt(false);
    }
  };

  // Analyze Admission Exam Patterns & Recurring Topics
  const handleAnalyzeExamPatterns = async () => {
    const studyContent = getEffectiveStudyContent();
    if (!studyContent || studyContent.trim().length < 30) {
      setErrorMessage('Agrega o sube material o exámenes primero para analizar sus patrones de admisión.');
      return;
    }
    setLoadingPatterns(true);
    setShowPatternsModal(true);
    try {
      const res = await fetch('/api/analyze/exam-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: studyContent }),
      });
      const data = await res.json();
      if (res.ok && data.patterns) {
        setExamPatterns(data.patterns);
        sfx.playLevelUp();
      } else {
        setErrorMessage(data.error || 'No se pudieron extraer los patrones del examen.');
      }
    } catch (e) {
      setErrorMessage('Error al conectar con el analizador de patrones de examen.');
    } finally {
      setLoadingPatterns(false);
    }
  };

  // Apply Admission Clone Mode & Re-generate Adaptive Simulator
  const handleApplyExamCloneMode = () => {
    const updatedDirectives: AIDirectives = {
      ...aiDirectives,
      learningMethod: 'exam_patterns_clone',
      questionStyle: 'case_study',
      customPrompt: 'Mimetiza estrictamente la forma de formular preguntas, los distractores habituales y las trampas de los exámenes de admisión subidos.',
    };
    setAiDirectives(updatedDirectives);
    setShowPatternsModal(false);
    sfx.playLevelUp();
    handleGenerateQuiz(activeLevelFilter, updatedDirectives);
  };

  // Siguiente pregunta / Modo Infinito Continuo
  const handleNextQuestion = () => {
    sfx.playClick();
    const nextIdx = quizIndex + 1;

    // In Infinite Mode, prefetch if getting close to end
    if (isInfiniteMode && nextIdx >= filteredQuestions.length - 2 && !fetchingMore) {
      fetchMoreQuestions(activeLevelFilter);
    }

    if (nextIdx < filteredQuestions.length) {
      setQuizIndex(nextIdx);
    } else {
      // Reached the end of currently loaded batch
      if (isInfiniteMode) {
        if (!fetchingMore) {
          fetchMoreQuestions(activeLevelFilter);
        }
        setQuizIndex(nextIdx); // will show the smooth loading card until new batch arrives
      } else {
        setQuizIndex(0);
      }
    }

    setSelectedOption(null);
    setRevealed(false);
    setShowExplanation(false);
    setShowDoubtBox(false);
    setUserDoubtInput('');
    setQuizNotice('');
  };

  // Flashcards flip & intervals
  const handleFlipCard = () => {
    sfx.playFlip();
    setIsFlipped(!isFlipped);
  };

  const handleNextCard = () => {
    if (flashcards.length === 0) return;
    sfx.playClick();
    setIsFlipped(false);
    setCardIndex((prev) => (prev < flashcards.length - 1 ? prev + 1 : 0));
  };

  const handlePrevCard = () => {
    if (flashcards.length === 0) return;
    sfx.playClick();
    setIsFlipped(false);
    setCardIndex((prev) => (prev > 0 ? prev - 1 : flashcards.length - 1));
  };

  const handleSetInterval = (type: 'again' | 'hard' | 'good' | 'easy') => {
    const card = flashcards[cardIndex];
    if (card) {
      setCardIntervals((prev) => ({ ...prev, [card.id]: type }));
    }
    if (type === 'easy' || type === 'good') {
      sfx.playCorrect();
    } else {
      sfx.playClick();
    }
    handleNextCard();
  };

  const handleShuffleDeck = () => {
    sfx.playClick();
    setFlashcards((prev) => [...prev].sort(() => Math.random() - 0.5));
    setCardIndex(0);
    setIsFlipped(false);
  };

  // Export Flashcards to Anki CSV
  const handleExportAnki = () => {
    if (flashcards.length === 0) return;
    sfx.playClick();
    const csvContent = flashcards
      .map((f) => `"${f.concepto.replace(/"/g, '""')}","${f.definicion.replace(/"/g, '""')} - Nemotecnia: ${f.nemotecnia || ''}"`)
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Thea_Flashcards_Anki.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Guide to Markdown
  const handleDownloadGuide = () => {
    if (!guideContent) return;
    sfx.playClick();
    const blob = new Blob([guideContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Thea_Dossier_Estudio.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Derived progress values
  const totalCurrentQ = filteredQuestions.length;
  const currentProgressPercent = totalCurrentQ > 0 ? Math.round(((quizIndex + 1) / totalCurrentQ) * 100) : 0;
  const currentLvlInfo = currentQ ? LEVEL_METADATA[currentQ.nivel || 1] : LEVEL_METADATA[1];

  const docsWordCount = (sourceDocs || (sourceDoc ? [sourceDoc] : [])).reduce(
    (acc, doc) => acc + (doc.conceptualContext || '').trim().split(/\s+/).filter(Boolean).length,
    0
  );
  const wordCount = notes.trim().split(/\s+/).filter(Boolean).length + docsWordCount;
  const readingTimeEstimate = Math.ceil(wordCount / 220);

  return (
    <div className="min-h-screen flex flex-col bg-[#0e0e14] text-gray-100 font-sans selection:bg-blue-600 selection:text-white">

      {/* =======================================================================
          TOP BAR (OMNI-NAV): NAVEGABLE, MINIMALISTA Y ELEGANTE
         ======================================================================= */}
      <header className="sticky top-0 z-40 bg-[#12121b]/95 backdrop-blur-md border-b border-[#222232] px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-md">
        {/* Left: Sidebar Toggle & Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
            className="p-2 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#2d2d42] text-gray-300 hover:text-white transition cursor-pointer flex items-center justify-center shadow-sm"
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4 text-blue-400" /> : <PanelLeft className="w-4 h-4 text-gray-300" />}
          </button>

          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setCurrentView('materiales')}
          >
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center font-black text-sm text-white shadow-sm">
              T
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-white leading-none">
                Thea Pro
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 font-medium">
                Gemini 3.8 Flash
              </span>
            </div>
          </div>
        </div>

        {/* Center: Segmented Navigation Pills (Direct switching without needing the sidebar open) */}
        <nav className="flex items-center gap-1 bg-[#171725] p-1 rounded-2xl border border-[#262638] overflow-x-auto no-scrollbar max-w-full">
          <button
            type="button"
            onClick={() => setCurrentView('materiales')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              currentView === 'materiales'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#202030]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Materiales</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('quiz')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              currentView === 'quiz'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#202030]'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-indigo-400" />
            <span>Quiz (4 Niveles)</span>
            {preguntas.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono text-blue-200">
                {preguntas.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('flashcards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              currentView === 'flashcards'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#202030]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>Tarjetas 3D</span>
            {flashcards.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono text-purple-200">
                {flashcards.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('guia')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              currentView === 'guia'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#202030]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>Dossier</span>
            {guideContent && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('consulta')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              currentView === 'consulta'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#202030]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Tutor</span>
          </button>
        </nav>

        {/* Right: Sound & Score Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowOcrModal(true)}
            title="Importar desde Google Drive / OCR de PDFs pesados e imágenes"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#2d2d42] text-xs font-semibold text-sky-300 hover:text-white transition cursor-pointer shadow-sm"
          >
            <Cloud className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">Drive & OCR</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#171724] border border-[#28283a] text-xs font-mono text-amber-300">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold">{score} pts</span>
          </div>

          <button
            type="button"
            onClick={handleToggleSound}
            title={soundOn ? 'Sonido activado' : 'Sonido silenciado'}
            className="w-8 h-8 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#2d2d42] text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-gray-500" />}
          </button>
        </div>
      </header>

      {/* =======================================================================
          LAYOUT BODY: COLLAPSIBLE SIDEBAR + MAIN WORKSPACE
         ======================================================================= */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        {/* Collapsible Sidebar */}
        <aside
          className={`bg-[#14141e] border-r border-[#222232] flex flex-col justify-between shrink-0 shadow-xl overflow-y-auto transition-all duration-300 ease-in-out ${
            sidebarOpen
              ? 'w-72 md:w-80 p-5 opacity-100'
              : 'w-0 p-0 border-0 opacity-0 overflow-hidden pointer-events-none'
          }`}
        >
          <div className="space-y-6">
            {/* Sidebar Header with Collapse Button */}
            <div className="flex items-center justify-between pb-3 border-b border-[#222232]">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-gray-300 tracking-wide uppercase">
                  Panel de Estudio
                </span>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                title="Colapsar panel"
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            {/* Engine & Context Status */}
            <div className="bg-[#1b1b26] border border-[#28283a] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-semibold text-gray-200">Gemini 3.8 Flash</span>
                </div>
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  1M Tokens
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-[#262638]">
                <span>Material cargado:</span>
                <span className="font-mono text-gray-300">
                  {wordCount.toLocaleString()} palabras
                </span>
              </div>
            </div>

            {/* Quick Drive & OCR Import Button */}
            <button
              type="button"
              onClick={() => setShowOcrModal(true)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-950/40 to-indigo-950/40 hover:from-blue-900/50 hover:to-indigo-900/50 border border-blue-500/30 text-blue-200 hover:text-white transition cursor-pointer shadow-sm"
              title="Importar documentos de Google Drive o procesar OCR de PDFs pesados"
            >
              <span className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-sky-400" />
                <span>Google Drive & OCR IA</span>
              </span>
              <span className="text-[10px] font-mono bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-bold">
                PDF/IMG
              </span>
            </button>

            {/* Folder Manager List in Sidebar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400 font-semibold px-1">
                <span>MIS CARPETAS ({folders.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewFolderName('');
                    setNewFolderIcon('📚');
                    setNewFolderStarterNotes('');
                    setShowCreateModal(true);
                  }}
                  className="text-blue-400 hover:text-blue-300 text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Nueva
                </button>
              </div>

              <div className="space-y-1 max-h-56 overflow-y-auto no-scrollbar">
                {folders.map((f) => {
                  const isCur = f.id === activeFolderId;
                  const fDocWords = (f.sourceDocs || (f.sourceDoc ? [f.sourceDoc] : [])).reduce(
                    (acc, d) => acc + (d.conceptualContext || '').trim().split(/\s+/).filter(Boolean).length,
                    0
                  );
                  const fWords = (f.notes || '').trim().split(/\s+/).filter(Boolean).length + fDocWords;
                  return (
                    <div
                      key={f.id}
                      className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                        isCur
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'text-gray-300 hover:bg-[#1f1f2d] hover:text-white'
                      }`}
                      onClick={() => switchFolder(f.id)}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span>{f.icon || '📁'}</span>
                        <span className="truncate max-w-[140px]">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] opacity-75 font-mono">
                          {fWords} pal
                        </span>
                        {folders.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFolder(f.id);
                            }}
                            title="Eliminar carpeta"
                            className={`p-1 rounded opacity-0 group-hover:opacity-100 transition ${
                              isCur ? 'hover:bg-blue-700 text-white' : 'hover:bg-red-500/20 text-gray-400 hover:text-red-400'
                            }`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Global Loading Status */}
            {loadingAction && (
              <div className="bg-blue-950/40 border border-blue-500/40 rounded-xl p-3 text-xs text-blue-200 flex items-center gap-2.5 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
                <span>
                  {loadingAction === 'quiz' && 'Generando preguntas con taxonomía de 4 niveles...'}
                  {loadingAction === 'flashcards' && 'Extrayendo conceptos y nemotecnias...'}
                  {loadingAction === 'guide' && 'Redactando dossier estructurado...'}
                </span>
              </div>
            )}

            {errorMessage && !loadingAction && (
              <div className="bg-red-950/40 border border-red-500/40 rounded-xl p-3 text-xs text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{errorMessage}</div>
              </div>
            )}
          </div>

          {/* Global Score Summary in Sidebar */}
          <div className="pt-3 border-t border-[#222232] text-xs text-gray-400 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Puntaje Total:</span>
            </div>
            <span className="font-extrabold text-white text-sm">
              {score} pts
            </span>
          </div>
        </aside>

        {/* =======================================================================
            MAIN CONTENT AREA
           ======================================================================= */}
        <main className="flex-1 p-4 sm:p-7 lg:p-9 overflow-y-auto flex flex-col items-center w-full min-w-0">
          <div className="w-full max-w-4xl space-y-6">

            {/* =======================================================================
                SLIDABLE FOLDERS BAR (DESLIZABLE & MINIMALISTA CON 'X' DIRECTO)
               ======================================================================= */}
            <div className="w-full flex items-center justify-between gap-2 bg-[#161623] border border-[#252538] rounded-2xl px-2.5 py-1.5 shadow-sm">
              {/* Horizontal Scroll Folder Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
                {folders.map((f) => {
                  const isCur = f.id === activeFolderId;
                  return (
                    <div
                      key={f.id}
                      className={`group flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                        isCur
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-[#1b1b28] hover:bg-[#232335] text-gray-300 hover:text-white border border-[#2a2a3e]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => switchFolder(f.id)}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="text-sm shrink-0">{f.icon || '📁'}</span>
                        <span className="truncate max-w-[120px] sm:max-w-[180px]">{f.name}</span>
                        {f.sourceDoc && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${isCur ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-300'}`}>
                            DOC
                          </span>
                        )}
                      </button>

                      {folders.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(f.id);
                          }}
                          title={`Cerrar / eliminar ${f.name}`}
                          className={`p-1 rounded-md transition cursor-pointer ${
                            isCur
                              ? 'hover:bg-blue-700 text-blue-200 hover:text-white'
                              : 'hover:bg-red-500/20 text-gray-400 hover:text-red-400'
                          }`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setNewFolderName('');
                    setNewFolderIcon('📚');
                    setNewFolderStarterNotes('');
                    setShowCreateModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-400 hover:text-white bg-[#1a1a27] hover:bg-[#222234] border border-dashed border-[#333348] whitespace-nowrap shrink-0 transition cursor-pointer"
                  title="Crear nueva carpeta de estudio"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nueva</span>
                </button>
              </div>

              {/* Quick Folder Actions */}
              <div className="flex items-center gap-1 shrink-0 border-l border-[#262638] pl-2">
                <button
                  type="button"
                  onClick={() => setShowDirectivesModal(true)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                    activeDirectivesCount > 0
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent'
                  }`}
                  title="Configurar instrucciones, temas a evaluar y metodología para la IA"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Directivas IA</span>
                  {activeDirectivesCount > 0 && (
                    <span className="text-[9px] bg-indigo-500 text-white px-1.5 py-0.2 rounded-full font-bold">
                      {activeDirectivesCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingFolder({ id: activeFolder.id, name: activeFolder.name, icon: activeFolder.icon })}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
                  title="Renombrar carpeta activa"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicateFolder(activeFolder.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
                  title="Duplicar carpeta activa"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          {/* Celebration Banner upon Level Up */}
          {showLevelUpCelebration && (
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/40 rounded-2xl p-4 text-center shadow-lg">
              <span className="text-xl">🎉</span>
              <h3 className="text-base font-bold text-amber-300 mt-0.5">
                ¡Nivel alcanzado: {LEVEL_METADATA[showLevelUpCelebration].title}!
              </h3>
              <p className="text-xs text-gray-300">
                {LEVEL_METADATA[showLevelUpCelebration].subtitle}
              </p>
            </div>
          )}

          {/* -------------------------------------------------------------------
              VISTA 1: MATERIALES & DOCS
             ------------------------------------------------------------------- */}
          {currentView === 'materiales' && (
            <div className="bg-[#181824] border border-[#272739] rounded-2xl p-5 sm:p-7 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#252536]">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>{activeFolder.icon || '📁'}</span>
                    <span>{activeFolder.name}</span>
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    <span>{wordCount.toLocaleString()} palabras</span>
                    <span aria-hidden="true">·</span>
                    <span>~{readingTimeEstimate} min de lectura</span>
                    {preguntas.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-blue-400 font-semibold">{preguntas.length} preguntas guardadas</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowDirectivesModal(true)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer border ${
                      activeDirectivesCount > 0
                        ? 'bg-indigo-600/20 hover:bg-indigo-600/30 border-indigo-500/50 text-indigo-200 shadow-sm'
                        : 'bg-[#20202e] hover:bg-[#28283a] border-[#333348] text-gray-300'
                    }`}
                    title="Configurar qué temas evaluar, el nivel de exigencia y la metodología de aprendizaje acelerado"
                  >
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Configurar Enfoque IA</span>
                    {activeDirectivesCount > 0 && (
                      <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.2 rounded-full font-bold">
                        {activeDirectivesCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowOcrModal(true)}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-blue-900/30 cursor-pointer"
                    title="Importar PDFs pesados desde Google Drive o fotos/escaneos con OCR IA"
                  >
                    <Cloud className="w-3.5 h-3.5 text-sky-200" />
                    <span>Google Drive & OCR IA</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateFolderFromPastedNotes}
                    disabled={wordCount < 5}
                    className="bg-[#20202e] hover:bg-[#28283a] border border-[#333348] text-gray-300 disabled:opacity-40 text-xs font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    title="Guardar este texto en una nueva carpeta independiente"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Guardar en nueva carpeta</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-[#20202e] hover:bg-[#28283a] border border-[#333348] text-gray-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    <span>Subir archivo</span>
                  </button>
                </div>
              </div>

              {/* Sample Presets as quiet single-line chips */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Ejemplos:</span>
                {SAMPLE_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const existing = folders.find((f) => f.name.includes(preset.title.split(':')[0]));
                      if (existing) {
                        switchFolder(existing.id);
                      } else {
                        handleCreateFolder(preset.title, preset.title.slice(0, 2), preset.content);
                      }
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-[#191924] hover:bg-[#232334] text-gray-300 hover:text-white border border-[#2b2b3d] whitespace-nowrap transition cursor-pointer"
                  >
                    {preset.title.split(':')[0]}
                  </button>
                ))}
              </div>

              {/* Active Directives Summary Banner */}
              {activeDirectivesCount > 0 && (
                <div className="bg-[#131525] border border-indigo-500/30 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-400">
                      <Target className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                        <span>Directivas IA de Estudio:</span>
                        <span className="text-indigo-300 font-medium">
                          {aiDirectives.learningMethod === 'feynman' && 'Método Feynman (Analogías y Síntesis)'}
                          {aiDirectives.learningMethod === 'exam_sim' && 'Simulador de Examen Oficial'}
                          {aiDirectives.learningMethod === 'active_recall' && 'Active Recall de Alta Fricción'}
                          {aiDirectives.learningMethod === 'spaced_reinforcement' && 'Refuerzo de Errores y Excepciones'}
                          {aiDirectives.learningMethod === 'socratic' && 'Deducción Socrática'}
                          {aiDirectives.learningMethod === 'balanced' && 'Enfoque Temático Específico'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 truncate mt-0.5">
                        {aiDirectives.selectedTopics.length > 0 && `Temas activos: ${aiDirectives.selectedTopics.join(', ')} · `}
                        {aiDirectives.customTopicFocus && `Foco: "${aiDirectives.customTopicFocus}" · `}
                        {aiDirectives.excludedTopics && `Excluir: "${aiDirectives.excludedTopics}" · `}
                        {aiDirectives.questionStyle !== 'standard' && `Formato: ${aiDirectives.questionStyle}`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDirectivesModal(true)}
                    className="text-xs font-semibold text-indigo-300 hover:text-white hover:underline shrink-0 cursor-pointer"
                  >
                    Modificar
                  </button>
                </div>
              )}

              {/* Active Source Documents Cards (Drive / Heavy PDFs / Scans) */}
              {sourceDocs.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs px-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span>
                          {sourceDocs.length === 1
                            ? 'Documento Fuente Activo'
                            : `Documentos Fuentes Activos (${sourceDocs.length})`}
                        </span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        IA Gemini 3.8 Flash
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOcrModal(true)}
                      className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Añadir otro PDF</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {sourceDocs.map((doc, idx) => (
                      <div
                        key={`${doc.fileName}-${idx}`}
                        className="bg-[#131726] border border-blue-500/30 rounded-xl p-3.5 relative overflow-hidden transition-all shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-md">
                                  {doc.title || doc.fileName}
                                </h3>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 shrink-0">
                                  <Check className="w-2.5 h-2.5" /> {doc.fileSize || 'PDF'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-300 mt-1 leading-relaxed line-clamp-2">
                                {doc.summary}
                              </p>
                              {doc.chapters && doc.chapters.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                  <span className="text-[10px] text-gray-400 font-medium mr-1">Ejes:</span>
                                  {doc.chapters.slice(0, 6).map((chap, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className="text-[10px] px-2 py-0.5 rounded-md bg-[#1c2236] text-blue-200 border border-blue-500/20"
                                    >
                                      {chap}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDetachSourceDoc(idx)}
                            className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition cursor-pointer shrink-0"
                            title="Desvincular este documento"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Textarea */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative rounded-xl border transition-all p-1 ${
                  isDragging ? 'border-blue-500 bg-blue-950/20' : 'border-[#28283a] bg-[#121217]'
                }`}
              >
                <textarea
                  id="massive-notes"
                  rows={sourceDocs.length > 0 ? 8 : 14}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={loadingAction !== null}
                  placeholder={
                    sourceDocs.length > 0
                      ? 'Apuntes adicionales, preguntas o notas para complementar los documentos fuente (opcional)...'
                      : 'Pega aquí tu material de estudio: apuntes, leyes, resúmenes, artículos científicos o capítulos de libros...'
                  }
                  className="w-full bg-transparent text-gray-100 placeholder-gray-500 p-3.5 text-xs sm:text-sm leading-relaxed resize-y focus:outline-none font-mono"
                />

                {isDragging && (
                  <div className="absolute inset-0 bg-blue-950/80 backdrop-blur-sm rounded-xl flex items-center justify-center text-blue-200 font-bold text-sm">
                    Suelta tu archivo aquí
                  </div>
                )}
              </div>

              {/* Document Analyzer summary if present */}
              {analysis && (
                <div className="bg-[#14141d] border border-blue-500/20 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white">{analysis.titulo}</h4>
                    <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      Densidad: {analysis.densidad}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {analysis.resumenBreve}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {analysis.temasClave?.map((tema, tIdx) => (
                      <span
                        key={tIdx}
                        className="text-[10px] bg-[#1c1c28] text-gray-300 px-2 py-0.5 rounded border border-[#2b2b3c]"
                      >
                        • {tema}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons to Generate (Minimalist, Clean & Fast) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleGenerateQuiz('all')}
                  disabled={loadingAction !== null}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition cursor-pointer shadow-sm"
                >
                  <Brain className="w-4 h-4 shrink-0" />
                  <span>{loadingAction === 'quiz' ? 'Generando preguntas...' : 'Generar Quiz'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleGenerateFlashcards}
                  disabled={loadingAction !== null}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-gray-200 hover:text-white bg-[#1e1e2c] hover:bg-[#27273a] border border-[#2e2e42] disabled:opacity-50 transition cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{loadingAction === 'flashcards' ? 'Generando tarjetas...' : 'Tarjetas 3D'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleGenerateGuide}
                  disabled={loadingAction !== null}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-gray-200 hover:text-white bg-[#1e1e2c] hover:bg-[#27273a] border border-[#2e2e42] disabled:opacity-50 transition cursor-pointer"
                >
                  <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{loadingAction === 'guide' ? 'Redactando dossier...' : 'Dossier de Estudio'}</span>
                </button>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------------
              VISTA 2: QUIZ DE ESTUDIO
             ------------------------------------------------------------------- */}
          {currentView === 'quiz' && (
            <div>
              {preguntas.length === 0 ? (
                <div className="bg-[#181824] border border-[#272739] rounded-2xl p-8 sm:p-10 text-center space-y-4 shadow-lg">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Brain className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {examBankQuestions.length > 0 ? 'Simulacro de Examen de Admisión' : 'Quiz de Estudio Académico'}
                  </h3>
                  <p className="text-gray-400 text-xs max-w-md mx-auto leading-relaxed">
                    {examBankQuestions.length > 0
                      ? `Se han digitalizado ${examBankQuestions.length} problemas reales con fórmulas, alternativas y soluciones extraídos de tu examen de admisión.`
                      : 'Preguntas académicas rigurosas basadas en los apuntes de tu carpeta activa, con ejercicios numéricos y explicaciones paso a paso.'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                    {examBankQuestions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPreguntas(examBankQuestions);
                          setQuizIndex(0);
                          setSelectedOption(null);
                          setRevealed(false);
                          sfx.playLevelUp();
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Rendir Preguntas del Examen ({examBankQuestions.length})</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleGenerateQuiz('all')}
                        disabled={loadingAction !== null}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{loadingAction === 'quiz' ? 'Generando preguntas...' : 'Comenzar Quiz'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleGenerateQuiz('all')}
                      disabled={loadingAction !== null}
                      className="bg-[#20202e] hover:bg-[#28283a] border border-[#333348] text-gray-300 font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3 text-blue-400" />
                      <span>Generar Nuevas con IA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentView('materiales')}
                      className="bg-[#20202e] hover:bg-[#28283a] border border-[#333348] text-gray-300 font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
                    >
                      Ver Materiales
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Real Exam Bank Banner if available */}
                  {examBankQuestions.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-[#181824] border border-blue-500/30 px-4 py-3 rounded-2xl shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">🏛️</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">Banco del Examen de Admisión</span>
                            <span className="text-[10px] font-mono bg-blue-500/20 text-blue-300 px-2 py-0.2 rounded-full border border-blue-500/30">
                              {examBankQuestions.length} preguntas extraídas
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Problemas y ejercicios reales digitalizados de tu documento.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPreguntas(examBankQuestions);
                          setQuizIndex(0);
                          setSelectedOption(null);
                          setRevealed(false);
                          sfx.playLevelUp();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 text-white font-semibold text-xs transition cursor-pointer shrink-0 shadow-sm"
                      >
                        Cargar Examen Original
                      </button>
                    </div>
                  )}

                  {/* Quiz Status & Progress Strip */}
                  <div className="flex items-center justify-between gap-3 text-xs text-gray-400 bg-[#161622] border border-[#252536] px-4 py-2.5 rounded-xl">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1.5 font-semibold text-gray-200">
                        <span className="text-blue-400">♾️</span> Modo Infinito
                      </span>
                      <span aria-hidden="true" className="text-gray-600">·</span>
                      <span className="flex items-center gap-1 text-amber-400 font-semibold">
                        <Flame className="w-3.5 h-3.5" /> Racha: {streak} (Máx: {maxStreak})
                      </span>
                      <span aria-hidden="true" className="text-gray-600 hidden sm:inline">·</span>
                      <span className="hidden sm:inline">Total respondidas: <strong className="text-white font-mono">{totalAnswered}</strong></span>
                    </div>

                    <div className="flex items-center gap-2">
                      {fetchingMore && (
                        <span className="flex items-center gap-1 text-[11px] text-blue-400 animate-pulse font-mono">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Generando...
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => fetchMoreQuestions(activeLevelFilter)}
                        disabled={fetchingMore}
                        className="px-2.5 py-1 rounded-lg bg-[#20202e] hover:bg-[#28283a] text-gray-300 hover:text-white border border-[#2e2e42] text-xs font-medium transition cursor-pointer"
                        title="Generar más preguntas en segundo plano"
                      >
                        +6 Preguntas
                      </button>

                      <button
                        type="button"
                        onClick={handleAnalyzeExamPatterns}
                        disabled={loadingPatterns}
                        className="px-2.5 py-1 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                        title="Analizar patrones y frecuencia de temas de los exámenes subidos"
                      >
                        <Target className={`w-3.5 h-3.5 text-indigo-400 ${loadingPatterns ? 'animate-spin' : ''}`} />
                        <span>{loadingPatterns ? 'Analizando...' : 'Radiografía de Admisión'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Segmented Level Filter */}
                  <div className="flex items-center gap-1.5 p-1 bg-[#151520] border border-[#262638] rounded-xl overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLevelFilter('all');
                        setQuizIndex(0);
                        setSelectedOption(null);
                        setRevealed(false);
                        sfx.playClick();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        activeLevelFilter === 'all'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Todos ({preguntas.length})
                    </button>
                    {[1, 2, 3, 4].map((lvl) => {
                      const meta = LEVEL_METADATA[lvl];
                      const countInLvl = preguntas.filter((q) => q.nivel === lvl).length;
                      const isCurrent = activeLevelFilter === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => {
                            setActiveLevelFilter(lvl);
                            setQuizIndex(0);
                            setSelectedOption(null);
                            setRevealed(false);
                            sfx.playClick();
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                            isCurrent
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          <span>{meta.icon}</span>
                          <span>Nivel {lvl}</span>
                          <span className="text-[10px] opacity-75 font-mono">({countInLvl})</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Infinite Queue Loading Card (when waiting for next questions) */}
                  {!currentQ ? (
                    <div className="bg-[#181822] border border-blue-500/40 rounded-3xl p-10 text-center space-y-4 shadow-2xl animate-pulse">
                      <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                        <RefreshCw className="w-8 h-8 animate-spin" />
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black text-white">
                        ♾️ Generando la siguiente tanda de preguntas infinitas...
                      </h3>
                      <p className="text-gray-400 text-sm max-w-md mx-auto">
                        Thea Pro está analizando nuevos ángulos de tus notas para formular preguntas inéditas sin repetir las anteriores.
                      </p>
                      <div className="pt-2 flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => fetchMoreQuestions(activeLevelFilter)}
                          disabled={fetchingMore}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition"
                        >
                          {fetchingMore ? 'Generando con Gemini...' : 'Cargar tanda ahora'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuizIndex(0)}
                          className="bg-[#242433] hover:bg-[#2e2e40] text-gray-300 font-bold px-5 py-2.5 rounded-xl text-xs transition border border-[#3a3a4e]"
                        >
                          Volver al inicio
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Progress & Performance Header */}
                      <div className="bg-[#181822] border border-[#2a2a3b] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="w-full sm:flex-1 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-extrabold text-white flex items-center gap-2">
                              <span>{currentLvlInfo.icon}</span>
                              <span>{currentLvlInfo.title}</span>
                              <span className="text-blue-400">· {currentProgressPercent}%</span>
                            </span>
                            <span className="text-gray-400 font-mono">
                              Pregunta {quizIndex + 1} de ∞ ({totalCurrentQ} cargadas)
                            </span>
                          </div>
                          <div className="w-full h-3 bg-[#111116] rounded-full overflow-hidden p-0.5 border border-[#2a2a3b]">
                            <div
                              className={`h-full bg-gradient-to-r ${currentLvlInfo.color} rounded-full transition-all duration-300`}
                              style={{ width: `${currentProgressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* 3-Star Rating based on correct answers */}
                        <div className="flex items-center gap-1.5 shrink-0 bg-[#121217] px-4 py-2 rounded-2xl border border-[#2a2a3b]">
                          {[0, 1, 2].map((starIdx) => {
                            const active =
                              (starIdx === 0 && score >= 1) ||
                              (starIdx === 1 && score >= 3) ||
                              (starIdx === 2 && score >= 6);
                            return (
                              <Star
                                key={starIdx}
                                className={`w-5 h-5 transition-colors ${
                                  active
                                    ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                                    : 'text-gray-700 fill-gray-800'
                                }`}
                              />
                            );
                          })}
                          <span className="text-xs font-bold text-gray-200 ml-2">
                            {score} aciertos
                          </span>
                        </div>
                      </div>

                      {/* Main Question Card with TTS Narrator button - COMPACT & ERGONOMIC */}
                      <div className="bg-[#161622] border border-[#272738] rounded-2xl p-4 sm:p-5 shadow-lg text-center relative space-y-2.5">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-3 py-0.5 rounded-full border border-blue-500/20">
                            Pregunta {quizIndex + 1} · Modo Infinito
                          </span>
                          <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                            Nivel {currentQ.nivel || 1}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleSpeakText(currentQ.pregunta || '')}
                            title="Escuchar pregunta en voz alta"
                            className="w-7 h-7 rounded-full bg-[#222232] hover:bg-[#2d2d40] text-gray-300 hover:text-white flex items-center justify-center border border-[#34344a] transition ml-1 cursor-pointer"
                          >
                            <Volume2 className={`w-3.5 h-3.5 ${speaking ? 'text-blue-400 animate-pulse' : ''}`} />
                          </button>
                        </div>

                        <h2 className="text-base sm:text-lg md:text-xl font-bold text-white leading-snug max-w-2xl mx-auto">
                          {currentQ.pregunta}
                        </h2>
                      </div>

                      {/* Thea 2x2 Grid of 4 Options (Numbered 1, 2, 3, 4) - COMPACT & STREAMLINED */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                        {currentQ?.opciones.map((opcion, i) => {
                          const isSelected = selectedOption === i;
                          const isCorrect = i === currentQ.correcta;

                          let cardStyle = 'border-[#262638] hover:border-blue-500/60 hover:bg-[#1a1a28] bg-[#14141e] text-gray-200 cursor-pointer active:scale-[0.99]';
                          let circleStyle = 'bg-[#101017] text-gray-400 border-[#2b2b3e]';

                          if (revealed) {
                            if (isCorrect) {
                              cardStyle = 'border-emerald-500 bg-emerald-950/35 text-emerald-100 ring-2 ring-emerald-500/50 shadow-md shadow-emerald-950/40 cursor-default';
                              circleStyle = 'bg-emerald-500 text-white border-emerald-300 shadow-sm shadow-emerald-500/50 scale-105';
                            } else if (isSelected && !isCorrect) {
                              cardStyle = 'border-rose-500 bg-rose-950/35 text-rose-100 ring-2 ring-rose-500/50 shadow-md shadow-rose-950/40 cursor-default';
                              circleStyle = 'bg-rose-500 text-white border-rose-300 shadow-sm shadow-rose-500/50 scale-105';
                            } else {
                              cardStyle = 'border-[#20202e] bg-[#111118] text-gray-500 opacity-60 cursor-default';
                              circleStyle = 'bg-[#0e0e14] text-gray-600 border-[#20202e]';
                            }
                          }

                          return (
                            <button
                              key={`quiz-opt-${quizIndex}-${i}`}
                              type="button"
                              disabled={revealed}
                              onClick={() => handleSelectOption(i)}
                              className={`w-full min-h-[58px] sm:min-h-[64px] p-3 sm:p-3.5 rounded-xl border transition-all duration-150 text-left flex items-center gap-3 select-none ${cardStyle}`}
                            >
                              <div
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center font-bold text-xs shrink-0 transition-all ${circleStyle}`}
                              >
                                {i + 1}
                              </div>
                              <span className="text-xs sm:text-sm font-medium leading-relaxed flex-1">
                                {opcion}
                              </span>
                              {revealed && isCorrect && (
                                <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-400 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-500/30 shrink-0">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Correcta</span>
                                </div>
                              )}
                              {revealed && isSelected && !isCorrect && (
                                <div className="flex items-center gap-1 bg-rose-500/20 text-rose-400 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-rose-500/30 shrink-0">
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Tu elección</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Warning message if any */}
                      {quizNotice && (
                        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-300 text-xs text-center font-bold">
                          {quizNotice}
                        </div>
                      )}

                      {/* IMMEDIATE ACTION & NAVIGATION BAR - FITS ON SCREEN WITHOUT SCROLLING */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#14141e] border border-[#252538] p-3 rounded-xl shadow-sm">
                        {/* Left: Instant Evaluation Status */}
                        <div className="flex items-center gap-2">
                          {revealed ? (
                            <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border ${
                              selectedOption === currentQ?.correcta
                                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40'
                                : 'bg-rose-950/50 text-rose-300 border-rose-500/40'
                            }`}>
                              {selectedOption === currentQ?.correcta ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                  <span>¡Correcto! (+1 acierto)</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                                  <span>Incorrecto · Opción #{currentQ.correcta + 1}</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 font-medium hidden sm:inline">
                              ⚡ Haz clic en una opción (1, 2, 3 o 4) para evaluar al instante
                            </span>
                          )}
                        </div>

                        {/* Center Actions: Tabs directos al Mapa Mental, A Toda Leche, Duda */}
                        {revealed && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Toggle Mapa Mental */}
                            <button
                              type="button"
                              onClick={() => {
                                if (showExplanation && contextActiveTab === 'mapa') {
                                  setShowExplanation(false);
                                } else {
                                  setShowExplanation(true);
                                  setContextActiveTab('mapa');
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                                showExplanation && contextActiveTab === 'mapa'
                                  ? 'bg-sky-600 text-white border-sky-400 shadow-sm'
                                  : 'bg-[#181f2a] hover:bg-[#202938] border-slate-700/80 text-sky-300 hover:text-white'
                              }`}
                              title="Ver el Mapa Mental Interconectado (Causa - Quiebre - Consecuencia)"
                            >
                              <Compass className="w-3.5 h-3.5 text-sky-400" />
                              <span>🗺️ Mapa Mental</span>
                            </button>

                            {/* Toggle A Toda Leche */}
                            <button
                              type="button"
                              onClick={() => {
                                if (showExplanation && contextActiveTab === 'todaLeche') {
                                  setShowExplanation(false);
                                } else {
                                  setShowExplanation(true);
                                  setContextActiveTab('todaLeche');
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                                showExplanation && contextActiveTab === 'todaLeche'
                                  ? 'bg-amber-600 text-white border-amber-400 shadow-sm'
                                  : 'bg-[#181f2a] hover:bg-[#202938] border-slate-700/80 text-amber-300 hover:text-white'
                              }`}
                              title="Ver la narración rápida y dinámica estilo YouTube"
                            >
                              <Zap className="w-3.5 h-3.5 text-amber-400" />
                              <span>⚡ A Toda Leche</span>
                            </button>

                            {/* Toggle Trampas & Nemotecnia */}
                            <button
                              type="button"
                              onClick={() => {
                                if (showExplanation && contextActiveTab === 'trampas') {
                                  setShowExplanation(false);
                                } else {
                                  setShowExplanation(true);
                                  setContextActiveTab('trampas');
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                                showExplanation && contextActiveTab === 'trampas'
                                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                                  : 'bg-[#181f2a] hover:bg-[#202938] border-slate-700/80 text-indigo-300 hover:text-white'
                              }`}
                              title="Ver las trampas de examen y nemotecnias"
                            >
                              <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
                              <span>🎯 Trampas</span>
                            </button>

                            {/* Preguntar Duda al Tutor IA */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowExplanation(true);
                                setShowDoubtBox(!showDoubtBox);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                                showDoubtBox
                                  ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                                  : 'bg-[#181f2a] hover:bg-[#202938] border-slate-700/80 text-purple-300 hover:text-white'
                              }`}
                              title="Hacer preguntas de dudas a la IA sobre este problema"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                              <span>Preguntar Duda</span>
                            </button>

                            {/* Ocultar si ya está abierto */}
                            {showExplanation && (
                              <button
                                type="button"
                                onClick={() => setShowExplanation(false)}
                                className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700 transition cursor-pointer"
                                title="Plegar panel de aprendizaje"
                              >
                                ✕ Cerrar
                              </button>
                            )}
                          </div>
                        )}

                        {/* Right: Siguiente / Saltar Button + Feedback */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleNextQuestion}
                            className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#082f49] font-black py-2 px-5 rounded-xl transition shadow-md shadow-sky-950/40 text-xs sm:text-sm flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                          >
                            <span>
                              {revealed
                                ? quizIndex < totalCurrentQ - 1
                                  ? 'Siguiente'
                                  : 'Reiniciar'
                                : 'Saltar'}
                            </span>
                            <ChevronRight className="w-4 h-4" />
                          </button>

                          {revealed && (
                            <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-white/10">
                              <button
                                type="button"
                                onClick={() => {
                                  if (currentQ) {
                                    setFeedbackVote((prev) => ({ ...prev, [currentQ.id]: 'up' }));
                                    sfx.playClick();
                                  }
                                }}
                                title="Buena pregunta"
                                className={`p-1.5 rounded-lg border transition ${
                                  currentQ && feedbackVote[currentQ.id] === 'up'
                                    ? 'bg-emerald-600 border-emerald-400 text-white'
                                    : 'bg-[#1a1a26] text-gray-400 hover:text-white border-[#2b2b3c]'
                                }`}
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (currentQ) {
                                    setFeedbackVote((prev) => ({ ...prev, [currentQ.id]: 'down' }));
                                    sfx.playClick();
                                  }
                                }}
                                title="Reportar redacción"
                                className={`p-1.5 rounded-lg border transition ${
                                  currentQ && feedbackVote[currentQ.id] === 'down'
                                    ? 'bg-rose-600 border-rose-400 text-white'
                                    : 'bg-[#1a1a26] text-gray-400 hover:text-white border-[#2b2b3c]'
                                }`}
                              >
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CENTRO DE APRENDIZAJE VISUAL: MAPA MENTAL & A TODA LECHE */}
                      {revealed && showExplanation && currentQ && (() => {
                        const ctx = questionContexts[currentQ.id] || getInstantQuestionContext(currentQ);
                        return (
                          <div className="rounded-2xl p-4 sm:p-5 border border-slate-800 bg-[#0c1017] text-slate-200 space-y-4 shadow-xl transition-all">
                            {/* Header: Clean status and dynamic tabs */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                              <div className="flex items-center gap-2">
                                {selectedOption === currentQ.correcta ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                                )}
                                <div>
                                  <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                    <span>
                                      {selectedOption === currentQ.correcta
                                        ? '¡Respuesta Correcta!'
                                        : 'Respuesta Incorrecta — Aprende del Error'}
                                    </span>
                                  </h4>
                                  <span className="text-[11px] text-slate-400">
                                    Clave correcta: <strong className="text-emerald-300 font-mono">Opción #{currentQ.correcta + 1}: {currentQ.opciones?.[currentQ.correcta]}</strong>
                                  </span>
                                </div>
                              </div>

                              {/* View Switcher Sub-tabs */}
                              <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setContextActiveTab('mapa')}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                                    contextActiveTab === 'mapa'
                                      ? 'bg-sky-600 text-white shadow-sm'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span>🗺️ Mapa Mental</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setContextActiveTab('todaLeche')}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                                    contextActiveTab === 'todaLeche'
                                      ? 'bg-amber-600 text-white shadow-sm'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span>⚡ A Toda Leche</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setContextActiveTab('trampas')}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                                    contextActiveTab === 'trampas'
                                      ? 'bg-indigo-600 text-white shadow-sm'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span>🎯 Trampas & Nemotecnia</span>
                                </button>
                              </div>
                            </div>

                            {/* TAB 1: MAPA MENTAL INTERACTIVO DE CAUSA-EFECTO */}
                            {contextActiveTab === 'mapa' && (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-xs text-slate-400">
                                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                                    <Compass className="w-3.5 h-3.5 text-sky-400" />
                                    <span>{ctx.tituloTema || 'Mapa de Causa-Efecto'}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {ctx.mapaMental?.ejeCentral || 'Causa ➔ Quiebre Central ➔ Consecuencia'}
                                  </span>
                                </div>

                                {ctx.mapaMental ? (
                                  <div className="space-y-4">
                                    {/* Eje de Causalidad / Timeline Bar */}
                                    {ctx.mapaMental.ejeCentral && (
                                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-sky-200 flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 shrink-0 font-mono">
                                          Cadena Causal:
                                        </span>
                                        <span className="font-medium text-slate-200 leading-snug">
                                          {ctx.mapaMental.ejeCentral}
                                        </span>
                                      </div>
                                    )}

                                    {/* 3 Fases Causa-Efecto Conectadas (Sin cajitas neón ni fragmentos sueltos) */}
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 items-stretch">
                                      {/* FASE 1: El Escenario Previo & Abuso de Fondo */}
                                      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                                              <span>💥 1. Conflicto & Abuso Previo</span>
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-mono">El Escenario</span>
                                          </div>
                                          <div className="space-y-3">
                                            {ctx.mapaMental.causas?.map((c: any, cIdx: number) => (
                                              <div key={c.id || cIdx} className="space-y-1.5">
                                                <div className="text-xs font-bold text-slate-100 flex items-center gap-1">
                                                  <span>{c.titulo}</span>
                                                </div>
                                                {c.actorOPrincipio && (
                                                  <span className="inline-block text-[10px] font-medium text-amber-300/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                    {c.actorOPrincipio}
                                                  </span>
                                                )}
                                                <p className="text-xs text-slate-300 leading-relaxed pt-0.5 font-sans">
                                                  {c.detalle}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/60 text-center font-mono">
                                          Detonó la reacción popular ➔
                                        </div>
                                      </div>

                                      {/* FASE 2: El Quiebre Decisivo & La Acción en Directo */}
                                      <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                            <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                                              <span>🎯 2. La Chispa & El Quiebre</span>
                                            </span>
                                            <span className="text-[10px] font-mono text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                                              {ctx.mapaMental.hechoCentral?.hitoOFormula || 'El Hito'}
                                            </span>
                                          </div>
                                          <div className="space-y-2">
                                            <h6 className="text-xs sm:text-sm font-bold text-white">
                                              {ctx.mapaMental.hechoCentral?.titulo}
                                            </h6>
                                            <p className="text-xs text-slate-200 leading-relaxed font-sans bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                                              {ctx.mapaMental.hechoCentral?.quePaso}
                                            </p>
                                            {ctx.mapaMental.hechoCentral?.quiebreClave && (
                                              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-0.5">
                                                <strong className="text-sky-300 block text-[10px] uppercase tracking-wider">
                                                  Punto de no retorno:
                                                </strong>
                                                <span>{ctx.mapaMental.hechoCentral.quiebreClave}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/60 text-center font-mono">
                                          Desató el nuevo orden ➔
                                        </div>
                                      </div>

                                      {/* FASE 3: Las Consecuencias & El Foco de Examen */}
                                      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                              <span>🌪️ 3. Desenlace & Pregunta de Admisión</span>
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-mono">Consecuencias</span>
                                          </div>
                                          <div className="space-y-3">
                                            {ctx.mapaMental.consecuencias?.map((e: any, eIdx: number) => (
                                              <div key={e.id || eIdx} className="space-y-1.5">
                                                <div className="text-xs font-bold text-slate-100 flex items-center gap-1">
                                                  <span>{e.titulo}</span>
                                                </div>
                                                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                                                  {e.impactoDirecto}
                                                </p>
                                                {e.conexionFutura && (
                                                  <div className="text-[10px] text-emerald-300/90 font-medium">
                                                    🔗 Conexión de examen: {e.conexionFutura}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/60 text-center font-mono">
                                          Conclusión definitiva
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-300 leading-relaxed p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                                    <p>{ctx.contextoAmpliado || 'Contexto procesado para este concepto.'}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* TAB 2: NARRACIÓN DINÁMICA "A TODA LECHE" */}
                            {contextActiveTab === 'todaLeche' && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                                  <span>⚡ Narración en Alta Velocidad (Sin rodeos de libro de texto)</span>
                                </div>
                                <div className="text-xs sm:text-sm text-slate-200 leading-relaxed space-y-2.5 bg-slate-900/70 p-4 rounded-xl border border-slate-800/90 whitespace-pre-line font-sans">
                                  {ctx.narracionATodaLeche || ctx.contextoAmpliado}
                                </div>
                              </div>
                            )}

                            {/* TAB 3: TRAMPAS DE ADMISIÓN & NEMOTECNIA */}
                            {contextActiveTab === 'trampas' && (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 space-y-1.5">
                                    <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                                      <span>🚨 La Trampa Típica del Evaluador</span>
                                    </div>
                                    <p className="text-xs text-slate-300 leading-relaxed">
                                      {ctx.pilaresExamen?.laTrampaDelEvaluador || ctx.porQueImportaEnExamenes}
                                    </p>
                                  </div>

                                  <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 space-y-1.5">
                                    <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                                      <span>⚡ Criterio de Descarte Rápido (5 seg)</span>
                                    </div>
                                    <p className="text-xs text-slate-300 leading-relaxed">
                                      {ctx.pilaresExamen?.comoDescartarRapido || 'Descarta toda opción que invierta la causa con el efecto o confunda variables.'}
                                    </p>
                                  </div>
                                </div>

                                {/* Super Nemotecnia Visual (Only shown if unique and distinct from descarte) */}
                                {ctx.reglaNemotecnica &&
                                  ctx.reglaNemotecnica.trim() !== (ctx.pilaresExamen?.comoDescartarRapido || '').trim() && (
                                    <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2">
                                      <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                      <div>
                                        <strong className="block text-amber-300 text-[11px] uppercase tracking-wider mb-0.5">
                                          Super Nemotecnia Visual:
                                        </strong>
                                        <span>{ctx.reglaNemotecnica}</span>
                                      </div>
                                    </div>
                                  )}
                              </div>
                            )}

                            {/* Tip de Examen Strip (Hidden in trampas tab to avoid visual redundancy) */}
                            {contextActiveTab !== 'trampas' && currentQ.tipExamen && (
                              <div className="bg-amber-950/20 rounded-xl p-2.5 text-xs text-amber-200/90 border border-amber-500/20 flex items-start gap-2">
                                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <span><strong>Regla de Examen:</strong> {currentQ.tipExamen}</span>
                              </div>
                            )}

                            {/* IN-QUIZ INTERACTIVE DOUBT SOLVER CHAT */}
                            {showDoubtBox && (
                              <div className="mt-3 bg-[#171322] border border-purple-500/30 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-purple-500/20">
                                  <div className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-purple-400" />
                                    <h5 className="text-xs font-bold text-purple-200">
                                      Preguntar Duda al Tutor IA sobre esta Pregunta
                                    </h5>
                                  </div>
                                  <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                                    Tutor en Vivo
                                  </span>
                                </div>

                                {/* Quick prompt chips */}
                                <div className="flex flex-wrap gap-1.5">
                                  {[
                                    '¿Por qué mi opción seleccionada no fue la correcta?',
                                    '¿Cómo se deduce la respuesta paso a paso?',
                                    'Dame una analogía sencilla de la vida real',
                                    '¿Qué otros datos clave suelen preguntar sobre este tema?'
                                  ].map((chip, cIdx) => (
                                    <button
                                      key={cIdx}
                                      type="button"
                                      onClick={() => handleAskQuestionDoubt(currentQ, chip)}
                                      disabled={askingDoubt}
                                      className="text-[11px] bg-[#221c32] hover:bg-[#2c2442] text-purple-200 hover:text-white px-2.5 py-1 rounded-lg border border-purple-500/20 transition cursor-pointer"
                                    >
                                      💬 {chip}
                                    </button>
                                  ))}
                                </div>

                                {/* Custom Doubt Input */}
                                <div className="flex items-center gap-2 pt-1">
                                  <input
                                    type="text"
                                    value={userDoubtInput}
                                    onChange={(e) => setUserDoubtInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAskQuestionDoubt(currentQ);
                                      }
                                    }}
                                    placeholder="Escribe tu duda específica sobre este ejercicio..."
                                    className="flex-1 bg-[#100c1a] border border-purple-500/30 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAskQuestionDoubt(currentQ)}
                                    disabled={askingDoubt || !userDoubtInput.trim()}
                                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm shrink-0"
                                  >
                                    {askingDoubt ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Send className="w-3.5 h-3.5" />
                                    )}
                                    <span>{askingDoubt ? 'Consultando...' : 'Preguntar'}</span>
                                  </button>
                                </div>

                                {/* Question Doubt History */}
                                {questionDoubts[currentQ.id] && questionDoubts[currentQ.id].length > 0 && (
                                  <div className="space-y-2.5 pt-2 max-h-64 overflow-y-auto no-scrollbar border-t border-purple-500/20">
                                    {questionDoubts[currentQ.id].map((d, dIdx) => (
                                      <div key={dIdx} className="bg-[#120e1e] rounded-lg p-3 text-xs border border-purple-500/20 space-y-1.5">
                                        <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                                          <span>👤</span> <span>{d.query}</span>
                                        </div>
                                        <div className="text-gray-200 leading-relaxed pl-2 border-l-2 border-purple-500/50">
                                          {d.answer}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------------------
              VISTA 3: TARJETAS 3D CON INTERVALOS ANKI
             ------------------------------------------------------------------- */}
          {currentView === 'flashcards' && (
            <div>
              {flashcards.length === 0 ? (
                <div className="max-w-xl mx-auto bg-[#171724] border border-[#272739] rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-lg">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Tarjetas Nemotécnicas Anki (3D)
                    </h3>
                    <p className="text-gray-400 text-xs max-w-sm mx-auto mt-1 leading-relaxed">
                      Repetición espaciada con conceptos clave y reglas mnemotécnicas generadas a partir del material de esta carpeta.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] text-gray-400">
                    <span className="px-2.5 py-1 rounded-lg bg-[#20202e] border border-[#2d2d3e]">🧠 Mnemotecnias</span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#20202e] border border-[#2d2d3e]">🔄 Rotación 3D</span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#20202e] border border-[#2d2d3e]">⏱️ Algoritmo SM-2</span>
                  </div>

                  <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleGenerateFlashcards}
                      disabled={loadingAction !== null}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{loadingAction === 'flashcards' ? 'Generando baraja...' : 'Generar Tarjetas Anki'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentView('materiales')}
                      className="bg-[#20202e] hover:bg-[#28283a] border border-[#333348] text-gray-300 font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
                    >
                      Ver Materiales
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Top Bar with export and shuffle */}
                  <div className="bg-[#181822] border border-[#2a2a3b] rounded-3xl p-4 sm:p-5 flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-white">
                        Tarjeta {cardIndex + 1} de {flashcards.length}
                      </span>
                      {flashcards[cardIndex]?.categoria && (
                        <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-0.5 rounded-full border border-blue-500/20">
                          {flashcards[cardIndex].categoria}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleShuffleDeck}
                        title="Barajar tarjetas"
                        className="p-2 rounded-xl bg-[#222230] hover:bg-[#2c2c3d] text-gray-300 hover:text-white border border-[#34344a] text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <Shuffle className="w-3.5 h-3.5 text-purple-400" />
                        <span className="hidden sm:inline">Barajar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportAnki}
                        title="Exportar archivo CSV para Anki o Quizlet"
                        className="p-2 rounded-xl bg-[#222230] hover:bg-[#2c2c3d] text-gray-300 hover:text-white border border-[#34344a] text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden sm:inline">Exportar Anki (.csv)</span>
                      </button>
                    </div>
                  </div>

                  {/* 3D Flip Card */}
                  <div
                    onClick={handleFlipCard}
                    className="perspective-1000 w-full h-84 sm:h-96 cursor-pointer select-none"
                  >
                    <div
                      className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${
                        isFlipped ? 'rotate-y-180' : ''
                      }`}
                    >
                      {/* FRONT */}
                      <div className="absolute inset-0 w-full h-full backface-hidden bg-gradient-to-b from-[#1c1c28] to-[#151520] border-2 border-[#333348] hover:border-blue-500/60 rounded-3xl p-8 flex flex-col items-center justify-between text-center shadow-2xl transition-colors">
                        <span className="text-xs font-extrabold uppercase tracking-widest text-blue-400 bg-blue-500/10 px-3.5 py-1 rounded-full border border-blue-500/20">
                          Concepto Clave
                        </span>

                        <div className="my-auto space-y-3">
                          <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-white max-w-xl leading-snug">
                            {flashcards[cardIndex]?.concepto}
                          </h3>
                        </div>

                        <div className="text-xs text-gray-400 bg-[#121217] px-4 py-2 rounded-full border border-[#2b2b3b] flex items-center gap-2">
                          <RotateCw className="w-3.5 h-3.5 text-blue-400" />
                          <span>Clic o Barra Espaciadora para voltear</span>
                        </div>
                      </div>

                      {/* BACK */}
                      <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-gradient-to-b from-[#1b2230] to-[#131924] border-2 border-sky-500/60 rounded-3xl p-8 flex flex-col items-center justify-between text-center shadow-2xl">
                        <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3.5 py-1 rounded-full border border-emerald-500/20">
                          Definición y Regla Nemotécnica
                        </span>

                        <div className="my-auto max-w-2xl px-2 space-y-3">
                          <p className="text-base sm:text-lg md:text-xl text-gray-100 font-semibold leading-relaxed">
                            {flashcards[cardIndex]?.definicion}
                          </p>
                          {flashcards[cardIndex]?.nemotecnia && (
                            <div className="bg-[#121824] border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 font-medium max-w-lg mx-auto">
                              💡 <strong>Nemotecnia:</strong> {flashcards[cardIndex].nemotecnia}
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-gray-400 bg-[#121217] px-4 py-2 rounded-full border border-[#2b2b3b] flex items-center gap-2">
                          <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                          <span>Clic para volver al concepto frontal</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Anki 4-Interval Rating Bar:
                      🔴 Otra vez (<1m) | 🟠 Difícil (6m) | 🟢 Bien (1d) | 🔵 Fácil (4d) */}
                  <div className="bg-[#181822] border border-[#2a2a3b] rounded-3xl p-4 shadow-xl">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block text-center mb-3">
                      ¿Cómo sentiste la retención de esta tarjeta? (Algoritmo Anki)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleSetInterval('again')}
                        className="py-3 px-3 rounded-2xl bg-red-950/30 hover:bg-red-900/40 border border-red-500/40 text-red-300 font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition"
                      >
                        <span>🔴 Otra vez</span>
                        <span className="text-[10px] opacity-75 font-normal">&lt; 1 min</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetInterval('hard')}
                        className="py-3 px-3 rounded-2xl bg-amber-950/30 hover:bg-amber-900/40 border border-amber-500/40 text-amber-300 font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition"
                      >
                        <span>🟠 Difícil</span>
                        <span className="text-[10px] opacity-75 font-normal">6 min</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetInterval('good')}
                        className="py-3 px-3 rounded-2xl bg-emerald-950/30 hover:bg-emerald-900/40 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition"
                      >
                        <span>🟢 Bien</span>
                        <span className="text-[10px] opacity-75 font-normal">1 día</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetInterval('easy')}
                        className="py-3 px-3 rounded-2xl bg-sky-950/30 hover:bg-sky-900/40 border border-sky-500/40 text-sky-300 font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition"
                      >
                        <span>🔵 Fácil</span>
                        <span className="text-[10px] opacity-75 font-normal">4 días</span>
                      </button>
                    </div>
                  </div>

                  {/* Previous / Next Card Controls */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={handlePrevCard}
                      className="bg-[#20202d] hover:bg-[#29293a] border border-[#34344a] text-white font-bold py-3 px-5 rounded-2xl transition flex items-center gap-2 text-xs"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Anterior</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleFlipCard}
                      className="bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#082f49] font-black py-3 px-7 rounded-2xl transition shadow-lg text-xs flex items-center gap-2"
                    >
                      <RotateCw className="w-4 h-4" />
                      <span>{isFlipped ? 'Ver Concepto' : 'Girar Tarjeta'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNextCard}
                      className="bg-[#20202d] hover:bg-[#29293a] border border-[#34344a] text-white font-bold py-3 px-5 rounded-2xl transition flex items-center gap-2 text-xs"
                    >
                      <span>Siguiente</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------------------
              VISTA 4: DOSSIER MAGISTRAL DE ESTUDIO
             ------------------------------------------------------------------- */}
          {currentView === 'guia' && (
            <div>
              {!guideContent ? (
                <div className="max-w-xl mx-auto bg-[#171724] border border-[#272739] rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-lg">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Dossier Magistral de Estudio
                    </h3>
                    <p className="text-gray-400 text-xs max-w-sm mx-auto mt-1 leading-relaxed">
                      Sintetiza tus apuntes en una guía integral estructurada con resumen ejecutivo, conceptos medulares, trampas de examen y glosario.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] text-gray-400">
                    <span className="px-2.5 py-1 rounded-lg bg-[#20202e] border border-[#2d2d3e]">📄 Resumen Ejecutivo</span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#20202e] border border-[#2d2d3e]">🏛️ Pilares Clave</span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#20202e] border border-[#2d2d3e]">⚠️ Trampas de Examen</span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#20202e] border border-[#2d2d3e]">📖 Glosario</span>
                  </div>

                  <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleGenerateGuide}
                      disabled={loadingAction !== null}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{loadingAction === 'guide' ? 'Redactando dossier...' : 'Generar Dossier Magistral'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentView('materiales')}
                      className="bg-[#20202e] hover:bg-[#28283a] border border-[#333348] text-gray-300 font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
                    >
                      Ver Materiales
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[#181822] border border-[#2a2a3b] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                  {/* Top Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#2a2a3b]">
                    <div>
                      <h2 className="text-2xl font-black text-white flex items-center gap-2.5">
                        <BookOpen className="w-6 h-6 text-emerald-400" />
                        Dossier Magistral de Estudio
                      </h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Estructurado según la metodología de síntesis activa de Thea Pro
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSpeakText(guideContent)}
                        className="bg-[#242433] hover:bg-[#2e2e40] border border-[#37374e] text-gray-200 text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5"
                      >
                        <Volume2 className={`w-4 h-4 ${speaking ? 'text-blue-400' : ''}`} />
                        <span>{speaking ? 'Detener' : 'Audio'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(guideContent);
                          setCopiedGuide(true);
                          sfx.playClick();
                          setTimeout(() => setCopiedGuide(false), 2000);
                        }}
                        className="bg-[#242433] hover:bg-[#2e2e40] border border-[#37374e] text-gray-200 text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5"
                      >
                        {copiedGuide ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedGuide ? 'Copiado' : 'Copiar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadGuide}
                        className="bg-[#242433] hover:bg-[#2e2e40] border border-[#37374e] text-gray-200 text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4 text-sky-400" />
                        <span>Descargar (.md)</span>
                      </button>
                    </div>
                  </div>

                  {/* Dossier Document Content */}
                  <div className="bg-[#121217] border border-[#262638] rounded-2xl p-6 sm:p-8 text-gray-100 text-sm sm:text-base leading-relaxed space-y-4 whitespace-pre-wrap font-sans">
                    {guideContent}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------------------
              VISTA 5: TUTOR SOCRÁTICO THEA
             ------------------------------------------------------------------- */}
          {currentView === 'consulta' && (
            <div className="bg-[#181822] border border-[#2a2a3b] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
              <div className="pb-5 border-b border-[#2a2a3b]">
                <h2 className="text-2xl font-black text-white flex items-center gap-2.5">
                  <HelpCircle className="w-6 h-6 text-amber-400" />
                  Tutor Académico Socrático
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Pregunta cualquier duda sobre tus apuntes. Thea te explicará con analogías didácticas, ejemplos clínicos/jurídicos y resolución paso a paso.
                </p>
              </div>

              <form onSubmit={handleAskTutor} className="space-y-4">
                <div>
                  <label htmlFor="tutor-box" className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                    Tu duda o consulta sobre el material:
                  </label>
                  <div className="relative">
                    <input
                      id="tutor-box"
                      type="text"
                      value={tutorQuery}
                      onChange={(e) => setTutorQuery(e.target.value)}
                      placeholder="Ej: ¿Por qué la hipótesis de Mitchell fue tan revolucionaria y qué papel juega el gradiente?"
                      className="w-full bg-[#121217] text-white placeholder-gray-500 border border-[#303044] rounded-2xl px-5 py-4 pr-32 text-sm focus:outline-none focus:border-amber-500 transition"
                    />
                    <button
                      type="submit"
                      disabled={tutorLoading || !tutorQuery.trim()}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#1a0f00] font-black px-5 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-md"
                    >
                      {tutorLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                      <span>Consultar</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Quick Prompt Starters */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-gray-400">Preguntas sugeridas:</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    '¿Cuáles son las 3 preguntas trampa típicas en un examen sobre esto?',
                    'Explícamelo con una analogía visual de la vida cotidiana',
                    '¿Cómo se conecta este tema con problemas del mundo real?',
                    'Dame una regla nemotécnica para recordar la secuencia clave',
                  ].map((sug, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => {
                        setTutorQuery(sug);
                        sfx.playClick();
                      }}
                      className="text-xs bg-[#222230] hover:bg-[#2b2b3d] text-gray-300 border border-[#333348] px-3.5 py-2 rounded-xl transition"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tutor Response Box */}
              {tutorResponse && (
                <div className="bg-[#121217] border border-amber-500/30 rounded-3xl p-6 sm:p-7 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between text-amber-400 text-xs font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span>Explicación de Thea</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSpeakText(tutorResponse)}
                      className="text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      <Volume2 className={`w-3.5 h-3.5 ${speaking ? 'text-amber-400' : ''}`} />
                      <span>{speaking ? 'Detener voz' : 'Escuchar'}</span>
                    </button>
                  </div>
                  <div className="text-gray-100 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                    {tutorResponse}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>

      {/* =======================================================================
          MODAL: CREAR NUEVA CARPETA DE ESTUDIO
         ======================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#181824] border border-[#313146] rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl space-y-5 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#29293a]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-lg">
                  {newFolderIcon}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Nueva Carpeta de Estudio</h3>
                  <p className="text-xs text-gray-400">Cada carpeta almacena sus propios apuntes, preguntas y tarjetas.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
                  Nombre del Tema o Asignatura
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ej. Fisiopatología Renal, Derecho Penal, Historia Romana..."
                  className="w-full bg-[#121218] border border-[#343448] focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
                  Ícono Identificador
                </label>
                <div className="flex flex-wrap gap-2 p-2 bg-[#121218] border border-[#2d2d3e] rounded-xl max-h-24 overflow-y-auto">
                  {['📚', '🧬', '⚖️', '🪐', '💻', '🔬', '📜', '🧠', '🎯', '🏥', '🧪', '🎨', '🏛️', '⚙️', '🌍', '📐', '🩺', '💡', '📊', '⚡'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewFolderIcon(emoji)}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition cursor-pointer ${
                        newFolderIcon === emoji
                          ? 'bg-blue-600 scale-110 shadow-md shadow-blue-900/50'
                          : 'hover:bg-[#20202d]'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
                  Material de Estudio Inicial (Opcional)
                </label>
                <textarea
                  rows={4}
                  value={newFolderStarterNotes}
                  onChange={(e) => setNewFolderStarterNotes(e.target.value)}
                  placeholder="Pega aquí el contenido inicial o déjalo en blanco para pegarlo después..."
                  className="w-full bg-[#121218] border border-[#343448] focus:border-blue-500 rounded-xl p-3 text-xs text-white placeholder-gray-500 focus:outline-none font-mono resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#29293a]">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCreateFolder(newFolderName, newFolderIcon, newFolderStarterNotes)}
                disabled={!newFolderName.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-lg shadow-blue-900/40 flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Carpeta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: RENOMBRAR CARPETA
         ======================================================================= */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#181824] border border-[#313146] rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl space-y-5 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#29293a]">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                Renombrar Carpeta
              </h3>
              <button
                type="button"
                onClick={() => setEditingFolder(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
                  Nombre de la Carpeta
                </label>
                <input
                  type="text"
                  value={editingFolder.name}
                  onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                  className="w-full bg-[#121218] border border-[#343448] focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
                  Cambiar Ícono
                </label>
                <div className="flex flex-wrap gap-2 p-2 bg-[#121218] border border-[#2d2d3e] rounded-xl max-h-24 overflow-y-auto">
                  {['📚', '🧬', '⚖️', '🪐', '💻', '🔬', '📜', '🧠', '🎯', '🏥', '🧪', '🎨', '🏛️', '⚙️', '🌍', '📐', '🩺', '💡', '📊', '⚡'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setEditingFolder({ ...editingFolder, icon: emoji })}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition cursor-pointer ${
                        editingFolder.icon === emoji
                          ? 'bg-blue-600 scale-110 shadow-md shadow-blue-900/50'
                          : 'hover:bg-[#20202d]'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#29293a]">
              <button
                type="button"
                onClick={() => setEditingFolder(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleRenameFolder(editingFolder.id, editingFolder.name, editingFolder.icon)}
                disabled={!editingFolder.name.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-lg shadow-blue-900/40 flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL: GOOGLE DRIVE & LECTOR OCR DE DOCUMENTOS PESADOS
         ======================================================================= */}
      <DriveAndOcrModal
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        onDocumentImported={handleDocumentImported}
        onDocumentsImported={handleDocumentsImported}
        currentFolderName={activeFolder.name}
      />

      {/* =======================================================================
          MODAL: INSTRUCCIONES & DIRECTIVAS PARA LA IA (ENFOQUE & APRENDIZAJE ACELERADO)
         ======================================================================= */}
      <AIDirectivesModal
        isOpen={showDirectivesModal}
        onClose={() => setShowDirectivesModal(false)}
        folderName={activeFolder.name}
        availableTopics={availableTopics}
        currentDirectives={aiDirectives}
        onSaveDirectives={(newDirectives) => {
          setAiDirectives(newDirectives);
          sfx.playLevelUp();
        }}
      />

      {/* =======================================================================
          MODAL: RADIOGRAFÍA DE ADMISIÓN & ANÁLISIS ADAPTATIVO DE EXÁMENES
         ======================================================================= */}
      {showPatternsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0c1017] border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl space-y-5 text-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                  🎯
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Radiografía de Exámenes de Admisión</h3>
                  <span className="text-xs text-slate-400">Algoritmo de análisis de recurrencia, materias y formulación</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPatternsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-slate-700/60 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingPatterns ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                <p className="text-sm font-semibold text-slate-200">
                  Analizando el banco de exámenes y detectando preguntas frecuentes...
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Extrayendo recurrencia por temas, estilos de formulación y trampas habituales de los evaluadores.
                </p>
              </div>
            ) : examPatterns ? (
              <div className="space-y-4">
                {/* Benchmark Detected */}
                <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Tipo de Examen Detectado</span>
                    <strong className="text-sm text-indigo-300 font-semibold">{examPatterns.tipoDocumentoDetectado}</strong>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    {examPatterns.institucionSugerida}
                  </span>
                </div>

                {/* Most Repeated Topics by Year / Frequency */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <span>📊 Temas Más Preguntados & Peso Estimado</span>
                  </span>
                  <div className="space-y-2">
                    {examPatterns.temasMasRecurrentes?.map((t: any, idx: number) => (
                      <div key={idx} className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-semibold text-slate-200">{t.tema}</strong>
                          <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                            Recurrencia: {t.recurrencia} ({t.porcentajeEstimado}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(Math.max(t.porcentajeEstimado || 20, 10), 100)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-400">{t.motivo}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pattern Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Estilo Predominante</span>
                    <p className="text-xs text-slate-300 leading-relaxed">{examPatterns.patronesDePregunta?.estiloPredominante}</p>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-rose-300/80 block">Trampa Más Común</span>
                    <p className="text-xs text-slate-300 leading-relaxed">{examPatterns.patronesDePregunta?.trampaMasComun}</p>
                  </div>
                </div>

                {/* Strategic Advice */}
                <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-300 text-[11px] uppercase tracking-wider mb-0.5">
                      Consejo Estratégico de Admisión:
                    </strong>
                    <span>{examPatterns.patronesDePregunta?.recomendacionEstrategica}</span>
                  </div>
                </div>

                {/* Action CTA: Apply Clone Mode */}
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowPatternsModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyExamCloneMode}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-900/40 transition cursor-pointer"
                  >
                    <span>🎯 Mimetizar y Generar Simulacro Adaptativo</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

    </div>
  );
}
