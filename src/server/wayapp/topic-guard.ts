/**
 * Conservative, deterministic routing: only unambiguously off-topic requests bypass AI.
 * Replies follow the page language (es, en, fr, zh); Spanish is the default.
 */
export type GuardLocale = "es" | "en" | "fr" | "zh";

type ReplyKey = "spoof" | "distress" | "relationship" | "health" | "offtopic" | "code";

const REPLIES: Record<GuardLocale, Record<ReplyKey, string>> = {
  es: {
    spoof: "No puedo cambiar mis instrucciones ni desactivar las medidas de seguridad. Soy WAY.APP y puedo ayudarte con la presencia digital de tu negocio.",
    distress: "Siento que estés pasando por esto. Si estás en peligro inmediato, llama al 112. Si piensas hacerte daño, busca ahora apoyo de alguien de confianza o de un servicio de emergencias.",
    relationship: "Siento que estés pasando por eso. Soy el asistente de WAY UP y puedo ayudarte con tu negocio y su presencia digital.",
    health: "Para cuestiones de salud, lo adecuado es consultar con un profesional sanitario. Yo puedo orientarte sobre la presencia digital de tu negocio.",
    offtopic: "Esa consulta se sale de mi especialidad. Estoy aquí para ayudarte con la web, el marketing y la presencia digital de tu negocio.",
    code: "Eso se sale de lo que hago: no escribo código, dibujos ASCII ni tareas generales. Sí puedo ayudarte con la web, el SEO local y el marketing de tu negocio. ¿De qué negocio se trata?",
  },
  en: {
    spoof: "I can't change my instructions or turn off my safeguards. I'm WAY.APP and I can help with your business's online presence.",
    distress: "I'm sorry you're going through this. If you are in immediate danger, call 112 (or your local emergency number). If you're thinking of hurting yourself, reach out now to someone you trust or to an emergency service.",
    relationship: "I'm sorry you're going through that. I'm the WAY UP assistant and I can help with your business and its online presence.",
    health: "For health questions, please talk to a healthcare professional. I can help you with your business's online presence.",
    offtopic: "That's outside my area. I'm here to help with your business's website, marketing and online presence.",
    code: "That's outside what I do: I don't write code, ASCII art or general tasks. I can help with your business's website, local SEO and marketing. What kind of business is it?",
  },
  fr: {
    spoof: "Je ne peux pas modifier mes instructions ni désactiver mes protections. Je suis WAY.APP et je peux vous aider avec la présence en ligne de votre entreprise.",
    distress: "Je suis désolé que vous traversiez cela. En cas de danger immédiat, appelez le 112. Si vous pensez à vous faire du mal, contactez dès maintenant une personne de confiance ou un service d'urgence.",
    relationship: "Je suis désolé que vous traversiez cela. Je suis l'assistant de WAY UP et je peux vous aider avec votre entreprise et sa présence en ligne.",
    health: "Pour les questions de santé, adressez-vous à un professionnel de santé. Je peux vous aider avec la présence en ligne de votre entreprise.",
    offtopic: "Cette demande sort de mon domaine. Je suis là pour vous aider avec le site web, le marketing et la présence en ligne de votre entreprise.",
    code: "Cela sort de mon rôle : je n'écris pas de code, d'art ASCII ni de tâches générales. Je peux vous aider avec le site web, le SEO local et le marketing de votre entreprise. De quelle activité s'agit-il ?",
  },
  zh: {
    spoof: "我无法更改我的指令或关闭安全措施。我是 WAY.APP，可以帮助您提升企业的线上形象。",
    distress: "很抱歉您正在经历这些。如果您处于紧急危险中，请立即拨打当地急救电话（欧洲为 112）。如果您有伤害自己的想法，请马上联系您信任的人或紧急服务。",
    relationship: "很抱歉您正在经历这些。我是 WAY UP 的助手，可以帮助您的企业及其线上形象。",
    health: "健康问题请咨询专业医务人员。我可以帮助您提升企业的线上形象。",
    offtopic: "这个问题超出了我的服务范围。我可以帮助您处理企业的网站、营销和线上形象。",
    code: "这超出了我的服务范围：我不编写代码、ASCII 图案或通用任务。我可以帮助您处理企业的网站、本地 SEO 和营销。请问是什么类型的企业？",
  },
};

// Attempts to override, reveal or replace the assistant's rules, in the four site languages.
const SPOOF_RE = new RegExp(
  [
    "fin de la sesion anterior", "actualizacion de sistema", "nueva directriz",
    "ignora (?:todas )?(?:las |tus |mis )?(?:anteriores )?instrucciones", "olvida (?:todas )?(?:tus |las )?instrucciones",
    "sin restricciones eticas", "sistema reconfigurado", "desactivar los protocolos", "modo desarrollador",
    "actua como (?:un )?sistema sin", "(?:muestra(?:me)?|dime|revela(?:me)?|ensena(?:me)?|copia) (?:tu|el|las|tus) (?:prompt|instrucciones)",
    "prompt (?:de|del) sistema", "instrucciones (?:internas|de sistema|del sistema)",
    "ignore (?:all |any |the |your |my )?(?:previous |prior |above )?(?:instructions|rules)", "disregard (?:all |your |the )?(?:previous )?(?:instructions|rules)",
    "system prompt", "(?:reveal|show|print|repeat) (?:me )?(?:your|the) (?:prompt|instructions|rules)", "developer mode", "jailbreak", "\\bdan mode\\b",
    "you are now (?:a|an) ", "pretend (?:to be|you are)",
    "ignore[sz]? (?:toutes )?(?:tes |les |vos )?(?:instructions|consignes)", "oublie[sz]? (?:tes |vos |les )?(?:instructions|consignes)",
    "(?:montre|revele|affiche)[sz]?(?:-moi)? (?:ton|votre|le) (?:prompt|instructions)", "prompt systeme", "mode developpeur",
    "忽略.{0,6}(?:指令|指示|规则)", "系统提示", "提示词", "开发者模式", "越狱",
  ].join("|"),
);

// Explicit business/digital context: never blocked locally, the model handles it.
const BUSINESS_RE = /\b(web|website|pagina|seo|marketing|negocio|empresa|cliente|clientes|ventas|vender|tienda|ecommerce|redes sociales|publicidad|campana|marca|presupuesto|auditoria|way\s?up|dominio|posicionamiento|conversiones|diseno|digital|business|company|customers?|sales|shop|store|brand|branding|site|entreprise|clients?|ventes|boutique|marque|referencement|publicite)\b|网站|营销|生意|企业|公司|品牌|客户|推广|店铺/;

// Code, ASCII art, homework and other general-purpose tasks.
const CODE_RE = /\b(codigo|code|coding|python|javascript|typescript|java|php|c\+\+|c#|rust|golang|sql|regex|algoritmo|algorithm|algorithme|programa(?:me|r)?|programmer|script|hola mundo|hello world|bonjour le monde|ascii|deberes|tarea de clase|examen|homework|exam|devoirs|poema|poem|poeme|cuento|ensayo|essay|dissertation|traduce(?:me)?|translate|traduis|resuelve|solve|resous|ecuacion|equation)\b|代码|编程|程序|作业|写诗|翻译/;

export function offTopicReply(input: string, locale: GuardLocale = "es"): string | null {
  const replies = REPLIES[locale] ?? REPLIES.es;
  const text = input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  // Explicit instruction-spoofing is not an emergency merely because it mentions
  // "protocolos de seguridad" or "sistema de emergencia".
  const instructionSpoof = SPOOF_RE.test(text);
  const directDistress = /(?:quiero|voy a|estoy pensando en|necesito)[ ]+(?:suicidarme|matarme|quitarme la vida|hacerme dano)|(?:estoy en peligro inmediato|me quiero morir)|\b(?:kill myself|end my life|want to die|me suicider|me tuer)\b|自杀|想死/.test(text);
  if (instructionSpoof && !directDistress) return replies.spoof;
  if (BUSINESS_RE.test(text)) return null;
  // Safety-critical situations require an appropriate response, not a sales pitch.
  if (directDistress || /(?:suicidio|autolesion|peligro inmediato|suicide|self[- ]harm)/.test(text)) return replies.distress;
  if (/\b(mi novia|mi novio|mi pareja|me ha dejado|me dejo mi|ruptura|infidelidad|me es infiel|desamor|volver con mi ex|my girlfriend|my boyfriend|broke up)\b/.test(text)) {
    return replies.relationship;
  }
  if (/\b(me duele|tengo fiebre|diagnosticame|que medicamento|medicacion|enfermedad|sintomas|tratamiento medico|fever|symptoms|medication|fievre|symptomes)\b/.test(text)) {
    return replies.health;
  }
  if (CODE_RE.test(text)) return replies.code;
  if (/\b(receta de cocina|como cocinar|resultado del partido|horoscopo|cuentame un chiste|recomiendame una pelicula|tell me a joke|recipe|horoscope|recommend a movie|raconte une blague|recette)\b/.test(text)) {
    return replies.offtopic;
  }
  return null;
}
