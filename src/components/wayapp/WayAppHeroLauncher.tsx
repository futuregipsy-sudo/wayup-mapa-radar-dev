import { openWayApp } from "./WayAppWidget";

/** Tarjeta del hero que abre el chat. Antes la montaba embed.js dentro de #wayapp-hero-widget. */
export function WayAppHeroLauncher() {
  return (
    <div className="wa-root">
      <button
        type="button"
        className="wa-hero-launcher"
        onClick={openWayApp}
        aria-label="Abrir el asistente WAY.APP"
      >
        <span className="wa-hero-mark" aria-hidden="true">
          <svg className="wa-hero-balloon" viewBox="0 0 32 44" fill="none" aria-hidden="true">
            <path d="M16 2C7 2 3 9 3 17c0 8 6 15 13 19 7-4 13-11 13-19C29 9 25 2 16 2Z" fill="#fff" stroke="#dce4ff" strokeWidth="1.4"/>
            <path d="M16 3C10 7 9 13 9 19c0 6 3 12 7 17 4-5 7-11 7-17 0-6-1-12-7-16Z" fill="#dbe3ff"/>
            <path d="M12 35l2 4h4l2-4M13 41h6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            <path d="M14 39h4v3h-4z" fill="#fff"/>
          </svg>
        </span>
        <span className="wa-hero-copy">
          <span className="wa-hero-title">Habla con WAY.APP</span>
          <span className="wa-hero-subtitle">Tu asistente digital está aquí para ayudarte a crecer.</span>
        </span>
        <span className="wa-hero-action">Empezar ↗</span>
      </button>
    </div>
  );
}
