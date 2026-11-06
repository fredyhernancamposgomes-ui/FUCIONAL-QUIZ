import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { PDFParse } from 'pdf-parse';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// High body limit to support massive PDF textbooks, documents and exams up to 100 MB (~135 MB base64)
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Custom middleware to catch body parser errors (e.g. entity too large) and always return JSON
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      error: 'El archivo excede el tamaño máximo permitido en el servidor (máximo 100 MB).',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Formato de solicitud inválido.',
    });
  }
  next(err);
});

// Helper to get GoogleGenAI instance
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno. Puedes verificarla en el panel Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Resilient generation with retry across Gemini models
async function callGeminiWithRetry(params: {
  contents: any;
  config?: any;
}) {
  const ai = getGeminiClient();
  // Try 3.8-flash first (primary model), then 3.1-flash-lite, then flash-latest
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        const isTemporary =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isTemporary && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }
  }

  // Parse error into friendly Spanish
  let friendlyMsg = 'Error al comunicarse con Gemini API.';
  try {
    const rawMsg = lastError?.message || '';
    if (rawMsg.includes('{') && rawMsg.includes('}')) {
      const parsed = JSON.parse(rawMsg.slice(rawMsg.indexOf('{'), rawMsg.lastIndexOf('}') + 1));
      if (parsed?.error?.code === 503 || parsed?.error?.status === 'UNAVAILABLE') {
        friendlyMsg = 'Los servidores de Gemini están experimentando alta demanda momentánea. Por favor, reintenta en unos instantes.';
      } else if (parsed?.error?.code === 403 || parsed?.error?.status === 'PERMISSION_DENIED') {
        friendlyMsg = 'Permiso denegado al invocar la API de Gemini. Revisa la clave en Settings > Secrets.';
      } else if (parsed?.error?.message) {
        friendlyMsg = parsed.error.message;
      }
    } else if (lastError?.message) {
      friendlyMsg = lastError.message;
    }
  } catch (_) {
    friendlyMsg = lastError?.message || friendlyMsg;
  }

  throw new Error(friendlyMsg);
}

// 1. Health & status check
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: 'gemini-3.8-flash',
    features: ['levels_1_to_4', 'large_context_ready', 'multilevel_quiz', 'audio_tts_ready'],
  });
});

// 2. Document Analysis (for massive contexts)
app.post('/api/analyze-material', async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    if (!notes || typeof notes !== 'string' || notes.trim().length < 20) {
      return res.status(400).json({ error: 'Material de estudio demasiado corto.' });
    }

    const words = notes.trim().split(/\s+/).length;
    const readingTimeMin = Math.ceil(words / 200);

    const prompt = `Analiza este material de estudio (que puede ser muy extenso) y resume su estructura temática.
Identifica:
1. "titulo": Título conceptual conciso y formal.
2. "temasClave": Lista de 3 a 6 subtemas o unidades que abarca.
3. "densidad": "Baja", "Media" o "Alta".
4. "resumenBreve": Resumen de 2 oraciones del alcance del documento.

Material:
"""
${notes.slice(0, 30000)}
"""`;

    const response = await callGeminiWithRetry({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            titulo: { type: Type.STRING },
            temasClave: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            densidad: { type: Type.STRING },
            resumenBreve: { type: Type.STRING },
          },
          required: ['titulo', 'temasClave', 'resumenBreve'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      success: true,
      stats: {
        words,
        chars: notes.length,
        readingTimeMin,
      },
      analysis: parsed,
    });
  } catch (err: any) {
    console.error('Error in analyze-material:', err);
    res.status(500).json({ error: err.message || 'Error analizando material.' });
  }
});

// Helper: Build specialized AI directives for study focus and accelerated learning
function buildAIDirectivesPrompt(aiDirectives: any): string {
  if (!aiDirectives || typeof aiDirectives !== 'object') return '';
  const directives: string[] = [];

  // 1. Enfoque Temático Específico (Capítulos / Temas seleccionados)
  if (Array.isArray(aiDirectives.selectedTopics) && aiDirectives.selectedTopics.length > 0) {
    directives.push(
      `🎯 TEMAS/CAPÍTULOS SELECCIONADOS POR EL ESTUDIANTE (PRIORIDAD OBLIGATORIA):\n` +
      `Genera las preguntas ÚNICAMENTE sobre estos temas o capítulos específicos:\n` +
      aiDirectives.selectedTopics.map((t: string) => `• ${t}`).join('\n') +
      `\nNo formules preguntas sobre otros capítulos no seleccionados.`
    );
  }

  if (aiDirectives.customTopicFocus && typeof aiDirectives.customTopicFocus === 'string' && aiDirectives.customTopicFocus.trim().length > 0) {
    directives.push(
      `🎯 ENFOQUE TEMÁTICO ADICIONAL INDICADO POR EL USUARIO:\n"${aiDirectives.customTopicFocus.trim()}"`
    );
  }

  // 2. Filtro de Exclusión
  if (aiDirectives.excludedTopics && typeof aiDirectives.excludedTopics === 'string' && aiDirectives.excludedTopics.trim().length > 0) {
    directives.push(
      `🚫 TEMAS Y ELEMENTOS EXCLUIDOS (PROHIBIDO EVALUAR O PREGUNTAR SOBRE ESTO):\n"${aiDirectives.excludedTopics.trim()}"`
    );
  }

  // 3. Metodología de Aprendizaje Acelerado & Avanzado
  switch (aiDirectives.learningMethod) {
    case 'feynman':
      directives.push(
        `🧠 METODOLOGÍA ACTIVA: MÉTODO FEYNMAN (COMPRENSIÓN PROFUNDA Y SÍNTESIS):\n` +
        `Formula preguntas que evalúen la comprensión de los principios fundamentales sin jerga vacía. En las explicaciones, incluye una analogía concisa y memorable del mundo real que fije el concepto permanentemente.`
      );
      break;
    case 'active_recall':
      directives.push(
        `⚡ METODOLOGÍA ACTIVA: ACTIVE RECALL DE ALTA DIFICULTAD Y FRICCIÓN COGNITIVA:\n` +
        `Diseña preguntas altamente desafiantes con distractores hiper-verosímiles. El objetivo es activar la memoria a largo plazo enfrentando al alumno a errores conceptuales sutiles y detalles críticos del texto.`
      );
      break;
    case 'exam_sim':
      directives.push(
        `🏛️ METODOLOGÍA ACTIVA: SIMULADOR DE EXAMEN OFICIAL / CASOS PRÁCTICOS:\n` +
        `Formula enunciados con formato de caso práctico, escenario profesional o situación problema real donde el alumno deba tomar una decisión o diagnosticar un error aplicando los conceptos aprendidos.`
      );
      break;
    case 'spaced_reinforcement':
      directives.push(
        `🔄 METODOLOGÍA ACTIVA: REFUERZO DE PUNTOS CIEGOS Y EXCEPCIONES:\n` +
        `Concéntrate en las excepciones a la norma general, contra-ejemplos y en las diferencias sutiles entre conceptos que los estudiantes suelen confundir en los exámenes.`
      );
      break;
    case 'socratic':
      directives.push(
        `💡 METODOLOGÍA ACTIVA: RAZONAMIENTO SOCRÁTICO Y DEDUCCIÓN CAUSAL:\n` +
        `Plantea preguntas que obliguen al estudiante a deducir el resultado conectando la causa inicial, el mecanismo intermedio y la consecuencia final.`
      );
      break;
    case 'cause_consequence':
      directives.push(
        `🗺️ METODOLOGÍA ACTIVA: MAPA DE CAUSA-EFECTO Y EVENTOS INTERCONECTADOS:\n` +
        `Formula preguntas centradas en las relaciones causales, los detonantes y las consecuencias directas de cada fenómeno o proceso. En las explicaciones, estructura la solución en 3 pilares: Causa, Hecho Central y Consecuencia.`
      );
      break;
    case 'youtube_speed':
      directives.push(
        `⚡ METODOLOGÍA ACTIVA: NARRACIÓN DINÁMICA "A TODA LECHE" (DIVULGACIÓN TOP YOUTUBE):\n` +
        `En las explicaciones, evita el tono de libro de texto plano. Usa un estilo ágil, directo, con gancho inicial, explicando cómo ocurrió todo con ritmo y energía pedagógica sin perder rigor.`
      );
      break;
    case 'exam_patterns_clone':
      directives.push(
        `🎯 METODOLOGÍA ACTIVA: ADAPTACIÓN Y MIMETIZACIÓN DE EXÁMENES DE ADMISIÓN:\n` +
        `Mimetiza estrictamente el estilo de formulación, los distractores típicos y los temas de alta recurrencia de los exámenes de admisión subidos en este material.`
      );
      break;
    default:
      break;
  }

  // 4. Estilo de Pregunta
  if (aiDirectives.questionStyle === 'case_study') {
    directives.push(`📋 ESTILO: Enunciados contextualizados en Casos Prácticos y Situaciones Escenario.`);
  } else if (aiDirectives.questionStyle === 'trap_detector') {
    directives.push(`⚠️ ESTILO: Detector de Trampas y Errores Habituales de Examen.`);
  } else if (aiDirectives.questionStyle === 'conceptual_contrast') {
    directives.push(`⚖️ ESTILO: Comparación y contraste directo entre dos o más conceptos.`);
  }

  // 5. Instrucciones Libres de Usuario
  if (aiDirectives.customPrompt && typeof aiDirectives.customPrompt === 'string' && aiDirectives.customPrompt.trim().length > 0) {
    directives.push(
      `📝 INSTRUCCIÓN PERSONALIZADA DEL ESTUDIANTE PARA LA IA:\n"${aiDirectives.customPrompt.trim()}"\nSigue rigurosamente esta indicación en cada elemento generado.`
    );
  }

  if (directives.length === 0) return '';
  return `\n=======================================================\nDIRECTIVAS DE ESTUDIO CONFIGURADAS POR EL ESTUDIANTE:\n${directives.join('\n\n')}\n=======================================================\n`;
}

// 3. Generate Progressive 4-Level Quiz (supports infinite stream & batch prefetching)
app.post('/api/generate/quiz', async (req: Request, res: Response) => {
  try {
    const { notes, targetLevel, countPerLevel, previousQuestions = [], batchSize, aiDirectives } = req.body;
    if (!notes || typeof notes !== 'string' || notes.trim().length < 15) {
      return res.status(400).json({
        error: 'Por favor proporciona notas o material de estudio con suficiente detalle (mínimo 15 caracteres).',
      });
    }

    const isMultiLevel = !targetLevel || targetLevel === 'all';
    const totalQuestions = batchSize || (isMultiLevel ? 8 : (typeof countPerLevel === 'number' ? countPerLevel : 6));

    const previousContext = Array.isArray(previousQuestions) && previousQuestions.length > 0
      ? `\nPREGUNTAS YA FORMULADAS EN TANDAS ANTERIORES (ESTÁ ESTRICTAMENTE PROHIBIDO REPETIR ESTOS CONCEPTOS O ENUNCIADOS):\n${previousQuestions.slice(-25).map((q: string) => `- "${q}"`).join('\n')}\nGenera preguntas 100% INÉDITAS, explorando otros problemas concretos, cálculos, materias y ejercicios específicos del material.`
      : '';

    const directivesPrompt = buildAIDirectivesPrompt(aiDirectives);

    const prompt = `Eres el generador de exámenes de admisión y simulacros de élite de Thea Pro.
Tu misión es formular exactamente ${totalQuestions} preguntas de opción múltiple de MÁXIMO RIGOR ACADÉMICO basadas en el siguiente material de estudio.

========================================================================
🚨 PROHIBICIÓN ABSOLUTA DE PREGUNTAS META-CONCEPTUALES ("ANTI-AI SLOP"):
Queda TERMINANTEMENTE PROHIBIDO formular preguntas abstractas, genéricas o reflexivas como:
❌ "¿Cuál es el propósito del método de 'análisis de flujo' sugerido en el documento?"
❌ "¿Qué relación jerárquica existe entre las variables según el documento?"
❌ "¿Qué trampa de examen debe evitar el alumno ante una excepción explícita?"
❌ "Si un proceso está diseñado para ser realizado en un sistema isobárico, ¿por qué es una trampa de examen ignorar esta restricción?"
❌ Cualquier pregunta que pregunte sobre "el documento", "el texto", "el autor sugiere", "la técnica mencionada" o métodos de memorización/estudio.

CADA PREGUNTA DEBE SER 100% DIRECTA, TÉCNICA Y ACADÉMICA:
✅ Debe evaluar DIRECTAMENTE la materia científica o humanística del material:
   - MATEMÁTICAS (Álgebra, Aritmética, Geometría, Trigonometría): Plantea problemas con datos numéricos concretos, ecuaciones, despejes algebraicos o teoremas geométricos.
   - CIENCIAS NATURALES (Física, Química, Biología): Plantea problemas de cinemática/dinámica/termodinámica con valores a calcular, reacciones químicas, estequiometría, o estructuras celulares/genéticas exactas.
   - HUMANIDADES Y LENGUAJE (Razonamiento Verbal, Lenguaje, Historia, Geografía): Plantea analogías verbales, precisión léxica, sintaxis gramatical, o acontecimientos históricos con fechas, causas y protagonistas reales.
✅ Si el material proviene de un examen de admisión o banco de preguntas: ADAPTA O UTILIZA DIRECTAMENTE LOS EJERCICIOS Y PROBLEMAS REALES CONTEXTUALIZADOS.
========================================================================

TAXONOMÍA DE 4 NIVELES DE DOMINIO ACADÉMICO REAL:
- Nivel 1: FUNDAMENTOS Y CONCEPTOS DIRECTOS (Definiciones formales, fórmulas canónicas, enunciados de leyes físicas o químicas, propiedades matemáticas elementales).
- Nivel 2: COMPRENSIÓN Y CÁLCULO DE 1 PASO (Ejercicios de aplicación directa de fórmulas, cálculo numérico inmediato, relaciones de proporcionalidad, balance de reacciones, analogías verbales).
- Nivel 3: PROBLEMAS TIPO EXAMEN DE ADMISIÓN (Problemas con enunciado de examen de admisión, problemas matemáticos o físicos con varios datos a relacionar, comprensión e inferencia lectora).
- Nivel 4: ALTA DIFICULTAD Y DESTREZA AVANZADA (Problemas combinados de alta exigencia tipo UNI / San Marcos / Politécnico / CENEVAL, que integran múltiples variables, trampas de signos o unidades reales, o deducción matemática rigurosa).

${
  isMultiLevel
    ? `Distribuye las ${totalQuestions} preguntas de forma equilibrada entre los Niveles 1, 2, 3 y 4.`
    : `Enfoca todas las ${totalQuestions} preguntas estrictamente en el NIVEL ${targetLevel}.`
}
${previousContext}
${directivesPrompt}

REQUISITOS ESTRICTOS:
1. Cada pregunta tiene exactamente 4 opciones de respuesta de alta calidad, solo una correcta ("correcta" es un número del 0 al 3).
2. "explicacion": Demostración matemática paso a paso o justificación teórica rigurosa.
3. "analisisDistractores": Explica por qué cada una de las otras opciones es errónea (cálculo incorrecto típico, confusión de signo o concepto).
4. "evidenciaApuntes": Cita la fórmula, principio o ley concreta del material.
5. "tipExamen": Regla nemotécnica o atajo de resolución para examen de admisión.
6. Distribuye las preguntas a lo largo de las distintas materias y secciones del documento.

Material de estudio / examen:
"""
${notes.trim()}
"""`;

    const response = await callGeminiWithRetry({
      contents: prompt,
      config: {
        systemInstruction: 'Eres Thea Pro, evaluadora académica y tutora de élite para exámenes de admisión preuniversitarios y universitarios. Formulas preguntas rigurosas, con problemas reales, cálculos numéricos y cero preguntas meta-conceptuales vacías.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            preguntas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pregunta: { type: Type.STRING },
                  opciones: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correcta: { type: Type.INTEGER, description: 'Índice de 0 a 3' },
                  nivel: { type: Type.INTEGER, description: '1, 2, 3 o 4' },
                  explicacion: { type: Type.STRING },
                  analisisDistractores: { type: Type.STRING },
                  evidenciaApuntes: { type: Type.STRING },
                  tipExamen: { type: Type.STRING },
                },
                required: ['pregunta', 'opciones', 'correcta', 'nivel', 'explicacion'],
              },
            },
          },
          required: ['preguntas'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (!Array.isArray(parsed.preguntas) || parsed.preguntas.length === 0) {
      throw new Error('No se generaron preguntas válidas.');
    }

    const sanitized = parsed.preguntas.map((p: any, idx: number) => {
      let c = typeof p.correcta === 'number' ? p.correcta : 0;
      if (c < 0 || c > 3) c = 0;
      let lvl = typeof p.nivel === 'number' ? p.nivel : 1;
      if (lvl < 1 || lvl > 4) lvl = 1;

      const opts = Array.isArray(p.opciones) ? p.opciones.slice(0, 4) : [];
      while (opts.length < 4) {
        opts.push(`Opción adicional ${opts.length + 1}`);
      }

      return {
        id: `q-${idx + 1}-${Date.now()}`,
        pregunta: p.pregunta || `Pregunta ${idx + 1}`,
        opciones: opts,
        correcta: c,
        nivel: lvl,
        explicacion: p.explicacion || 'Demostración y resolución verificada.',
        analisisDistractores: p.analisisDistractores || 'Las demás opciones contienen errores de cálculo o premisas incorrectas.',
        evidenciaApuntes: p.evidenciaApuntes || 'Fundamentado en los principios y datos de tu material.',
        tipExamen: p.tipExamen || 'Verifica siempre las unidades y condiciones iniciales.',
      };
    });

    res.json({ success: true, preguntas: sanitized });
  } catch (error: any) {
    const rawMsg = String(error?.message || '');
    const isQuotaExceeded =
      rawMsg.includes('quota') ||
      rawMsg.includes('Quota exceeded') ||
      rawMsg.includes('RESOURCE_EXHAUSTED') ||
      rawMsg.includes('429');

    console.warn('Gemini API call returned:', rawMsg, 'Activating fallback generator.');

    // Intelligent local fallback so the user's infinite study is never interrupted
    const fallbackQuestions = generateFallbackQuiz(
      req.body.notes,
      req.body.targetLevel,
      req.body.batchSize || 6,
      req.body.previousQuestions || []
    );

    res.json({
      success: true,
      preguntas: fallbackQuestions,
      quotaExceeded: isQuotaExceeded,
      notice: isQuotaExceeded
        ? 'Límite diario de Gemini alcanzado. Thea Pro ha activado el motor académico de respaldo.'
        : 'Preguntas sintetizadas mediante el motor de respaldo de Thea Pro.',
    });
  }
});

// Fallback question synthesizer directly grounded on text concepts (NEVER meta-questions)
function generateFallbackQuiz(
  notes: string,
  targetLevel: any,
  batchSize = 6,
  previousQuestions: string[] = []
) {
  const lines = notes.split('\n').map((l) => l.trim()).filter((l) => l.length > 20);
  const pool: { term: string; definition: string; isExercise?: boolean }[] = [];

  for (const line of lines) {
    // Check if line looks like an exercise or question from an exam
    const isExamQuestion = /^(pregunta|ejercicio|problema|\d+[\.\-\)])/i.test(line);
    if (isExamQuestion && line.length > 30) {
      pool.push({
        term: line.slice(0, 40).replace(/^[#*•\d\.\-\s]+/, '').trim(),
        definition: line,
        isExercise: true,
      });
      continue;
    }

    if (line.includes(':')) {
      const parts = line.split(':');
      const term = parts[0].replace(/^[-*•\d\.\s#]+/, '').trim();
      const def = parts.slice(1).join(':').trim();
      if (term.length >= 3 && term.length <= 60 && def.length >= 15) {
        pool.push({ term, definition: def });
      }
    } else if (line.toLowerCase().includes(' es ') || line.toLowerCase().includes(' consiste en ')) {
      const sep = line.toLowerCase().includes(' consiste en ') ? ' consiste en ' : ' es ';
      const parts = line.split(new RegExp(sep, 'i'));
      const term = parts[0].replace(/^[-*•\d\.\s#]+/, '').trim();
      const def = parts.slice(1).join(sep).trim();
      if (term.length >= 3 && term.length <= 60 && def.length >= 15) {
        pool.push({ term, definition: def });
      }
    }
  }

  // Fallback pool from sentences if no definitions found
  if (pool.length < 4) {
    const sentences = notes.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter((s) => s.length > 25) || [];
    sentences.forEach((s) => {
      pool.push({
        term: s.slice(0, 35).trim(),
        definition: s,
      });
    });
  }

  if (pool.length === 0) {
    pool.push({
      term: 'Principio de estudio',
      definition: notes.slice(0, 100),
    });
  }

  const result: any[] = [];

  for (let i = 0; i < batchSize; i++) {
    const itemIndex = (i * 2 + Math.floor(Math.random() * pool.length)) % pool.length;
    const item = pool[itemIndex];
    const lvl = targetLevel === 'all' || !targetLevel ? ((i % 4) + 1) : Number(targetLevel);

    let enunciado = '';
    if (item.isExercise) {
      enunciado = item.definition;
    } else if (lvl === 1) {
      enunciado = `Respecto a "${item.term}", ¿cuál de los siguientes enunciados expresa con exactitud su definición o principio fundamental?`;
    } else if (lvl === 2) {
      enunciado = `Al analizar el mecanismo y dinámica de "${item.term}", ¿cuál de las siguientes afirmaciones describe su comportamiento correcto?`;
    } else if (lvl === 3) {
      enunciado = `En una situación práctica o problema de aplicación relacionado con "${item.term}", ¿cuál es el resultado o procedimiento válido?`;
    } else {
      enunciado = `En un problema de examen de admisión sobre "${item.term}", ¿cuál es la proposición científicamente precisa que resuelve el caso?`;
    }

    // Select distractors from other pool items
    const otherItems = pool.filter((_, idx) => idx !== itemIndex);
    const shuffledOthers = [...otherItems].sort(() => Math.random() - 0.5);
    const distractors = shuffledOthers.slice(0, 3).map((o) => {
      const text = o.definition.length > 110 ? o.definition.slice(0, 110) + '...' : o.definition;
      return text;
    });

    while (distractors.length < 3) {
      distractors.push(`Valor o postulado no correspondiente a las propiedades estudiadas.`);
    }

    const correctText = item.definition.length > 120 ? item.definition.slice(0, 120) + '...' : item.definition;
    const correctPos = Math.floor(Math.random() * 4);
    const opciones: string[] = [];

    let distIdx = 0;
    for (let o = 0; o < 4; o++) {
      if (o === correctPos) {
        opciones.push(correctText);
      } else {
        opciones.push(distractors[distIdx++] || 'Opción no válida para el enunciado.');
      }
    }

    result.push({
      id: `q-inf-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      pregunta: enunciado,
      opciones,
      correcta: correctPos,
      nivel: lvl,
      explicacion: `Fundamento académico: ${item.definition}`,
      analisisDistractores: `Las demás alternativas corresponden a otros conceptos o contienen premisas falsas.`,
      evidenciaApuntes: `Extraído del material en la sección referente a "${item.term}".`,
      tipExamen: `Asocia siempre "${item.term}" con sus fórmulas o postulados clave.`,
      isFallback: true,
    });
  }

  return result;
}

// 4. Generate Enhanced Flashcards with Anki/Leitner intervals
app.post('/api/generate/flashcards', async (req: Request, res: Response) => {
  try {
    const { notes, count = 10, aiDirectives } = req.body;
    if (!notes || typeof notes !== 'string' || notes.trim().length < 15) {
      return res.status(400).json({
        error: 'Por favor proporciona notas o material de estudio con suficiente detalle.',
      });
    }

    const directivesPrompt = buildAIDirectivesPrompt(aiDirectives);

    const prompt = `Extrae entre ${Math.min(Math.max(count, 6), 16)} conceptos fundamentales a lo largo de TODOS estos apuntes para construir tarjetas nemotécnicas (Flashcards) de alto impacto.
Para cada tarjeta incluye:
1. "concepto": Concepto, término o pregunta frontal directa.
2. "definicion": Explicación concisa y nítida.
3. "categoria": Área temática o capítulo del apunte.
4. "nemotecnia": Regla nemotécnica, acrónimo o frase memorable para retenerlo para siempre.
5. "dificultad": "Básica", "Intermedia" o "Avanzada".
${directivesPrompt}

Material de estudio:
"""
${notes.trim()}
"""`;

    const response = await callGeminiWithRetry({
      contents: prompt,
      config: {
        systemInstruction: 'Eres una pedagoga especialista en memorización activa y repetición espaciada.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  concepto: { type: Type.STRING },
                  definicion: { type: Type.STRING },
                  categoria: { type: Type.STRING },
                  nemotecnia: { type: Type.STRING },
                  dificultad: { type: Type.STRING },
                },
                required: ['concepto', 'definicion'],
              },
            },
          },
          required: ['flashcards'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (!Array.isArray(parsed.flashcards) || parsed.flashcards.length === 0) {
      throw new Error('No se generaron flashcards válidas.');
    }

    const sanitized = parsed.flashcards.map((f: any, idx: number) => ({
      id: `fc-${idx + 1}-${Date.now()}`,
      concepto: f.concepto || `Concepto ${idx + 1}`,
      definicion: f.definicion || 'Definición no disponible.',
      categoria: f.categoria || 'General',
      nemotecnia: f.nemotecnia || '',
      dificultad: f.dificultad || 'Intermedia',
    }));

    res.json({ success: true, flashcards: sanitized });
  } catch (error: any) {
    console.warn('Flashcards Gemini call error, activating fallback parser:', error?.message);
    const lines = req.body.notes.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 20);
    const fallbackCards: any[] = [];

    for (const line of lines) {
      if (line.includes(':')) {
        const parts = line.split(':');
        const concepto = parts[0].replace(/^[-*•\d\.\s]+/, '').trim();
        const definicion = parts.slice(1).join(':').trim();
        if (concepto.length >= 3 && concepto.length <= 60 && definicion.length >= 15) {
          fallbackCards.push({
            id: `fc-fb-${fallbackCards.length + 1}-${Date.now()}`,
            concepto,
            definicion,
            categoria: 'Concepto Clave',
            nemotecnia: `Recuerda relacionar ${concepto} con su función principal.`,
            dificultad: 'Intermedia',
          });
        }
      }
    }

    if (fallbackCards.length < 4) {
      const sentences = req.body.notes.match(/[^.!?]+[.!?]+/g)?.map((s: string) => s.trim()).filter((s: string) => s.length > 25) || [];
      sentences.slice(0, 10).forEach((s: string, idx: number) => {
        fallbackCards.push({
          id: `fc-fb-${idx + 1}-${Date.now()}`,
          concepto: s.slice(0, 35).trim(),
          definicion: s,
          categoria: 'Fundamento',
          nemotecnia: 'Repasa este enunciado como pilar conceptual.',
          dificultad: 'Básica',
        });
      });
    }

    res.json({
      success: true,
      flashcards: fallbackCards.slice(0, 12),
      isFallback: true,
    });
  }
});

// 5. Generate Comprehensive Study Dossier
app.post('/api/generate/guide', async (req: Request, res: Response) => {
  try {
    const { notes, aiDirectives } = req.body;
    if (!notes || typeof notes !== 'string' || notes.trim().length < 15) {
      return res.status(400).json({
        error: 'Por favor proporciona notas o material de estudio con suficiente detalle.',
      });
    }

    const directivesPrompt = buildAIDirectivesPrompt(aiDirectives);

    const prompt = `Crea un Dossier Magistral de Estudio a partir de este material (que puede ser de enorme extensión).
Organiza el contenido con formato Markdown enriquecido y estructura impecable:
${directivesPrompt}

# 📚 [TÍTULO IMPACTANTE Y CIENTÍFICO/ACADÉMICO]
> **Resumen Ejecutivo:** 2 a 3 oraciones de alto impacto que condensan el valor medular.

---

### 🗺️ Índice Temático
(Lista numerada de los ejes cubiertos)

---

### 🏛️ 1. Pilares y Conceptos Fundamentales
(Desarrollo exhaustivo con términos en **negrita**, definiciones exactas y tablas o listas comparativas)

---

### ⚙️ 2. Mecanismos y Dinámicas Paso a Paso
(Cómo funciona en la práctica, causas, efectos e interdependencias)

---

### ⚠️ 3. Trampas Comunes y Preguntas Críticas de Examen
(Los 4 errores más frecuentes que cometen los alumnos en este tema y cómo evitarlos)

---

### 💡 4. Reglas Nemotécnicas de Oro
(Estrategias mentales para recordar fórmulas, nombres o listas complejas)

---

### 📖 5. Glosario Ultrarrápido de Repaso
(Tabla o lista de términos con su significado en una frase)

Material de estudio:
"""
${notes.trim()}
"""`;

    const response = await callGeminiWithRetry({
      contents: prompt,
      config: {
        systemInstruction: 'Eres una autora académica de alto nivel. Redactas dossiers de estudio que transforman contenidos complejos en guías cristalinas y magistrales.',
        maxOutputTokens: 8192,
      },
    });

    res.json({ success: true, guide: response.text || '' });
  } catch (error: any) {
    console.error('Error generating guide:', error);
    res.status(500).json({
      error: error.message || 'Error al generar la guía.',
    });
  }
});

// 6. Interactive Tutor Explanation / Doubt Solver
app.post('/api/generate/explain', async (req: Request, res: Response) => {
  try {
    const { question, notes, style, aiDirectives } = req.body;
    if (!question || !notes) {
      return res.status(400).json({ error: 'Faltan parámetros de consulta.' });
    }

    const directivesPrompt = buildAIDirectivesPrompt(aiDirectives);

    const prompt = `El estudiante te hace la siguiente consulta sobre su material de estudio:
Consulta: "${question}"

Estilo deseado: ${style || 'Claridad pedagógica con analogía de la vida real'}
${directivesPrompt}

Material de estudio:
"""
${notes.slice(0, 40000)}
"""

Responde de forma estimulante, empática y rigurosa en español. Usa analogías accesibles cuando ayuden a fijar la comprensión.`;

    const response = await callGeminiWithRetry({
      contents: prompt,
    });

    res.json({ success: true, explanation: response.text || '' });
  } catch (error: any) {
    console.error('Error in tutor explanation:', error);
    res.status(500).json({ error: error.message || 'Error al consultar al tutor.' });
  }
});

// Helper: Instant high-yield synthesizer for Question Mental Map & A Toda Leche narrative
function synthesizeQuestionContext(question: any, notes?: string) {
  const qText = (question.pregunta || '').toLowerCase();
  const correctOpt = question.opciones?.[question.correcta] || 'Concepto Demostrado';
  const optLower = correctOpt.toLowerCase();
  const exp = question.explicacion || '';
  const dist = question.analisisDistractores || '';
  const tip = question.tipExamen || '';
  const fullContext = `${qText} ${optLower} ${exp.toLowerCase()} ${notes ? String(notes).slice(0, 1000).toLowerCase() : ''}`;

  // 1. BIOLOGÍA CELULAR / SÍNTESIS DE PROTEÍNAS / ORGANELOS (e.g., Ribosomas, Golgi, Mitocondria, Núcleo)
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
      tituloTema: 'Ruta Molecular Completa: De la Información Genética a la Proteína Activa',
      narracionATodaLeche: `¡Paren las rotativas y miren cómo funciona la fábrica de la vida! 🏭⚡

Imagínate a la célula como una megafábrica industrial altamente coordinada. El plano maestro jamás puede salir de la bóveda: **el ADN se queda seguro en el Núcleo**. Para que el sistema funcione, la célula saca una copia portátil: **el ARNm (mensajero)**, que sale por los poros nucleares directo al citoplasma.

¿Y quién tiene la maquinaria pesada para ensamblar los ladrillos? **¡El Ribosoma!** Este complejo supramolecular no trabaja solo ni en el vacío:
1. **La subunidad menor** atrapa la cinta de ARNm y busca el codón de inicio (AUG).
2. **Los camiones de transporte (ARNt)** van trayendo uno a uno los aminoácidos exactos.
3. **La subunidad mayor (con su enzima peptidil transferasa)** va forjando los enlaces peptídicos a toda velocidad.

¿Y qué pasa después? La proteína no sale cruda a la calle: pasa al **Retículo Endoplasmático Rugoso (RER)** para plegarse, y de ahí viaja en vesículas al **Aparato de Golgi** (el centro logístico tipo Amazon) para empaquetarse, recibir etiquetas químicas (glucosilación) y enviarse a los lisosomas, membrana o al exterior celular. ¡Esa es la cadena completa que te evalúan en admisión!`,
      mapaMental: {
        ejeCentral: 'Línea de Ensamblaje Celular: Núcleo ➔ ARNm ➔ Ribosoma (Traducción) ➔ RER ➔ Golgi',
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
        laTrampaDelEvaluador: 'El examen de admisión busca confundir el SITIO DE SÍNTESIS (Ribosoma / RER) con el SITIO DE EMPAQUETAMIENTO (Aparato de Golgi) o de DIGESTIÓN (Lisosoma).',
        comoDescartarRapido: 'Verbo clave rector: "Sintetizar / Traducir" = Ribosoma. "Modificar / Empaquetar" = Golgi. "Digerir / Hidrolizar" = Lisosoma. "Oxidar / Respiración" = Mitocondria.',
        frecuenciaEnAdmision: 'Muy Alta (Fija en exámenes de ciencias biológicas y salud)',
      },
      reglaNemotecnica: 'Nemotecnia "NA-RI-GO": Núcleo (plano) ➔ Ribosoma (fabricación) ➔ Golgi (envío a domicilio).',
    };
  }

  // 2. HISTORIA UNIVERSAL / PROCESOS SOCIALES (Causas, Quiebre, Nuevo Orden)
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

  // 3. DEFAULT SYSTEMIC MODEL (Step-by-step causal flow with zero pseudo-intellectual buzzwords)
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
}

// 6b. Deep Question Context Explorer (Mental Map + "A Toda Leche" Dynamic Narrative) - ULTRA FAST & RESILIENT
app.post('/api/generate/question-context', async (req: Request, res: Response) => {
  try {
    const { question, notes } = req.body;
    if (!question || !question.pregunta) {
      return res.status(400).json({ error: 'Faltan datos de la pregunta.' });
    }

    const fallback = synthesizeQuestionContext(question, notes);

    const prompt = `Eres el divulgador y pedagogo estrella de Thea Pro para exámenes de admisión de alta exigencia (UNMSM, UNI, UNT, PUCP, admisión nacional e internacional).
El estudiante acaba de resolver una pregunta y exige EXPLORAR EL CONTEXTO Y LA CADENA DE CAUSA-EFECTO CON EL DRAMA Y LOS HECHOS REALES.

🚨 PROHIBICIÓN ABSOLUTA DE PALABRAS PRETENCIOSAS O JERGA CORPORATIVA / FILOSÓFICA VACÍA:
ESTÁ TOTALMENTE PROHIBIDO usar frases huecas como:
❌ "Acumulación de tensión"
❌ "Activación del colapso"
❌ "Quiebre de la soberanía"
❌ "Expansión de la onda"
❌ "Consolidación sistémica"
❌ "Mecanismo o ley operativa"
❌ "Transformación súbita del súbdito"

¡EL ESTUDIANTE NECESITA LOS HECHOS CONCRETOS, EL CONFLICTO REAL Y LOS DATOS DE EXAMEN DE ADMISIÓN!

1. SI ES HISTORIA (ej. Revolución Francesa, Guerras Mundiales, Independencias, Imperios):
   - Narra con nombres propios y datos reales el abuso y los bandos: Quiénes tenían los privilegios y quiénes pagaban los platos rotos (ej: en la Revolución Francesa, el 97% del Tercer Estado muriéndose de hambre con la crisis del pan y cargando todos los impuestos, mientras el Clero 1% y Nobleza 2% vivían de lujos en Versalles sin pagar tributos).
   - Explica la trampa o conspiración detonante: Cómo intentaron imponer más abusos (ej: Luis XVI convoca los Estados Generales por bancarrota; nobles y clero intentan el voto por estamento 2 a 1 para aplastar al pueblo).
   - Cuenta la rebelión y el quiebre: Cómo reaccionaron los afectados (ej: El Tercer Estado se rebela, va a la Sala del Juego de la Pelota y jura no salir sin Constitución escrita; el pueblo de París asalta la Bastilla el 14 de julio por armas y pólvora).
   - Consecuencias evaluadas en admisión: Abolición del feudalismo, Declaración de los Derechos del Hombre, ejecución de Luis XVI y ascenso napoleónico.

2. SI ES BIOLOGÍA O CIENCIAS (ej. Ribosomas, Célula, Genética, Química, Física):
   - Explica la ruta de ensamblaje real con todos los participantes:
     * El Núcleo resguarda el ADN y transcribe la orden en ARNm.
     * El ARNm sale por los poros nucleares hacia el citoplasma.
     * El ARNt acarrea los aminoácidos específicos usando anticodones.
     * El Ribosoma ensambla la proteína traduciendo los codones y forjando enlaces peptídicos.
     * El Retículo Endoplasmático Rugoso (RER) la pliega y el Complejo de Golgi la etiqueta y despacha hacia lisosomas o membrana.

3. NARRACIÓN ESTILO YOUTUBE "A TODA LECHE":
   - Narración apasionante, con gancho directo ("¡Ojo a lo que realmente pasó aquí!"), ritmo trepidante y contando el drama humano o el proceso vivo como una película fascinante.

4. CADA CAMPO DEBE CONTENER INFORMACIÓN REAL, DISTINTA Y SIN REPETIR.

PREGUNTA EVALUADA:
"${question.pregunta}"
OPCIÓN CORRECTA: "${question.opciones?.[question.correcta] || ''}"
FUNDAMENTO: "${question.explicacion || ''}"
DISTRACTORES: "${question.analisisDistractores || ''}"
${notes ? `MATERIAL:\n"""\n${String(notes).slice(0, 8000)}\n"""` : ''}

Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "tituloTema": "Título corto y directo con el hecho o proceso real (ej: Revolución Francesa: De la Crisis del Pan a la Caída de Versalles)",
  "narracionATodaLeche": "Narración en Markdown estilo YouTube contando el drama humano y los hechos reales con energía, emojis y ritmo ágil (3 párrafos).",
  "mapaMental": {
    "ejeCentral": "Cadena de hechos reales: [Abuso o Condición previa] ➔ [La Trampa o Chispa] ➔ [La Rebelión o Quiebre] ➔ [El Desenlace]",
    "causas": [
      { "id": "c1", "titulo": "1. El Escenario Previo y el Abuso de Poder", "detalle": "Quiénes abusaban, quiénes sufrían y qué crisis económica o necesidad existía con datos reales.", "actorOPrincipio": "Los bandos o elementos previos" },
      { "id": "c2", "titulo": "2. La Trampa o Chispa que Colmó el Vaso", "detalle": "La maniobra o trampa que detonó la rebelión o reacción en cadena.", "actorOPrincipio": "El detonante exacto" }
    ],
    "hechoCentral": {
      "titulo": "3. El Hito Decisivo y la Acción en Directo",
      "hitoOFormula": "Fecha o Concepto Clave (ej: 14 de Julio 1789 / Juramento del Juego de Pelota / Traducción de Codones)",
      "quePaso": "Qué hicieron exactamente los protagonistas o qué hace la molécula paso a paso",
      "quiebreClave": "Por qué este hecho destruyó el orden previo y no hubo marcha atrás"
    },
    "consecuencias": [
      { "id": "e1", "titulo": "4. La Caída del Régimen y la Nueva Ley", "impactoDirecto": "Qué se abolió, qué documento o producto nació y a quién benefició", "conexionFutura": "Efecto inmediato en la sociedad o célula" },
      { "id": "e2", "titulo": "5. Lo que Evalúan en el Examen de Admisión", "impactoDirecto": "El dato de fondo que siempre preguntan los evaluadores en los exámenes", "conexionFutura": "Pregunta clave de simulacro de admisión" }
    ]
  },
  "pilaresExamen": {
    "laTrampaDelEvaluador": "Qué confusión explota el examen (ej: la farsa del voto por estamento vs voto por cabeza / confundir síntesis con empaquetado)",
    "comoDescartarRapido": "Regla de oro de descarte en 5 segundos sin dudar",
    "frecuenciaEnAdmision": "Muy Alta / Alta"
  },
  "reglaNemotecnica": "Acrónimo o regla mnemotécnica original y útil"
}`;

    // Robust call with gemini-3.1-flash-lite and a 12-second timeout
    const aiPromise = (async () => {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 2048,
        },
      });
      return JSON.parse(response.text || '{}');
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI generation timed out')), 12000)
    );

    let context: any;
    try {
      context = await Promise.race([aiPromise, timeoutPromise]);
      if (!context || !context.tituloTema || !context.mapaMental) {
        context = fallback;
      }
    } catch (err: any) {
      console.warn('Fast fallback applied for question-context:', err?.message);
      context = fallback;
    }

    res.json({ success: true, context });
  } catch (error: any) {
    console.warn('Error in question-context, serving fallback:', error);
    const fallback = synthesizeQuestionContext(req.body.question, req.body.notes);
    res.json({ success: true, context: fallback });
  }
});

// 6b2. Exam Patterns & Admission Intelligence Analyzer
app.post('/api/analyze/exam-patterns', async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    if (!notes || typeof notes !== 'string' || notes.trim().length < 30) {
      return res.status(400).json({ error: 'Material insuficiente para analizar patrones de examen.' });
    }

    const prompt = `Actúa como el decano del departamento de evaluación y admisión de Thea Pro.
Analiza este material de estudio (que puede contener exámenes de admisión pasados, simulacros o compendios preuniversitarios) y genera una RADIOGRAFÍA ESTRATÉGICA Y ADAPTATIVA DE EXAMEN:

Material:
"""
${notes.slice(0, 45000)}
"""

Genera un JSON con esta estructura exacta:
{
  "tipoDocumentoDetectado": "Examen de Admisión Real / Simulacro / Banco de Preguntas / Teoría",
  "institucionSugerida": "Institución o Universidad de referencia (ej. UNMSM, UNI, UNSAAC, Exámenes Nacionales)",
  "temasMasRecurrentes": [
    {
      "tema": "Nombre del tema frecuente",
      "recurrencia": "Muy Alta / Alta / Media",
      "porcentajeEstimado": 28,
      "motivo": "Por qué los evaluadores insisten tanto en preguntar este tema específico"
    }
  ],
  "patronesDePregunta": {
    "estiloPredominante": "Formulación de problemas de cálculo / Preguntas DECO con contexto / Relación Causa-Efecto",
    "trampaMasComun": "La trampa típica que usan para confundir a los postulantes",
    "recomendacionEstrategica": "Consejo maestro para maximizar el puntaje en este tipo de examen"
  },
  "materiasIdentificadas": ["Materia 1", "Materia 2", "Materia 3"]
}`;

    const response = await callGeminiWithRetry({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tipoDocumentoDetectado: { type: Type.STRING },
            institucionSugerida: { type: Type.STRING },
            temasMasRecurrentes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tema: { type: Type.STRING },
                  recurrencia: { type: Type.STRING },
                  porcentajeEstimado: { type: Type.NUMBER },
                  motivo: { type: Type.STRING },
                },
                required: ['tema', 'recurrencia', 'porcentajeEstimado', 'motivo'],
              },
            },
            patronesDePregunta: {
              type: Type.OBJECT,
              properties: {
                estiloPredominante: { type: Type.STRING },
                trampaMasComun: { type: Type.STRING },
                recomendacionEstrategica: { type: Type.STRING },
              },
              required: ['estiloPredominante', 'trampaMasComun', 'recomendacionEstrategica'],
            },
            materiasIdentificadas: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['tipoDocumentoDetectado', 'temasMasRecurrentes', 'patronesDePregunta', 'materiasIdentificadas'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, patterns: parsed });
  } catch (error: any) {
    console.error('Error analyzing exam patterns:', error);
    res.status(500).json({ error: error.message || 'Error analizando patrones de examen.' });
  }
});

// 6c. Instant In-Quiz Doubt Solver (Ask questions directly about this problem without leaving the quiz)
app.post('/api/generate/ask-question-doubt', async (req: Request, res: Response) => {
  try {
    const { userDoubt, question, userSelectedOption, notes } = req.body;
    if (!userDoubt || !question) {
      return res.status(400).json({ error: 'Faltan parámetros de consulta.' });
    }

    const selectedText = typeof userSelectedOption === 'number' && question.opciones?.[userSelectedOption]
      ? `El estudiante marcó: "${question.opciones[userSelectedOption]}" (${userSelectedOption === question.correcta ? 'CORRECTA' : 'INCORRECTA'})`
      : '';

    const prompt = `Eres Thea Pro, la tutora pedagógica más empática, inteligente y clara.
El estudiante tiene una DUDA ESPECÍFICA sobre esta pregunta de su quiz:

PREGUNTA DEL QUIZ:
"${question.pregunta}"

OPCIONES:
${question.opciones?.map((o: string, idx: number) => `${idx + 1}) ${o}${idx === question.correcta ? ' [RESPUESTA CORRECTA]' : ''}`).join('\n')}

ESTADO DEL ESTUDIANTE:
${selectedText}

EXPLICACIÓN OFICIAL:
"${question.explicacion || ''}"

DUDA DEL ESTUDIANTE:
"${userDoubt}"

${notes ? `MATERIAL DE REFERENCIA:\n"""\n${String(notes).slice(0, 30000)}\n"""` : ''}

INSTRUCCIONES PARA TU RESPUESTA:
- Responde directamente a la inquietud del estudiante con calidez pedagógica, claridad cristalina y ejemplos concretos.
- Si el alumno pregunta por qué su opción falló o por qué no pudo ser otra fecha/fórmula, explícale la diferencia puntual de manera memorable.
- Usa formato Markdown legible con viñetas o negritas para resaltar ideas clave.
- Sé concisa pero exhaustiva (3 a 5 párrafos estructurados).`;

    const response = await callGeminiWithRetry({
      contents: prompt,
    });

    res.json({ success: true, answer: response.text || '' });
  } catch (error: any) {
    console.error('Error in ask-question-doubt:', error);
    res.status(500).json({ error: error.message || 'Error al resolver la duda.' });
  }
});

// Core reusable document processing engine (Extracts text/images and analyzes via Gemini 3.8 Flash)
async function processDocumentBuffer(params: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType?: string;
  customInstructions?: string;
}) {
  const { fileBuffer, fileName, customInstructions } = params;
  const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(1);

  if (fileBuffer.length > 150 * 1024 * 1024) {
    throw new Error(`El archivo (${fileSizeMB} MB) excede el tamaño máximo permitido de 150 MB.`);
  }

  // Determine normalized mimeType
  let detectedMime = params.mimeType || 'application/pdf';
  const lowerName = (fileName || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) {
    detectedMime = 'application/pdf';
  } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    detectedMime = 'image/jpeg';
  } else if (lowerName.endsWith('.png')) {
    detectedMime = 'image/png';
  } else if (lowerName.endsWith('.webp')) {
    detectedMime = 'image/webp';
  }

  let extractedPdfText = '';
  let totalPages = 0;
  const extractedImages: { mimeType: string; data: string }[] = [];

  if (detectedMime === 'application/pdf') {
    try {
      const parser = new PDFParse({ data: fileBuffer });
      const parseResult = await parser.getText();
      extractedPdfText = parseResult.text || '';
      totalPages = parseResult.total || 0;

      // If text is minimal (e.g. scanned PDF like CamScanner without digital OCR text layer)
      if (extractedPdfText.trim().length <= 80) {
        try {
          const imgResult = await parser.getImage({ first: 1, last: 8, imageBuffer: true });
          if (imgResult && Array.isArray(imgResult.pages)) {
            for (const page of imgResult.pages) {
              if (Array.isArray(page.images)) {
                for (const img of page.images) {
                  if (img.data && img.data.length > 1000) {
                    extractedImages.push({
                      mimeType: 'image/jpeg',
                      data: Buffer.from(img.data).toString('base64'),
                    });
                    if (extractedImages.length >= 8) break;
                  }
                }
              }
              if (extractedImages.length >= 8) break;
            }
          }
        } catch (imgErr) {
          console.warn('Could not extract page images via getImage:', imgErr);
        }

        // If no embedded images found, try getScreenshot
        if (extractedImages.length === 0) {
          try {
            const screenshots = await parser.getScreenshot({ first: 1, last: 6 });
            if (screenshots && Array.isArray(screenshots.pages)) {
              for (const page of screenshots.pages) {
                if (page.data) {
                  extractedImages.push({
                    mimeType: 'image/png',
                    data: Buffer.from(page.data).toString('base64'),
                  });
                  if (extractedImages.length >= 6) break;
                }
              }
            }
          } catch (shotErr) {
            console.warn('Could not extract page screenshots via getScreenshot:', shotErr);
          }
        }
      }
      await parser.destroy();
    } catch (pdfErr) {
      console.warn('PDF text extraction error via PDFParse:', pdfErr);
    }
  }

  const hasExtractedText = extractedPdfText.trim().length > 80;

  const promptText = `Actúa como el motor de OCR y asimilación de exámenes de admisión y materiales académicos de Thea Pro.
Vas a procesar detenidamente este material${totalPages > 0 ? ` de ${totalPages} páginas` : ''} (${fileSizeMB} MB, archivo "${fileName}").

🚨 DETERMINACIÓN OBLIGATORIA DEL TIPO DE DOCUMENTO:
Determina si este material es:
A) "EXAMEN_ADMISION" / "BANCO_PREGUNTAS": Contiene exámenes de admisión pasados, simulacros, balotarios, problemas numerados con alternativas A, B, C, D, E o ejercicios de prácticas preuniversitarias (Álgebra, Aritmética, Geometría, Trigonometría, Física, Química, Biología, Razonamiento Matemático, Razonamiento Verbal, Lenguaje, Historia, Geografía, Filosofía, Economía, etc.).
B) "MATERIAL_TEORICO": Libros de texto, compendios conceptuales, manuales o apuntes de clase.

========================================================================
🚨 SI EL DOCUMENTO ES UN EXAMEN DE ADMISIÓN O BANCO DE PREGUNTAS:
¡REGLA FUNDAMENTAL DE ORO!:
❌ QUEDA TERMINANTEMENTE PROHIBIDO resumirlo en generalidades abstractas ("métodos de análisis de flujo", "relación entre variables independientes y dependientes", "trampas de examen ante excepciones").
✅ DEBES TRANSCRIBIR Y EXTRAER DIRECTAMENTE LOS PROBLEMAS Y PREGUNTAS REALES DEL EXAMEN:
1. Transcribe cada enunciado con todos sus datos numéricos, ecuaciones matemáticas, fórmulas físicas o químicas, figuras descritas y alternativas de respuesta (A, B, C, D, E).
2. Clasifica cada problema en su materia respectiva (Álgebra, Aritmética, Geometría, Trigonometría, Física, Química, Biología, Razonamiento Matemático, Razonamiento Verbal, Historia, etc.).
3. Resuelve cada problema paso a paso deduciendo la respuesta correcta fundamentada.
4. En "preguntasBanco", incluye la lista estructurada de estas preguntas reales listas para el simulador con sus 4 o 5 opciones y la respuesta correcta.
5. En "extraccionConceptual", transcribe el banco completo de problemas con sus ecuaciones, datos y soluciones demostradas paso a paso.

🚨 SI EL DOCUMENTO ES MATERIAL TEÓRICO O MIXTO:
- Extrae todas las definiciones formales, leyes científicas, fórmulas canónicas y mecanismos paso a paso.
- PROHIBIDO formular o redactar meta-lenguaje abstracto sobre 'metodologías'.
========================================================================

Genera un JSON con esta estructura exacta:
{
  "tipoDocumento": "EXAMEN_ADMISION" | "BANCO_PREGUNTAS" | "MATERIAL_TEORICO",
  "titulo": "Título conciso y formal (ej: Examen de Admisión UNI/UNMSM - Ciencias y Letras)",
  "resumen": "Resumen conciso indicando materias identificadas, cantidad de problemas y temas clave.",
  "materias": ["Álgebra", "Física", "Química", "Razonamiento Matemático", "Razonamiento Verbal", ...],
  "capitulos": ["Lista de materias o subtemas identificados a lo largo del material"],
  "extraccionConceptual": "Texto extenso en Markdown con el banco íntegro de problemas reales transcritos paso a paso (si es examen) o las fórmulas, teoremas y leyes exactas (si es teoría).",
  "preguntasBanco": [
    {
      "id": "banco-1",
      "pregunta": "Enunciado completo, técnico y exacto del problema o pregunta del examen...",
      "opciones": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"],
      "correcta": 0,
      "nivel": 3,
      "explicacion": "Resolución matemática paso a paso o fundamentación irrefutable.",
      "analisisDistractores": "Por qué las otras opciones son erróneas.",
      "evidenciaApuntes": "Transcrito del problema del examen.",
      "tipExamen": "Técnica rápida para resolver este ejercicio en examen de admisión."
    }
  ]
}
${customInstructions ? `\nInstrucciones extra del alumno: ${customInstructions}` : ''}`;

  let response: any;

  if (hasExtractedText) {
    // PDF with digital text layer (even 100 MB textbooks) - sent as structured text to Gemini 3.8 Flash (1M context)
    const textPayload = `${promptText}

--- TEXTO EXTRAÍDO DEL DOCUMENTO (${totalPages} PÁGINAS) ---
"""
${extractedPdfText.slice(0, 480000)}
"""`;

    response = await callGeminiWithRetry({
      contents: textPayload,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    });
  } else if (extractedImages.length > 0) {
    // Pure scanned PDF where images were extracted from pages
    const parts: any[] = extractedImages.map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data,
      },
    }));
    parts.push({ text: promptText });

    response = await callGeminiWithRetry({
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    });
  } else {
    // Scanned document or image file <= 25 MB - send directly to Gemini multimodal
    const MAX_INLINE_BYTES = 25 * 1024 * 1024;
    if (fileBuffer.length > MAX_INLINE_BYTES) {
      throw new Error(
        `El documento es un escaneo fotográfico de ${fileSizeMB} MB sin capa de texto indexable. Para archivos mayores a 25 MB asegúrate de que el PDF contenga texto o divídelo en partes.`
      );
    }

    const docPart = {
      inlineData: {
        mimeType: detectedMime,
        data: fileBuffer.toString('base64'),
      },
    };
    const textPart = { text: promptText };

    response = await callGeminiWithRetry({
      contents: { parts: [docPart, textPart] },
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    });
  }

  const rawText = response?.text || '';
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = {
        titulo: fileName?.replace(/\.[^/.]+$/, '') || 'Documento de Estudio',
        resumen: rawText.slice(0, 300) + '...',
        capitulos: ['Tema Principal', 'Conceptos Clave'],
        extraccionConceptual: rawText,
      };
    }
  }

  const title = parsed.titulo || fileName?.replace(/\.[^/.]+$/, '') || 'Documento de Estudio';
  const summary = parsed.resumen || 'Documento analizado y estructurado como fuente de estudio.';
  const chapters =
    Array.isArray(parsed.capitulos) && parsed.capitulos.length > 0
      ? parsed.capitulos
      : (Array.isArray(parsed.materias) && parsed.materias.length > 0 ? parsed.materias : ['Álgebra', 'Física', 'Química', 'Razonamiento']);
  const conceptual = parsed.extraccionConceptual || rawText;
  const wordsCount = conceptual.trim().split(/\s+/).filter(Boolean).length;
  const tipoDocumento = parsed.tipoDocumento || (lowerName.includes('simulacro') || lowerName.includes('examen') || lowerName.includes('admision') ? 'EXAMEN_ADMISION' : 'MATERIAL_TEORICO');
  const materias = Array.isArray(parsed.materias) ? parsed.materias : chapters;
  const preguntasBanco = Array.isArray(parsed.preguntasBanco) ? parsed.preguntasBanco.map((p: any, idx: number) => {
    const opts = Array.isArray(p.opciones) ? p.opciones.slice(0, 4) : ['Opción A', 'Opción B', 'Opción C', 'Opción D'];
    while (opts.length < 4) opts.push(`Opción ${opts.length + 1}`);
    let c = typeof p.correcta === 'number' ? p.correcta : 0;
    if (c < 0 || c > 3) c = 0;
    return {
      id: `banco-${Date.now()}-${idx + 1}`,
      pregunta: p.pregunta || `Pregunta ${idx + 1}`,
      opciones: opts,
      correcta: c,
      nivel: typeof p.nivel === 'number' ? p.nivel : 3,
      explicacion: p.explicacion || 'Resolución del problema del examen.',
      analisisDistractores: p.analisisDistractores || 'Las demás opciones son incorrectas.',
      evidenciaApuntes: p.evidenciaApuntes || 'Transcrito del examen.',
      tipExamen: p.tipExamen || 'Verifica siempre la fórmula y el despeje.',
    };
  }) : [];

  return {
    success: true,
    fileName: fileName || 'Documento procesado',
    title,
    summary,
    chapters,
    conceptualContext: conceptual,
    wordsCount,
    mimeType: detectedMime,
    tipoDocumento,
    materias,
    preguntasBanco,
  };
}

// In-memory sessions for chunked upload (bypasses 32MB reverse proxy limit)
interface ChunkSession {
  uploadId: string;
  chunks: (Buffer | null)[];
  receivedCount: number;
  totalChunks: number;
  fileName: string;
  mimeType: string;
  customInstructions?: string;
  createdAt: number;
}

const chunkSessions = new Map<string, ChunkSession>();

// Cleanup stale sessions older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of chunkSessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      chunkSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// 7a. Chunked Upload Endpoint for Heavy Documents (Up to 150 MB without proxy 413 limits)
app.post('/api/ocr-chunk-upload', async (req: Request, res: Response) => {
  try {
    const { uploadId, chunkIndex, totalChunks, fileName, mimeType, chunkBase64, customInstructions } = req.body;

    if (!uploadId || chunkIndex === undefined || !totalChunks || !chunkBase64) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros de fragmento incompletos.',
      });
    }

    let session = chunkSessions.get(uploadId);
    if (!session) {
      session = {
        uploadId,
        chunks: new Array(totalChunks).fill(null),
        receivedCount: 0,
        totalChunks,
        fileName: fileName || 'documento.pdf',
        mimeType: mimeType || 'application/pdf',
        customInstructions,
        createdAt: Date.now(),
      };
      chunkSessions.set(uploadId, session);
    }

    const chunkBuffer = Buffer.from(chunkBase64, 'base64');
    if (!session.chunks[chunkIndex]) {
      session.chunks[chunkIndex] = chunkBuffer;
      session.receivedCount++;
    }

    const progress = Math.round((session.receivedCount / totalChunks) * 100);

    // If not all chunks received yet, acknowledge chunk
    if (session.receivedCount < totalChunks) {
      return res.json({
        success: true,
        status: 'chunk_received',
        chunkIndex,
        totalChunks,
        progress,
      });
    }

    // All chunks received! Reassemble and process
    const fullBuffer = Buffer.concat(session.chunks as Buffer[]);
    chunkSessions.delete(uploadId);

    const result = await processDocumentBuffer({
      fileBuffer: fullBuffer,
      fileName: session.fileName,
      mimeType: session.mimeType,
      customInstructions: session.customInstructions,
    });

    res.json({
      ...result,
      status: 'complete',
    });
  } catch (error: any) {
    console.error('Error in /api/ocr-chunk-upload:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar los fragmentos del documento.',
    });
  }
});

// 7b. Single-call Document Analysis via Gemini 3.8 Flash
app.post('/api/ocr-process', async (req: Request, res: Response) => {
  try {
    const { base64Data, mimeType, fileName, customInstructions } = req.body;
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'No se recibió el contenido binario del archivo o imagen para OCR.',
      });
    }

    const fileBuffer = Buffer.from(base64Data, 'base64');
    const result = await processDocumentBuffer({
      fileBuffer,
      fileName,
      mimeType,
      customInstructions,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ocr-process:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar el archivo mediante OCR inteligente.',
    });
  }
});

// Configure Vite middleware in development or serve static in production
const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Thea Pro Server running on http://0.0.0.0:${PORT}`);
});
